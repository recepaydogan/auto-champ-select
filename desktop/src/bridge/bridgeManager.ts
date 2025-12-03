/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Main bridge coordinator (LCU ↔ Rift ↔ Mobile)
 */

import { RiftClient, type RiftClientCallbacks } from './riftClient';
import { MobileHandler, type MobileHandlerCallbacks } from './mobileHandler';
import { MobileOpcode } from './types';
import { getLcuClient, type LcuClient } from '../lib/lcuClient';
import { watchLcuConnection } from '../lib/lcuConnection';

export interface BridgeConfig {
  riftUrl: string;
  jwtSecret: string;
  userId: string; // Supabase user ID
}

export interface ConnectionRequestCallback {
  (deviceInfo: { device: string; browser: string; identity: string }): Promise<boolean>;
}

export interface StatusChangeCallback {
  (status: {
    riftConnected: boolean;
    mobileConnected: boolean;
    lcuConnected: boolean;
  }): void;
}

export class BridgeManager {
  private riftClient: RiftClient | null = null;
  private mobileHandlers: Map<string, MobileHandler> = new Map();
  private token: string | null = null;
  private config: BridgeConfig | null = null;
  private lcuClient: LcuClient = getLcuClient();
  private connectionRequestCallback: ConnectionRequestCallback | null = null;
  private statusChangeCallback: StatusChangeCallback | null = null;
  private stopLcuWatching: (() => void) | null = null;
  private lcuConnected: boolean = false;
  private riftConnected: boolean = false;
  private lastFailedLcuPort: number | null = null; // Prevent repeated failed attempts

  /**
   * Sets the connection request callback
   */
  setConnectionRequestCallback(callback: ConnectionRequestCallback): void {
    this.connectionRequestCallback = callback;
  }

  /**
   * Sets the status change callback
   */
  setStatusChangeCallback(callback: StatusChangeCallback): void {
    this.statusChangeCallback = callback;
  }

  /**
   * Gets current connection status
   */
  getStatus() {
    return {
      riftConnected: this.riftConnected,
      mobileConnected: this.mobileHandlers.size > 0,
      lcuConnected: this.lcuConnected,
    };
  }

  /**
   * Notifies listeners about status change and broadcasts to mobile
   */
  private notifyStatusChange(): void {
    const status = this.getStatus();

    // Notify UI callback
    if (this.statusChangeCallback) {
      this.statusChangeCallback(status);
    }

    // Broadcast to all connected mobile devices
    this.broadcastStatusToMobile();
  }

  /**
   * Broadcasts current status to all connected mobile devices
   */
  private async broadcastStatusToMobile(): Promise<void> {
    const status = this.getStatus();

    for (const [uuid, handler] of this.mobileHandlers.entries()) {
      try {
        if (handler.isReady()) {
          const encrypted = await handler.encryptMessage([
            MobileOpcode.STATUS,
            status
          ]);
          this.riftClient?.sendToMobile(uuid, encrypted);
        }
      } catch (error) {
        console.error('[BridgeManager] Failed to broadcast status to mobile:', error);
      }
    }
  }

  /**
   * Initializes the bridge with Rift server configuration
   */
  async initialize(config: BridgeConfig): Promise<void> {
    // Prevent re-initialization if already connected
    if (this.riftClient?.isConnected()) {
      console.log('[BridgeManager] Already connected, skipping initialization');
      return;
    }

    this.config = config;

    // Start watching for LCU connection
    this.startLcuWatching();

    // Register with Rift server to get JWT token
    await this.registerWithRift();
  }

  /**
   * Starts watching for League client connection
   */
  private startLcuWatching(): void {
    if (this.stopLcuWatching) {
      return; // Already watching
    }

    console.log('[BridgeManager] Starting LCU connection watch...');

    this.stopLcuWatching = watchLcuConnection(
      async (lcuConfig) => {
        // Skip if we already failed on this port (stale lockfile)
        if (this.lastFailedLcuPort === lcuConfig.port) {
          return;
        }

        console.log('[BridgeManager] LCU lockfile found on port:', lcuConfig.port);
        try {
          // connect() now includes verification - throws if LCU isn't actually running
          await this.lcuClient.connect(lcuConfig);
          this.lcuConnected = true;
          this.lastFailedLcuPort = null; // Reset on success
          console.log('[BridgeManager] LCU client verified and connected');
          this.notifyStatusChange();
        } catch (error) {
          // Connection or verification failed - stale lockfile or client closed
          console.log('[BridgeManager] LCU connection failed (stale lockfile?):', error);
          this.lcuConnected = false;
          this.lastFailedLcuPort = lcuConfig.port;
          this.lcuClient.disconnect();
          this.notifyStatusChange();
        }
      },
      () => {
        console.log('[BridgeManager] LCU disconnected (lockfile removed)');
        this.lcuConnected = false;
        this.lastFailedLcuPort = null; // Reset when lockfile is removed
        this.lcuClient.disconnect();
        this.notifyStatusChange();
      },
      3000 // Check every 3 seconds
    );
  }

