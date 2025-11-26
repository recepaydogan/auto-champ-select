/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import Login from './components/login'
import { type Session } from '@supabase/supabase-js'
import QRCode from './components/QRCode'
import ConnectionApproval from './components/ConnectionApproval'
import { getBridgeManager } from './bridge/bridgeManager'

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [bridgeCode, setBridgeCode] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [pendingConnection, setPendingConnection] = useState<{ device: string; browser: string; identity: string } | null>(null)
  const [pendingConnectionIdentity, setPendingConnectionIdentity] = useState<string | null>(null)
  const [pendingConnectionResolve, setPendingConnectionResolve] = useState<((approved: boolean) => void) | null>(null)

  useEffect(() => {
    // Auth setup
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    }).catch((error) => {
      console.error('[App] Failed to get session:', error)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  // Listen for bridge connection requests and messages
  useEffect(() => {
    if (!session) return

    const messageListener = (windowId: any, _messageId: any, message: any) => {
      let messageContent: string | null = null;
      
      if (typeof message === 'string') {
        messageContent = message;
      } else if (windowId && typeof windowId === 'object' && typeof windowId.content === 'string') {
        messageContent = windowId.content;
      }
      
      if (messageContent) {
        try {
          const data = JSON.parse(messageContent);
          if (data.type === 'connection_request') {
            setPendingConnection(data.deviceInfo);
            setPendingConnectionIdentity(data.deviceInfo.identity);
          }
        } catch {
          // Ignore parsing errors
        }
      }
    };

    overwolf.windows.onMessageReceived.addListener(messageListener);

    // Check bridge code periodically
    const checkBridgeCode = () => {
      try {
        const bridge = getBridgeManager()
        const code = bridge.getCode()
        if (code) {
          setBridgeCode(code)
        }
      } catch {
        // Bridge not initialized yet
      }
    }

    const interval = setInterval(checkBridgeCode, 1000)
    checkBridgeCode()

    return () => {
      overwolf.windows.onMessageReceived.removeListener(messageListener)
      clearInterval(interval)
    }
  }, [session])

  // Connection request callback is now set up in handleConnect before bridge initialization

  const handleConnect = async () => {
    try {
    const bridge = getBridgeManager()
      
      // Set up connection request callback BEFORE initializing
    bridge.setConnectionRequestCallback(async (deviceInfo) => {
      return new Promise<boolean>((resolve) => {
          console.log('[App] Connection request received:', deviceInfo)
        setPendingConnection(deviceInfo)
        setPendingConnectionIdentity(deviceInfo.identity)
        setPendingConnectionResolve(() => resolve)
      })
    })

      // Use import.meta.env for Vite, fallback to hardcoded values
      // Use 127.0.0.1 instead of localhost for Overwolf compatibility
      const riftUrl = (import.meta.env?.VITE_RIFT_URL as string) || 'http://127.0.0.1:51001'
      const jwtSecret = (import.meta.env?.VITE_RIFT_JWT_SECRET as string) || 'dev-secret-key-change-in-production'
      
      await bridge.initialize({
        riftUrl,
        jwtSecret
      })

      const code = bridge.getCode()
      if (code) {
        setBridgeCode(code)
        setIsConnected(true)
      }
    } catch (error: any) {
      console.error('[App] Failed to connect bridge:', error)
      alert('Failed to connect bridge: ' + error.message)
    }
  }

  const handleDragMove = () => {
    overwolf.windows.getCurrentWindow((result: any) => {
      if (result.status === "success") {
        overwolf.windows.dragMove(result.window.id);
      }
    });
  };

  const handleClose = () => {
    overwolf.windows.getCurrentWindow((result: any) => {
      if (result.status === "success") {
        overwolf.windows.close(result.window.id);
      }
    });
  };

  if (!session) {
    return (
      <div className="h-screen w-screen bg-neutral-950 text-white flex flex-col overflow-hidden border border-neutral-800 rounded-lg">
        <div className="flex justify-between items-center bg-neutral-900/80 backdrop-blur-md px-4 py-3 border-b border-neutral-800 cursor-grab active:cursor-grabbing select-none z-50" onMouseDown={handleDragMove}>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]"></div>
            <div className="font-bold text-sm tracking-wide text-neutral-200">AUTO CHAMP SELECT</div>
          </div>
          <button className="text-neutral-500 hover:text-white hover:bg-red-500/20 hover:border-red-500/50 border border-transparent rounded-md px-2 py-1 transition-all duration-200" onClick={handleClose}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <Login />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden text-white font-sans">
      <ConnectionApproval
        isOpen={pendingConnection !== null}
        deviceInfo={pendingConnection}
        onAccept={() => {
          // Resolve the pending connection promise
          if (pendingConnectionResolve) {
            pendingConnectionResolve(true)
          }
          
          // Also send message to background for logging
          overwolf.windows.obtainDeclaredWindow('background', (result: any) => {
            if (result.success && pendingConnectionIdentity) {
              overwolf.windows.sendMessage(result.window.id, 'connection_response', JSON.stringify({
                type: 'connection_response',
                deviceIdentity: pendingConnectionIdentity,
                approved: true
              }), () => {});
            }
          });
          
          setPendingConnection(null)
          setPendingConnectionIdentity(null)
          setPendingConnectionResolve(null)
        }}
        onReject={() => {
          // Resolve the pending connection promise with false
          if (pendingConnectionResolve) {
            pendingConnectionResolve(false)
          }
          
          // Also send message to background for logging
          overwolf.windows.obtainDeclaredWindow('background', (result: any) => {
            if (result.success && pendingConnectionIdentity) {
              overwolf.windows.sendMessage(result.window.id, 'connection_response', JSON.stringify({
                type: 'connection_response',
                deviceIdentity: pendingConnectionIdentity,
                approved: false
              }), () => {});
            }
          });
          
          setPendingConnection(null)
          setPendingConnectionIdentity(null)
          setPendingConnectionResolve(null)
        }}
      />

      {/* Custom Title Bar */}
      <div className="flex justify-between items-center bg-neutral-900/80 backdrop-blur-md px-4 py-3 border-b border-neutral-800 cursor-grab active:cursor-grabbing select-none z-50" onMouseDown={handleDragMove}>
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full shadow-[0_0_10px_rgba(99,102,241,0.5)] ${isConnected ? 'bg-green-500 shadow-green-500/50' : 'bg-red-500 shadow-red-500/50'}`}></div>
          <div className="font-bold text-sm tracking-wide text-neutral-200">AUTO CHAMP SELECT</div>
        </div>
        <button className="text-neutral-500 hover:text-white hover:bg-red-500/20 hover:border-red-500/50 border border-transparent rounded-md px-2 py-1 transition-all duration-200" onClick={handleClose}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        {!isConnected || !bridgeCode ? (
          <div className="flex flex-col items-center gap-6 max-w-md w-full">
            <h1 className="text-3xl font-bold text-white text-center">Auto Champ Select</h1>
            <p className="text-neutral-400 text-center">
              Connect your mobile device to control League of Legends from your phone.
            </p>
            <button
              onClick={handleConnect}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 px-6 rounded-xl transition-all shadow-lg shadow-indigo-900/20"
            >
              Connect
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-6 max-w-md w-full">
            <h1 className="text-3xl font-bold text-white text-center">Connection Code</h1>
            <p className="text-neutral-400 text-center">
              Enter this code in your mobile app or scan the QR code to connect.
            </p>
            
            <div className="text-6xl font-bold text-indigo-400 tracking-wider bg-neutral-900/50 px-8 py-4 rounded-xl border border-neutral-800">
              {bridgeCode}
            </div>

            <QRCode value={bridgeCode} size={200} />

            <button
              onClick={() => {
                setIsConnected(false)
                setBridgeCode(null)
                const bridge = getBridgeManager()
                bridge.disconnect()
              }}
              className="text-neutral-400 hover:text-white text-sm"
            >
              Disconnect
            </button>
          </div>
        )}

        <div className="absolute bottom-4 right-4">
          <button
            className="text-neutral-500 hover:text-white text-sm"
            onClick={() => supabase.auth.signOut()}
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  )
}

export default App
