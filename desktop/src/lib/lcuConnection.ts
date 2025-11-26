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
export async function discoverLcuConnection(verbose: boolean = false): Promise<LcuConfig | null> {
  // Try all possible lockfile locations silently
  for (const path of LOCKFILE_PATHS) {
    try {
      const config = await readLockfile(path, verbose);
      if (config) {
        return config;
      }
    } catch {
      // Silently continue to next path
    }
  }
  return null;
}

/**
 * Reads and parses the lockfile at the specified path
 */
async function readLockfile(path: string, verbose: boolean = false): Promise<LcuConfig | null> {
  return new Promise((resolve, reject) => {
    if (!overwolf || !overwolf.io) {
      reject(new Error('Overwolf API not available'));
      return;
    }

    try {
      overwolf.io.readTextFile(path, {}, (result: any) => {
        if (!result || result.status === 'error' || result.error || !result.content) {
          resolve(null);
          return;
        }

        parseLockfileContent(result.content, resolve, reject, verbose);
      });
    } catch (error: any) {
      reject(error);
    }
  });
}

/**
 * Parses lockfile content
 */
function parseLockfileContent(content: string, resolve: (value: LcuConfig | null) => void, reject: (error: any) => void, verbose: boolean = false): void {
  try {
    // Lockfile format: process:pid:port:password:protocol
    const parts = content.trim().split(':');
    
    if (parts.length < 4) {
      resolve(null);
      return;
    }

    const pid = parseInt(parts[1], 10);
    const port = parseInt(parts[2], 10);
    const password = parts[3];

    if (isNaN(pid) || isNaN(port) || !password) {
      resolve(null);
      return;
    }

    resolve({ pid, port, password });
  } catch (error) {
    if (verbose) {
      console.error('[LCU Connection] Error parsing lockfile:', error);
    }
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

    const config = await discoverLcuConnection();

    if (config) {
      // Check if config changed (port/password might change on restart)
      if (!lastConfig || 
          lastConfig.port !== config.port || 
          lastConfig.password !== config.password) {
        console.log('[LCU Connection] League client connected - Port:', config.port);
        lastConfig = config;
        onConnected(config);
      }
      // Don't log "still active" to reduce noise
    } else {
      // Connection lost
      if (lastConfig) {
        console.log('[LCU Connection] League client disconnected');
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

