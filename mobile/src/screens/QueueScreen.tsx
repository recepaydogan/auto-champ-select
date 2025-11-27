import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { Button } from '@rneui/themed';

interface QueueScreenProps {
    onCancelQueue: () => void;
    timeInQueue: number;
    readyCheck?: any;
    onAccept?: () => void;
    onDecline?: () => void;
}

export default function QueueScreen({ onCancelQueue, timeInQueue, readyCheck, onAccept, onDecline }: QueueScreenProps) {
    const pulseAnim = useRef(new Animated.Value(1)).current;

    const isReadyCheck = readyCheck?.state === 'InProgress';
    const playerResponse = readyCheck?.playerResponse;

    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, {
                    toValue: 1.1,
                    duration: 1000,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                }),
                Animated.timing(pulseAnim, {
                    toValue: 1,
                    duration: 1000,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                }),
            ])
        ).start();
    }, []);

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <View style={styles.container}>
            <View style={styles.content}>
                <Animated.View style={[styles.pulseContainer, { transform: [{ scale: pulseAnim }] }]}>
                    <View style={styles.logoContainer}>
                        <Text style={styles.logoText}>LoL</Text>
                    </View>
                </Animated.View>

                <Text style={styles.statusText}>
                    {isReadyCheck ? 'Match Found!' : 'Finding Match...'}
                </Text>
                {!isReadyCheck && <Text style={styles.timerText}>{formatTime(timeInQueue)}</Text>}

                {isReadyCheck && (
                    <View style={styles.readyCheckContainer}>
                        <Text style={styles.timerText}>{readyCheck.timer}s</Text>
                        <View style={styles.readyCheckButtons}>
                            <Button
                                title="Accept"
                                onPress={onAccept}
                                disabled={playerResponse !== 'None'}
                                buttonStyle={[styles.acceptButton, playerResponse === 'Accepted' && styles.acceptedButton]}
                                titleStyle={styles.buttonTitle}
                            />
                            <Button
                                title="Decline"
                                onPress={onDecline}
                                disabled={playerResponse !== 'None'}
                                buttonStyle={[styles.declineButton, playerResponse === 'Declined' && styles.declinedButton]}
                                titleStyle={styles.buttonTitle}
                            />
                        </View>
                    </View>
                )}
            </View>

            {!isReadyCheck && (
                <View style={styles.footer}>
                    <Button
                        title="Cancel Queue"
                        onPress={onCancelQueue}
                        buttonStyle={styles.cancelButton}
                        containerStyle={styles.buttonContainer}
                        icon={{
                            name: 'times',
                            type: 'font-awesome',
                            size: 15,
                            color: 'white',
                        }}
                    />
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0a0a',
        padding: 20,
        justifyContent: 'space-between',
    },
    content: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    pulseContainer: {
        marginBottom: 40,
    },
    logoContainer: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: '#171717',
        borderWidth: 2,
        borderColor: '#4f46e5',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#4f46e5',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
        elevation: 10,
    },
    logoText: {
        color: '#ffffff',
        fontSize: 24,
        fontWeight: 'bold',
    },
    statusText: {
        color: '#ffffff',
        fontSize: 24,
        fontWeight: '600',
        marginBottom: 10,
    },
    timerText: {
        color: '#a3a3a3',
        fontSize: 18,
        fontVariant: ['tabular-nums'],
    },
    footer: {
        marginBottom: 40,
    },
    buttonContainer: {
        width: '100%',
    },
    cancelButton: {
        backgroundColor: '#ef4444',
        paddingVertical: 15,
        borderRadius: 12,
    },
    readyCheckContainer: {
        width: '100%',
        alignItems: 'center',
        marginTop: 20,
    },
    readyCheckButtons: {
        flexDirection: 'row',
        gap: 20,
        marginTop: 20,
        width: '100%',
        justifyContent: 'center',
    },
    acceptButton: {
        backgroundColor: '#059669',
        paddingVertical: 15,
        paddingHorizontal: 30,
        borderRadius: 12,
        minWidth: 120,
    },
    acceptedButton: {
        backgroundColor: '#047857',
        opacity: 0.8,
    },
    declineButton: {
        backgroundColor: '#dc2626',
        paddingVertical: 15,
        paddingHorizontal: 30,
        borderRadius: 12,
        minWidth: 120,
    },
    declinedButton: {
        backgroundColor: '#b91c1c',
        opacity: 0.8,
    },
    buttonTitle: {
        fontSize: 18,
        fontWeight: 'bold',
    },
});
