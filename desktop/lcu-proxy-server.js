// lcu-proxy-server.js
// Small HTTP proxy server to bypass CORS restrictions
// This runs as a Node.js server that the Overwolf app communicates with

import http from 'http';
import https from 'https';

const PROXY_PORT = 21337; // Local proxy port

// Store LCU config (will be set by first request)
let lcuConfig = null;

const server = http.createServer((req, res) => {
  // Enable CORS for Overwolf extension
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Parse request
  const url = new URL(req.url, `http://${req.headers.host}`);
  
  if (url.pathname === '/set-config') {
    // Set LCU config
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        lcuConfig = JSON.parse(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  if (!lcuConfig) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'LCU config not set' }));
    return;
  }

  // Proxy request to LCU
  const lcuPath = url.pathname;
  const lcuMethod = req.method;
  
  const token = Buffer.from(`riot:${lcuConfig.password}`).toString('base64');
  
  // Base headers - Authorization is always needed
  const options = {
    hostname: '127.0.0.1',
    port: lcuConfig.port,
    path: lcuPath + (url.search || ''),
    method: lcuMethod,
    headers: {
      'Authorization': `Basic ${token}`,
      'Accept': 'application/json',
    },
    rejectUnauthorized: false // Accept self-signed certificate
  };

  let requestBody = '';
  req.on('data', chunk => { requestBody += chunk.toString(); });
  
  req.on('end', () => {
    // Only set Content-Type and Content-Length if there's actually a body
    // Mimic's C# code sets Content = null when body is null, not an empty string
    if (requestBody && requestBody.length > 0) {
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(requestBody);
    }
    // For POST/PATCH/PUT with no body, don't set Content-Type or Content-Length
    // This matches Mimic's behavior where Content = null

    let responseBody = '';
    const proxyReq = https.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, {
        'Content-Type': proxyRes.headers['content-type'] || 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      
      proxyRes.on('data', (chunk) => {
        responseBody += chunk.toString();
        res.write(chunk);
      });
      
      proxyRes.on('end', () => {
        console.log(`[Proxy] ${lcuMethod} ${lcuPath} -> ${proxyRes.statusCode}`);
        if (proxyRes.statusCode >= 400) {
          console.log(`[Proxy] Error response: ${responseBody.substring(0, 500)}`);
        }
        res.end();
      });
    });

    proxyReq.on('error', (error) => {
      console.error(`[Proxy] Request error for ${lcuMethod} ${lcuPath}:`, error.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    });

    // Only write body if it exists (matching Mimic's behavior)
    if (requestBody && requestBody.length > 0) {
      proxyReq.write(requestBody);
    }
    
    proxyReq.end();
  });
});

server.listen(PROXY_PORT, '127.0.0.1', () => {
  console.log(`LCU Proxy Server running on http://127.0.0.1:${PROXY_PORT}`);
});

