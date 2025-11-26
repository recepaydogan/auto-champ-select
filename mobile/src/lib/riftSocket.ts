/**
 * WebSocket client for connecting to Rift server
 * Similar to mimic-reference/web/src/components/root/rift-socket.ts
 */

import { Platform } from 'react-native';
import 'react-native-get-random-values'; // Polyfill for crypto.getRandomValues
// @ts-ignore - expo-crypto types may not be available
import * as ExpoCrypto from 'expo-crypto';
// @ts-ignore - crypto-js types may not be available
import CryptoJS from 'crypto-js';
// @ts-ignore - jsencrypt types may not be available
import JSEncrypt from 'jsencrypt';

export const RiftSocketState = {
  CONNECTING: 0,
  FAILED_NO_DESKTOP: 1,
  FAILED_DESKTOP_DENY: 2,
  HANDSHAKING: 3,
  CONNECTED: 4,
  DISCONNECTED: 5
} as const;

export type RiftSocketStateValue = typeof RiftSocketState[keyof typeof RiftSocketState];

const RiftOpcode = {
  CONNECT: 4,
  CONNECT_PUBKEY: 5,
  SEND: 6,
  RECEIVE: 8
} as const;

export const MobileOpcode = {
  SECRET: 1,
  SECRET_RESPONSE: 2,
  VERSION: 3,
  VERSION_RESPONSE: 4,
  SUBSCRIBE: 5,
  UNSUBSCRIBE: 6,
  REQUEST: 7,
  RESPONSE: 8,
  UPDATE: 9
} as const;

export type MobileOpcodeValue = typeof MobileOpcode[keyof typeof MobileOpcode];

export default class RiftSocket {
  private socket: WebSocket | null = null;
  public onopen: (() => void) | null = null;
  public onmessage: ((msg: { data: string }) => void) | null = null;
  public onclose: (() => void) | null = null;
  public readyState = WebSocket.CONNECTING;
  public state: RiftSocketStateValue = RiftSocketState.CONNECTING;

  private key: CryptoKey | Uint8Array | null = null; // CryptoKey for web, Uint8Array for React Native
  private encrypted = false;

  constructor(private code: string, private riftUrl: string) {
    // Convert HTTP/HTTPS URL to WebSocket URL
    let wsUrl = riftUrl;
    if (riftUrl.startsWith('http://')) {
      wsUrl = riftUrl.replace('http://', 'ws://');
    } else if (riftUrl.startsWith('https://')) {
      wsUrl = riftUrl.replace('https://', 'wss://');
    } else if (!riftUrl.startsWith('ws://') && !riftUrl.startsWith('wss://')) {
      // If no protocol specified, assume ws://
      wsUrl = `ws://${riftUrl}`;
    }
    
    wsUrl = `${wsUrl}/mobile?code=${code}`;
    console.log('[RiftSocket] Connecting to:', wsUrl);
    
    this.socket = new WebSocket(wsUrl);
    this.socket.onopen = this.handleOpen;
    this.socket.onmessage = this.handleMessage;
    this.socket.onerror = this.handleError;
    this.socket.onclose = this.handleClose;
  }

  /**
   * Encrypts and sends a message
   */
  public async send(contents: string) {
    if (!this.key || !this.encrypted) {
      throw new Error('Not encrypted yet');
    }

    let encryptedPayload: string;

    if (Platform.OS === 'web') {
      // Generate random IV
      const iv = new Uint8Array(16);
      crypto.getRandomValues(iv);
      
      // Encrypt using Web Crypto
      const encryptedBuffer = await crypto.subtle.encrypt(
        { name: 'AES-CBC', iv: iv },
        this.key as CryptoKey,
        new TextEncoder().encode(contents)
      );
      
      const ivBase64 = this.arrayBufferToBase64(iv.buffer);
      const encryptedBase64 = this.arrayBufferToBase64(encryptedBuffer);
      encryptedPayload = ivBase64 + ':' + encryptedBase64;
    } else {
      // For React Native, use CryptoJS directly (no ArrayBuffer conversions!)
      const keyArray = this.key as Uint8Array;
      const keyBuffer = new ArrayBuffer(keyArray.length);
      new Uint8Array(keyBuffer).set(keyArray);
      const keyBase64 = this.arrayBufferToBase64(keyBuffer);
      
      console.log('[RiftSocket] Encrypting with key base64:', keyBase64);
      
      // Generate random IV using CryptoJS
      const ivWords = CryptoJS.lib.WordArray.random(16);
      const ivBase64 = ivWords.toString(CryptoJS.enc.Base64);
      
      // Parse key
      const key = CryptoJS.enc.Base64.parse(keyBase64);
      
      // Encrypt - use CryptoJS base64 directly, no intermediate conversions!
      const encrypted = CryptoJS.AES.encrypt(contents, key, {
        iv: ivWords,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
      });
      
      const encryptedBase64 = encrypted.ciphertext.toString(CryptoJS.enc.Base64);
      encryptedPayload = ivBase64 + ':' + encryptedBase64;
      
      console.log('[RiftSocket] Encrypted payload:', encryptedPayload.substring(0, 50) + '...');
    }

    this.socket?.send(JSON.stringify([
      RiftOpcode.SEND,
      encryptedPayload
    ]));
  }

