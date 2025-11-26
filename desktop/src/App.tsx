/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import Login from './components/login'
import { type Session } from '@supabase/supabase-js'
import Modal from './components/Modal'
import { 
  enterQueue, 
  cancelQueue, 
  acceptReadyCheck, 
  declineReadyCheck,
  getLobby,
  getMatchmakingSearch,
  getReadyCheck,
  getChampSelectSession,
  pickBanChampion,
  getPickableChampions,
  isLcuConnected
} from './lcuHelper'
import CreateLobby from './components/CreateLobby'
import { watchLcuConnection } from './lib/lcuConnection'
import { getLcuClient, type LcuEvent } from './lib/lcuClient'
import { getAllChampions, type Champion, getChampionImageUrlByKey } from './lib/championData'

// Champion image component with error handling
function ChampionImage({ championId, championKey }: { championId: number; championKey: string }) {
  const [imageUrl, setImageUrl] = useState<string>('')
  const [error, setError] = useState(false)

  useEffect(() => {
    getChampionImageUrlByKey(championKey).then(setImageUrl).catch(() => setError(true))
  }, [championKey])

  if (error || !imageUrl) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-neutral-700">
        <span className="text-xs text-neutral-500">No Image</span>
      </div>
    )
  }

  return (
    <img
      src={imageUrl}
      alt={`Champion ${championId}`}
      className="w-full h-full object-cover opacity-80 group-hover/champ:opacity-100 transition-opacity"
      onError={() => setError(true)}
    />
  )
}

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [gamePhase, setGamePhase] = useState<string>('None')
  const [lcuConnected, setLcuConnected] = useState(false)
  const [autoAccept, setAutoAccept] = useState(true)
  const [, setQueueState] = useState<any>(null)
  const [readyCheckState, setReadyCheckState] = useState<any>(null)
  const [champSelectState, setChampSelectState] = useState<any>(null)
  const [champions, setChampions] = useState<Champion[]>([])
  const [championSearch, setChampionSearch] = useState('')
  const [pickableChampions, setPickableChampions] = useState<number[]>([])
  const [modalState, setModalState] = useState<{ isOpen: boolean; title: string; message: string; type: 'info' | 'error' | 'success' }>({
    isOpen: false, title: '', message: '', type: 'info'
  })
  const [showCreateLobby, setShowCreateLobby] = useState(false)

  useEffect(() => {
    // Global error handler to prevent app from crashing
    const handleError = (event: ErrorEvent) => {
      console.error('[App] Global error caught:', event.error)
      console.error('[App] Error message:', event.message)
      console.error('[App] Error stack:', event.error?.stack)
      // Don't let errors crash the app - keep window visible
      event.preventDefault()
    }

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('[App] Unhandled promise rejection:', event.reason)
      // Don't let promise rejections crash the app
      event.preventDefault()
    }

    window.addEventListener('error', handleError)
    window.addEventListener('unhandledrejection', handleUnhandledRejection)

    // Ensure window stays visible
    const ensureWindowVisible = () => {
      overwolf.windows.getCurrentWindow((result: any) => {
        if (result.success && result.window) {
          const windowId = result.window.id
          // Check if window is minimized or hidden
          if (result.window.state === 'minimized' || result.window.state === 'hidden') {
            console.log('[App] Window is minimized/hidden, restoring...')
            overwolf.windows.restore(windowId, () => {})
          }
        }
      })
    }

    // Check window visibility periodically
    const visibilityInterval = setInterval(ensureWindowVisible, 2000)
    
    // Also check immediately
    ensureWindowVisible()

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
      clearInterval(visibilityInterval)
      window.removeEventListener('error', handleError)
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
      subscription.unsubscribe()
    }
  }, [])

  // LCU Connection
  useEffect(() => {
    const client = getLcuClient()
    let stopWatching: (() => void) | null = null

    stopWatching = watchLcuConnection(
      async (config) => {
        console.log('LCU connected in desktop window')
        setLcuConnected(true)
        await client.connect(config)

        // Consolidated state management - use event data from observers
        // Store current state values to determine phase
        let currentChampSelect: any = null
        let currentReadyCheck: any = null
        let currentSearch: any = null
        let currentLobby: any = null
        let currentGameflow: any = null
        
        let lastPhaseUpdate = 0
        let pendingUpdate: ReturnType<typeof setTimeout> | null = null
        const PHASE_UPDATE_DEBOUNCE = 800 // Increased debounce to prevent rapid changes
        
        const updatePhaseFromState = () => {
          // Clear any pending update
          if (pendingUpdate) {
            clearTimeout(pendingUpdate)
            pendingUpdate = null
          }
          
          // Schedule update with debounce
          pendingUpdate = setTimeout(() => {
            const now = Date.now()
            if (now - lastPhaseUpdate < PHASE_UPDATE_DEBOUNCE) {
              // Still too soon, reschedule
              pendingUpdate = setTimeout(() => updatePhaseFromState(), PHASE_UPDATE_DEBOUNCE - (now - lastPhaseUpdate))
              return
            }
            lastPhaseUpdate = now
            
            // Determine phase based on priority (most specific states first)
            // Don't rely on gameflow if we have specific endpoint data
            let newPhase: string = 'None'
            
            if (currentChampSelect) {
              newPhase = 'ChampSelect'
              setChampSelectState(currentChampSelect)
            } else if (currentReadyCheck && currentReadyCheck.state === 'InProgress') {
              newPhase = 'ReadyCheck'
              setReadyCheckState(currentReadyCheck)
            } else if (currentSearch && currentSearch.isCurrentlyInQueue) {
              newPhase = 'Queue'
              setQueueState(currentSearch)
            } else if (currentLobby) {
              newPhase = 'Lobby'
            } else if (currentGameflow && currentGameflow.phase) {
              // Only use gameflow if we don't have specific endpoint data
              // This prevents gameflow from overriding more specific states
              const phase = currentGameflow.phase
              if (phase === 'ChampSelect') {
                newPhase = 'ChampSelect'
              } else if (phase === 'ReadyCheck') {
                newPhase = 'ReadyCheck'
              } else if (phase === 'Matchmaking' || phase === 'InQueue') {
                newPhase = 'Queue'
              } else if (phase === 'Lobby') {
                newPhase = 'Lobby'
              } else {
                newPhase = 'None'
              }
            } else {
              newPhase = 'None'
            }
            
            // Only update if phase actually changed
            setGamePhase((currentPhase) => {
              if (currentPhase !== newPhase) {
                console.log('[App] Phase changed:', currentPhase, '->', newPhase, {
                  champSelect: !!currentChampSelect,
                  readyCheck: !!currentReadyCheck,
                  search: !!currentSearch,
                  lobby: !!currentLobby,
                  gameflow: currentGameflow?.phase
                })
                return newPhase
              }
              return currentPhase
            })
            
            // Clear states that are no longer active
            if (newPhase !== 'ChampSelect') {
              setChampSelectState(null)
            }
            if (newPhase !== 'ReadyCheck') {
              setReadyCheckState(null)
            }
            if (newPhase !== 'Queue') {
              setQueueState(null)
            }
            
            pendingUpdate = null
          }, 100) // Small initial delay to batch updates
        }
        
        // Observe all endpoints and update state, then recalculate phase
        // Priority: specific endpoints override gameflow to prevent conflicts
        client.observe('/lol-champ-select/v1/session', (event: LcuEvent) => {
          currentChampSelect = event.data || null
          updatePhaseFromState()
        })
        
        client.observe('/lol-matchmaking/v1/ready-check', (event: LcuEvent) => {
          currentReadyCheck = event.data || null
          updatePhaseFromState()
        })
        
        client.observe('/lol-matchmaking/v1/search', (event: LcuEvent) => {
          currentSearch = event.data || null
          updatePhaseFromState()
        })
        
        client.observe('/lol-lobby/v2/lobby', (event: LcuEvent) => {
          currentLobby = event.data || null
          updatePhaseFromState()
        })
        
        // Only observe gameflow, but don't let it override specific endpoint data
        // Gameflow is only used as fallback when all specific endpoints are null
        client.observe('/lol-gameflow/v1/session', (event: LcuEvent) => {
          // Only update gameflow if we don't have more specific data
          // This prevents gameflow from conflicting with lobby/matchmaking states
          if (!currentChampSelect && !currentReadyCheck && !currentSearch && !currentLobby) {
            currentGameflow = event.data || null
            updatePhaseFromState()
          } else {
            // Still store it for fallback, but don't trigger update
            currentGameflow = event.data || null
          }
        })
        
        // Load initial states and populate state variables
        try {
          const [lobby, search, readyCheck, champSelect, gameflow] = await Promise.all([
            getLobby().catch(() => null),
            getMatchmakingSearch().catch(() => null),
            getReadyCheck().catch(() => null),
            getChampSelectSession().catch(() => null),
            client.request('/lol-gameflow/v1/session').catch(() => null)
          ])
          
          // Store initial state
          currentLobby = lobby
          currentSearch = search
          currentReadyCheck = readyCheck
          currentChampSelect = champSelect
          currentGameflow = gameflow
          
          // Update phase based on initial state
          updatePhaseFromState()
        } catch (error) {
          console.error('Failed to load initial states:', error)
        }
      },
      () => {
        console.log('LCU disconnected in desktop window')
        setLcuConnected(false)
        setGamePhase('None')
        setQueueState(null)
        setReadyCheckState(null)
        setChampSelectState(null)
        client.disconnect()
      }
    )

    // Listen for messages from background window
    overwolf.windows.getCurrentWindow((result: any) => {
      if (result.success) {
        const messageListener = (windowId: any, _messageId: any, message: any) => {
          try {
            // Extract message content - Overwolf API puts it in windowId.content
            let messageContent: string | null = null
            
            if (windowId && typeof windowId === 'object' && typeof windowId.content === 'string') {
              messageContent = windowId.content
            } else if (typeof message === 'string') {
              messageContent = message
            } else if (message && typeof message === 'object' && typeof message.content === 'string') {
              messageContent = message.content
            } else if (typeof windowId === 'string') {
              messageContent = windowId
            }
            
            if (!messageContent) {
              // Not a message we care about, ignore silently
              return
            }
            
            const data = JSON.parse(messageContent)
            console.log('[Desktop] Received message:', data.type)
            if (data.type === 'lcu_event') {
              // Handle events forwarded from background
              if (data.event === 'gameflow' && data.data?.phase) {
                setGamePhase(data.data.phase)
              } else if (data.event === 'lobby') {
                setGamePhase(data.data ? 'Lobby' : 'None')
              } else if (data.event === 'matchmaking' && data.data?.isCurrentlyInQueue) {
                setGamePhase('Queue')
                setQueueState(data.data)
              } else if (data.event === 'champ_select') {
                setGamePhase('ChampSelect')
                setChampSelectState(data.data)
              }
            } else if (data.type === 'lcu_response') {
              // This shouldn't happen here - responses are handled in lcuClient
              console.log('[Desktop] Received LCU response:', data.requestId)
            }
          } catch (error) {
            // Silently ignore parsing errors for messages we don't care about
            // Only log if it looks like it might be important
            if (windowId && typeof windowId === 'object' && windowId.content) {
              const content = String(windowId.content).substring(0, 100)
              if (content.includes('lcu_event') || content.includes('lcu_response')) {
                console.error('[Desktop] Error parsing message:', error, 'Content:', content)
              }
            }
          }
        }
        overwolf.windows.onMessageReceived.addListener(messageListener)
        
        // Cleanup on unmount
        return () => {
          overwolf.windows.onMessageReceived.removeListener(messageListener)
        }
      }
    })

    return () => {
      if (stopWatching) {
        stopWatching()
      }
      client.disconnect()
    }
  }, [])

  // Load champion data
  useEffect(() => {
    getAllChampions().then(setChampions).catch(console.error)
  }, [])

  // Load pickable champions when in champ select
  useEffect(() => {
    if (gamePhase === 'ChampSelect' && isLcuConnected()) {
      getPickableChampions().then(setPickableChampions).catch(console.error)
    }
  }, [gamePhase])

  // Auto-accept ready check
  useEffect(() => {
    if (autoAccept && readyCheckState && readyCheckState.state === 'InProgress' && isLcuConnected()) {
      acceptReadyCheck().catch(console.error)
    }
  }, [autoAccept, readyCheckState])


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

  const handleEnterQueue = async () => {
    try {
      await enterQueue()
      setModalState({ isOpen: true, title: 'Success', message: 'Entered queue', type: 'info' })
    } catch (error: any) {
      setModalState({ isOpen: true, title: 'Error', message: error.message || 'Failed to enter queue', type: 'error' })
    }
  }

  const handleCancelQueue = async () => {
    console.log('[App] Cancel queue clicked, current gamePhase:', gamePhase)
    try {
      console.log('[App] Calling cancelQueue()...')
      await cancelQueue()
      console.log('[App] cancelQueue() succeeded')
      setModalState({ isOpen: true, title: 'Success', message: 'Left queue', type: 'info' })
    } catch (error: any) {
      console.error('[App] cancelQueue() failed:', error)
      setModalState({ isOpen: true, title: 'Error', message: error.message || 'Failed to leave queue', type: 'error' })
    }
  }

  const handleAcceptReadyCheck = async () => {
    try {
      await acceptReadyCheck()
    } catch (error: any) {
      setModalState({ isOpen: true, title: 'Error', message: error.message || 'Failed to accept', type: 'error' })
    }
  }

  const handleDeclineReadyCheck = async () => {
    try {
      await declineReadyCheck()
    } catch (error: any) {
      setModalState({ isOpen: true, title: 'Error', message: error.message || 'Failed to decline', type: 'error' })
    }
  }

  const handlePickChampion = async (championId: number) => {
    if (!champSelectState) return

    try {
      // Find the current action for the local player
      const localPlayerCellId = champSelectState.localPlayerCellId
      const myTeam = champSelectState.myTeam || []
      const localPlayer = myTeam.find((m: any) => m.cellId === localPlayerCellId)
      
      if (!localPlayer) return

      // Find the first incomplete action for this player
      const actions = champSelectState.actions || []
      for (const turn of actions) {
        for (const action of turn) {
          if (action.actorCellId === localPlayerCellId && !action.completed) {
            // Hover first, then complete
            await pickBanChampion(action.id, championId, true)
            setModalState({ isOpen: true, title: 'Success', message: 'Champion selected', type: 'info' })
            return
          }
        }
      }
    } catch (error: any) {
      setModalState({ isOpen: true, title: 'Error', message: error.message || 'Failed to pick champion', type: 'error' })
    }
  }

  const filteredChampions = championSearch
    ? champions.filter(c => 
        c.name.toLowerCase().includes(championSearch.toLowerCase()) ||
        c.title.toLowerCase().includes(championSearch.toLowerCase())
      )
    : champions

  const displayChampions = gamePhase === 'ChampSelect' && Array.isArray(pickableChampions) && pickableChampions.length > 0
    ? filteredChampions.filter(c => pickableChampions.includes(parseInt(c.key)))
    : filteredChampions

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
    <div className="flex flex-col h-screen bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden text-white font-sans selection:bg-indigo-500/30">
      <Modal
        isOpen={modalState.isOpen}
        title={modalState.title}
        message={modalState.message}
        type={modalState.type}
        onClose={() => setModalState(prev => ({ ...prev, isOpen: false }))}
      />
      {showCreateLobby && (
        <CreateLobby
          onClose={() => setShowCreateLobby(false)}
          onSuccess={() => {
            setModalState({ isOpen: true, title: 'Success', message: 'Lobby created successfully', type: 'success' })
          }}
        />
      )}

      {/* Settings Modal */}
      {/* Settings Modal Removed */}

      {/* Custom Title Bar */}
      <div className="flex justify-between items-center bg-neutral-900/80 backdrop-blur-md px-4 py-3 border-b border-neutral-800 cursor-grab active:cursor-grabbing select-none z-50" onMouseDown={handleDragMove}>
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full shadow-[0_0_10px_rgba(99,102,241,0.5)] ${lcuConnected ? 'bg-green-500 shadow-green-500/50' : 'bg-red-500 shadow-red-500/50'}`}></div>
          <div className="font-bold text-sm tracking-wide text-neutral-200">AUTO CHAMP SELECT</div>
        </div>
        <button className="text-neutral-500 hover:text-white hover:bg-red-500/20 hover:border-red-500/50 border border-transparent rounded-md px-2 py-1 transition-all duration-200" onClick={handleClose}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 bg-neutral-900/50 border-r border-neutral-800 p-6 flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <div className="text-xs font-bold text-neutral-500 uppercase tracking-wider">User</div>
            <div className="flex items-center gap-3 bg-neutral-800/50 p-3 rounded-xl border border-neutral-700/50">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-sm font-bold">
                {session.user.email?.charAt(0).toUpperCase()}
              </div>
              <div className="flex flex-col overflow-hidden">
                <span className="text-sm font-medium truncate" title={session.user.email}>{session.user.email}</span>
                <span className="text-xs text-green-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span>
                  Connected
                </span>
              </div>
            </div>
          </div>

          <div className="flex-1">
            <div className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">Navigation</div>
            <nav className="flex flex-col gap-1">
              <button className="flex items-center gap-3 px-3 py-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
                Dashboard
              </button>
              {/* Removed Manual LCU Settings as per user request */}
            </nav>
          </div>

          <button
            className="flex items-center gap-2 px-4 py-3 rounded-xl bg-neutral-800 hover:bg-red-900/20 hover:text-red-400 hover:border-red-900/30 border border-neutral-700 text-neutral-400 transition-all text-sm font-medium"
            onClick={() => supabase.auth.signOut()}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
            Sign Out
          </button>
        </div>
        <div className="flex-1 p-8 overflow-y-auto bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-900/20 via-neutral-950 to-neutral-950">
          <header className="mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">Dashboard</h1>
            <p className="text-neutral-400">Manage your game queue and champion selection.</p>
            {!lcuConnected && <div className="mt-2 text-red-400 text-sm">LCU Disconnected. Please start League of Legends client.</div>}
            {lcuConnected && <div className="mt-2 text-green-400 text-sm">LCU Connected</div>}
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Game Status Card */}
            <div className="bg-neutral-900/50 backdrop-blur-sm border border-neutral-800 rounded-2xl p-6 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl -mr-16 -mt-16 transition-all group-hover:bg-indigo-500/20"></div>
              <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-400"><circle cx="12" cy="12" r="10"></circle><polygon points="10 8 16 12 10 16 10 8"></polygon></svg>
                Game Status
              </h2>
              <div className="flex items-center justify-between bg-neutral-950/50 rounded-xl p-4 border border-neutral-800">
                <span className="text-neutral-400">Current Phase</span>
                <span className="px-3 py-1 rounded-full bg-neutral-800 text-neutral-300 text-sm font-medium border border-neutral-700">{gamePhase}</span>
              </div>
              <button
                onClick={() => setShowCreateLobby(true)}
                disabled={!lcuConnected || gamePhase === 'Queue'}
                className="mt-4 w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-neutral-800 disabled:text-neutral-500 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-lg shadow-indigo-900/20 flex items-center justify-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                Create Lobby
              </button>
              <div className="mt-6 flex gap-3">
                <button
                  disabled={!lcuConnected || gamePhase !== 'Lobby'}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-neutral-800 disabled:text-neutral-500 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-lg shadow-indigo-900/20 flex items-center justify-center gap-2"
                  onClick={handleEnterQueue}
                >
                  Enter Queue
                </button>
                <button
                  disabled={!lcuConnected || gamePhase !== 'Queue'}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-neutral-800 disabled:text-neutral-500 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-lg shadow-indigo-900/20 flex items-center justify-center gap-2"
                  onClick={handleCancelQueue}
                >
                  Cancel Queue
                </button>
              </div>
            </div>

            {/* Auto Accept Card */}
            <div className="bg-neutral-900/50 backdrop-blur-sm border border-neutral-800 rounded-2xl p-6 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/10 rounded-full blur-3xl -mr-16 -mt-16 transition-all group-hover:bg-green-500/20"></div>
              <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-400"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                Auto Accept
              </h2>
              <div className="flex items-center justify-between bg-neutral-950/50 rounded-xl p-4 border border-neutral-800">
                <div className="flex flex-col">
                  <span className="text-white font-medium">Auto Accept Match</span>
                  <span className="text-xs text-neutral-500">Automatically accept when queue pops</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={autoAccept}
                    onChange={e => setAutoAccept(e.target.checked)}
                  />
                  <div className="w-11 h-6 bg-neutral-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
                </label>
              </div>
            </div>

            {/* Champion Select Card */}
            <div className="lg:col-span-2 bg-neutral-900/50 backdrop-blur-sm border border-neutral-800 rounded-2xl p-6 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/5 rounded-full blur-3xl -mr-20 -mt-20 transition-all group-hover:bg-purple-500/10"></div>
              <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-400"><path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"></path><line x1="16" y1="8" x2="2" y2="22"></line><line x1="17.5" y1="15" x2="9" y2="15"></line></svg>
                Champion Select
              </h2>

              <div className="flex flex-col gap-4">
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                    <svg className="w-4 h-4 text-neutral-500" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 20">
                      <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m19 19-4-4m0-7A7 7 0 1 1 1 8a7 7 0 0 1 14 0Z" />
                    </svg>
                  </div>
                  <input 
                    type="search" 
                    className="block w-full p-4 pl-10 text-sm text-white border border-neutral-700 rounded-xl bg-neutral-950/50 focus:ring-indigo-500 focus:border-indigo-500 placeholder-neutral-600" 
                    placeholder="Search for a champion..." 
                    value={championSearch}
                    onChange={(e) => setChampionSearch(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                  {!Array.isArray(displayChampions) || displayChampions.length === 0 ? (
                    <div className="col-span-full text-center text-neutral-500 py-8">No champions found</div>
                  ) : (
                    displayChampions.map((champion) => (
                      <div
                        key={champion.id}
                        className="aspect-square bg-neutral-800 rounded-lg border border-neutral-700 hover:border-indigo-500 hover:shadow-[0_0_15px_rgba(99,102,241,0.3)] transition-all cursor-pointer flex flex-col items-center justify-center group/champ relative overflow-hidden"
                        onClick={() => gamePhase === 'ChampSelect' && handlePickChampion(parseInt(champion.key))}
                      >
                        <ChampionImage championId={parseInt(champion.key)} championKey={champion.id} />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent opacity-0 group-hover/champ:opacity-100 transition-opacity"></div>
                        <div className="absolute bottom-0 left-0 right-0 p-2 text-center opacity-0 group-hover/champ:opacity-100 transition-opacity z-10">
                          <div className="text-xs font-bold text-white">{champion.name}</div>
                          <div className="text-xs text-neutral-400">{champion.title}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Ready Check Modal */}
          {readyCheckState && readyCheckState.state === 'InProgress' && (
            <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8 max-w-md w-full mx-4">
                <h2 className="text-2xl font-bold text-white mb-4 text-center">Match Found!</h2>
                <p className="text-neutral-400 text-center mb-6">
                  A match has been found. Accept to continue.
                </p>
                {readyCheckState.timer !== undefined && (
                  <div className="mb-6">
                    <div className="w-full bg-neutral-800 rounded-full h-2">
                      <div 
                        className="bg-indigo-500 h-2 rounded-full transition-all"
                        style={{ width: `${((12 - readyCheckState.timer) / 12) * 100}%` }}
                      ></div>
                    </div>
                    <p className="text-center text-neutral-500 text-sm mt-2">
                      {Math.ceil(readyCheckState.timer)}s remaining
                    </p>
                  </div>
                )}
                <div className="flex gap-4">
                  <button
                    onClick={handleDeclineReadyCheck}
                    className="flex-1 bg-neutral-800 hover:bg-neutral-700 text-white font-medium py-3 px-4 rounded-xl border border-neutral-700 transition-all"
                  >
                    Decline
                  </button>
                  <button
                    onClick={handleAcceptReadyCheck}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-lg shadow-indigo-900/20"
                  >
                    Accept
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div >
    </div >
  )
}

export default App
