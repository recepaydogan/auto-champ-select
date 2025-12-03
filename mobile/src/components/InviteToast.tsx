import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Dimensions, Platform } from 'react-native';
import { Invite } from '../hooks/useInviteListener';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';

interface InviteToastProps {
    invite: Invite;
    onAccept: (id: string) => void;
    onDecline: (id: string) => void;
}

const { width } = Dimensions.get('window');

export default function InviteToast({ invite, onAccept, onDecline }: InviteToastProps) {
    const slideAnim = useRef(new Animated.Value(-150)).current;
    const scaleAnim = useRef(new Animated.Value(0.9)).current;
    const progressAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        // Entrance animation
        const targetOffset = Platform.OS === 'android' ? 32 : 24;
        Animated.parallel([
            Animated.spring(slideAnim, {
                toValue: targetOffset, // Sit a bit lower under the status bar
                useNativeDriver: true,
                tension: 60,
                friction: 8
            }),
            Animated.spring(scaleAnim, {
                toValue: 1,
                useNativeDriver: true,
                tension: 70,
                friction: 7
            })
        ]).start();

        // Progress bar animation (30 seconds timeout visualization)
        Animated.timing(progressAnim, {
            toValue: 0,
            duration: 30000,
            useNativeDriver: false // width doesn't support native driver
        }).start();
    }, []);

    const handleAccept = () => {
        Animated.parallel([
            Animated.timing(scaleAnim, { toValue: 1.1, duration: 100, useNativeDriver: true }),
            Animated.timing(slideAnim, { toValue: -200, duration: 200, useNativeDriver: true })
        ]).start(() => onAccept(invite.invitationId));
    };

    const handleDecline = () => {
        Animated.timing(slideAnim, {
            toValue: -200,
            duration: 200,
            useNativeDriver: true
        }).start(() => onDecline(invite.invitationId));
    };

    return (
        <Animated.View style={[
            styles.container,
            { transform: [{ translateY: slideAnim }, { scale: scaleAnim }] }
        ]}>
            <LinearGradient
                colors={['#1e1b4b', '#312e81']} // Deep Indigo Gradient
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.gradient}
            >
                {/* Progress Bar */}
                <View style={styles.progressContainer}>
                    <Animated.View
                        style={[
                            styles.progressBar,
                            {
                                width: progressAnim.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: ['0%', '100%']
                                })
                            }
                        ]}
                    />
                </View>

                <View style={styles.content}>
                    {/* Left: Avatar/Icon */}
                    <View style={styles.iconContainer}>
                        <LinearGradient
                            colors={['#4f46e5', '#818cf8']}
                            style={styles.avatarGradient}
                        >
                            <Text style={styles.avatarText}>
                                {invite.fromSummonerName?.charAt(0).toUpperCase() || '?'}
                            </Text>
                        </LinearGradient>
                        <View style={styles.onlineBadge} />
                    </View>

                    {/* Middle: Text Info */}
                    <View style={styles.textContainer}>
                        <Text style={styles.inviteTitle}>GAME INVITE</Text>
                        <Text style={styles.senderName} numberOfLines={1}>
                            {invite.fromSummonerName}
                        </Text>
                        <View style={styles.queueRow}>
                            <Icon name="gamepad-variant" size={12} color="#94a3b8" style={{ marginRight: 4 }} />
                            <Text style={styles.queueName} numberOfLines={1}>
                                {invite.queueName}
                            </Text>
                        </View>
                    </View>

                    {/* Right: Actions */}
                    <View style={styles.actions}>
                        <TouchableOpacity
                            style={styles.declineButton}
                            onPress={handleDecline}
                            activeOpacity={0.7}
                        >
                            <Icon name="close" size={20} color="#cbd5e1" />
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.acceptButton}
                            onPress={handleAccept}
                            activeOpacity={0.7}
                        >
                            <LinearGradient
                                colors={['#22c55e', '#16a34a']}
                                style={styles.acceptGradient}
                            >
                                <Icon name="check" size={20} color="#ffffff" />
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                </View>
            </LinearGradient>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        top: 0,
        alignSelf: 'center',
        width: width - 32, // 16px padding on each side
        zIndex: 9999,
        shadowColor: "#4f46e5",
        shadowOffset: {
            width: 0,
            height: 8,
        },
        shadowOpacity: 0.4,
        shadowRadius: 12,
        elevation: 10,
    },
    gradient: {
        borderRadius: 16,
        padding: 0,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        overflow: 'hidden',
    },
    progressContainer: {
        height: 2,
        backgroundColor: 'rgba(255,255,255,0.1)',
        width: '100%',
    },
    progressBar: {
        height: '100%',
        backgroundColor: '#6366f1',
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
    },
    iconContainer: {
        position: 'relative',
        marginRight: 14,
    },
    avatarGradient: {
        width: 48,
        height: 48,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 3,
    },
    avatarText: {
        color: '#ffffff',
        fontSize: 20,
        fontWeight: 'bold',
    },
    onlineBadge: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: 14,
        height: 14,
        borderRadius: 7,
        backgroundColor: '#22c55e',
        borderWidth: 2,
        borderColor: '#1e1b4b',
    },
    textContainer: {
        flex: 1,
        justifyContent: 'center',
    },
    inviteTitle: {
        color: '#818cf8',
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 1,
        marginBottom: 2,
    },
    senderName: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '700',
        marginBottom: 2,
    },
    queueRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    queueName: {
        color: '#94a3b8',
        fontSize: 13,
        fontWeight: '500',
    },
    actions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginLeft: 8,
    },
    declineButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    acceptButton: {
        width: 48,
        height: 48,
        borderRadius: 24,
        shadowColor: "#22c55e",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
    },
    acceptGradient: {
        width: '100%',
        height: '100%',
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
    },
});
