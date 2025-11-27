/* eslint-disable @typescript-eslint/no-explicit-any */
// lcuClient.ts
// LCU API client with HTTP and WebSocket support

import type { LcuConfig } from './lcuConnection';

export interface LcuEvent {
  uri: string;
  eventType: 'Create' | 'Update' | 'Delete';
  data: any;
}

export type LcuEventListener = (event: LcuEvent) => void;

/**
 * Checks if an error is an expected LCU state error (not a real failure)
 * These errors occur when the game state doesn't support the requested operation
 */
function isExpectedLcuError(error: Error | string): boolean {
  const errorMessage = typeof error === 'string' ? error : error.message || '';
  const expectedErrors = [
    'LOBBY_NOT_FOUND',
    'Not attached to a matchmaking queue',
    'No matchmaking search exists',
    'No active delegate',
    'QUEUE_NOT_ENABLED'
  ];

  return expectedErrors.some(expected => errorMessage.includes(expected));
}

export class LcuClient {
  private config: LcuConfig | null = null;
  private ws: WebSocket | null = null;
  private listeners: Map<string, Set<LcuEventListener>> = new Map();
  private reconnectTimer: number | null = null;
  private isConnecting = false;
  private pollingIntervals: Map<string, number> = new Map();
  private lastValues: Map<string, any> = new Map();
  private proxyConfigured = false;

  constructor() { }

  /**
   * Connects to the LCU API using the provided config
   * Verifies connection by making a test request
   */
  async connect(config: LcuConfig): Promise<void> {
    if (this.config && this.config.port === config.port && this.config.password === config.password) {
      // Already connected with same config - but verify it still works
      try {
        await this.verifyConnection();
        return;
      } catch {
        // Connection no longer works, reconnect
        this.disconnect();
      }
    }

    this.config = config;
    this.proxyConfigured = false;

    // Verify connection works before reporting as connected
    try {
      await this.verifyConnection();
    } catch (error) {
      this.config = null;
      throw new Error('LCU connection failed - League client not responding');
    }

    // Start WebSocket for events (non-blocking, HTTP fallback works)
    this.connectWebSocket();
  }

