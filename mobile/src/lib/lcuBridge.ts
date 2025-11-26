/**
 * LCU API wrapper that sends requests through WebSocket
 */

import RiftSocket, { MobileOpcode } from './riftSocket';

export interface LCUResult {
  status: number;
  content: any;
}

export class LCUBridge {
  private socket: RiftSocket | null = null;
  private idCounter = 0;
  private pendingRequests: Map<number, { resolve: (result: LCUResult) => void; reject: (error: Error) => void }> = new Map();
  private observers: Map<string, (result: LCUResult) => void> = new Map();

  /**
   * Connects to Rift server
   */
  async connect(code: string, riftUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = new RiftSocket(code, riftUrl);
      
      // Handle connection timeout
      const timeoutId = setTimeout(() => {
        if (this.socket && (this.socket.state === 0 || this.socket.state === 1 || this.socket.state === 2)) {
          // Still connecting or failed
          let errorMessage = 'Connection timeout. Failed to connect to Rift server';
          
          if (riftUrl.includes('localhost') || riftUrl.includes('127.0.0.1')) {
            errorMessage = 'Connection timeout. Cannot use localhost on a physical device. Please use your computer\'s IP address (e.g., ws://192.168.1.100:51001). Update EXPO_PUBLIC_RIFT_URL in your .env file.';
          } else {
            errorMessage = 'Connection timeout. Make sure:\n1. Desktop app is running\n2. Both devices are on the same WiFi network\n3. Firewall allows port 51001';
          }
          
          reject(new Error(errorMessage));
        }
      }, 10000);

      this.socket.onopen = () => {
        clearTimeout(timeoutId);
        console.log('[LCUBridge] Connected to Rift');
        resolve();
      };

      this.socket.onmessage = (msg: { data: string }) => {
        this.handleMessage(msg.data);
      };

      this.socket.onclose = () => {
        clearTimeout(timeoutId);
        console.log('[LCUBridge] Disconnected from Rift');
        // Reject all pending requests
        for (const [id, { reject }] of this.pendingRequests.entries()) {
          reject(new Error('Connection closed'));
        }
        this.pendingRequests.clear();
        
        // If we were trying to connect and it closed, reject the connection promise
        if (this.socket?.state === 1 || this.socket?.state === 2) { // FAILED states
          let errorMessage = 'Failed to connect to Rift server';
          
          // Provide helpful error message based on the URL
          if (riftUrl.includes('localhost') || riftUrl.includes('127.0.0.1')) {
            errorMessage = 'Cannot connect using localhost on a physical device. Please use your computer\'s IP address (e.g., ws://192.168.1.100:51001). Update EXPO_PUBLIC_RIFT_URL in your .env file.';
          } else {
            errorMessage = 'Failed to connect. Make sure:\n1. Desktop app is running\n2. Both devices are on the same WiFi network\n3. Firewall allows port 51001';
          }
          
          reject(new Error(errorMessage));
        }
      };
    });
  }

  /**
   * Makes an LCU API request
   */
  async request(path: string, method: string = 'GET', body?: any): Promise<LCUResult> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to Rift server');
    }

    return new Promise((resolve, reject) => {
      const id = this.idCounter++;
      this.pendingRequests.set(id, { resolve, reject });

      const bodyStr = body ? JSON.stringify(body) : null;
      const message = JSON.stringify([MobileOpcode.REQUEST, id, path, method, bodyStr]);

      this.socket!.send(message).catch(error => {
        console.error('[LCUBridge] Failed to send request:', error);
        this.pendingRequests.delete(id);
        reject(error);
      });
    });
  }

  /**
   * Observes an LCU endpoint
   */
  observe(path: string, handler: (result: LCUResult) => void): () => void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to Rift server');
    }

    this.observers.set(path, handler);

    // Subscribe to the endpoint
    const message = JSON.stringify([MobileOpcode.SUBSCRIBE, path]);
    this.socket.send(message).catch(console.error);

    // Make initial request
    this.request(path).then(handler).catch(console.error);

    // Return unsubscribe function
    return () => {
      this.observers.delete(path);
      const unsubscribeMsg = JSON.stringify([MobileOpcode.UNSUBSCRIBE, path]);
      this.socket?.send(unsubscribeMsg).catch(console.error);
    };
  }

  /**
   * Handles incoming messages
   */
  private handleMessage(data: string) {
    try {
      const msg = JSON.parse(data);

      if (msg[0] === MobileOpcode.RESPONSE) {
        const [, id, status, content] = msg;
        const pending = this.pendingRequests.get(id);
        if (pending) {
          this.pendingRequests.delete(id);
          pending.resolve({ status, content });
        }
      } else if (msg[0] === MobileOpcode.UPDATE) {
        const [, path, status, content] = msg;
        const handler = this.observers.get(path);
        if (handler) {
          handler({ status, content });
        }
      }
    } catch (error) {
      console.error('[LCUBridge] Error handling message:', error);
    }
  }

  /**
   * Disconnects from Rift
   */
  disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.pendingRequests.clear();
    this.observers.clear();
  }

  /**
   * Checks if connected
   */
  isConnected(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }
}

// Singleton instance
let lcuBridgeInstance: LCUBridge | null = null;

export function getLCUBridge(): LCUBridge {
  if (!lcuBridgeInstance) {
    lcuBridgeInstance = new LCUBridge();
  }
  return lcuBridgeInstance;
}