  /**
   * Handles WebSocket open
   */
  private handleOpen = () => {
    // Request the public key for our target
    this.socket?.send(JSON.stringify([RiftOpcode.CONNECT, this.code]));
  };

  /**
   * Handles WebSocket message
   */
  private handleMessage = async (msg: { data: string }) => {
    try {
      const [op, ...data] = JSON.parse(msg.data);

      if (op === RiftOpcode.CONNECT_PUBKEY) {
        const pubkey = data[0];

        if (!pubkey) {
          this.state = RiftSocketState.FAILED_NO_DESKTOP;
          return;
        }

        this.state = RiftSocketState.HANDSHAKING;
        await this.sendIdentity(pubkey);
      } else if (op === RiftOpcode.RECEIVE) {
        await this.handleMobileMessage(data[0]);
      }
    } catch (error) {
      console.error('[RiftSocket] Error handling message:', error);
    }
  };

  /**
   * Handles WebSocket error
   */
  private handleError = (error: any) => {
    console.error('[RiftSocket] WebSocket error:', error);
    // If we haven't opened yet and get an error, mark as failed
    if (this.readyState === WebSocket.CONNECTING) {
      this.readyState = WebSocket.CLOSED as any;
      this.state = RiftSocketState.FAILED_NO_DESKTOP;
    }
  };

  /**
   * Handles WebSocket close
   */
  private handleClose = (event?: any) => {
    this.readyState = WebSocket.CLOSED as any;
    // Only set to disconnected if we were connected, otherwise keep failed state
    if (this.state === RiftSocketState.CONNECTED || this.state === RiftSocketState.HANDSHAKING) {
      this.state = RiftSocketState.DISCONNECTED;
    } else if (this.state === RiftSocketState.CONNECTING) {
      // If we were connecting and closed, mark as failed
      this.state = RiftSocketState.FAILED_NO_DESKTOP;
    }
    if (this.onclose) {
      this.onclose();
    }
  };

  /**
   * Sends identity and establishes encryption
   */
  private async sendIdentity(pubkey: string) {
    // Generate a random shared key
    const secret = new Uint8Array(32);
    if (Platform.OS === 'web') {
      crypto.getRandomValues(secret);
    } else {
      // For React Native, use expo-crypto
      const randomBytes = await ExpoCrypto.getRandomBytesAsync(32);
      secret.set(randomBytes);
    }

    // Import as CryptoKey
    if (Platform.OS === 'web') {
      this.key = await crypto.subtle.importKey(
        'raw',
        secret.buffer,
        { name: 'AES-CBC' },
        false,
        ['encrypt', 'decrypt']
      );
    } else {
      // For React Native, store as Uint8Array
      this.key = secret;
    }

    // Encrypt identity with RSA public key
    const deviceId = this.getDeviceID();
    const { device, browser } = this.getDeviceDescription();
    
    const secretBase64 = this.arrayBufferToBase64(secret.buffer);
    console.log('[RiftSocket] Sending secret key base64:', secretBase64);
    console.log('[RiftSocket] Secret key base64 length:', secretBase64.length);
    
    const identify = JSON.stringify({
      secret: secretBase64,
      identity: deviceId,
      device,
      browser
    });

    // Encrypt with RSA
    let encrypted: string;
    if (Platform.OS === 'web') {
      // Use Web Crypto API for RSA encryption
      const publicKeyObj = await this.importRSAPublicKey(pubkey);
      const encryptedBuffer = await crypto.subtle.encrypt(
        { name: 'RSA-OAEP' },
        publicKeyObj,
        new TextEncoder().encode(identify)
      );
      encrypted = this.arrayBufferToBase64(encryptedBuffer);
    } else {
      // For React Native, we need RSA-OAEP encryption
      // Try to use Web Crypto API if available (Expo web), otherwise fallback
      try {
        // Check if we're in Expo web environment (has crypto.subtle)
        if (typeof crypto !== 'undefined' && crypto.subtle) {
          const publicKeyObj = await this.importRSAPublicKey(pubkey);
          const encryptedBuffer = await crypto.subtle.encrypt(
            { name: 'RSA-OAEP' },
            publicKeyObj,
            new TextEncoder().encode(identify)
          );
          encrypted = this.arrayBufferToBase64(encryptedBuffer);
        } else {
          // Fallback: Use JSEncrypt (PKCS1) - desktop bridge will need to support both
          // TODO: Update desktop bridge to support PKCS1 padding as fallback
          const encrypt = new JSEncrypt();
          const pemKey = `-----BEGIN PUBLIC KEY-----\n${pubkey.match(/.{1,64}/g)?.join('\n')}\n-----END PUBLIC KEY-----`;
          encrypt.setPublicKey(pemKey);
          const encryptedResult = encrypt.encrypt(identify);
          if (!encryptedResult) {
            throw new Error('RSA encryption failed');
          }
          encrypted = encryptedResult;
        }
      } catch (error) {
        console.error('[RiftSocket] RSA encryption error:', error);
        throw new Error('RSA encryption failed: ' + (error as Error).message);
      }
    }

    // Send the handshake to Conduit
    this.socket?.send(JSON.stringify([
      RiftOpcode.SEND,
      [MobileOpcode.SECRET, encrypted]
    ]));
  }