  /**
   * Verifies the LCU connection by making a test request
   */
  private async verifyConnection(): Promise<void> {
    if (!this.config) {
      throw new Error('No config');
    }

    // Ensure proxy has our config first
    await this.setProxyConfig();

    // Make a test request via proxy using XMLHttpRequest for consistency
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', 'http://127.0.0.1:21337/lol-summoner/v1/current-summoner', true);
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.timeout = 5000; // 5 second timeout

      xhr.onload = () => {
        // 404 is okay (not logged in), 200 is connected
        if (xhr.status === 200 || xhr.status === 404) {
          resolve();
        } else if (xhr.status === 500) {
          // Proxy returns 500 with error details when LCU can't be reached
          if (xhr.responseText.includes('ECONNREFUSED') || xhr.responseText.includes('not running')) {
            reject(new Error('LCU not responding - League client not running'));
          } else {
            reject(new Error('LCU request failed: ' + xhr.responseText));
          }
        } else {
          resolve(); // Other statuses are okay (e.g., 401 = no auth but server is there)
        }
      };

      xhr.onerror = () => {
        reject(new Error('LCU verification request failed'));
      };

      xhr.ontimeout = () => {
        reject(new Error('LCU verification timeout'));
      };

      xhr.send();
    });
  }

  /**
   * Disconnects from the LCU API
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    // Stop all polling
    for (const [, interval] of this.pollingIntervals.entries()) {
      clearInterval(interval);
    }
    this.pollingIntervals.clear();
    this.lastValues.clear();

    this.config = null;
    this.isConnecting = false;
    this.proxyConfigured = false;
  }

  /**
   * Checks if currently connected
   * Note: We consider connected if we have config, even without WebSocket
   * HTTP requests work fine without WebSocket
   */
  isConnected(): boolean {
    return this.config !== null;
  }

  /**
   * Makes an HTTP request to the LCU API
   * Proxies through background script to avoid CORS issues
   */
  async request(path: string, method: string = 'GET', body?: any): Promise<any> {
    if (!this.config) {
      throw new Error('Not connected to LCU');
    }

    // Try to proxy through background script first
    return new Promise((resolve, reject) => {
      // Get current window to determine if we're in background or desktop
      overwolf.windows.getCurrentWindow((windowResult: any) => {
        const windowName = windowResult.window?.name;
        const isBackground = windowName === 'background';

        // Only log for queue-related requests to reduce noise
        if (path.includes('queues') || path.includes('EnabledGameQueues') || path.includes('DefaultGameQueues')) {
          console.log('[LCU Client] Request:', method, path, isBackground ? '(background)' : '(desktop)');
        }

        if (isBackground) {
          // We're in background script - make direct request
          this.makeDirectRequest(path, method, body).then(resolve).catch(reject);
        } else {
          // We're in desktop window - proxy through background
          this.proxyRequest(path, method, body).then(resolve).catch(reject);
        }
      });
    });
  }

  /**
   * Makes a direct HTTP request via local proxy server to bypass CORS
   */
  private async makeDirectRequest(path: string, method: string, body?: any): Promise<any> {
    if (!this.config) {
      throw new Error('Not connected to LCU');
    }

    // Use local proxy server to bypass CORS
    const proxyUrl = `http://127.0.0.1:21337${path}`;

    // First, ensure proxy has our config
    try {
      await this.setProxyConfig();
    } catch (error) {
      console.warn('[LCU Client] Proxy config failed, trying direct request:', error);
      // Fall back to direct request (will likely fail due to CORS)
    }

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(method, proxyUrl, true);

      // No custom headers needed - proxy handles auth
      xhr.setRequestHeader('Accept', 'application/json');

      // Only set Content-Type if there's actually a body (matching Mimic's behavior)
      if (body !== undefined && body !== null) {
        xhr.setRequestHeader('Content-Type', 'application/json');
      }

      xhr.onload = () => {
        const responseText = xhr.responseText;

        if (xhr.status === 204 || xhr.status === 202) {
          resolve(null);
          return;
        }

        if (xhr.status >= 200 && xhr.status < 300) {
          if (!responseText) {
            resolve(null);
            return;
          }
          try {
            const data = JSON.parse(responseText);
            if (data.error) {
              const error = new Error(data.error);
              if (isExpectedLcuError(error)) {
                // Expected errors - return null silently
                resolve(null);
              } else {
                console.error('[LCU Client] Request failed:', path, data.error);
                reject(error);
              }
            } else {
              // Only log for queue-related requests
              if (path.includes('queues') || path.includes('EnabledGameQueues') || path.includes('DefaultGameQueues')) {
                console.log('[LCU Client] ✓', method, path, '->', Array.isArray(data) ? `${data.length} items` : 'success');
              }
              resolve(data);
            }
          } catch (error) {
            console.error('[LCU Client] Failed to parse response:', path, error);
            reject(new Error(`Failed to parse response: ${error}`));
          }
        } else {
          // Try to parse error response for more details
          let errorMessage = `HTTP ${xhr.status}: ${xhr.statusText}`;
          if (responseText) {
            try {
              const errorData = JSON.parse(responseText);
              if (errorData.message) {
                errorMessage = errorData.message;
              } else if (errorData.error) {
                errorMessage = errorData.error;
              }
            } catch (e) {
              errorMessage = responseText.substring(0, 200);
            }
          }

          const error = new Error(errorMessage);
          if (isExpectedLcuError(error)) {
            // Expected errors - return null silently
            resolve(null);
          } else {
            console.error('[LCU Client] Request failed:', path, errorMessage);
            reject(error);
          }
        }
      };

      xhr.onerror = () => {
        console.error('[LCU Client] Proxy request failed - is proxy server running on port 21337?');
        reject(new Error('Network error - is proxy server running? Start it with: node desktop/lcu-proxy-server.js'));
      };

      xhr.ontimeout = () => {
        console.error('[LCU Client] Proxy request timed out');
        reject(new Error('Request timeout - proxy server may not be running'));
      };

      xhr.timeout = 10000;

      // Send request
      try {
        if (body !== undefined) {
          const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
          xhr.send(bodyStr);
        } else {
          xhr.send();
        }
      } catch (error) {
        console.error('[LCU Client] Error sending request:', error);
        reject(error);
      }
    });
  }

  /**
   * Sets the LCU config on the proxy server
   */
  private async setProxyConfig(): Promise<void> {
    if (!this.config) return;
    if (this.proxyConfigured) return;

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', 'http://127.0.0.1:21337/set-config', true);
      xhr.setRequestHeader('Content-Type', 'application/json');

      xhr.onload = () => {
        if (xhr.status === 200) {
          this.proxyConfigured = true;
          resolve();
        } else {
          reject(new Error(`Failed to set proxy config: ${xhr.status}`));
        }
      };

      xhr.onerror = () => {
        // Proxy server might not be running - that's OK, we'll try direct
        resolve();
      };

      xhr.send(JSON.stringify(this.config));
    });
  }

  /**
   * Proxies request through background script
   */
  private async proxyRequest(path: string, method: string, body?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const requestId = Date.now().toString();
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      // Helper to clear timeout and resolve
      const clearTimeoutAndResolve = (value: any) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        resolve(value);
      };

      // Helper to clear timeout and reject
      const clearTimeoutAndReject = (error: any) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        reject(error);
      };

      // Set up response listener (minimal logging)
      const messageListener = (windowId: any, _messageId: any, message: any) => {
        // Extract message content - Overwolf API puts it in windowId.content
        let messageContent: string | null = null;

        if (windowId && typeof windowId === 'object' && typeof windowId.content === 'string') {
          messageContent = windowId.content;
        } else if (typeof message === 'string') {
          messageContent = message;
        } else if (message && typeof message === 'object' && typeof message.content === 'string') {
          messageContent = message.content;
        } else if (typeof windowId === 'string') {
          messageContent = windowId;
        }

        if (!messageContent) return;

        try {
          const data = JSON.parse(messageContent);

          if (data.type === 'lcu_response' && data.requestId === requestId) {
            overwolf.windows.onMessageReceived.removeListener(messageListener);

            if (data.error) {
              const error = new Error(data.error);
              if (isExpectedLcuError(error)) {
                clearTimeoutAndResolve(null);
              } else {
                clearTimeoutAndReject(error);
              }
            } else {
              clearTimeoutAndResolve(data.data);
            }
          }
          // Ignore messages with different requestId (they're for other listeners)
        } catch {
          // Ignore parse errors
        }
      };

      overwolf.windows.onMessageReceived.addListener(messageListener);

      // Send request to background
      overwolf.windows.obtainDeclaredWindow('background', (result: any) => {
        if (result.success) {
          const messageContent = JSON.stringify({
            type: 'lcu_request',
            requestId,
            path,
            method,
            body,
            config: this.config
          });

          overwolf.windows.sendMessage(result.window.id, requestId, messageContent, (sendResult: any) => {
            if (sendResult.status === 'error') {
              overwolf.windows.onMessageReceived.removeListener(messageListener);
              clearTimeoutAndReject(new Error('Failed to send request to background: ' + (sendResult.error || 'Unknown error')));
            }
          });
        } else {
          overwolf.windows.onMessageReceived.removeListener(messageListener);
          clearTimeoutAndReject(new Error('Background window not found'));
        }
      });

      // Timeout after 10 seconds
      timeoutId = setTimeout(() => {
        overwolf.windows.onMessageReceived.removeListener(messageListener);
        clearTimeoutAndReject(new Error('Request timeout'));
      }, 10000);
    });
  }

  /**
   * Subscribes to events matching a URI pattern
   * Uses WebSocket if available, otherwise falls back to HTTP polling
   */
  observe(uriPattern: string | RegExp, listener: LcuEventListener): () => void {
    const pattern = typeof uriPattern === 'string' ? uriPattern : uriPattern.source;

    if (!this.listeners.has(pattern)) {
      this.listeners.set(pattern, new Set());
    }

    this.listeners.get(pattern)!.add(listener);

    // If WebSocket is not connected, use HTTP polling
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.startPolling(pattern);
    }

    // Return unsubscribe function
    return () => {
      const patternKey = typeof uriPattern === 'string' ? uriPattern : uriPattern.source;
      const listeners = this.listeners.get(patternKey);
      if (listeners) {
        listeners.delete(listener);
        if (listeners.size === 0) {
          this.listeners.delete(patternKey);
          this.stopPolling(patternKey);
        }
      }
    };
  }

  /**
   * Starts HTTP polling for a URI pattern
   */
  private startPolling(pattern: string): void {
    if (this.pollingIntervals.has(pattern)) {
      return; // Already polling
    }

    const interval = window.setInterval(async () => {
      if (!this.config) return;

      try {
        const currentValue = await this.request(pattern);
        const lastValue = this.lastValues.get(pattern);

        // Check if value changed
        if (JSON.stringify(currentValue) !== JSON.stringify(lastValue)) {
          this.lastValues.set(pattern, currentValue);

          // Notify listeners
          const listeners = this.listeners.get(pattern);
          if (listeners) {
            listeners.forEach(listener => {
              try {
                listener({
                  uri: pattern,
                  eventType: lastValue === undefined ? 'Create' : 'Update',
                  data: currentValue,
                });
              } catch (err) {
                console.error('Error in LCU event listener:', err);
              }
            });
          }
        }
      } catch {
        // Endpoint might not exist or be available yet
        // Don't spam errors
      }
    }, 1000); // Poll every second

    this.pollingIntervals.set(pattern, interval);
  }

  /**
   * Stops HTTP polling for a URI pattern
   */
  private stopPolling(pattern: string): void {
    const interval = this.pollingIntervals.get(pattern);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(pattern);
      this.lastValues.delete(pattern);
    }
  }

  /**
   * Connects to the WebSocket for real-time updates
   * Note: LCU WebSocket requires WAMP authentication which browser WebSocket API doesn't support directly
   * This will fail with 403, but HTTP requests work fine for controlling the client
   */
  private async connectWebSocket(): Promise<void> {
    if (!this.config || this.isConnecting) {
      return;
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    this.isConnecting = true;

    try {
      // LCU WebSocket uses WAMP protocol and requires authentication
      // Browser WebSocket API doesn't support credential setting, so this will likely fail
      // But HTTP requests work fine, so we'll continue without WebSocket
      const wsUrl = `wss://127.0.0.1:${this.config.port}/`;
      const ws = new WebSocket(wsUrl, 'wamp');

      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        console.log('LCU WebSocket connected');
        this.isConnecting = false;

        // Subscribe to OnJsonApiEvent
        try {
          ws.send(JSON.stringify([5, 'OnJsonApiEvent']));
        } catch (error) {
          console.error('Failed to subscribe to events:', error);
        }
      };

      ws.onmessage = (event) => {
        this.handleWebSocketMessage(event);
      };

      ws.onerror = () => {
        // 403 is expected - browser WebSocket can't authenticate with LCU
        // HTTP requests work fine, so we'll continue without WebSocket
        console.log('LCU WebSocket connection failed (expected - using HTTP polling instead)');
        this.isConnecting = false;
        this.ws = null;
        // Don't reconnect - WebSocket won't work in browser environment
      };

      ws.onclose = (event) => {
        console.log('LCU WebSocket closed', event.code);
        this.ws = null;
        this.isConnecting = false;
        // Don't reconnect - WebSocket authentication not supported in browser
      };

      this.ws = ws;
    } catch (error) {
      console.log('LCU WebSocket not available (using HTTP polling instead):', error);
      this.isConnecting = false;
      // Don't schedule reconnect - WebSocket won't work
    }
  }

  /**
   * Handles incoming WebSocket messages
   */
  private handleWebSocketMessage(event: MessageEvent): void {
    try {
      const data = JSON.parse(event.data);

      // WAMP message format: [messageType, topic, ...]
      // OnJsonApiEvent is type 8
      if (Array.isArray(data) && data.length >= 3 && data[0] === 8 && data[1] === 'OnJsonApiEvent') {
        const eventData = data[2];
        const uri = eventData.uri;
        const eventType = eventData.eventType;
        const payload = eventData.data;

        // Notify matching listeners
        for (const [pattern, listeners] of this.listeners.entries()) {
          if (this.matchesPattern(uri, pattern)) {
            listeners.forEach(listener => {
              try {
                listener({
                  uri,
                  eventType,
                  data: payload,
                });
              } catch (error) {
                console.error('Error in LCU event listener:', error);
              }
            });
          }
        }
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  }

  /**
   * Checks if a URI matches a pattern (string or regex)
   */
  private matchesPattern(uri: string, pattern: string | RegExp): boolean {
    if (typeof pattern === 'string') {
      return uri === pattern || uri.startsWith(pattern);
    }
    return pattern.test(uri);
  }


  // Convenience methods for common operations

  /**
   * Enters the matchmaking queue
   */
  async enterQueue(): Promise<void> {
    await this.request('/lol-lobby/v2/lobby/matchmaking/search', 'POST');
  }

  /**
   * Cancels the matchmaking queue
   */
  async cancelQueue(): Promise<void> {
    console.log('[LCU Client] Cancelling queue...')

    // First check if there's an active queue
    try {
      const searchState = await this.getMatchmakingSearch()
      if (!searchState || !searchState.isCurrentlyInQueue) {
        console.log('[LCU Client] No active queue to cancel')
        return // Already not in queue, nothing to do
      }
    } catch (error: any) {
      // If we can't get the search state, try to cancel anyway
      // The DELETE will fail gracefully if there's no queue
      console.log('[LCU Client] Could not check queue state, attempting cancel anyway:', error.message)
    }

    try {
      await this.request('/lol-lobby/v2/lobby/matchmaking/search', 'DELETE');
      console.log('[LCU Client] Queue cancelled successfully')
    } catch (error: any) {
      // If it's an expected error, that's fine - we're already not in queue
      if (isExpectedLcuError(error)) {
        console.log('[LCU Client] No queue to cancel (already not in queue)')
        return // Success - we're not in queue
      }
      // Otherwise, rethrow the error
      throw error
    }
  }

  /**
   * Accepts a ready check
   */
  async acceptReadyCheck(): Promise<void> {
    await this.request('/lol-matchmaking/v1/ready-check/accept', 'POST');
  }

  /**
   * Declines a ready check
   */
  async declineReadyCheck(): Promise<void> {
    await this.request('/lol-matchmaking/v1/ready-check/decline', 'POST');
  }

  /**
   * Gets the current lobby state
   */
  async getLobby(): Promise<any> {
    return this.request('/lol-lobby/v2/lobby');
  }

  /**
   * Gets the current matchmaking search state
   */
  async getMatchmakingSearch(): Promise<any> {
    return this.request('/lol-matchmaking/v1/search');
  }

  /**
   * Gets the current ready check state
   */
  async getReadyCheck(): Promise<any> {
    return this.request('/lol-matchmaking/v1/ready-check');
  }

  /**
   * Gets the current champion select session
   */
  async getChampSelectSession(): Promise<any> {
    return this.request('/lol-champ-select/v1/session');
  }

  /**
   * Picks or bans a champion
   */
  async pickBanChampion(actionId: number, championId: number, completed: boolean = false): Promise<void> {
    await this.request(
      `/lol-champ-select/v1/session/actions/${actionId}`,
      'PATCH',
      { championId, completed }
    );
  }

  /**
   * Hovers a champion (sets championId without completing)
   */
  async hoverChampion(actionId: number, championId: number): Promise<void> {
    await this.request(
      `/lol-champ-select/v1/session/actions/${actionId}`,
      'PATCH',
      { championId }
    );
  }

  /**
   * Gets pickable champion IDs
   */
  async getPickableChampions(): Promise<number[]> {
    return this.request('/lol-champ-select/v1/pickable-champion-ids');
  }

  /**
   * Gets bannable champion IDs
   */
  async getBannableChampions(): Promise<number[]> {
    return this.request('/lol-champ-select/v1/bannable-champion-ids');
  }

  /**
   * Gets all available game queues
   */
  async getGameQueues(): Promise<any[]> {
    try {
      const data = await this.request('/lol-game-queues/v1/queues');
      if (Array.isArray(data)) {
        console.log('[LCU Client] getGameQueues: Got', data.length, 'queues');
        return data;
      } else {
        console.warn('[LCU Client] getGameQueues: Response is not an array:', typeof data, data);
        return [];
      }
    } catch (error) {
      console.error('[LCU Client] getGameQueues failed:', error);
      return [];
    }
  }

  /**
   * Gets enabled game queue IDs from platform config
   */
  async getEnabledGameQueues(): Promise<number[]> {
    try {
      const data = await this.request('/lol-platform-config/v1/namespaces/LcuSocial/EnabledGameQueues');
      // Platform config endpoint might return different formats
      let value: string = '';

      if (typeof data === 'string') {
        value = data;
      } else if (data && typeof data === 'object') {
        value = data.value || data.content || data.data || data.result || '';
        if (typeof value !== 'string' && value) {
          value = String(value);
        }
      }

      if (!value || typeof value !== 'string') {
        console.warn('[LCU Client] getEnabledGameQueues: Not a string, got:', typeof data);
        return [];
      }

      const result = value.split(',').map((x: string) => parseInt(x.trim(), 10)).filter((x: number) => !isNaN(x));
      console.log('[LCU Client] getEnabledGameQueues: Got', result.length, 'enabled queue IDs');
      return result;
    } catch (error) {
      console.error('[LCU Client] Failed to get enabled queues:', error);
      // Return empty array on error - we'll show all PvP queues as fallback
      return [];
    }
  }

  /**
   * Gets default game queue IDs from platform config
   */
  async getDefaultGameQueues(): Promise<number[]> {
    try {
      const data = await this.request('/lol-platform-config/v1/namespaces/LcuSocial/DefaultGameQueues');
      let value: string = '';

      if (typeof data === 'string') {
        value = data;
      } else if (data && typeof data === 'object') {
        value = data.value || data.content || data.data || data.result || '';
        if (typeof value !== 'string' && value) {
          value = String(value);
        }
      }

      if (!value || typeof value !== 'string') {
        console.warn('[LCU Client] getDefaultGameQueues: Not a string, got:', typeof data);
        return [];
      }

      const result = value.split(',').map((x: string) => parseInt(x.trim(), 10)).filter((x: number) => !isNaN(x));
      console.log('[LCU Client] getDefaultGameQueues: Got', result.length, 'default queue IDs');
      return result;
    } catch (error) {
      console.error('[LCU Client] Failed to get default queues:', error);
      return [];
    }
  }

  /**
   * Creates a lobby with the specified queue ID
   */
  async createLobby(queueId: number): Promise<void> {
    await this.request('/lol-lobby/v2/lobby', 'POST', { queueId });
  }
}

// Singleton instance
let lcuClientInstance: LcuClient | null = null;

/**
 * Gets the singleton LCU client instance
 */
export function getLcuClient(): LcuClient {
  if (!lcuClientInstance) {
    lcuClientInstance = new LcuClient();
  }
  return lcuClientInstance;
}

