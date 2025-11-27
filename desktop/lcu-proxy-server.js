// lcu-proxy-server.js
// Small HTTP proxy server to bypass CORS restrictions
// This runs as a Node.js server that the Overwolf app communicates with

import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { homedir } from 'os';

const PROXY_PORT = 21337; // Local proxy port

// Store LCU config (will be set by first request or auto-discovered)
let lcuConfig = null;

// Common lockfile locations for Windows
const LOCKFILE_PATHS = [
  path.join(homedir(), 'AppData', 'Local', 'Riot Games', 'League of Legends', 'lockfile'),
  'C:\\Riot Games\\League of Legends\\lockfile',
  'C:\\Program Files\\Riot Games\\League of Legends\\lockfile',
  'C:\\Program Files (x86)\\Riot Games\\League of Legends\\lockfile',
  'D:\\Riot Games\\League of Legends\\lockfile',
];

/**
 * Tries to discover LCU config by reading lockfile
 */
function discoverLcuConfig() {
  for (const lockfilePath of LOCKFILE_PATHS) {
    try {
      if (fs.existsSync(lockfilePath)) {
        const content = fs.readFileSync(lockfilePath, 'utf8');
        const parts = content.trim().split(':');
        if (parts.length >= 4) {
          const config = {
            pid: parseInt(parts[1], 10),
            port: parseInt(parts[2], 10),
            password: parts[3]
          };
          console.log(`[Proxy] Found lockfile at ${lockfilePath} - Port: ${config.port}`);
          return config;
        }
      }
    } catch (error) {
      // File doesn't exist or can't be read, continue
    }
  }
  return null;
}

/**
 * Verifies that the LCU is actually responding (not just a stale lockfile)
 */
function verifyLcuConnection(config) {
  return new Promise((resolve) => {
    const token = Buffer.from(`riot:${config.password}`).toString('base64');
    
    const options = {
      hostname: '127.0.0.1',
      port: config.port,
      path: '/lol-summoner/v1/current-summoner',
      method: 'GET',
      headers: {
        'Authorization': `Basic ${token}`,
        'Accept': 'application/json',
      },
      rejectUnauthorized: false,
      timeout: 2000
    };

    const req = https.request(options, (res) => {
      // Any response (even 4xx) means LCU is running
      resolve(true);
      req.destroy();
    });

    req.on('error', () => {
      resolve(false);
    });

    req.on('timeout', () => {
      resolve(false);
      req.destroy();
    });

    req.end();
  });
}

/**
 * Periodically check for League client
 */
function watchForLeagueClient() {
  const checkInterval = setInterval(async () => {
    if (!lcuConfig) {
      const config = discoverLcuConfig();
      if (config) {
        // Verify the connection actually works before reporting as connected
        const isAlive = await verifyLcuConnection(config);
        if (isAlive) {
          lcuConfig = config;
          console.log('[Proxy] League client connected - Port:', config.port);
        } else {
          console.log('[Proxy] Found stale lockfile, League not actually running');
        }
      }
    } else {
      // Verify League is still running by making a test request
      const isAlive = await verifyLcuConnection(lcuConfig);
      if (!isAlive) {
        console.log('[Proxy] League client disconnected (connection lost)');
        lcuConfig = null;
      }
    }
  }, 3000);

  return () => clearInterval(checkInterval);
}

// Try to discover on startup
async function initializeLcuDetection() {
  const config = discoverLcuConfig();
  if (config) {
    const isAlive = await verifyLcuConnection(config);
    if (isAlive) {
      lcuConfig = config;
      console.log('[Proxy] League client connected on startup - Port:', config.port);
    } else {
      console.log('[Proxy] Found lockfile but League not running (stale lockfile)');
    }
  } else {
    console.log('[Proxy] League client not found - will watch for it...');
  }
  
  // Start watching for League client
  watchForLeagueClient();
}

initializeLcuDetection();

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
        console.log('[Proxy] LCU config set via /set-config - Port:', lcuConfig.port);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  // Check status endpoint - verify connection is still alive
  if (url.pathname === '/status') {
    (async () => {
      let isConnected = false;
      if (lcuConfig) {
        isConnected = await verifyLcuConnection(lcuConfig);
        if (!isConnected) {
          console.log('[Proxy] Status check: League disconnected');
          lcuConfig = null;
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        connected: isConnected,
        port: lcuConfig?.port || null
      }));
    })();
    return;
  }

  // Auto-discover endpoint
  if (url.pathname === '/discover') {
    const config = discoverLcuConfig();
    if (config) {
      lcuConfig = config;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, port: config.port }));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'League client not found' }));
    }
    return;
  }

  if (!lcuConfig) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'LCU config not set - League client not running or not detected' }));
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