  /**
   * Handles incoming encrypted message
   */
  private async handleMobileMessage(parts: any) {
    if (this.encrypted && this.key && typeof parts === 'string') {
      const [ivBase64, encryptedBase64] = parts.split(':');

      let decrypted: string;
      if (Platform.OS === 'web') {
        // Decrypt incoming message using Web Crypto
        const ivBuffer = this.base64ToArrayBuffer(ivBase64);
        const encryptedBuffer = this.base64ToArrayBuffer(encryptedBase64);
        const decryptedBuffer = await crypto.subtle.decrypt(
          { name: 'AES-CBC', iv: ivBuffer },
          this.key as CryptoKey,
          encryptedBuffer
        );
        decrypted = new TextDecoder('utf-8').decode(decryptedBuffer);
      } else {
        // For React Native, use CryptoJS directly with base64 strings
        // No need to convert to ArrayBuffer and back!
        const keyArray = this.key as Uint8Array;
        const keyBuffer = new ArrayBuffer(keyArray.length);
        new Uint8Array(keyBuffer).set(keyArray);
        const keyBase64 = this.arrayBufferToBase64(keyBuffer);
        
        // Parse directly from base64 - much simpler!
        const key = CryptoJS.enc.Base64.parse(keyBase64);
        const iv = CryptoJS.enc.Base64.parse(ivBase64);
        const ciphertext = CryptoJS.enc.Base64.parse(encryptedBase64);
        
        const decryptedCrypto = CryptoJS.AES.decrypt(
          { ciphertext: ciphertext } as any,
          key,
          { iv: iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }
        );
        decrypted = decryptedCrypto.toString(CryptoJS.enc.Utf8);
        
        if (!decrypted) {
          console.error('[RiftSocket] Decryption failed - empty result');
          return;
        }
      }

      if (this.onmessage) {
        this.onmessage({ data: decrypted });
      }
      return;
    }

    if (Array.isArray(parts) && parts[0] === MobileOpcode.SECRET_RESPONSE) {
      const succeeded = parts[1];

      if (!succeeded) {
        this.state = RiftSocketState.FAILED_DESKTOP_DENY;
        this.key = null;
        return;
      }

      // Handshake is done, we're "open" now
      this.encrypted = true;
      this.readyState = WebSocket.OPEN as any;
      this.state = RiftSocketState.CONNECTED;
      if (this.onopen) {
        this.onopen();
      }
    }
  }

  /**
   * Gets device ID
   */
  private getDeviceID(): string {
    // Generate a persistent device ID
    // In production, store this in AsyncStorage
    return 'device-' + Math.random().toString(36).substring(7);
  }

  /**
   * Gets device description
   */
  private getDeviceDescription(): { device: string; browser: string } {
    return {
      device: Platform.OS,
      browser: 'React Native'
    };
  }

