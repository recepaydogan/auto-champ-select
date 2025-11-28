import { useState, useEffect, useMemo } from 'react'
import { getGameQueues, getEnabledGameQueues, getDefaultGameQueues, createLobby } from '../lcuHelper'

interface GameQueue {
  category: string
  gameMode: string
  description: string
  id: number
  queueAvailability: string
  mapId: number
  assetMutator?: string
  numPlayersPerTeam?: number
  isCustom?: boolean
  gameSelectCategory?: string
  shortName?: string
  name?: string
  spectatorEnabled?: boolean
}

type MappedQueueList = { [key: string]: GameQueue[] }

const GAMEMODE_NAMES: { [key: string]: string } = {
  "8-ascension": "Ascension",
  "8-odin": "Definitely Not Dominion",
  "10-classic": "Twisted Treeline",
  "11-arsr": "ARSR",
  "11-assassinate": "Blood Moon",
  "11-classic": "Summoner's Rift",
  "11-urf": "AR URF",
  "11-siege": "Nexus Siege",
  "11-lcurgmdisabled": "Rotating Game Mode",
  "12-aram": "ARAM",
  "12-portalparty": "Portal Party",
  "12-kingporo": "Legend of the Poro King",
  "12-basic_tutorial": "TUTORIAL",
  "11-battle_training": "BATTLE TRAINING",
  "11-tutorial_flow": "TUTORIAL",
  "16-darkstar": "Dark Star: Singularity",
  "18-starguardian": "Invasion",
  "11-doombotsteemo": "Doom Bots of Doom",
  "11-practicetool": "Practice Tool",
  "22-tft": "Teamfight Tactics",
  "30-cherry": "Arena",
  // Additional mappings for case variations
  "11-CLASSIC": "Summoner's Rift",
  "12-ARAM": "ARAM",
  "11-URF": "AR URF",
  "30-CHERRY": "Arena",
  // Special game modes
  "11-swiftplay": "Tam Gaz",
  "12-kiwi": "ARAM: Şamata",
  "11-SWIFTPLAY": "Tam Gaz",
  "12-KIWI": "ARAM: Şamata"
}

interface CreateLobbyProps {
  onClose: () => void
  onSuccess: () => void
}

