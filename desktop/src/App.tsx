/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabaseClient'
import Login from './components/login'
import { type Session } from '@supabase/supabase-js'
import ConnectionApproval from './components/ConnectionApproval'
import ConnectionStatus, { type ConnectionStatusState } from './components/ConnectionStatus'
import CustomModal, { type CustomModalButton } from './components/CustomModal'
import { getBridgeManager } from './bridge/bridgeManager'

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatusState>({
    riftConnected: false,
    mobileConnected: false,
    lcuConnected: false
  })
  const [pendingConnection, setPendingConnection] = useState<{ device: string; browser: string; identity: string } | null>(null)
  const [pendingConnectionIdentity, setPendingConnectionIdentity] = useState<string | null>(null)
  const [pendingConnectionResolve, setPendingConnectionResolve] = useState<((approved: boolean) => void) | null>(null)
  
  // Custom modal state
  const [modalVisible, setModalVisible] = useState(false)
  const [modalConfig, setModalConfig] = useState<{
    title: string;
    message?: string;
    type?: 'info' | 'success' | 'warning' | 'error';
    buttons?: CustomModalButton[];
  }>({ title: '' })

  // Custom alert function
  const showAlert = useCallback((
    title: string,
    message?: string,
    buttons?: CustomModalButton[],
    type?: 'info' | 'success' | 'warning' | 'error'
  ) => {
    setModalConfig({
      title,
      message,
      type: type || 'info',
      buttons: buttons || [{ text: 'OK', onClick: () => {}, variant: 'primary' }]
    })
    setModalVisible(true)
  }, [])

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

  // Listen for bridge connection requests
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

    return () => {
      overwolf.windows.onMessageReceived.removeListener(messageListener)
    }
  }, [session])

  // Auto-connect when session is available
  useEffect(() => {
    if (session && !isConnected && !isConnecting) {
      handleConnect()
    }
  }, [session])

  const handleConnect = async () => {
    if (!session?.user?.id) {
      console.error('[App] No user session available')
      return
    }

    setIsConnecting(true)
    
    try {
      const bridge = getBridgeManager()
      
      // Set up status change callback
      bridge.setStatusChangeCallback((status) => {
        setConnectionStatus(status)
      })
      
      // Set up connection request callback BEFORE initializing
      bridge.setConnectionRequestCallback(async (deviceInfo) => {
        return new Promise<boolean>((resolve) => {
          console.log('[App] Connection request received:', deviceInfo)
          setPendingConnection(deviceInfo)
          setPendingConnectionIdentity(deviceInfo.identity)
          setPendingConnectionResolve(() => (approved: boolean) => {
            resolve(approved)
          })
        })
      })

      // Use import.meta.env for Vite, fallback to hardcoded values
      // Use 127.0.0.1 instead of localhost for Overwolf compatibility
      const riftUrl = (import.meta.env?.VITE_RIFT_URL as string) || 'http://127.0.0.1:51001'
      const jwtSecret = (import.meta.env?.VITE_RIFT_JWT_SECRET as string) || 'dev-secret-key-change-in-production'
      
      await bridge.initialize({
        riftUrl,
        jwtSecret,
        userId: session.user.id
      })

      setIsConnected(true)
      console.log('[App] Connected to Rift server for user:', session.user.id)
    } catch (error: any) {
      console.error('[App] Failed to connect bridge:', error)
      showAlert('Connection Failed', error.message || 'Failed to connect to server', undefined, 'error')
    } finally {
      setIsConnecting(false)
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
        {isConnecting ? (
          <div className="flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-neutral-400">Connecting to server...</p>
          </div>
        ) : isConnected ? (
          <ConnectionStatus
            status={connectionStatus}
            userEmail={session?.user?.email}
            onDisconnect={() => {
              setIsConnected(false)
              setConnectionStatus({
                riftConnected: false,
                mobileConnected: false,
                lcuConnected: false
              })
              const bridge = getBridgeManager()
              bridge.disconnect()
            }}
          />
        ) : (
          <div className="flex flex-col items-center gap-6 max-w-md w-full">
            <div className="text-5xl">🔌</div>
            <h1 className="text-2xl font-bold text-white text-center">Not Connected</h1>
            <p className="text-neutral-400 text-center">
              Connect to enable mobile control for League of Legends.
            </p>
            <button
              onClick={handleConnect}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 px-6 rounded-xl transition-all shadow-lg shadow-indigo-900/20"
            >
              Connect
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

      <CustomModal
        isOpen={modalVisible}
        title={modalConfig.title}
        message={modalConfig.message}
        type={modalConfig.type}
        buttons={modalConfig.buttons}
        onClose={() => setModalVisible(false)}
      />
    </div>
  )
}

export default App