  /**
   * Imports RSA public key (works for both web and React Native with Web Crypto API)
   */
  private async importRSAPublicKey(pubkey: string): Promise<CryptoKey> {
    // The pubkey from Rift is base64 SPKI format
    // Convert to ArrayBuffer
    const binaryDer = this.base64ToArrayBuffer(pubkey);
    
    // Use Web Crypto API (available in Expo web, or polyfilled)
    if (typeof crypto === 'undefined' || !crypto.subtle) {
      throw new Error('Web Crypto API not available');
    }
    
    return await crypto.subtle.importKey(
      'spki',
      binaryDer,
      {
        name: 'RSA-OAEP',
        hash: 'SHA-256'
      },
      false,
      ['encrypt']
    );
  }

  /**
   * Encrypts data with AES-CBC
   */
  private async encryptAES(iv: Uint8Array, data: string): Promise<ArrayBuffer> {
    if (Platform.OS === 'web' && this.key) {
      const ivBuffer = new ArrayBuffer(iv.length);
      new Uint8Array(ivBuffer).set(iv);
      return await crypto.subtle.encrypt(
        { name: 'AES-CBC', iv: ivBuffer },
        this.key as CryptoKey,
        new TextEncoder().encode(data)
      );
    } else if (Platform.OS !== 'web' && this.key) {
      // For React Native, use CryptoJS
      const keyArray = this.key as Uint8Array;
      const keyBuffer = new ArrayBuffer(keyArray.length);
      new Uint8Array(keyBuffer).set(keyArray);
      const keyBase64 = this.arrayBufferToBase64(keyBuffer);
      const key = CryptoJS.enc.Base64.parse(keyBase64);
      
      // Convert IV to base64 then to CryptoJS WordArray
      const ivBuffer = new ArrayBuffer(iv.length);
      new Uint8Array(ivBuffer).set(iv);
      const ivBase64 = this.arrayBufferToBase64(ivBuffer);
      const ivCrypto = CryptoJS.enc.Base64.parse(ivBase64);
      
      const encrypted = CryptoJS.AES.encrypt(data, key, {
        iv: ivCrypto,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
      });
      
      // Convert CryptoJS ciphertext to ArrayBuffer
      const encryptedBase64 = encrypted.ciphertext.toString(CryptoJS.enc.Base64);
      return this.base64ToArrayBuffer(encryptedBase64);
    }
    throw new Error('AES encryption not available');
  }

  /**
   * Converts ArrayBuffer to base64
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    // Use the same approach as mimic-reference: btoa(String.fromCharCode(...bytes))
    // This works consistently across platforms
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    
    if (Platform.OS === 'web') {
      return btoa(binary);
    } else {
      // For React Native, use standard base64 encoding
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      let result = '';
      const len = binary.length;
      
      for (let i = 0; i < len; i += 3) {
        const a = binary.charCodeAt(i);
        const b = i + 1 < len ? binary.charCodeAt(i + 1) : 0;
        const c = i + 2 < len ? binary.charCodeAt(i + 2) : 0;
        
        const bitmap = (a << 16) | (b << 8) | c;
        
        result += chars.charAt((bitmap >> 18) & 63);
        result += chars.charAt((bitmap >> 12) & 63);
        result += (i + 1 < len) ? chars.charAt((bitmap >> 6) & 63) : '=';
        result += (i + 2 < len) ? chars.charAt(bitmap & 63) : '=';
      }
      return result;
    }
  }

  /**
   * Converts base64 to ArrayBuffer
   */
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    if (Platform.OS === 'web') {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes.buffer;
    } else {
      // For React Native, manually decode base64
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      let binary = '';
      base64 = base64.replace(/[^A-Za-z0-9\+\/]/g, '');
      for (let i = 0; i < base64.length; i += 4) {
        const enc1 = chars.indexOf(base64.charAt(i));
        const enc2 = chars.indexOf(base64.charAt(i + 1));
        const enc3 = chars.indexOf(base64.charAt(i + 2));
        const enc4 = chars.indexOf(base64.charAt(i + 3));
        const bitmap = (enc1 << 18) | (enc2 << 12) | (enc3 << 6) | enc4;
        binary += String.fromCharCode((bitmap >> 16) & 255);
        if (enc3 !== 64) binary += String.fromCharCode((bitmap >> 8) & 255);
        if (enc4 !== 64) binary += String.fromCharCode(bitmap & 255);
      }
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes.buffer;
    }
  }

  /**
   * Closes the connection
   */
  public close() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }
}