export default function CreateLobby({ onClose, onSuccess }: CreateLobbyProps) {
  const [queues, setQueues] = useState<GameQueue[]>([])
  const [enabledGameQueues, setEnabledGameQueues] = useState<number[]>([])
  const [defaultGameQueues, setDefaultGameQueues] = useState<number[]>([])
  const [selectedSection, setSelectedSection] = useState<string>('')
  const [selectedQueueId, setSelectedQueueId] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    loadQueueData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadQueueData = async () => {
    try {
      setLoading(true)
      console.log('[CreateLobby] Loading queue data...')
      
      // Check if LCU is connected first
      const { isLcuConnected, getLcuClientInstance } = await import('../lcuHelper')
      
      // Ensure LCU client is connected
      if (!isLcuConnected()) {
        console.log('[CreateLobby] LCU not connected, attempting to connect...')
        // Try to discover and connect
        const { discoverLcuConnection } = await import('../lib/lcuConnection')
        const config = await discoverLcuConnection()
        if (config) {
          const client = getLcuClientInstance()
          await client.connect(config)
          console.log('[CreateLobby] LCU connected successfully')
        } else {
          console.error('[CreateLobby] LCU not connected and cannot discover connection! Cannot load queue data.')
          setLoading(false)
          return
        }
      }
      
      console.log('[CreateLobby] LCU is connected, fetching queue data...')
      
      // Retry logic for fetching queues (sometimes LCU needs a moment to be ready)
      const fetchWithRetry = async <T,>(fn: () => Promise<T>, name: string, maxRetries = 3): Promise<T> => {
        for (let i = 0; i < maxRetries; i++) {
          try {
            const result = await fn()
            if (result !== null && result !== undefined) {
              // Check if result is an array and has items, or if it's a non-empty value
              if (Array.isArray(result)) {
                if (result.length > 0) {
                  console.log(`[CreateLobby] ✓ ${name} fetched successfully (attempt ${i + 1}):`, result.length, 'items')
                  return result
                } else if (i < maxRetries - 1) {
                  console.log(`[CreateLobby] ${name} returned empty array, retrying... (attempt ${i + 1}/${maxRetries})`)
                  await new Promise(resolve => setTimeout(resolve, 500 * (i + 1))) // Exponential backoff
                  continue
                }
              } else {
                // Non-array result, return it
                console.log(`[CreateLobby] ✓ ${name} fetched successfully (attempt ${i + 1})`)
                return result
              }
            }
          } catch (err) {
            console.error(`[CreateLobby] Failed to get ${name} (attempt ${i + 1}/${maxRetries}):`, err)
            if (i < maxRetries - 1) {
              await new Promise(resolve => setTimeout(resolve, 500 * (i + 1))) // Exponential backoff
            }
          }
        }
        console.warn(`[CreateLobby] ⚠️ ${name} failed after ${maxRetries} attempts, returning empty/default`)
        return ([] as unknown) as T // Return empty array as fallback
      }
      
      let queuesData: GameQueue[]
      const [queuesDataTemp, enabledData, defaultData] = await Promise.all([
        fetchWithRetry<GameQueue[]>(() => getGameQueues(), 'game queues', 3),
        fetchWithRetry<number[]>(() => getEnabledGameQueues(), 'enabled queues', 3),
        fetchWithRetry<number[]>(() => getDefaultGameQueues(), 'default queues', 3)
      ])
      queuesData = queuesDataTemp || []
      
      // If queues are empty, try one more time after a short delay
      if (!queuesData || (Array.isArray(queuesData) && queuesData.length === 0)) {
        console.warn('[CreateLobby] ⚠️ Queues data is empty! Waiting 1 second and retrying...')
        await new Promise(resolve => setTimeout(resolve, 1000))
        
        try {
          const retryQueues = await getGameQueues()
          if (retryQueues && Array.isArray(retryQueues) && retryQueues.length > 0) {
            console.log('[CreateLobby] ✓ Retry successful! Got', retryQueues.length, 'queues')
            queuesData = retryQueues
          } else {
            console.error('[CreateLobby] ✗ Retry also returned empty. LCU might not be fully ready.')
          }
        } catch (err) {
          console.error('[CreateLobby] ✗ Retry failed:', err)
        }
      }
    
      
      // Ensure we always set arrays, never null or undefined
      const safeQueuesData = Array.isArray(queuesData) ? queuesData : []
      const safeEnabledData = Array.isArray(enabledData) ? enabledData : []
      const safeDefaultData = Array.isArray(defaultData) ? defaultData : []
      
      setQueues(safeQueuesData)
      setEnabledGameQueues(safeEnabledData)
      setDefaultGameQueues(safeDefaultData)
      
      // Calculate available queues immediately with all data
      const available = getAvailableQueues(safeQueuesData, safeEnabledData, safeDefaultData)
      const sections = getSections(available)
      
      
      // Set initial selection immediately
      if (sections.length > 0) {
        setSelectedSection(sections[0])
        const firstQueue = available[sections[0]]?.[0]
        if (firstQueue) {
          setSelectedQueueId(firstQueue.id)
          console.log('[CreateLobby] Set initial selection:', sections[0], firstQueue.id, firstQueue.description)
        }
      } else {
        console.warn('[CreateLobby] No sections available!')
       
      }
    } catch (error) {
      console.error('[CreateLobby] Failed to load queue data:', error)
    } finally {
      setLoading(false)
    }
  }

  const getAvailableQueues = (queuesList: GameQueue[], enabled: number[], defaults: number[]): MappedQueueList => {
    const ret: MappedQueueList = {}

    // Ensure we have valid arrays (defensive programming)
    const safeQueuesList = Array.isArray(queuesList) ? queuesList : []
    const safeEnabled = Array.isArray(enabled) ? enabled : []
    const safeDefaults = Array.isArray(defaults) ? defaults : []
    // If enabled list is empty, show all available PvP queues (fallback)
    // Otherwise, match Mimic's exact logic: only show PvP queues that are Available AND in enabled list
    const shouldFilterByEnabled = safeEnabled.length > 0

    // Log all queues to see what we're working with
    const allQueuesByCategory: { [key: string]: GameQueue[] } = {}
    const allQueuesByAvailability: { [key: string]: GameQueue[] } = {}
    const allQueuesByGameMode: { [key: string]: GameQueue[] } = {}
    
    for (const queue of safeQueuesList) {
      // Track by category
      if (!allQueuesByCategory[queue.category]) allQueuesByCategory[queue.category] = []
      allQueuesByCategory[queue.category].push(queue)
      
      // Track by availability
      if (!allQueuesByAvailability[queue.queueAvailability]) allQueuesByAvailability[queue.queueAvailability] = []
      allQueuesByAvailability[queue.queueAvailability].push(queue)
      
      // Track by game mode
      const gameModeKey = `${queue.mapId}-${queue.gameMode}`
      if (!allQueuesByGameMode[gameModeKey]) allQueuesByGameMode[gameModeKey] = []
      allQueuesByGameMode[gameModeKey].push(queue)
    }
    
    queuesList.forEach(queue => {
      if (queue.category !== 'PvP') {
        return
      }
      if (queue.queueAvailability !== 'Available') {
        return
      }
     
     console.log("DEBUG - QUEUE", JSON.stringify(queue, null, 2))
    })
    for (const queue of queuesList) {
      // Skip non-PvP queues
      if (queue.category !== 'PvP') {
        if (queue.description.toLowerCase().includes('aram') || queue.description.toLowerCase().includes('urf') || queue.description.toLowerCase().includes('classic')) {
          console.log(`[CreateLobby] ✗ Skipped non-PvP queue ${queue.id} (${queue.description}) - category: ${queue.category}`)
        }
        continue
      }
      
      // Skip unavailable queues
      if (queue.queueAvailability !== 'Available') {
        if (queue.description.toLowerCase().includes('aram') || queue.description.toLowerCase().includes('urf') || queue.description.toLowerCase().includes('classic')) {
          console.log(`[CreateLobby] ✗ Skipped unavailable queue ${queue.id} (${queue.description}) - availability: ${queue.queueAvailability}`)
        }
        continue
      }
      
      // Always include popular queues (Tam Gaz, ARAM: Şamata) even if not in enabled list
      const popularQueueIds = [480, 2400] // Tam Gaz, ARAM: Şamata
      const isPopularQueue = popularQueueIds.includes(queue.id)
      
      // Always include URF and Arena even if not in enabled list
      const isUrf = queue.gameMode.toLowerCase() === 'urf'
      const isArena = queue.gameMode.toLowerCase() === 'cherry' && queue.mapId === 30
      const isSpecialQueue = isPopularQueue || isUrf || isArena
      
      // Only include queues that are in the enabled list (if enabled list is not empty)
      // Exception: always include popular queues, URF, and Arena
      if (shouldFilterByEnabled && !safeEnabled.includes(queue.id) && !isSpecialQueue) {
        if (queue.description.toLowerCase().includes('aram') || queue.description.toLowerCase().includes('urf') || queue.description.toLowerCase().includes('classic') || queue.description.toLowerCase().includes('tam gaz') || queue.description.toLowerCase().includes('şamata') || queue.description.toLowerCase().includes('arena')) {
          console.log(`[CreateLobby] ✗ Skipped queue ${queue.id} (${queue.description}) - not in enabled list`)
        }
        continue
      }
      
      if (isSpecialQueue) {
        console.log(`[CreateLobby] ✓ Including special queue ${queue.id} (${queue.description}) - popular: ${isPopularQueue}, URF: ${isUrf}, Arena: ${isArena}`)
      }

      // Normalize key to lowercase for consistent lookup (gameMode might be uppercase like "ARAM", "CLASSIC")
      const key = `${queue.mapId}-${queue.gameMode}`.toLowerCase()
      if (!ret[key]) ret[key] = []
      ret[key].push(queue)
      console.log(`[CreateLobby] ✓ Added queue ${queue.id} (${queue.description}) to section ${key} (original: ${queue.mapId}-${queue.gameMode})`)
    }

    const totalQueuesInResult = Object.values(ret).reduce((sum, arr) => sum + arr.length, 0)

    
    // If no queues passed the filter, show a warning and try to include more
    if (totalQueuesInResult === 0 && safeQueuesList.length > 0) {
      // Fallback: show all available PvP queues regardless of enabled list
      for (const queue of safeQueuesList) {
        if (queue.category === 'PvP' && queue.queueAvailability === 'Available') {
          const key = `${queue.mapId}-${queue.gameMode}`.toLowerCase()
          if (!ret[key]) ret[key] = []
          ret[key].push(queue)
        }
      }
    }
    

    // Sort queues by default order (matching Mimic's logic)
    for (const queues of Object.values(ret)) {
      queues.sort((a, b) => {
        const aDefaultIndex = safeDefaults.indexOf(a.id)
        const bDefaultIndex = safeDefaults.indexOf(b.id)

        if (aDefaultIndex !== -1) {
          if (bDefaultIndex !== -1) {
            return aDefaultIndex - bDefaultIndex
          }
          return -1
        }

        if (bDefaultIndex !== -1) {
          return 1
        }

        return 0
      })
    }

    return ret
  }

  const getSections = (availableQueues: MappedQueueList): string[] => {
    const sectionKeys = Object.keys(availableQueues)
    console.log('[CreateLobby] getSections - input keys:', sectionKeys)
    
    // Define custom ordering for specific game modes
    const getOrderPriority = (key: string): number => {
      const lowerKey = key.toLowerCase()
      const [mapId, gameMode] = lowerKey.split('-')
      
      // Map 11 (Summoner's Rift) priorities
      if (mapId === '11') {
        if (gameMode === 'classic') return 1      // Summoner's Rift - first
        if (gameMode === 'swiftplay') return 2    // Tam Gaz - right after Summoner's Rift
        if (gameMode === 'urf') return 3          // AR URF
        return 10                                  // Other map 11 modes
      }
      
      // Map 12 (Howling Abyss) priorities
      if (mapId === '12') {
        if (gameMode === 'aram') return 20        // ARAM - first
        if (gameMode === 'kiwi') return 21        // ARAM: Şamata - right after ARAM
        return 25                                  // Other map 12 modes
      }
      
      // Map 30 (Arena) priorities
      if (mapId === '30' && gameMode === 'cherry') return 30  // Arena
      
      // Default: sort by map ID, then game mode
      return 100 + parseInt(mapId || '999', 10)
    }
    
    const sorted = sectionKeys.sort((a, b) => {
      const aPriority = getOrderPriority(a)
      const bPriority = getOrderPriority(b)
      
      if (aPriority !== bPriority) {
        return aPriority - bPriority
      }
      
      // If same priority, sort alphabetically
      return a.localeCompare(b)
    })
    
    console.log('[CreateLobby] getSections - sorted keys:', sorted)
    return sorted
  }

  const handleCreateLobby = async () => {
    if (!selectedQueueId) return

    const selectedQueue = (selectedSection ? availableQueues[selectedSection]?.find(q => q.id === selectedQueueId) : undefined)
      || queues.find(q => q.id === selectedQueueId)

    try {
      setCreating(true)
      await createLobby(selectedQueueId, selectedQueue)
      onSuccess()
      onClose()
    } catch (error: unknown) {
      console.error('Failed to create lobby:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      alert(`Failed to create lobby: ${errorMessage}`)
    } finally {
      setCreating(false)
    }
  }

  // Recalculate available queues whenever dependencies change
  const availableQueues = useMemo(() => {
    const safeQueues = Array.isArray(queues) ? queues : []
    const safeEnabled = Array.isArray(enabledGameQueues) ? enabledGameQueues : []
    const safeDefaults = Array.isArray(defaultGameQueues) ? defaultGameQueues : []
    
    console.log('[CreateLobby] Recalculating available queues with:', {
      queues: safeQueues.length,
      enabled: safeEnabled.length,
      defaults: safeDefaults.length
    })
    return getAvailableQueues(safeQueues, safeEnabled, safeDefaults)
  }, [queues, enabledGameQueues, defaultGameQueues])
  
  const sections = useMemo(() => {
    return getSections(availableQueues)
  }, [availableQueues])

  const sectionTitle = selectedSection ? (() => {
    try {
      const lowerKey = selectedSection.toLowerCase()
      const gameModeName = GAMEMODE_NAMES[lowerKey] || GAMEMODE_NAMES[selectedSection]
      if (gameModeName) return gameModeName
      
      // Fallback: try to get a descriptive name from the first queue in this section
      const firstQueue = availableQueues[selectedSection]?.[0]
      if (firstQueue) {
        // Extract map name from description or use game mode
        const [mapId, gameMode] = selectedSection.split('-')
        const gameModeLower = gameMode.toLowerCase()
        
        if (mapId === '11') {
          if (gameModeLower === 'classic') return "Summoner's Rift"
          if (gameModeLower === 'urf') return "AR URF"
        }
        if (mapId === '12' && gameModeLower === 'aram') return "ARAM"
        
        // Last resort: use the queue description
        return firstQueue.description.split(' ')[0] + '...' // Just show first word to avoid long names
      }
      
      return selectedSection
    } catch (error) {
      console.error('[CreateLobby] Error generating section title:', error)
      return selectedSection
    }
  })() : 'Select Game Mode'

  // Update selected section when sections change
  useEffect(() => {
    if (sections.length > 0 && !selectedSection) {
      console.log('[CreateLobby] Auto-selecting first section:', sections[0])
      setSelectedSection(sections[0])
      const firstQueue = availableQueues[sections[0]]?.[0]
      if (firstQueue) {
        setSelectedQueueId(firstQueue.id)
      }
    }
  }, [sections, selectedSection, availableQueues])

  // Debug logging before render
  console.log('[CreateLobby] Render state:', {
    loading,
    queuesCount: Array.isArray(queues) ? queues.length : 0,
    enabledCount: Array.isArray(enabledGameQueues) ? enabledGameQueues.length : 0,
    defaultsCount: Array.isArray(defaultGameQueues) ? defaultGameQueues.length : 0,
    sectionsCount: Array.isArray(sections) ? sections.length : 0,
    sections: sections,
    availableQueuesKeys: Object.keys(availableQueues),
    selectedSection
  })

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center">
        <div className="bg-neutral-900 rounded-2xl p-8 border border-neutral-800">
          <div className="text-white text-lg">Loading queues...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-neutral-900 rounded-2xl border border-neutral-800 max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-neutral-800">
          <h2 className="text-2xl font-bold text-white">Create Lobby</h2>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* Game Mode Selection */}
        <div className="p-6 border-b border-neutral-800">
          {sections.length === 0 ? (
            <div className="text-neutral-500 text-center py-4">
              <div>No game modes available</div>
              <div className="text-xs mt-2 space-y-1">
                <div>Debug: queues={Array.isArray(queues) ? queues.length : 0}, enabled={Array.isArray(enabledGameQueues) ? enabledGameQueues.length : 0}, defaults={Array.isArray(defaultGameQueues) ? defaultGameQueues.length : 0}</div>
                <div>Sections count: {Array.isArray(sections) ? sections.length : 0}</div>
                <div>Available queues keys: {Object.keys(availableQueues).join(', ') || 'none'}</div>
                {Array.isArray(queues) && queues.length > 0 && (
                  <div className="mt-2">
                    <div>Sample queue categories: {[...new Set(queues.slice(0, 10).map(q => q.category))].join(', ')}</div>
                    <div>Sample queue availability: {[...new Set(queues.slice(0, 10).map(q => q.queueAvailability))].join(', ')}</div>
                    <div>Sample game modes: {queues.slice(0, 5).map(q => `${q.mapId}-${q.gameMode}`).join(', ')}</div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-2">
              {sections.map((section) => {
                return (
                  <button
                    key={section}
                    onClick={() => {
                      console.log('[CreateLobby] Section clicked:', section, 'queues:', availableQueues[section]?.length)
                      setSelectedSection(section)
                      const firstQueue = availableQueues[section]?.[0]
                      if (firstQueue) {
                        setSelectedQueueId(firstQueue.id)
                      }
                    }}
                    className={`flex-shrink-0 px-4 py-2 rounded-lg border transition-all ${
                      selectedSection === section
                        ? 'bg-indigo-600 border-indigo-500 text-white'
                        : 'bg-neutral-800 border-neutral-700 text-neutral-300 hover:border-neutral-600'
                    }`}
                  >
                    {GAMEMODE_NAMES[section.toLowerCase()] || section}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Queue Selection */}
        <div className="flex-1 overflow-y-auto p-6">
          <h3 className="text-xl font-bold text-white mb-4">{sectionTitle}</h3>
          {!selectedSection ? (
            <div className="text-neutral-500 text-center py-8">Select a game mode above</div>
          ) : !availableQueues[selectedSection] || !Array.isArray(availableQueues[selectedSection]) || availableQueues[selectedSection].length === 0 ? (
            <div className="text-neutral-500 text-center py-8">
              <div>No queues available for this mode</div>
              <div className="text-sm mt-2">Debug: sections={sections.length}, selected={selectedSection}</div>
              <div className="text-xs mt-1">Available sections: {Object.keys(availableQueues).join(', ')}</div>
            </div>
          ) : (
            <div className="space-y-2">
              {availableQueues[selectedSection].map((queue) => (
                <button
                  key={queue.id}
                  onClick={() => setSelectedQueueId(queue.id)}
                  className={`w-full text-left p-4 rounded-lg border transition-all ${
                    selectedQueueId === queue.id
                      ? 'bg-indigo-600/20 border-indigo-500 text-white'
                      : 'bg-neutral-800/50 border-neutral-700 text-neutral-300 hover:border-neutral-600'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                      selectedQueueId === queue.id
                        ? 'border-indigo-400 bg-indigo-600'
                        : 'border-neutral-600'
                    }`}>
                      {selectedQueueId === queue.id && (
                        <div className="w-2 h-2 rounded-full bg-white"></div>
                      )}
                    </div>
                    <span className="font-medium">{queue.description}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-neutral-800 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-lg bg-neutral-800 text-neutral-300 hover:bg-neutral-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreateLobby}
            disabled={!selectedQueueId || creating}
            className="px-6 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {creating ? 'Creating...' : 'Create Lobby'}
          </button>
        </div>
      </div>
    </div>
  )
}

