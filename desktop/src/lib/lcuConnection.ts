// lcuConnection.ts
// Discovers League Client Update (LCU) connection info by reading the lockfile

export interface LcuConfig {
  port: number;
  password: string;
  pid: number;
}

// Common lockfile locations
const LOCKFILE_PATHS = [
  '%LOCALAPPDATA%\\Riot Games\\League of Legends\\lockfile',
  'C:\\Riot Games\\League of Legends\\lockfile',
  'C:\\Program Files\\Riot Games\\League of Legends\\lockfile',
  'C:\\Program Files (x86)\\Riot Games\\League of Legends\\lockfile',
];

/**
 * Reads the League client lockfile and extracts connection information
 */
export async function discoverLcuConnection(): Promise<LcuConfig | null> {
  console.log('[LCU Connection] Starting discovery...');
  
  // Try all possible lockfile locations
  // Note: %LOCALAPPDATA% is a Windows environment variable that Overwolf should handle
  // If it doesn't work, we'll try the other paths
  const paths = LOCKFILE_PATHS;

  console.log('[LCU Connection] Checking', paths.length, 'lockfile paths');

  for (const path of paths) {
    console.log('[LCU Connection] Trying path:', path);
    try {
      const config = await readLockfile(path);
      if (config) {
        console.log('[LCU Connection] ✓ Found LCU config at:', path, 'Port:', config.port);
        return config;
      } else {
        console.log('[LCU Connection] ✗ No config found at:', path);
      }
    } catch (error: any) {
      console.error(`[LCU Connection] ✗ Error reading lockfile at ${path}:`, error?.message || error);
    }
  }

  console.log('[LCU Connection] ✗ No LCU connection found in any path');
  return null;
}

/**
 * Reads and parses the lockfile at the specified path
 */
async function readLockfile(path: string): Promise<LcuConfig | null> {
  return new Promise((resolve, reject) => {
    console.log('[LCU Connection] Attempting to read lockfile:', path);
    
    if (!overwolf || !overwolf.io) {
      console.error('[LCU Connection] Overwolf API not available');
      reject(new Error('Overwolf API not available'));
      return;
    }

    // Overwolf FileSystem API - readTextFile requires 3 arguments: path, options, callback
    // Signature: readTextFile(path, options, callback)
    console.log('[LCU Connection] Calling overwolf.io.readTextFile...');
    
    try {
      // Overwolf API requires options object (can be empty {})
      overwolf.io.readTextFile(path, {}, (result: any) => {
        console.log('[LCU Connection] readTextFile result:', result);
        
        if (!result) {
          console.log('[LCU Connection] No result from readTextFile');
          resolve(null);
          return;
        }

        if (result.status === 'error' || result.error) {
          console.log('[LCU Connection] readTextFile error:', result.error || result.status);
          resolve(null);
          return;
        }

        if (!result.content) {
          console.log('[LCU Connection] No content in result');
          resolve(null);
          return;
        }

        console.log('[LCU Connection] Lockfile content received, length:', result.content.length);
        parseLockfileContent(result.content, resolve, reject);
      });
    } catch (error: any) {
      console.error('[LCU Connection] Exception calling readTextFile:', error);
      reject(error);
    }
  });
}

/**
 * Parses lockfile content
 */
function parseLockfileContent(content: string, resolve: (value: LcuConfig | null) => void, reject: (error: any) => void): void {
  try {
    console.log('[LCU Connection] Parsing lockfile content:', content.substring(0, 50) + '...');
    
    // Lockfile format: process:pid:port:password:protocol
    const parts = content.trim().split(':');
    console.log('[LCU Connection] Lockfile parts:', parts.length, 'parts');
    
    if (parts.length < 4) {
      console.log('[LCU Connection] Invalid lockfile format: not enough parts');
      resolve(null);
      return;
    }

    const pid = parseInt(parts[1], 10);
    const port = parseInt(parts[2], 10);
    const password = parts[3];

    console.log('[LCU Connection] Parsed values - PID:', pid, 'Port:', port, 'Password length:', password?.length);

    if (isNaN(pid) || isNaN(port) || !password) {
      console.log('[LCU Connection] Invalid parsed values');
      resolve(null);
      return;
    }

    console.log('[LCU Connection] ✓ Successfully parsed lockfile');
    resolve({ pid, port, password });
  } catch (error) {
    console.error('[LCU Connection] Error parsing lockfile:', error);
    reject(error);
  }
}

/**
 * Continuously monitors for LCU connection, calling callback when found or lost
 */
export function watchLcuConnection(
  onConnected: (config: LcuConfig) => void,
  onDisconnected: () => void,
  intervalMs: number = 2000
): () => void {
  let lastConfig: LcuConfig | null = null;
  let isRunning = true;

  const checkConnection = async () => {
    if (!isRunning) return;

    console.log('[LCU Connection] Checking for LCU connection...');
    const config = await discoverLcuConnection();

    if (config) {
      // Check if config changed (port/password might change on restart)
      if (!lastConfig || 
          lastConfig.port !== config.port || 
          lastConfig.password !== config.password) {
        console.log('[LCU Connection] New/updated connection detected');
        lastConfig = config;
        onConnected(config);
      } else {
        console.log('[LCU Connection] Connection still active');
      }
    } else {
      // Connection lost
      if (lastConfig) {
        console.log('[LCU Connection] Connection lost');
        lastConfig = null;
        onDisconnected();
      }
    }

    if (isRunning) {
      setTimeout(checkConnection, intervalMs);
    }
  };

  // Start checking immediately
  checkConnection();

  // Return cleanup function
  return () => {
    isRunning = false;
  };
}

