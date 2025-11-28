import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Modal } from 'react-native';
import { Button } from '@rneui/themed';
import { getLCUBridge } from '../lib/lcuBridge';

interface GameQueue {
  category: string;
  gameMode: string;
  description: string;
  id: number;
  queueAvailability: string;
  mapId: number;
  isCustom?: boolean;
  shortName?: string;
  name?: string;
}

interface CreateLobbyProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onError?: (message: string) => void;
}

export default function CreateLobby({ visible, onClose, onSuccess, onError }: CreateLobbyProps) {
  const [queues, setQueues] = useState<GameQueue[]>([]);
  const [groupedQueues, setGroupedQueues] = useState<{ [key: string]: GameQueue[] }>({});
  const [selectedQueueId, setSelectedQueueId] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const lcuBridge = getLCUBridge();
  useEffect(() => {
    if (visible && lcuBridge.getIsConnected()) {
      loadQueues();
    }
    if (visible && !lcuBridge.getIsConnected()) {
      // If not connected, just close silently
      onClose();
    }
  }, [visible]);

  const loadQueues = async () => {
    if (!lcuBridge.getIsConnected()) return;
    try {
      setLoading(true);
      console.log('[CreateLobby] Starting to load queues...');

      const queuesResult = await lcuBridge.request('/lol-game-queues/v1/queues');
      let allQueues: GameQueue[] = queuesResult.content || [];
      
      // Unwanted queue patterns to exclude
      const unwantedPatterns = [
        '1. eğitim bölümü',
        '2. eğitim bölümü',
        '3. eğitim bölümü',
        'team fight tactics eğitim',
        'Rastgele ultra rekabet faktörü clas'
      ];
      
      // Helper function to check if queue matches unwanted patterns
      const isUnwantedQueue = (q: GameQueue): boolean => {
        const searchText = `${q.description || ''} ${q.name || ''} ${q.shortName || ''}`.toLowerCase();
        return unwantedPatterns.some(pattern => searchText.includes(pattern.toLowerCase()));
      };
      
      // Filter logic:
      // 1. Must be 'Available'
      // 2. Must NOT be custom (isCustom === false), UNLESS it is Practice Tool (id 3140)
      // 3. Must NOT match unwanted patterns
      const validQueues = allQueues.filter(q =>
        q.queueAvailability === 'Available' &&
        (!q.isCustom || q.id === 3140) &&
        !isUnwantedQueue(q)
      );

      console.log('[CreateLobby] Valid queues count:', validQueues.length);

      setQueues(validQueues);

      // Group queues
      const groups: { [key: string]: GameQueue[] } = {
        'Sihirdar Vadisi': [],
        'Teamfight Tactics': [],
        'ARAM': [],
        'Arena ve URF': [],
        'Antrenman': [],
        'Diğer': []
      };

      validQueues.forEach(q => {
        // 1. Antrenman: Practice Tool, Tutorial, and Co-op vs AI (VersusAi)
        if (q.gameMode === 'PRACTICETOOL' || q.gameMode === 'TUTORIAL' || q.category === 'VersusAi' || q.id === 3140) {
          groups['Antrenman'].push(q);
        }
        // 2. Teamfight Tactics: Map 22
        else if (q.mapId === 22 || q.gameMode === 'TFT' || q.gameMode === 'TURBO' || q.gameMode === 'DOUBLE' || q.gameMode === 'CHONCC') {
          groups['Teamfight Tactics'].push(q);
        }
        // 3. Arena ve URF: Cherry, URF, Ultbook, Strawberry (Swarm)
        else if (q.gameMode === 'CHERRY' || q.gameMode === 'URF' || q.gameMode === 'ULTBOOK' || q.gameMode === 'STRAWBERRY') {
          groups['Arena ve URF'].push(q);
        }
        // 4. ARAM: Map 12
        else if (q.gameMode === 'ARAM' || q.mapId === 12) {
          groups['ARAM'].push(q);
        }
        // 5. Sihirdar Vadisi: Map 11 (Classic, Swiftplay/Quickplay) - ONLY if not caught by above (e.g. URF/Bots)
        else if (q.mapId === 11) {
          groups['Sihirdar Vadisi'].push(q);
        }
        // 6. Fallback
        else {
          groups['Diğer'].push(q);
        }
      });

      setGroupedQueues(groups);

      // Select first available queue from the first non-empty group
      for (const category of Object.keys(groups)) {
        if (groups[category].length > 0) {
          setSelectedQueueId(groups[category][0].id);
          break;
        }
      }
    } catch (error) {
      console.error('Failed to load queues:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateLobby = async () => {
    if (!lcuBridge.getIsConnected()) {
      onClose();
      return;
    }
    if (!selectedQueueId) {
      return;
    }

    try {
      setCreating(true);
      
      // Find the selected queue for logging
      let selectedQueue: GameQueue | undefined;
      for (const categoryQueues of Object.values(groupedQueues)) {
        selectedQueue = categoryQueues.find(q => q.id === selectedQueueId);
        if (selectedQueue) break;
      }
      
      console.log('[CreateLobby] Creating lobby with queue:', {
        queueId: selectedQueueId,
        queueName: selectedQueue?.shortName || selectedQueue?.description || selectedQueue?.gameMode,
        isCustom: selectedQueue?.isCustom,
        gameMode: selectedQueue?.gameMode,
        queueDetails: selectedQueue
      });
      
      // Try to switch queue without dropping lobby/members
      let result;
      const requestBody: any = { queueId: selectedQueueId };
      if (selectedQueue?.isCustom && selectedQueue?.gameMode === 'PRACTICETOOL' && selectedQueue.mapId) {
        requestBody.mapId = selectedQueue.mapId;
      }

      // 1) Preferred: POST to lobby with queueId (LCU updates existing lobby without kicking members)
      result = await lcuBridge.request('/lol-lobby/v2/lobby', 'POST', requestBody);

      // 2) If POST not allowed, try PATCH as fallback
      if (result.status >= 400) {
        console.log('[CreateLobby] POST failed, attempting PATCH to update lobby queue');
        result = await lcuBridge.request('/lol-lobby/v2/lobby', 'PATCH', requestBody);
      }
      
      console.log('[CreateLobby] Lobby creation/switch response:', result);
      
      // Check if response indicates an error
      if (result.content && result.content.error) {
        throw new Error(result.content.error);
      }
      
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('[CreateLobby] Failed to create lobby:', {
        error,
        queueId: selectedQueueId,
        errorMessage: error.message,
        errorContent: error.content || error.status,
        responseStatus: error.status
      });
      
      // Extract error message from response
      let errorMessage = 'Failed to create lobby';
      if (error.content?.error) {
        errorMessage = `Lobby creation failed: ${error.content.error}`;
      } else if (error.message) {
        errorMessage = error.message;
      } else if (error.content?.message) {
        errorMessage = error.content.message;
      }
      
      if (onError) {
        onError(errorMessage);
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.title}>Create Lobby</Text>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#2196F3" />
              <Text style={styles.loadingText}>Loading queues...</Text>
            </View>
          ) : (
            <ScrollView style={styles.queueList}>
              {Object.entries(groupedQueues).map(([category, categoryQueues]) => (
                categoryQueues.length > 0 && (
                  <View key={category} style={styles.categoryContainer}>
                    <Text style={styles.categoryHeader}>{category}</Text>
                    {categoryQueues.map((queue) => (
                      <Button
                        key={queue.id}
                        title={queue.shortName || queue.description || queue.gameMode}
                        onPress={() => setSelectedQueueId(queue.id)}
                        buttonStyle={[
                          styles.queueButton,
                          selectedQueueId === queue.id && styles.queueButtonSelected
                        ]}
                        titleStyle={[
                          styles.queueButtonText,
                          selectedQueueId === queue.id && styles.queueButtonTextSelected
                        ]}
                      />
                    ))}
                  </View>
                )
              ))}
            </ScrollView>
          )}

          <View style={styles.buttonRow}>
            <Button
              title="Cancel"
              onPress={onClose}
              buttonStyle={styles.cancelButton}
              containerStyle={styles.buttonHalf}
            />
            <Button
              title={creating ? "Creating..." : "Create"}
              onPress={handleCreateLobby}
              disabled={!selectedQueueId || creating}
              buttonStyle={styles.createButton}
              containerStyle={styles.buttonHalf}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 20,
    width: '90%',
    maxHeight: '80%',
  },
  title: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    color: '#ccc',
    marginTop: 10,
  },
  queueList: {
    maxHeight: 400,
    marginBottom: 20,
  },
  categoryContainer: {
    marginBottom: 16,
  },
  categoryHeader: {
    color: '#888',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
    marginLeft: 4,
    textTransform: 'uppercase',
  },
  queueButton: {
    backgroundColor: '#2a2a2a',
    marginVertical: 5,
    borderRadius: 8,
  },
  queueButtonSelected: {
    backgroundColor: '#2196F3',
  },
  queueButtonText: {
    color: 'white',
  },
  queueButtonTextSelected: {
    color: 'white',
    fontWeight: 'bold',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  buttonHalf: {
    flex: 1,
    marginHorizontal: 5,
  },
  cancelButton: {
    backgroundColor: '#757575',
  },
  createButton: {
    backgroundColor: '#4CAF50',
  },
});

