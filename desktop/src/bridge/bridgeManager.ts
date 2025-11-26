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
}

export interface ConnectionRequestCallback {
  (deviceInfo: { device: string; browser: string; identity: string }): Promise<boolean>;
}

export class BridgeManager {
  private riftClient: RiftClient | null = null;
  private mobileHandlers: Map<string, MobileHandler> = new Map();
  private token: string | null = null;
  private config: BridgeConfig | null = null;
  private lcuClient: LcuClient = getLcuClient();
  private connectionRequestCallback: ConnectionRequestCallback | null = null;
  private stopLcuWatching: (() => void) | null = null;
  private lcuConnected: boolean = false;

  /**
   * Sets the connection request callback
   */
  setConnectionRequestCallback(callback: ConnectionRequestCallback): void {
    this.connectionRequestCallback = callback;
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
        console.log('[BridgeManager] LCU connected on port:', lcuConfig.port);
        try {
          await this.lcuClient.connect(lcuConfig);
          this.lcuConnected = true;
          console.log('[BridgeManager] LCU client connected successfully');
        } catch (error) {
          console.error('[BridgeManager] Failed to connect LCU client:', error);
        }
      },
      () => {
        console.log('[BridgeManager] LCU disconnected');
        this.lcuConnected = false;
        this.lcuClient.disconnect();
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
      console.log('[BridgeManager] Registering with Rift at:', riftUrl);
      
      const data = await new Promise<any>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${riftUrl}/register`, true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('Accept', 'application/json');
        
        xhr.onload = () => {
          console.log('[BridgeManager] XHR response status:', xhr.status);
          console.log('[BridgeManager] XHR response text:', xhr.responseText.substring(0, 200));
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
          xhr.send(JSON.stringify({ pubkey: publicKey }));
        } catch (error: any) {
          console.error('[BridgeManager] Error sending XHR:', error);
          reject(new Error('Failed to send request: ' + error.message));
        }
      });

      if (!data.ok || !data.token) {
        throw new Error('Invalid registration response');
      }

      this.token = data.token;
      console.log('[BridgeManager] Registered with Rift, token received');

      // Extract code from JWT
      const code = this.extractCodeFromToken(data.token);
      console.log('[BridgeManager] Connection code:', code);

      // Connect to Rift WebSocket
      await this.connectToRift();
    } catch (error) {
      console.error('[BridgeManager] Failed to register with Rift:', error);
      throw error;
    }
  }

  /**
   * Extracts 6-digit code from JWT token
   */
  private extractCodeFromToken(token: string): string {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid JWT format');
      }

      // Decode base64 (add padding if needed)
      const base64Json = parts[1];
      const padded = base64Json.padEnd(4 * Math.ceil(base64Json.length / 4), '=');
      const json = atob(padded);
      const payload = JSON.parse(json);

      return payload.code;
    } catch (error) {
      console.error('[BridgeManager] Failed to extract code from token:', error);
      return '000000';
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
      },
      onClose: () => {
        console.log('[BridgeManager] Disconnected from Rift server');
        // RiftClient already handles reconnection, don't duplicate it here
      },
      onNewConnection: (uuid: string) => {
        console.log('[BridgeManager] New mobile connection:', uuid);
        this.createMobileHandler(uuid);
      },
      onConnectionClosed: (uuid: string) => {
        console.log('[BridgeManager] Mobile connection closed:', uuid);
        this.removeMobileHandler(uuid);
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
        // Check if we have a direct callback (non-Overwolf environment)
        if (this.connectionRequestCallback) {
          console.log('[BridgeManager] Using direct callback for connection request');
          return this.connectionRequestCallback(deviceInfo);
        }

        // Check if Overwolf is available
        if (typeof overwolf === 'undefined' || !overwolf.windows) {
          console.log('[BridgeManager] Overwolf not available, auto-approving connection');
          // Auto-approve in non-Overwolf environment if no callback is set
          return true;
        }

        // Send connection request to desktop window via Overwolf messaging
        return new Promise<boolean>((resolve) => {
          overwolf.windows.obtainDeclaredWindow('desktop', (result: any) => {
            if (result.success) {
              overwolf.windows.sendMessage(result.window.id, 'connection_request', JSON.stringify({
                type: 'connection_request',
                deviceInfo
              }), () => {});

              // Listen for response
              const messageListener = (windowId: any, _messageId: any, message: any) => {
                let messageContent: string | null = null;
                
                if (typeof message === 'string') {
                  messageContent = message;
                } else if (windowId && typeof windowId === 'object' && typeof windowId.content === 'string') {
                  messageContent = windowId.content;
                }
                
                if (messageContent) {
                  try {
                    const data = JSON.parse(messageContent);
                    if (data.type === 'connection_response' && data.deviceIdentity === deviceInfo.identity) {
                      overwolf.windows.onMessageReceived.removeListener(messageListener);
                      resolve(data.approved === true);
                    }
                  } catch (error) {
                    // Ignore parsing errors
                  }
                }
              };

              overwolf.windows.onMessageReceived.addListener(messageListener);

              // Timeout after 30 seconds
              setTimeout(() => {
                overwolf.windows.onMessageReceived.removeListener(messageListener);
                resolve(false);
              }, 30000);
            } else {
              // No desktop window, auto-approve
              console.log('[BridgeManager] No desktop window found, auto-approving');
              resolve(true);
            }
          });
        });
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
   * Gets the connection code
   */
  getCode(): string | null {
    if (!this.token) {
      return null;
    }
    return this.extractCodeFromToken(this.token);
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