  /**
   * Checks if LCU client is connected
   */
  isLcuConnected(): boolean {
    return this.lcuConnected && this.lcuClient.isConnected();
  }

  /**
   * Registers with Rift server and gets JWT token
   * Uses XMLHttpRequest instead of fetch for better Overwolf compatibility
   */
  private async registerWithRift(): Promise<void> {
    if (!this.config) {
      throw new Error('Bridge not initialized');
    }

    try {
      const { exportPublicKey } = await import('./crypto');
      const publicKey = await exportPublicKey();

      // Use XMLHttpRequest instead of fetch for Overwolf compatibility
      // Replace localhost with 127.0.0.1 for Overwolf compatibility
      const riftUrl = this.config!.riftUrl.replace('localhost', '127.0.0.1');
      console.log('[BridgeManager] Registering with Rift at:', riftUrl, 'for user:', this.config.userId);

      const data = await new Promise<any>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${riftUrl}/register`, true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('Accept', 'application/json');

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const response = JSON.parse(xhr.responseText);
              resolve(response);
            } catch (error) {
              console.error('[BridgeManager] Failed to parse response:', error);
              reject(new Error('Failed to parse response: ' + xhr.responseText.substring(0, 100)));
            }
          } else {
            reject(new Error(`Registration failed: ${xhr.statusText} (${xhr.status}) - ${xhr.responseText.substring(0, 100)}`));
          }
        };

        xhr.onerror = (event) => {
          console.error('[BridgeManager] XHR error event:', event);
          reject(new Error(`Network error: Failed to connect to Rift server at ${riftUrl}. Make sure the Rift server is running.`));
        };

        xhr.ontimeout = () => {
          reject(new Error('Request timeout: Rift server did not respond within 10 seconds'));
        };

        xhr.timeout = 10000; // 10 second timeout
        try {
          // Send userId along with pubkey
          xhr.send(JSON.stringify({ pubkey: publicKey, userId: this.config!.userId }));
        } catch (error: any) {
          console.error('[BridgeManager] Error sending XHR:', error);
          reject(new Error('Failed to send request: ' + error.message));
        }
      });

      if (!data.ok || !data.token) {
        throw new Error('Invalid registration response');
      }

      this.token = data.token;
      console.log('[BridgeManager] Registered with Rift successfully');

      // Connect to Rift WebSocket
      await this.connectToRift();
    } catch (error) {
      console.error('[BridgeManager] Failed to register with Rift:', error);
      throw error;
    }
  }


  /**
   * Connects to Rift WebSocket server
   */
  private async connectToRift(): Promise<void> {
    if (!this.config || !this.token) {
      throw new Error('Bridge not initialized or no token');
    }

    // Disconnect existing client before creating new one
    if (this.riftClient) {
      console.log('[BridgeManager] Disconnecting existing Rift client');
      this.riftClient.disconnect();
      this.riftClient = null;
    }

    const callbacks: RiftClientCallbacks = {
      onOpen: () => {
        console.log('[BridgeManager] Connected to Rift server');
        this.riftConnected = true;
        this.notifyStatusChange();
      },
      onClose: () => {
        console.log('[BridgeManager] Disconnected from Rift server');
        this.riftConnected = false;
        this.notifyStatusChange();
        // RiftClient already handles reconnection, don't duplicate it here
      },
      onNewConnection: (uuid: string) => {
        console.log('[BridgeManager] New mobile connection:', uuid);
        this.createMobileHandler(uuid);
        // Status change will be notified after SECRET handshake completes
      },
      onConnectionClosed: (uuid: string) => {
        console.log('[BridgeManager] Mobile connection closed:', uuid);
        this.removeMobileHandler(uuid);
        this.notifyStatusChange();
      },
      onMessage: (uuid: string, message: any) => {
        this.handleRiftMessage(uuid, message);
      }
    };

    this.riftClient = new RiftClient(
      this.config.riftUrl.replace('http://', 'ws://').replace('https://', 'wss://'),
      this.token,
      callbacks
    );

    await this.riftClient.connect();
  }

  /**
   * Creates a handler for a mobile connection
   */
  private createMobileHandler(uuid: string): void {
    const callbacks: MobileHandlerCallbacks = {
      onRequest: async (_id: number, path: string, method: string, body: string | null) => {
        try {
          const result = await this.lcuClient.request(path, method, body ? JSON.parse(body) : undefined);
          return { status: 200, content: result };
        } catch (error: any) {
          console.error('[BridgeManager] LCU request failed:', error);
          return { status: error.status || 500, content: { error: error.message } };
        }
      },
      onConnectionRequest: async (deviceInfo: { device: string; browser: string; identity: string }) => {
        // Auto-approve mobile connections when desktop is running—no user prompt required.
        console.log('[BridgeManager] Auto-approving mobile connection:', deviceInfo);

        // Log that we are ignoring the callback to satisfy linter (unused variable)
        if (this.connectionRequestCallback) {
          console.log('[BridgeManager] Ignoring connectionRequestCallback (auto-approve enabled)');
        }

        // Small delay to ensure handler is set up before broadcasting status
        setTimeout(() => this.notifyStatusChange(), 100);
        return true;
      },
      onStatusRequest: () => {
        // Return current status when mobile requests it
        return this.getStatus();
      },
      onConnectionApproved: () => {
        // Connection is now fully established (after handshake complete)
        console.log('[BridgeManager] Mobile connection fully established');
        this.notifyStatusChange();
      },
      onSubscribe: (path: string) => {
        // Subscribe to LCU endpoint
        const unsubscribe = this.lcuClient.observe(path, (event) => {
          const handler = this.mobileHandlers.get(uuid);
          if (handler && handler.matchesObservedPath(path)) {
            handler.encryptMessage([
              MobileOpcode.UPDATE,
              path,
              200,
              event.data
            ]).then(encrypted => {
              this.riftClient?.sendToMobile(uuid, encrypted);
            }).catch(error => {
              console.error('[BridgeManager] Failed to encrypt update:', error);
            });
          }
        });

        // Store unsubscribe function
        const handler = this.mobileHandlers.get(uuid);
        if (handler) {
          (handler as any).lcuObservers = (handler as any).lcuObservers || new Map();
          (handler as any).lcuObservers.set(path, unsubscribe);
        }
      },
      onUnsubscribe: (path: string) => {
        // Unsubscribe from LCU endpoint
        const handler = this.mobileHandlers.get(uuid);
        if (handler && (handler as any).lcuObservers) {
          const unsubscribe = (handler as any).lcuObservers.get(path);
          if (unsubscribe) {
            unsubscribe();
            (handler as any).lcuObservers.delete(path);
          }
        }
      }
    };

    const handler = new MobileHandler(callbacks);
    this.mobileHandlers.set(uuid, handler);
  }

  /**
   * Removes a mobile handler
   */
  private removeMobileHandler(uuid: string): void {
    const handler = this.mobileHandlers.get(uuid);
    if (handler) {
      handler.cleanup();
      this.mobileHandlers.delete(uuid);
    }
  }

  /**
   * Handles message from Rift server
   */
  private handleRiftMessage(uuid: string, message: any): void {
    const handler = this.mobileHandlers.get(uuid);
    if (!handler) {
      console.warn('[BridgeManager] No handler for mobile connection:', uuid);
      return;
    }

    // Handle message (may need decryption) - async handling
    handler.handleMessage(message).then(result => {
      console.log('[BridgeManager] handleMessage result:', result ? 'got result' : 'null');
      if (!result) {
        // Message was handled internally, no response needed
        return;
      }

      // Check if this is a SECRET_RESPONSE (needs to be sent unencrypted)
      try {
        const parsed = JSON.parse(result);
        if (Array.isArray(parsed) && parsed[0] === MobileOpcode.SECRET_RESPONSE) {
          // Send SECRET_RESPONSE directly without encryption
          console.log('[BridgeManager] Sending SECRET_RESPONSE to mobile:', parsed[1]);
          this.riftClient?.sendToMobile(uuid, parsed);
          return;
        }
      } catch {
        // Not a JSON response, treat as decrypted message
      }

      // Handle decrypted message
      console.log('[BridgeManager] Calling handleDecryptedMessage with result length:', result.length);
      handler.handleDecryptedMessage(result).then(async response => {
        console.log('[BridgeManager] handleDecryptedMessage response:', response ? 'got response' : 'null');
        if (response) {
          console.log('[BridgeManager] Encrypting and sending response');
          const encrypted = await handler.encryptMessage(response);
          this.riftClient?.sendToMobile(uuid, encrypted);
          console.log('[BridgeManager] Response sent');
        }
      }).catch(error => {
        console.error('[BridgeManager] Error handling mobile message:', error);
      });
    }).catch(error => {
      console.error('[BridgeManager] Error handling message:', error);
    });
  }

  /**
   * Disconnects from Rift
   */
  disconnect(): void {
    // Stop LCU watching
    if (this.stopLcuWatching) {
      this.stopLcuWatching();
      this.stopLcuWatching = null;
    }

    // Disconnect LCU client
    if (this.lcuClient) {
      this.lcuClient.disconnect();
      this.lcuConnected = false;
    }

    // Disconnect Rift client
    if (this.riftClient) {
      this.riftClient.disconnect();
      this.riftClient = null;
    }

    for (const handler of this.mobileHandlers.values()) {
      handler.cleanup();
    }
    this.mobileHandlers.clear();
  }
}

// Singleton instance
let bridgeManagerInstance: BridgeManager | null = null;

export function getBridgeManager(): BridgeManager {
  if (!bridgeManagerInstance) {
    bridgeManagerInstance = new BridgeManager();
  }
  return bridgeManagerInstance;
}
