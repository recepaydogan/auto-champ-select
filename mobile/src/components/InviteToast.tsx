import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Dimensions } from 'react-native';
import { Invite } from '../hooks/useInviteListener';

interface InviteToastProps {
    invite: Invite;
    onAccept: (id: string) => void;
    onDecline: (id: string) => void;
}

export default function InviteToast({ invite, onAccept, onDecline }: InviteToastProps) {
    const slideAnim = React.useRef(new Animated.Value(-100)).current;

    React.useEffect(() => {
        Animated.spring(slideAnim, {
            toValue: 20, // Top margin
            useNativeDriver: true,
            tension: 50,
            friction: 7
        }).start();
    }, [slideAnim]);

    return (
        <Animated.View style={[styles.container, { transform: [{ translateY: slideAnim }] }]}>
            <View style={styles.content}>
                <View style={styles.header}>
                    <Text style={styles.title}>Game Invite</Text>
                    <Text style={styles.time}>Just now</Text>
                </View>

                <View style={styles.details}>
                    <View style={styles.avatarPlaceholder}>
                        <Text style={styles.avatarText}>
                            {invite.fromSummonerName?.charAt(0).toUpperCase() || '?'}
                        </Text>
                    </View>
                    <View style={styles.textContainer}>
                        <Text style={styles.senderName} numberOfLines={1}>
                            {invite.fromSummonerName}
                        </Text>
                        <Text style={styles.queueName} numberOfLines={1}>
                            {invite.queueName}
                        </Text>
                    </View>
                </View>

                <View style={styles.actions}>
                    <TouchableOpacity
                        style={[styles.button, styles.declineButton]}
                        onPress={() => onDecline(invite.invitationId)}
                    >
                        <Text style={styles.declineText}>Decline</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.button, styles.acceptButton]}
                        onPress={() => onAccept(invite.invitationId)}
                    >
                        <Text style={styles.acceptText}>Accept</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Animated.View>
    );
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        top: 0,
        left: 20,
        right: 20,
        zIndex: 9999,
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 4,
        },
        shadowOpacity: 0.30,
        shadowRadius: 4.65,
        elevation: 8,
    },
    content: {
        backgroundColor: '#1f2937', // Dark gray/blue
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: '#374151',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    title: {
        color: '#9ca3af',
        fontSize: 12,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    time: {
        color: '#6b7280',
        fontSize: 12,
    },
    details: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    avatarPlaceholder: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#4f46e5',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    avatarText: {
        color: '#ffffff',
        fontSize: 18,
        fontWeight: 'bold',
    },
    textContainer: {
        flex: 1,
    },
    senderName: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 2,
    },
    queueName: {
        color: '#d1d5db',
        fontSize: 14,
    },
    actions: {
        flexDirection: 'row',
        gap: 12,
    },
    button: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    acceptButton: {
        backgroundColor: '#22c55e', // Green
    },
    declineButton: {
        backgroundColor: '#374151', // Gray
        borderWidth: 1,
        borderColor: '#4b5563',
    },
    acceptText: {
        color: '#ffffff',
        fontWeight: '600',
        fontSize: 14,
    },
    declineText: {
        color: '#d1d5db',
        fontWeight: '600',
        fontSize: 14,
    },
});
