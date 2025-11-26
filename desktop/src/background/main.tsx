import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { supabase } from '../supabaseClient'
import { type Session } from '@supabase/supabase-js'
import { watchLcuConnection } from '../lib/lcuConnection'
import { getLcuClient } from '../lib/lcuClient'
import { acceptReadyCheck, pickBanChampion } from '../lcuHelper'
import { getBridgeManager } from '../bridge/bridgeManager'

const Background = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [autoAccept] = useState(true);
  const [bridgeCode] = useState<string | null>(null);

  useEffect(() => {
    // 1. Handle Auth Session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Initialize Bridge Manager (but don't auto-connect - wait for user to click Connect)
  useEffect(() => {
    // Set up connection request callback
    const bridge = getBridgeManager();
    bridge.setConnectionRequestCallback(async (deviceInfo) => {
      // Show approval modal in desktop window
      return new Promise((resolve) => {
        // Send message to desktop window to show approval modal
        overwolf.windows.obtainDeclaredWindow('desktop', (result: any) => {
          if (result.success) {
            overwolf.windows.sendMessage(result.window.id, 'connection_request', JSON.stringify({
              type: 'connection_request',
              deviceInfo
            }), () => {});
            
            // Listen for approval response
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
                  if (data.type === 'connection_response' && data.deviceIdentity === deviceInfo.identity) {
                    overwolf.windows.onMessageReceived.removeListener(messageListener);
                    resolve(data.approved);
                  }
                } catch (error) {
                  // Ignore parsing errors
                }
              }
            };
            
            overwolf.windows.onMessageReceived.addListener(messageListener);
            
            // Timeout after 30 seconds
            setTimeout(() => {
              overwolf.windows.onMessageReceived.removeListener(messageListener);
              resolve(false);
            }, 30000);
          } else {
            resolve(false);
          }
        });
      });
    });

    return () => {
      const bridge = getBridgeManager();
      bridge.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!session?.user) return;

    console.log("Background: User authenticated", session.user.id);

    // 2. Setup Realtime Subscription
    const channel = supabase.channel(`lobby:${session.user.id}`)
      .on('broadcast', { event: 'accept_match' }, async () => {
        console.log("Received ACCEPT MATCH command from mobile");
        try {
          await acceptReadyCheck();
          console.log("Accepted match via LCU");
        } catch (error) {
          console.error("Failed to accept match:", error);
        }
      })
      .on('broadcast', { event: 'pick_champion' }, async (payload) => {
        console.log("Received PICK CHAMPION command:", payload);
        try {
          const { actionId, championId, completed } = payload.payload || {};
          if (actionId && championId !== undefined) {
            await pickBanChampion(actionId, championId, completed ?? false);
            console.log("Picked champion via LCU");
          }
        } catch (error) {
          console.error("Failed to pick champion:", error);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session]);

  // Handle LCU requests from desktop window
  useEffect(() => {
    console.log('[Background] ===== Setting up message listener =====');
    console.log('[Background] Background window ready to receive messages');
    
    // Overwolf's onMessageReceived callback signature: (windowId, messageId, message)
    // where message is a string containing the JSON message content
    const messageListener = (windowId: any, messageId: any, message: any) => {
      console.log('[Background] ===== Message Received =====');
      console.log('[Background] windowId:', windowId);
      console.log('[Background] messageId:', messageId);
      console.log('[Background] message type:', typeof message);
      console.log('[Background] message value:', typeof message === 'string' ? message.substring(0, 200) : message);
      
      // According to Overwolf API, message parameter should be a string
      let messageContent: string | null = null;
      
      // Try message parameter as string first (standard Overwolf API)
      if (typeof message === 'string') {
        messageContent = message;
        console.log('[Background] ✓ Extracted message from message parameter (string)');
      }
      // Fallback: try windowInfo.content (in case API changed)
      else if (windowId && typeof windowId === 'object' && typeof windowId.content === 'string') {
        messageContent = windowId.content;
        console.log('[Background] ✓ Extracted message from windowId.content');
      }
      // Fallback: try message.content
      else if (message && typeof message === 'object' && typeof message.content === 'string') {
        messageContent = message.content;
        console.log('[Background] ✓ Extracted message from message.content');
      }
      // Fallback: try windowId as string
      else if (typeof windowId === 'string') {
        messageContent = windowId;
        console.log('[Background] ✓ Extracted message from windowId (string)');
      }
      
      if (!messageContent) {
        console.error('[Background] ✗ Could not extract message content from any location');
        console.error('[Background] Raw parameters:', {
          windowIdType: typeof windowId,
          windowIdValue: windowId,
          messageIdType: typeof messageId,
          messageIdValue: messageId,
          messageType: typeof message,
          messageValue: message
        });
        return;
      }
      
      console.log('[Background] Message content length:', messageContent.length);
      console.log('[Background] Message content preview:', messageContent.substring(0, 300));
      
      try {
        const data = JSON.parse(messageContent);
        console.log('[Background] ✓ Successfully parsed JSON');
        console.log('[Background] Message type:', data.type);
        console.log('[Background] Request ID:', data.requestId);
        
        if (data.type === 'lcu_request') {
          console.log('[Background] ✓ Valid LCU request detected');
          console.log('[Background] Request details:', {
            path: data.path,
            method: data.method,
            hasBody: !!data.body,
            hasConfig: !!data.config
          });
          handleLcuRequest(data);
        } else {
          console.log('[Background] Ignoring non-LCU message type:', data.type);
        }
      } catch (error) {
        console.error('[Background] ✗ Error parsing message JSON:', error);
        console.error('[Background] Message content that failed to parse:', messageContent);
      }
      
      console.log('[Background] ======================================');
    };

    overwolf.windows.onMessageReceived.addListener(messageListener);
    console.log('[Background] ✓ Message listener registered successfully');
    console.log('[Background] =========================================');

    async function handleLcuRequest(data: any) {
      const requestId = data.requestId;
      const startTime = Date.now();
      
      console.log('[Background] ===== Processing LCU Request =====');
      console.log('[Background] Request ID:', requestId);
      console.log('[Background] Path:', data.path);
      console.log('[Background] Method:', data.method);
      console.log('[Background] Has body:', !!data.body);
      
      const client = getLcuClient();
      
      // Connect if not already connected
      if (!client.isConnected()) {
        if (data.config) {
          console.log('[Background] Client not connected, connecting with provided config');
          console.log('[Background] Config:', { port: data.config.port, pid: data.config.pid });
          try {
            await client.connect(data.config);
            console.log('[Background] ✓ Successfully connected to LCU');
          } catch (error: any) {
            console.error('[Background] ✗ Failed to connect to LCU:', error.message);
            // Try to send error response
            overwolf.windows.obtainDeclaredWindow('desktop', (windowResult: any) => {
              if (windowResult.success) {
                overwolf.windows.sendMessage(windowResult.window.id, requestId, JSON.stringify({
                  type: 'lcu_response',
                  requestId: requestId,
                  error: `Failed to connect to LCU: ${error.message}`
                }), () => {});
              }
            });
            return;
          }
        } else {
          console.error('[Background] ✗ Client not connected and no config provided');
          // Try to send error response
          overwolf.windows.obtainDeclaredWindow('desktop', (windowResult: any) => {
            if (windowResult.success) {
              overwolf.windows.sendMessage(windowResult.window.id, requestId, JSON.stringify({
                type: 'lcu_response',
                requestId: requestId,
                error: 'LCU client not connected and no config provided'
              }), () => {});
            }
          });
          return;
        }
      } else {
        console.log('[Background] ✓ Client already connected');
      }

      try {
        console.log('[Background] Making LCU request to proxy server...');
        const result = await client.request(data.path, data.method, data.body);
        const duration = Date.now() - startTime;
        
        console.log('[Background] ✓ LCU request succeeded');
        console.log('[Background] Duration:', duration, 'ms');
        console.log('[Background] Result type:', typeof result);
        console.log('[Background] Result is array:', Array.isArray(result));
        if (Array.isArray(result)) {
          console.log('[Background] Result length:', result.length);
        }
        
        // Send response back to desktop window
        console.log('[Background] Obtaining desktop window to send response...');
        overwolf.windows.obtainDeclaredWindow('desktop', (windowResult: any) => {
          if (windowResult.success) {
            console.log('[Background] ✓ Desktop window found, ID:', windowResult.window.id);
            const responseMessage = JSON.stringify({
              type: 'lcu_response',
              requestId: requestId,
              data: result
            });
            console.log('[Background] Sending response message (length:', responseMessage.length, 'chars)');
            
            overwolf.windows.sendMessage(windowResult.window.id, requestId, responseMessage, (sendResult: any) => {
              if (sendResult.status === 'error') {
                console.error('[Background] ✗ Failed to send response:', sendResult.error);
              } else {
                console.log('[Background] ✓ Response sent successfully');
                console.log('[Background] Send result:', sendResult);
              }
              console.log('[Background] ======================================');
            });
          } else {
            console.error('[Background] ✗ Failed to obtain desktop window:', windowResult);
            console.log('[Background] ======================================');
          }
        });
      } catch (error: any) {
        const duration = Date.now() - startTime;
        console.error('[Background] ✗ LCU request failed');
        console.error('[Background] Duration:', duration, 'ms');
        console.error('[Background] Error:', error.message);
        console.error('[Background] Error stack:', error.stack);
        
        // Send error back
        console.log('[Background] Obtaining desktop window to send error response...');
        overwolf.windows.obtainDeclaredWindow('desktop', (windowResult: any) => {
          if (windowResult.success) {
            console.log('[Background] ✓ Desktop window found for error response');
            const errorMessage = JSON.stringify({
              type: 'lcu_response',
              requestId: requestId,
              error: error.message || 'Request failed'
            });
            overwolf.windows.sendMessage(windowResult.window.id, requestId, errorMessage, (sendResult: any) => {
              if (sendResult.status === 'error') {
                console.error('[Background] ✗ Failed to send error response:', sendResult.error);
              } else {
                console.log('[Background] ✓ Error response sent successfully');
              }
              console.log('[Background] ======================================');
            });
          } else {
            console.error('[Background] ✗ Failed to obtain desktop window for error:', windowResult);
            console.log('[Background] ======================================');
          }
        });
      }
    }

    return () => {
      overwolf.windows.onMessageReceived.removeListener(messageListener);
    };
  }, []);

  // LCU Connection and Auto-Accept
  useEffect(() => {
    console.log("Background: Setting up LCU connection");

    const client = getLcuClient();
    let stopWatching: (() => void) | null = null;

    // Watch for LCU connection
    stopWatching = watchLcuConnection(
      async (config) => {
        console.log("LCU connected:", config.port);
        await client.connect(config);

        // Set up auto-accept for ready check
        if (autoAccept) {
          client.observe('/lol-matchmaking/v1/ready-check', async (event) => {
            if (event.data && event.data.state === 'InProgress') {
              console.log("Ready check detected, auto-accepting...");
              try {
                await acceptReadyCheck();
                console.log("Auto-accepted ready check");
              } catch (error) {
                console.error("Failed to auto-accept:", error);
              }
            }
          });
        }

        // Forward LCU events to desktop window
        client.observe('/lol-gameflow/v1/session', (event) => {
          overwolf.windows.obtainDeclaredWindow("desktop", (result: any) => {
            if (result.success) {
              overwolf.windows.sendMessage(result.window.id, 'lcu_event_gameflow', JSON.stringify({
                type: 'lcu_event',
                event: 'gameflow',
                data: event.data
              }), () => {});
            }
          });
        });

        client.observe('/lol-lobby/v2/lobby', (event) => {
          overwolf.windows.obtainDeclaredWindow("desktop", (result: any) => {
            if (result.success) {
              overwolf.windows.sendMessage(result.window.id, 'lcu_event_lobby', JSON.stringify({
                type: 'lcu_event',
                event: 'lobby',
                data: event.data
              }), () => {});
            }
          });
        });

        client.observe('/lol-matchmaking/v1/search', (event) => {
          overwolf.windows.obtainDeclaredWindow("desktop", (result: any) => {
            if (result.success) {
              overwolf.windows.sendMessage(result.window.id, 'lcu_event_matchmaking', JSON.stringify({
                type: 'lcu_event',
                event: 'matchmaking',
                data: event.data
              }), () => {});
            }
          });
        });

        client.observe('/lol-champ-select/v1/session', (event) => {
          overwolf.windows.obtainDeclaredWindow("desktop", (result: any) => {
            if (result.success) {
              overwolf.windows.sendMessage(result.window.id, 'lcu_event_champ_select', JSON.stringify({
                type: 'lcu_event',
                event: 'champ_select',
                data: event.data
              }), () => {});
            }
          });
        });
      },
      () => {
        console.log("LCU disconnected");
        client.disconnect();
      }
    );

    return () => {
      if (stopWatching) {
        stopWatching();
      }
      client.disconnect();
    };
  }, [autoAccept]);

  useEffect(() => {
    console.log("Auto Champ Select Background Window Loaded");

    // Open Desktop Window
    overwolf.windows.obtainDeclaredWindow("desktop", (result: any) => {
      if (result.success) {
        const windowId = result.window.id;
        console.log("Obtained desktop window, ID:", windowId);
        overwolf.windows.restore(windowId, (restoreResult: any) => {
          console.log("Desktop window restored", restoreResult);
          if (restoreResult.status === 'success') {
            overwolf.windows.changeSize(windowId, 1200, 800, (resizeResult: any) => {
              console.log("Window resized", resizeResult);
              if (resizeResult.status === 'error') {
                console.error("Failed to resize window:", resizeResult.error);
              }
            });
          } else {
            console.error("Failed to restore window:", restoreResult);
          }
        });
      } else {
        console.error("Failed to obtain desktop window:", result);
      }
    });

    const registerEvents = () => {
      overwolf.games.events.onError.addListener((info: any) => {
        console.error("Error: ", info);
      });

      overwolf.games.events.onInfoUpdates2.addListener((info: any) => {
        console.log("Info UPDATE: ", info);

        // Handle Match Found
        if (info.feature === 'lobby_info' && info.info && info.info.queueId) {
          // Queue popped? Not exactly. 'match_flow' is better.
        }

        if (info.feature === 'game_flow') {
          if (info.info.game_flow && info.info.game_flow.phase === 'MatchFound') {
            console.log("MATCH FOUND! Sending to mobile...");
            if (session?.user) {
              supabase.channel(`lobby:${session.user.id}`).send({
                type: 'broadcast',
                event: 'match_found',
                payload: { timestamp: Date.now() }
              });
            }
          }
          if (info.info.game_flow && info.info.game_flow.phase === 'ChampSelect') {
            console.log("CHAMP SELECT! Sending to mobile...");
            if (session?.user) {
              supabase.channel(`lobby:${session.user.id}`).send({
                type: 'broadcast',
                event: 'champ_select_start',
                payload: { timestamp: Date.now() }
              });
            }
          }
        }
      });

      overwolf.games.events.onNewEvents.addListener((info: any) => {
        console.log("New EVENT: ", info);
        // Sometimes events come here instead of InfoUpdates
      });
    }

    overwolf.games.getGameInfo(5426, (gameInfo: any) => { // 5426 is LoL Class ID
      if (gameInfo && gameInfo.isRunning) {
        registerEvents();
        overwolf.games.events.setRequiredFeatures(['game_flow', 'lobby_info', 'match_info'], (info: any) => {
          if (info.status == 'error') {
            console.error("Could not set required features: " + info.reason);
          } else {
            console.log("Required features set");
          }
        });
      }
    });

    overwolf.games.onGameInfoUpdated.addListener((res: any) => {
      if (res.gameChanged) {
        if (res.gameInfo.isRunning && res.gameInfo.classId === 5426) {
          registerEvents();
          overwolf.games.events.setRequiredFeatures(['game_flow', 'lobby_info', 'match_info'], console.log);
        }
      }
    });
  }, [session]);

  return (
    <div>
      <h1>Background Window</h1>
      <p>Hidden window handling game events.</p>
      <p>User: {session?.user?.email ?? 'Not logged in'}</p>
      {bridgeCode && (
        <div>
          <h2>Mobile Connection Code</h2>
          <p style={{ fontSize: '24px', fontWeight: 'bold' }}>{bridgeCode}</p>
          <p>Enter this code in the mobile app to connect</p>
        </div>
      )}
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Background />
  </React.StrictMode>,
)
