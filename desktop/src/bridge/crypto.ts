/**
 * Crypto helpers for RSA and AES encryption
 * Similar to Mimic's CryptoHelpers.cs
 * Uses node-forge for PKCS#1 compatibility with mobile's JSEncrypt
 */

import * as forge from 'node-forge';

// Storage key for localStorage
const STORAGE_KEY = 'auto-champ-select-rsa-keys-v2';

interface StoredKeys {
  publicKeyPem: string;
  privateKeyPem: string;
  publicKeyBase64: string; // SPKI format for mobile
}

let cachedKeys: { publicKey: forge.pki.rsa.PublicKey; privateKey: forge.pki.rsa.PrivateKey; publicKeyBase64: string } | null = null;

/**
 * Gets or generates RSA keypair using node-forge (PKCS#1 compatible)
 */
async function getRSAKeyPair(): Promise<{ publicKey: forge.pki.rsa.PublicKey; privateKey: forge.pki.rsa.PrivateKey; publicKeyBase64: string }> {
  if (cachedKeys) {
    return cachedKeys;
  }

  // Try to load from localStorage
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const keys: StoredKeys = JSON.parse(stored);
      const publicKey = forge.pki.publicKeyFromPem(keys.publicKeyPem);
      const privateKey = forge.pki.privateKeyFromPem(keys.privateKeyPem);
      cachedKeys = { publicKey, privateKey, publicKeyBase64: keys.publicKeyBase64 };
      console.log('[Crypto] Loaded RSA keys from storage');
      return cachedKeys;
    }
  } catch (error) {
    console.warn('[Crypto] Failed to load stored keys, generating new ones:', error);
  }

  // Generate new keypair
  console.log('[Crypto] Generating new RSA keypair...');
  const keyPair = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
  
  // Export public key in SPKI/DER format (base64) for mobile
  const publicKeyAsn1 = forge.pki.publicKeyToAsn1(keyPair.publicKey);
  const publicKeyDer = forge.asn1.toDer(publicKeyAsn1).getBytes();
  const publicKeyBase64 = forge.util.encode64(publicKeyDer);
  
  // Save to localStorage
  try {
    const keyData: StoredKeys = {
      publicKeyPem: forge.pki.publicKeyToPem(keyPair.publicKey),
      privateKeyPem: forge.pki.privateKeyToPem(keyPair.privateKey),
      publicKeyBase64
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keyData));
    console.log('[Crypto] Saved new RSA keys to storage');
  } catch (error) {
    console.warn('[Crypto] Failed to save keys to localStorage:', error);
  }

  cachedKeys = { publicKey: keyPair.publicKey, privateKey: keyPair.privateKey, publicKeyBase64 };
  return cachedKeys;
}

/**
 * Exports the public key in base64 SPKI format (compatible with mobile)
 */
export async function exportPublicKey(): Promise<string> {
  const keyPair = await getRSAKeyPair();
  return keyPair.publicKeyBase64;
}

/**
 * Decrypts RSA-encrypted data using node-forge (PKCS#1 v1.5 compatible with JSEncrypt)
 */
export async function decryptRSA(encryptedBase64: string): Promise<string | null> {
  try {
    const keyPair = await getRSAKeyPair();
    const encrypted = forge.util.decode64(encryptedBase64);
    
    // Try PKCS#1 v1.5 first (JSEncrypt compatibility)
    try {
      const decrypted = keyPair.privateKey.decrypt(encrypted, 'RSAES-PKCS1-V1_5');
      console.log('[Crypto] RSA decryption succeeded (PKCS#1)');
      return decrypted;
    } catch {
      console.log('[Crypto] PKCS#1 decryption failed, trying OAEP...');
      // Try RSA-OAEP as fallback
      try {
        const decrypted = keyPair.privateKey.decrypt(encrypted, 'RSA-OAEP', {
          md: forge.md.sha256.create()
        });
        console.log('[Crypto] RSA decryption succeeded (OAEP)');
        return decrypted;
      } catch (oaepError) {
        console.error('[Crypto] Both PKCS#1 and OAEP decryption failed');
        throw oaepError;
      }
    }
  } catch (error) {
    console.error('[Crypto] RSA decryption failed:', error);
    return null;
  }
}

/**
 * Encrypts data with AES-CBC using CryptoJS (matches mobile)
 * Key is passed as base64 string to match mobile's format exactly
 */
export async function encryptAES(keyBase64: string, plaintext: string): Promise<string> {
  // Parse key with CryptoJS (same way mobile does)
  const cryptoKey = CryptoJS.enc.Base64.parse(keyBase64);
  
  // Generate random IV
  const ivWords = CryptoJS.lib.WordArray.random(16);
  const ivBase64 = ivWords.toString(CryptoJS.enc.Base64);
  
  // Encrypt
  const encrypted = CryptoJS.AES.encrypt(plaintext, cryptoKey, {
    iv: ivWords,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  });
  
  // Return iv:ciphertext format
  const encryptedBase64 = encrypted.ciphertext.toString(CryptoJS.enc.Base64);
  return ivBase64 + ':' + encryptedBase64;
}

/**
 * Decrypts AES-CBC encrypted data using Web Crypto API
 */
import CryptoJS from 'crypto-js';

export async function decryptAES(keyBase64: string, encryptedBase64: string): Promise<string> {
  console.log('[Crypto] decryptAES input - keyBase64 length:', keyBase64.length, 'encryptedBase64:', encryptedBase64.substring(0, 50) + '...');
  
  const parts = encryptedBase64.split(':');
  if (parts.length !== 2) {
    throw new Error(`Invalid encrypted format - expected "iv:ciphertext", got ${parts.length} parts`);
  }
  
  const [ivBase64, ciphertextBase64] = parts;
  
  // Parse key with CryptoJS
  const cryptoKey = CryptoJS.enc.Base64.parse(keyBase64);
  
  // Parse IV
  const iv = CryptoJS.enc.Base64.parse(ivBase64);
  
  // Parse ciphertext
  const ciphertext = CryptoJS.enc.Base64.parse(ciphertextBase64);
  
  console.log('[Crypto] decryptAES - key sigBytes:', cryptoKey.sigBytes, 'iv sigBytes:', iv.sigBytes, 'ciphertext sigBytes:', ciphertext.sigBytes);
  console.log('[Crypto] decryptAES - key first 4 words:', cryptoKey.words.slice(0, 4));
  
  // Create cipherParams object
  const cipherParams = CryptoJS.lib.CipherParams.create({
    ciphertext: ciphertext
  });
  
  // Decrypt
  const decrypted = CryptoJS.AES.decrypt(cipherParams, cryptoKey, {
    iv: iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  });
  
  console.log('[Crypto] decryptAES - decrypted sigBytes:', decrypted.sigBytes, 'words:', decrypted.words.slice(0, 4));
  
  // Convert to string
  const result = decrypted.toString(CryptoJS.enc.Utf8);
  if (!result) {
    console.error('[Crypto] decryptAES - empty result, raw decrypted hex:', decrypted.toString(CryptoJS.enc.Hex));
    throw new Error('Decryption failed - empty result');
  }
  
  return result;
}

