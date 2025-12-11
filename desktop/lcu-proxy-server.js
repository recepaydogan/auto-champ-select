// lcu-proxy-server.js
// Small HTTP proxy server to bypass CORS restrictions
// This runs as a Node.js server that the Overwolf app communicates with

import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { homedir } from 'os';

const PROXY_PORT = 21337; // Local proxy port
// Track unique endpoints the official client hits (method + path)
const ENDPOINT_LOG_PATH = path.join(process.cwd(), 'lcu-endpoints.log');
const seenEndpoints = new Set();
// Focused log for quickplay-related calls (paths containing quick/slot/tam)
const QUICKPLAY_LOG_PATH = path.join(process.cwd(), 'lcu-quickplay.log');

function logQuickplay(details) {
  const line = `[${new Date().toISOString()}] ${JSON.stringify(details)}\n`;
  fs.appendFile(QUICKPLAY_LOG_PATH, line, (err) => {
    if (err) {
      console.error('[Proxy] Failed to write quickplay log:', err.message);
    }
  });
}

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
        console.log("DEBUG -", config)
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

const server = http.createServer(async (req, res) => {
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

  // Expose connection info for local frontend
  if (url.pathname === '/connection-info') {
    if (lcuConfig) {
      // Verify connection is still alive before returning it
      const isAlive = await verifyLcuConnection(lcuConfig);
      if (isAlive) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(lcuConfig));
      } else {
        lcuConfig = null;
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'League client not running' }));
      }
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'League client not running' }));
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

  // Record each unique endpoint (method + path) the official client hits
  const endpointKey = `${lcuMethod} ${lcuPath}`;
  if (!seenEndpoints.has(endpointKey)) {
    seenEndpoints.add(endpointKey);
    const logLine = `[${new Date().toISOString()}] ${endpointKey}\n`;
    fs.appendFile(ENDPOINT_LOG_PATH, logLine, (err) => {
      if (err) {
        console.error('[Proxy] Failed to write endpoint log:', err.message);
      } else {
        console.log('[Proxy][Endpoint]', endpointKey, '(logged)');
      }
    });
  }

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
    // Identify quickplay-ish calls (path or payload or query hints)
    const quickplayHint = /quick|slot|tam|pickable|pick|position/i;
    const queueHint = /queueId["']?\s*:\s*49\d/i;
    const isQuickplayPath = quickplayHint.test(lcuPath) || quickplayHint.test(url.search || '');
    const isQuickplayBody = quickplayHint.test(requestBody) || queueHint.test(requestBody);
    const isQuickplay = isQuickplayPath || isQuickplayBody;

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
        if (isQuickplay) {
          const entry = {
            method: lcuMethod,
            path: lcuPath + (url.search || ''),
            status: proxyRes.statusCode,
            requestBody: requestBody ? requestBody.substring(0, 2000) : undefined,
            responseBody: responseBody ? responseBody.substring(0, 2000) : undefined,
          };
          logQuickplay(entry);
          console.log('[Proxy][Quickplay]', entry);
        }
        // Check if this is an expected error (not a real failure)
        const isExpectedError = proxyRes.statusCode === 404 && (
          responseBody.includes('No matchmaking search exists') ||
          responseBody.includes('No active delegate') ||
          responseBody.includes('RESOURCE_NOT_FOUND') ||
          responseBody.includes('RPC_ERROR')
        );

        if (proxyRes.statusCode >= 200 && proxyRes.statusCode < 300) {
          // Only log successful requests for debugging specific endpoints
          if (lcuPath.includes('queues') || lcuPath.includes('lobby') && lcuMethod !== 'GET') {
            console.log(`[Proxy] ${lcuMethod} ${lcuPath} -> ${proxyRes.statusCode}`);
          }
        } else if (proxyRes.statusCode >= 400 && !isExpectedError) {
          // Only log unexpected errors
          console.log(`[Proxy] ${lcuMethod} ${lcuPath} -> ${proxyRes.statusCode}`);
          console.log(`[Proxy] Error response: ${responseBody.substring(0, 500)}`);
        }
        // Expected errors (404s for missing resources) are silently ignored
        res.end();
      });
    });

    proxyReq.on('error', (error) => {
      console.error(`[Proxy] Request error for ${lcuMethod} ${lcuPath}:`, error.message);
      if (isQuickplayPath) {
        logQuickplay({
          method: lcuMethod,
          path: lcuPath + (url.search || ''),
          error: error.message,
          requestBody: requestBody ? requestBody.substring(0, 2000) : undefined,
        });
      }
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

