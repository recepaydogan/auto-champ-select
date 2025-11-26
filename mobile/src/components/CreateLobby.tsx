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
}

interface CreateLobbyProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreateLobby({ visible, onClose, onSuccess }: CreateLobbyProps) {
  const [queues, setQueues] = useState<GameQueue[]>([]);
  const [selectedQueueId, setSelectedQueueId] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const lcuBridge = getLCUBridge();

  useEffect(() => {
    if (visible && lcuBridge.isConnected()) {
      loadQueues();
    }
  }, [visible]);

  const loadQueues = async () => {
    try {
      setLoading(true);
      console.log('[CreateLobby] Starting to load queues...');
      console.log('[CreateLobby] lcuBridge.isConnected():', lcuBridge.isConnected());
      
      console.log('[CreateLobby] Requesting /lol-game-queues/v1/queues...');
      const queuesResult = await lcuBridge.request('/lol-game-queues/v1/queues');
      console.log('[CreateLobby] Queues result:', queuesResult);
      
      console.log('[CreateLobby] Requesting enabled queues...');
      const enabledResult = await lcuBridge.request('/lol-platform-config/v1/namespaces/LcuSocial/EnabledGameQueues').catch((e) => {
        console.log('[CreateLobby] Enabled queues error (ignored):', e);
        return null;
      });
      console.log('[CreateLobby] Enabled result:', enabledResult);

      let allQueues: GameQueue[] = queuesResult.content || [];
      let enabledIds: number[] = [];

      if (enabledResult && enabledResult.content) {
        const enabledStr = typeof enabledResult.content === 'string' 
          ? enabledResult.content 
          : enabledResult.content.value || enabledResult.content;
        enabledIds = enabledStr.split(',').map((x: string) => parseInt(x.trim(), 10)).filter((x: number) => !isNaN(x));
      }

      // Filter to only PvP queues that are available
      const pvpQueues = allQueues.filter(q => 
        q.queueAvailability === 'Available' &&
        (enabledIds.length === 0 || enabledIds.includes(q.id))
      );

      setQueues(pvpQueues);
      
      if (pvpQueues.length > 0) {
        setSelectedQueueId(pvpQueues[0].id);
      }
    } catch (error) {
      console.error('Failed to load queues:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateLobby = async () => {
    if (!selectedQueueId) {
      return;
    }

    try {
      setCreating(true);
      await lcuBridge.request('/lol-lobby/v2/lobby', 'POST', { queueId: selectedQueueId });
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Failed to create lobby:', error);
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
              {queues.map((queue) => (
                <Button
                  key={queue.id}
                  title={queue.description || queue.gameMode}
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

