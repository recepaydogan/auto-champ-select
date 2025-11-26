# LCU Proxy Server

Due to CORS restrictions in Overwolf extensions, a small proxy server is needed to communicate with the League Client Update (LCU) API.

## Setup

1. Make sure Node.js is installed on your system
2. Start the proxy server before using the app:

```bash
node lcu-proxy-server.js
```

The proxy server will run on `http://127.0.0.1:21337` and forward requests to the LCU API, bypassing CORS restrictions.

## Alternative: Native Helper

For production, consider creating a native helper executable (like Mimic's Conduit) that:
- Runs automatically when the app starts
- Makes HTTP requests to LCU without CORS restrictions
- Communicates with the Overwolf app via WebSocket or HTTP

This would be similar to how Mimic's Conduit works, but integrated into the Overwolf app.

