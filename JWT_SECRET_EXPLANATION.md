# What is RIFT_JWT_SECRET?

## Simple Explanation

`RIFT_JWT_SECRET` is a **password/key** used to sign and verify security tokens (JWTs) that allow your desktop app to connect to the Rift server.

Think of it like:
- **Rift Server** = A secure building
- **Desktop App** = You trying to enter
- **JWT Secret** = The master key that proves you're allowed in

## Why Do You Need It?

1. **Security**: Prevents unauthorized apps from connecting to your Rift server
2. **Authentication**: The Rift server uses it to verify that connection requests are legitimate
3. **Token Signing**: When your desktop app registers, Rift creates a signed token using this secret

## How It Works

1. Desktop app sends its public key to Rift server
2. Rift server creates a JWT token (signed with `RIFT_JWT_SECRET`)
3. Desktop app receives the token
4. Desktop app uses this token to connect via WebSocket
5. Rift server verifies the token using the same secret

## How to Generate One

### Option 1: Random String (Simple)
Just use any long random string:
```
RIFT_JWT_SECRET=my-super-secret-key-12345-change-this
```

### Option 2: Generate Secure Random Key (Recommended)

**Windows (PowerShell):**
```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

**Mac/Linux:**
```bash
openssl rand -base64 32
```

**Online Generator:**
- Visit: https://randomkeygen.com/
- Use a "CodeIgniter Encryption Keys" or generate a random string

### Option 3: Use a Password Generator
Any password generator that creates a 32+ character random string works.

## Where to Use It

You need to set the **SAME** secret in two places:

### 1. Rift Server (`desktop/rift-server/.env`)
```bash
RIFT_JWT_SECRET=your-generated-secret-here
```

### 2. Desktop App (`desktop/.env`)
```bash
VITE_RIFT_JWT_SECRET=your-generated-secret-here
```

**IMPORTANT:** They must match exactly! If they don't match, the desktop app won't be able to connect.

## Example Setup

Let's say you generate: `aB3xK9mP2qR7vT1wY5zN8cF4hJ6lO0sU3dG7`

### Rift Server `.env`:
```bash
RIFT_JWT_SECRET=aB3xK9mP2qR7vT1wY5zN8cF4hJ6lO0sU3dG7
PORT=51001
```

### Desktop App `.env`:
```bash
VITE_RIFT_URL=http://localhost:51001
VITE_RIFT_JWT_SECRET=aB3xK9mP2qR7vT1wY5zN8cF4hJ6lO0sU3dG7
```

## Quick Start (Development)

For development/testing, you can use a simple secret:

```bash
# Rift Server .env
RIFT_JWT_SECRET=dev-secret-key-12345

# Desktop App .env  
VITE_RIFT_JWT_SECRET=dev-secret-key-12345
```

**Note:** For production, use a strong randomly generated secret!

## Troubleshooting

**Error: "No JWT secret found"**
- Make sure you created `.env` file in `desktop/rift-server/`
- Make sure `RIFT_JWT_SECRET` is set in the file

**Error: "Unauthorized" or connection fails**
- Check that `RIFT_JWT_SECRET` in Rift server matches `VITE_RIFT_JWT_SECRET` in desktop app
- They must be exactly the same string

**Token verification fails**
- Make sure there are no extra spaces or quotes in your `.env` file
- Example: `RIFT_JWT_SECRET=my-secret` (not `RIFT_JWT_SECRET="my-secret"`)

