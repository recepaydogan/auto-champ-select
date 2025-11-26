# Rift Server

Server-side component responsible for securely tunneling WebSocket connections between desktop bridge and mobile clients.

## Setup

1. **Copy environment file:**
```bash
cp .env.example .env
```

2. **Edit `.env` file** and set your `RIFT_JWT_SECRET`:
```
RIFT_JWT_SECRET=your-secret-key-change-this-in-production
PORT=51001
```

**Important:** The `RIFT_JWT_SECRET` must match `VITE_RIFT_JWT_SECRET` in your `desktop/.env` file!

3. **Install dependencies:**
```bash
npm install
```

4. **Start the server:**

**Windows:**
```powershell
.\start.ps1
```

**Linux/Mac:**
```bash
chmod +x start.sh
./start.sh
```

**Or manually:**
```bash
npm start
```

**Development mode (with auto-reload):**
```bash
npm run dev
```

You should see:
```
[+] Starting rift...
[+] Listening on 0.0.0.0:51001... ^C to exit.
```

## Architecture

- **HTTP Server**: Handles `/register` and `/check` endpoints for JWT token management
- **WebSocket Server**: Handles `/conduit` (desktop) and `/mobile` (mobile) connections
- **Database**: SQLite database storing 6-digit codes and public keys

## Endpoints

### HTTP

- `POST /register` - Register a new conduit instance, receive JWT token
- `GET /check?token=...` - Verify JWT token validity

### WebSocket

- `/conduit` - Desktop bridge connections (requires JWT token)
- `/mobile?code=XXXXXX` - Mobile client connections (requires 6-digit code)

