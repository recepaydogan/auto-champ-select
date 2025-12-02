/**
 * LCU API wrapper that sends requests through WebSocket
 */

import RiftSocket, { MobileOpcode } from './riftSocket';

export interface LCUResult {
  status: number;
  content: any;
}

export interface DesktopStatus {
  riftConnected: boolean;
  mobileConnected: boolean;
  lcuConnected: boolean;
}

export class LCUBridge {
  private socket: RiftSocket | null = null;
  private idCounter = 0;
  private pendingRequests: Map<number, { resolve: (result: LCUResult) => void; reject: (error: Error) => void }> = new Map();
  private observers: Map<string, (result: LCUResult) => void> = new Map();
  private statusCallback: ((status: DesktopStatus) => void) | null = null;
  private disconnectCallback: ((reason: string) => void) | null = null;
  private connectionListeners: Set<(connected: boolean) => void> = new Set();
  private isConnected = false;
  private desktopStatus: DesktopStatus = {
    riftConnected: false,
    mobileConnected: false,
    lcuConnected: false
  };

  /**
   * Connects to Rift server using Supabase user ID
   */
  async connect(userId: string, riftUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let resolved = false;

      const handleReject = (errorMessage: string) => {
        if (!resolved) {
          resolved = true;
          reject(new Error(errorMessage));
        }
      };

      const handleResolve = () => {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      };

      try {
        this.socket = new RiftSocket(userId, riftUrl);
      } catch (error: any) {
        handleReject(`Failed to create connection: ${error.message}`);
        return;
      }

      this.socket.onopen = () => {
        console.log('[LCUBridge] Connected to Rift');
        this.isConnected = true;
        this.notifyConnectionListeners(true);
        handleResolve();
      };

      this.socket.onmessage = (msg: { data: string }) => {
        this.handleMessage(msg.data);
      };

      this.socket.onclose = () => {
        console.log('[LCUBridge] Disconnected from Rift, state:', this.socket?.state, 'wasConnected:', this.isConnected);

        const wasConnected = this.isConnected;
        this.isConnected = false;
        this.notifyConnectionListeners(false);

        // Reject all pending requests
        for (const [, { reject: rejectRequest }] of this.pendingRequests.entries()) {
          rejectRequest(new Error('Connection closed'));
        }
        this.pendingRequests.clear();
        this.observers.clear();

        // Provide helpful error message based on state and URL
        let errorMessage = 'Connection closed';

        if (this.socket?.state === 1) { // FAILED_NO_DESKTOP
          errorMessage = 'Desktop app not found. Make sure:\n1. Desktop app is running\n2. You are signed in with the same account';
        } else if (this.socket?.state === 2) { // FAILED_DESKTOP_DENY
          errorMessage = 'Connection was denied by the desktop app.';
        } else if (riftUrl.includes('localhost') || riftUrl.includes('127.0.0.1')) {
          errorMessage = 'Cannot connect using localhost on a physical device. Please use your computer\'s IP address (e.g., 192.168.1.100:51001).';
        }

        // If we were connected and now disconnected, notify via callback
        if (wasConnected && this.disconnectCallback) {
          this.disconnectCallback(errorMessage);
        }

        handleReject(errorMessage);
      };

      // Also add a fallback timeout for truly stuck connections (network issues)
      // This is just a safety net - normally onclose handles failures
      setTimeout(() => {
        if (!resolved && this.socket) {
          console.log('[LCUBridge] Safety timeout triggered, state:', this.socket.state);
          handleReject('Connection is taking too long. Please check your network and try again.');
        }
      }, 60000); // 60 second safety net
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
      } else if (msg[0] === MobileOpcode.STATUS) {
        // Status update from desktop
        const [, status] = msg;
        this.desktopStatus = status;
        if (this.statusCallback) {
          this.statusCallback(status);
        }
      }
    } catch (error) {
      console.error('[LCUBridge] Error handling message:', error);
    }
  }

  /**
   * Disconnects from Rift (manual disconnect, won't trigger disconnect callback)
   */
  disconnect() {
    this.isConnected = false; // Set before close to prevent callback
    this.notifyConnectionListeners(false);
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
  getIsConnected(): boolean {
    return this.isConnected && this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }

  /**
   * Sets the status callback
   */
  setStatusCallback(callback: (status: DesktopStatus) => void): void {
    this.statusCallback = callback;
  }

  /**
   * Sets the disconnect callback (called when connection drops after being connected)
   */
  setDisconnectCallback(callback: (reason: string) => void): void {
    this.disconnectCallback = callback;
  }

  /**
   * Adds a connection listener
   */
  addConnectionListener(callback: (connected: boolean) => void): void {
    this.connectionListeners.add(callback);
  }

  /**
   * Removes a connection listener
   */
  removeConnectionListener(callback: (connected: boolean) => void): void {
    this.connectionListeners.delete(callback);
  }

  /**
   * Notifies all connection listeners
   */
  private notifyConnectionListeners(connected: boolean): void {
    this.connectionListeners.forEach(listener => {
      try {
        listener(connected);
      } catch (e) {
        console.error('[LCUBridge] Error in connection listener:', e);
      }
    });
  }

  /**
   * Gets the current desktop status
   */
  getDesktopStatus(): DesktopStatus {
    return this.desktopStatus;
  }

  /**
   * Requests current status from desktop
   */
  requestStatus(): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    const message = JSON.stringify([MobileOpcode.STATUS_REQUEST]);
    this.socket.send(message).catch(console.error);
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

/**
 * Check if desktop is online for a user (before attempting WebSocket connection)
 */
export async function checkDesktopOnline(userId: string, riftHttpUrl: string): Promise<{
  desktopOnline: boolean;
  registered: boolean;
  error?: string;
}> {
  try {
    const response = await fetch(`${riftHttpUrl}/status/${userId}`);

    if (!response.ok) {
      return {
        desktopOnline: false,
        registered: false,
        error: `Server error: ${response.status}`
      };
    }

    const data = await response.json();
    return {
      desktopOnline: data.desktopOnline || false,
      registered: data.registered || false
    };
  } catch (error: any) {
    // Network error - server probably not reachable
    return {
      desktopOnline: false,
      registered: false,
      error: error.message || 'Cannot reach server'
    };
  }
}

