# Environment Variables Setup Guide

## Overview

You need to set up environment variables for three parts of the system:

1. **Desktop App** (Vite) - Uses `VITE_*` prefix
2. **Rift Server** (Node.js) - Uses `process.env`
3. **Mobile App** (Expo) - Uses `EXPO_PUBLIC_*` prefix

## 1. Desktop App (`desktop/.env`)

Create `desktop/.env` file:

```bash
# Supabase Configuration (if you're using Supabase)
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key

# Rift Server Configuration
VITE_RIFT_URL=http://localhost:51001
VITE_RIFT_JWT_SECRET=your-secret-key-change-this-in-production
```

**Important:** 
- `VITE_RIFT_JWT_SECRET` must match `RIFT_JWT_SECRET` in Rift server
- For local development, use `http://localhost:51001`
- For production, use your actual Rift server URL

## 2. Rift Server (`desktop/rift-server/.env`)

Create `desktop/rift-server/.env` file:

```bash
# JWT Secret for signing tokens
# MUST match VITE_RIFT_JWT_SECRET in desktop app
RIFT_JWT_SECRET=your-secret-key-change-this-in-production

# Server Port (optional, defaults to 51001)
PORT=51001
```

**Important:**
- `RIFT_JWT_SECRET` is **REQUIRED** - server won't start without it
- Must match the secret in desktop app
- Use a strong random string in production

## 3. Mobile App (`mobile/.env`)

Create `mobile/.env` file:

```bash
# Rift Server URLs
# For local testing (same WiFi network): ws://YOUR_COMPUTER_IP:51001
# For remote server: ws://your-server-ip:51001 or wss://your-domain.com
EXPO_PUBLIC_RIFT_URL=ws://localhost:51001
EXPO_PUBLIC_RIFT_HTTP_URL=http://localhost:51001
```

**Important:**
- `localhost` only works if mobile and desktop are on the same network
- For different networks, use your computer's local IP (e.g., `ws://192.168.1.100:51001`)
- Find your IP: `ipconfig` (Windows) or `ifconfig` (Mac/Linux)
- Use `wss://` (secure WebSocket) if using HTTPS

## Quick Setup Steps

### Step 1: Generate a JWT Secret

Generate a random secret key:
```bash
# On Linux/Mac:
openssl rand -base64 32

# On Windows (PowerShell):
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

### Step 2: Create Desktop `.env`

```bash
cd desktop
cp .env.example .env
# Edit .env and set:
# - VITE_RIFT_URL=http://localhost:51001
# - VITE_RIFT_JWT_SECRET=<your-generated-secret>
```

### Step 3: Create Rift Server `.env`

```bash
cd desktop/rift-server
cp .env.example .env
# Edit .env and set:
# - RIFT_JWT_SECRET=<same-secret-as-desktop>
# - PORT=51001 (optional)
```

### Step 4: Create Mobile `.env`

```bash
cd mobile
cp .env.example .env
# Edit .env and set:
# - EXPO_PUBLIC_RIFT_URL=ws://localhost:51001 (or your computer's IP)
# - EXPO_PUBLIC_RIFT_HTTP_URL=http://localhost:51001 (or your computer's IP)
```

## Testing Locally

### Same Network Setup:
1. Desktop `.env`: `VITE_RIFT_URL=http://localhost:51001`
2. Mobile `.env`: `EXPO_PUBLIC_RIFT_URL=ws://YOUR_COMPUTER_IP:51001`

Find your computer's IP:
- Windows: `ipconfig` → Look for IPv4 Address
- Mac/Linux: `ifconfig` or `ip addr` → Look for inet address

### Example:
If your computer IP is `192.168.1.100`:
- Desktop: `VITE_RIFT_URL=http://localhost:51001` (stays localhost)
- Mobile: `EXPO_PUBLIC_RIFT_URL=ws://192.168.1.100:51001`

## Security Notes

- **Never commit `.env` files** - They're already in `.gitignore`
- Use different secrets for development and production
- In production, use environment variables set by your hosting provider
- For Rift server, consider using a process manager (PM2) to set env vars

## Troubleshooting

**Desktop can't connect to Rift:**
- Check Rift server is running: `curl http://localhost:51001`
- Verify `VITE_RIFT_URL` matches Rift server URL
- Check `VITE_RIFT_JWT_SECRET` matches `RIFT_JWT_SECRET`

**Mobile can't connect:**
- Verify mobile and desktop are on same network
- Check firewall allows port 51001
- Use computer's IP instead of `localhost`
- Verify `EXPO_PUBLIC_RIFT_URL` uses correct protocol (`ws://` or `wss://`)

**Connection approved but mobile can't control LCU:**
- Check desktop app shows "Connected" status
- Verify LCU is running (League client open)
- Check browser console for errors

