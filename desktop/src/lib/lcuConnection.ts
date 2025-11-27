// lcuConnection.ts
// Discovers League Client Update (LCU) connection info by reading the lockfile

export interface LcuConfig {
  port: number;
  password: string;
  pid: number;
}



/**
 * Discovers League Client Update (LCU) connection info by querying the proxy server
 */
export async function discoverLcuConnection(_verbose: boolean = false): Promise<LcuConfig | null> {
  // We no longer read lockfiles directly because Overwolf's file access is unreliable
  // Instead, we ask our Node.js proxy server which has better system access
  return queryProxyConnectionInfo();
}

/**
 * Queries the local proxy server for LCU connection info
 */
async function queryProxyConnectionInfo(): Promise<LcuConfig | null> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', 'http://127.0.0.1:21337/connection-info', true);
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.timeout = 1000; // Fast timeout since it's local

    xhr.onload = () => {
      if (xhr.status === 200) {
        try {
          const config = JSON.parse(xhr.responseText);
          resolve(config);
        } catch {
          resolve(null);
        }
      } else {
        resolve(null);
      }
    };

    xhr.onerror = () => {
      resolve(null);
    };

    xhr.ontimeout = () => {
      resolve(null);
    };

    xhr.send();
  });
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

