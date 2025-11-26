/**
 * Configuration for mobile app
 */

// For physical device: use your computer's IP address (e.g., ws://192.168.1.100:51001)
// For emulator: use localhost or 127.0.0.1
// For same device: use localhost
export const RIFT_URL = process.env.EXPO_PUBLIC_RIFT_URL || 'ws://127.0.0.1:51001';
export const RIFT_HTTP_URL = process.env.EXPO_PUBLIC_RIFT_HTTP_URL || 'http://127.0.0.1:51001';

