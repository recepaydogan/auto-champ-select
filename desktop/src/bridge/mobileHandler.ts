/**
 * Handles mobile connections and encrypted messaging
 */

import { MobileOpcode } from './types';
import { decryptRSA, encryptAES, decryptAES } from './crypto';

export interface MobileHandlerCallbacks {
  onRequest: (id: number, path: string, method: string, body: string | null) => Promise<{ status: number; content: any }>;
  onSubscribe: (path: string) => void;
  onUnsubscribe: (path: string) => void;
  onConnectionRequest: (deviceInfo: { device: string; browser: string; identity: string }) => Promise<boolean>;
}

export class MobileHandler {
  private aesKeyBase64: string | null = null;
  private observedPaths: Map<string, RegExp> = new Map();
  private callbacks: MobileHandlerCallbacks;
  private lcuObservers: Map<string, () => void> = new Map();
  private approved: boolean = false;
  private pendingDeviceInfo: { device: string; browser: string; identity: string } | null = null;

  constructor(callbacks: MobileHandlerCallbacks) {
    this.callbacks = callbacks;
  }

  /**
   * Handles incoming message from mobile (before decryption)
   */
  async handleMessage(message: any): Promise<string | null> {
    // Check if this is a secret handshake message
    if (Array.isArray(message) && message[0] === MobileOpcode.SECRET) {
      console.log('[MobileHandler] Handling secret handshake');
      return await this.handleSecretHandshake(message[1]);
    }

    // If we have an AES key, decrypt the message
    if (this.aesKeyBase64 && typeof message === 'string') {
      console.log('[MobileHandler] Decrypting message...');
      try {
        const decrypted = await decryptAES(this.aesKeyBase64, message);
        console.log('[MobileHandler] Decrypted successfully');
        return decrypted;
      } catch (error) {
        console.error('[MobileHandler] Failed to decrypt message:', error);
        return null;
      }
    }

    console.warn('[MobileHandler] Cannot handle message - hasAESKey:', !!this.aesKeyBase64, 'messageType:', typeof message, 'approved:', this.approved);
    return null;
  }

  /**
   * Handles decrypted mobile message
   */
  async handleDecryptedMessage(decrypted: string): Promise<any> {
    // Block all requests if not approved
    if (!this.approved) {
      console.warn('[MobileHandler] Request blocked - device not approved');
      return null;
    }

    try {
      const msg = JSON.parse(decrypted);
      
      if (!Array.isArray(msg)) {
        return null;
      }

      const opcode = msg[0];

      if (opcode === MobileOpcode.SUBSCRIBE) {
        const path = msg[1];
        this.observePath(path);
        this.callbacks.onSubscribe(path);
        return null;
      } else if (opcode === MobileOpcode.UNSUBSCRIBE) {
        const path = msg[1];
        this.unobservePath(path);
        this.callbacks.onUnsubscribe(path);
        return null;
      } else if (opcode === MobileOpcode.REQUEST) {
        const [id, path, method, body] = msg.slice(1);
        console.log('[MobileHandler] REQUEST:', method, path);
        const result = await this.callbacks.onRequest(id, path, method, body || null);
        return [MobileOpcode.RESPONSE, id, result.status, result.content];
      } else if (opcode === MobileOpcode.VERSION) {
        return [MobileOpcode.VERSION_RESPONSE, '1.0.0', 'Desktop'];
      }

      return null;
    } catch (error) {
      console.error('[MobileHandler] Error handling decrypted message:', error);
      return null;
    }
  }

  /**
   * Encrypts a message for mobile
   */
  async encryptMessage(message: any): Promise<string> {
    if (!this.aesKeyBase64) {
      throw new Error('No AES key established');
    }

    const json = JSON.stringify(message);
    return await encryptAES(this.aesKeyBase64, json);
  }

  /**
   * Handles secret handshake
   */
  private async handleSecretHandshake(encryptedSecret: string): Promise<string | null> {
    try {
      const decrypted = await decryptRSA(encryptedSecret);
      if (!decrypted) {
        return JSON.stringify([MobileOpcode.SECRET_RESPONSE, false]);
      }

      const info = JSON.parse(decrypted);
      
      if (!info.secret || !info.identity) {
        return JSON.stringify([MobileOpcode.SECRET_RESPONSE, false]);
      }

      // Store device info for approval
      this.pendingDeviceInfo = {
        device: info.device || 'Unknown',
        browser: info.browser || 'Unknown',
        identity: info.identity
      };

      // Request approval from user (this will show modal in desktop window)
      // Note: This is async, but we need to return synchronously for the handshake
      // So we'll handle approval asynchronously and return a pending response
      let approved = false;
      
      try {
        approved = await this.callbacks.onConnectionRequest(this.pendingDeviceInfo);
      } catch (error) {
        console.error('[MobileHandler] Approval request failed:', error);
        approved = false;
      }
      
      if (approved) {
        // Store the AES key as base64 string - CryptoJS will parse it the same way mobile does
        console.log('[MobileHandler] AES key base64 received:', info.secret);
        console.log('[MobileHandler] AES key base64 length:', info.secret.length);
        this.aesKeyBase64 = info.secret;
        this.approved = true;
        console.log('[MobileHandler] Device approved:', info.identity);
        this.pendingDeviceInfo = null;
        return JSON.stringify([MobileOpcode.SECRET_RESPONSE, true]);
      } else {
        console.log('[MobileHandler] Device rejected:', info.identity);
        this.pendingDeviceInfo = null;
        this.aesKeyBase64 = null;
        return JSON.stringify([MobileOpcode.SECRET_RESPONSE, false]);
      }
    } catch (error) {
      console.error('[MobileHandler] Secret handshake failed:', error);
      return JSON.stringify([MobileOpcode.SECRET_RESPONSE, false]);
    }
  }

  /**
   * Observes an LCU path
   */
  private observePath(pathPattern: string): void {
    if (this.observedPaths.has(pathPattern)) {
      return;
    }

    const regex = new RegExp(pathPattern);
    this.observedPaths.set(pathPattern, regex);

    // Note: Actual observation is handled by bridgeManager
    // This just tracks the pattern
  }

  /**
   * Stops observing an LCU path
   */
  private unobservePath(pathPattern: string): void {
    const unsubscribe = this.lcuObservers.get(pathPattern);
    if (unsubscribe) {
      unsubscribe();
      this.lcuObservers.delete(pathPattern);
    }
    this.observedPaths.delete(pathPattern);
  }

  /**
   * Checks if a path matches any observed patterns
   */
  matchesObservedPath(path: string): boolean {
    for (const regex of this.observedPaths.values()) {
      if (regex.test(path)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Cleans up all observers
   */
  cleanup(): void {
    for (const unsubscribe of this.lcuObservers.values()) {
      unsubscribe();
    }
    this.lcuObservers.clear();
    this.observedPaths.clear();
    this.aesKeyBase64 = null;
  }
}

