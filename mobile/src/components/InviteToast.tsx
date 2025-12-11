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
    const glowAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        // Entrance animation - positioned lower
        const targetOffset = Platform.OS === 'android' ? 60 : 56;
        Animated.parallel([
            Animated.spring(slideAnim, {
                toValue: targetOffset,
                useNativeDriver: true,
                tension: 50,
                friction: 9
            }),
            Animated.spring(scaleAnim, {
                toValue: 1,
                useNativeDriver: true,
                tension: 70,
                friction: 7
            })
        ]).start();

        // Subtle glow pulse animation
        Animated.loop(
            Animated.sequence([
                Animated.timing(glowAnim, { toValue: 1, duration: 1500, useNativeDriver: false }),
                Animated.timing(glowAnim, { toValue: 0, duration: 1500, useNativeDriver: false })
            ])
        ).start();

        // Progress bar animation (30 seconds timeout visualization)
        Animated.timing(progressAnim, {
            toValue: 0,
            duration: 30000,
            useNativeDriver: false
        }).start();
    }, []);

    const handleAccept = () => {
        Animated.parallel([
            Animated.timing(scaleAnim, { toValue: 1.05, duration: 100, useNativeDriver: true }),
            Animated.timing(slideAnim, { toValue: -200, duration: 250, useNativeDriver: true })
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
            {/* Outer glow border */}
            <Animated.View style={[
                styles.glowBorder,
                {
                    shadowOpacity: glowAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.3, 0.6]
                    })
                }
            ]}>
                <LinearGradient
                    colors={['#1a1a2e', '#0f0f1a']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.gradient}
                >
                    {/* Gold accent line at top */}
                    <LinearGradient
                        colors={['#c9a227', '#f0d060', '#c9a227']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.goldAccent}
                    />

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
                        {/* Left: Avatar with gold ring */}
                        <View style={styles.iconContainer}>
                            <View style={styles.avatarRing}>
                                <LinearGradient
                                    colors={['#0a0a12', '#1a1a2e']}
                                    style={styles.avatarGradient}
                                >
                                    <Text style={styles.avatarText}>
                                        {invite.fromSummonerName?.charAt(0).toUpperCase() || '?'}
                                    </Text>
                                </LinearGradient>
                            </View>
                            <View style={styles.onlineBadge} />
                        </View>

                        {/* Middle: Text Info */}
                        <View style={styles.textContainer}>
                            <View style={styles.titleRow}>
                                <Icon name="sword-cross" size={12} color="#c9a227" style={{ marginRight: 4 }} />
                                <Text style={styles.inviteTitle}>GAME INVITE</Text>
                            </View>
                            <Text style={styles.senderName} numberOfLines={1}>
                                {invite.fromSummonerName || 'Unknown Summoner'}
                            </Text>
                            <View style={styles.queueRow}>
                                <Icon name="gamepad-variant" size={11} color="#7a7a8c" style={{ marginRight: 4 }} />
                                <Text style={styles.queueName} numberOfLines={1}>
                                    {invite.queueName || 'Game Mode'}
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
                                <Icon name="close" size={18} color="#8b8b9a" />
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.acceptButton}
                                onPress={handleAccept}
                                activeOpacity={0.8}
                            >
                                <LinearGradient
                                    colors={['#c9a227', '#a88419']}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 0, y: 1 }}
                                    style={styles.acceptGradient}
                                >
                                    <Icon name="check" size={22} color="#0a0a12" />
                                </LinearGradient>
                            </TouchableOpacity>
                        </View>
                    </View>
                </LinearGradient>
            </Animated.View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        top: 0,
        alignSelf: 'center',
        width: width - 24,
        zIndex: 9999,
    },
    glowBorder: {
        borderRadius: 12,
        shadowColor: "#c9a227",
        shadowOffset: { width: 0, height: 4 },
        shadowRadius: 16,
        elevation: 12,
    },
    gradient: {
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#c9a227',
        overflow: 'hidden',
    },
    goldAccent: {
        height: 2,
        width: '100%',
    },
    progressContainer: {
        height: 3,
        backgroundColor: 'rgba(201, 162, 39, 0.15)',
        width: '100%',
    },
    progressBar: {
        height: '100%',
        backgroundColor: '#c9a227',
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 16,
    },
    iconContainer: {
        position: 'relative',
        marginRight: 14,
    },
    avatarRing: {
        width: 52,
        height: 52,
        borderRadius: 26,
        borderWidth: 2,
        borderColor: '#c9a227',
        padding: 2,
    },
    avatarGradient: {
        width: '100%',
        height: '100%',
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: {
        color: '#c9a227',
        fontSize: 20,
        fontWeight: 'bold',
    },
    onlineBadge: {
        position: 'absolute',
        bottom: 2,
        right: 2,
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: '#22c55e',
        borderWidth: 2,
        borderColor: '#0f0f1a',
    },
    textContainer: {
        flex: 1,
        justifyContent: 'center',
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 2,
    },
    inviteTitle: {
        color: '#c9a227',
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 1.5,
    },
    senderName: {
        color: '#f0e6d2',
        fontSize: 16,
        fontWeight: '700',
        marginBottom: 2,
    },
    queueRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    queueName: {
        color: '#7a7a8c',
        fontSize: 12,
        fontWeight: '500',
    },
    actions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginLeft: 8,
    },
    declineButton: {
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: 'rgba(255,255,255,0.05)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    acceptButton: {
        width: 50,
        height: 50,
        borderRadius: 25,
        shadowColor: "#c9a227",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
        elevation: 6,
    },
    acceptGradient: {
        width: '100%',
        height: '100%',
        borderRadius: 25,
        justifyContent: 'center',
        alignItems: 'center',
    },
});
