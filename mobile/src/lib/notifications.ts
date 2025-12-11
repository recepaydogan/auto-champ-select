/**
 * Push Notifications Service
 * Handles notification permissions, registration, and local notification scheduling
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase, isSupabaseConfigured } from './supabase';

// Configure notification behavior
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
    }),
});

/**
 * Request notification permissions and get push token
 * @returns Expo push token or null if failed
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
    let token: string | null = null;

    // Push notifications only work on physical devices
    if (!Device.isDevice) {
        console.warn('[Notifications] Must use physical device for push notifications');
        return null;
    }

    // Check if we already have permission
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    // Request permission if not already granted
    if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
    }

    if (finalStatus !== 'granted') {
        console.warn('[Notifications] Failed to get push token - permission denied');
        return null;
    }

    try {
        // Get Expo push token
        const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

        if (projectId) {
            const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
            token = tokenData.data;
        } else {
            // Fallback for development
            const tokenData = await Notifications.getExpoPushTokenAsync();
            token = tokenData.data;
        }

        console.log('[Notifications] Push token:', token);
    } catch (error) {
        console.error('[Notifications] Error getting push token:', error);
    }

    // Android requires a notification channel
    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('match-alerts', {
            name: 'Match Alerts',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#C89B3C',
            sound: 'default',
        });

        await Notifications.setNotificationChannelAsync('lobby-invites', {
            name: 'Lobby Invites',
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#C89B3C',
            sound: 'default',
        });
    }

    return token;
}

/**
 * Save push token to Supabase for the current user
 */
export async function savePushTokenToSupabase(token: string): Promise<boolean> {
    if (!isSupabaseConfigured) {
        console.warn('[Notifications] Supabase not configured, skipping token save');
        return false;
    }

    try {
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            console.warn('[Notifications] No user logged in, cannot save token');
            return false;
        }

        const deviceId = Device.deviceName || Device.modelName || 'unknown';
        const platform = Platform.OS;

        // Upsert the token (update if exists, insert if not)
        const { error } = await supabase
            .from('push_tokens')
            .upsert(
                {
                    user_id: user.id,
                    token: token,
                    device_id: deviceId,
                    platform: platform,
                },
                {
                    onConflict: 'user_id,token',
                }
            );

        if (error) {
            console.error('[Notifications] Error saving token to Supabase:', error);
            return false;
        }

        console.log('[Notifications] Token saved to Supabase');
        return true;
    } catch (error) {
        console.error('[Notifications] Error saving token:', error);
        return false;
    }
}

/**
 * Remove push token from Supabase (call on logout)
 */
export async function removePushTokenFromSupabase(token: string): Promise<void> {
    if (!isSupabaseConfigured) return;

    try {
        await supabase
            .from('push_tokens')
            .delete()
            .eq('token', token);
    } catch (error) {
        console.error('[Notifications] Error removing token:', error);
    }
}

/**
 * Schedule a local notification for match found
 */
export async function scheduleMatchFoundNotification(): Promise<void> {
    try {
        await Notifications.scheduleNotificationAsync({
            content: {
                title: '⚔️ Match Found!',
                body: 'Your match is ready. Tap to accept!',
                sound: 'default',
                priority: Notifications.AndroidNotificationPriority.MAX,
                categoryIdentifier: 'match-found',
            },
            trigger: null, // Immediate notification
        });
        console.log('[Notifications] Match found notification scheduled');
    } catch (error) {
        console.error('[Notifications] Error scheduling match notification:', error);
    }
}

/**
 * Schedule a local notification for lobby invite
 */
export async function scheduleLobbyInviteNotification(
    senderName: string,
    queueName: string
): Promise<void> {
    try {
        await Notifications.scheduleNotificationAsync({
            content: {
                title: '📨 Lobby Invite',
                body: `${senderName} invited you to ${queueName}`,
                sound: 'default',
                priority: Notifications.AndroidNotificationPriority.HIGH,
                categoryIdentifier: 'lobby-invite',
            },
            trigger: null, // Immediate notification
        });
        console.log('[Notifications] Lobby invite notification scheduled');
    } catch (error) {
        console.error('[Notifications] Error scheduling invite notification:', error);
    }
}

/**
 * Set up notification response handler
 * @param onMatchNotificationTap - Callback when user taps match notification
 * @param onInviteNotificationTap - Callback when user taps invite notification
 * @returns Cleanup function to remove listeners
 */
export function setupNotificationHandlers(
    onMatchNotificationTap?: () => void,
    onInviteNotificationTap?: () => void
): () => void {
    // Handle notification received while app is foregrounded
    const receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
        console.log('[Notifications] Received in foreground:', notification.request.content.title);
    });

    // Handle notification tap (app in background or killed)
    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
        const category = response.notification.request.content.categoryIdentifier;
        console.log('[Notifications] User tapped notification:', category);

        if (category === 'match-found' && onMatchNotificationTap) {
            onMatchNotificationTap();
        } else if (category === 'lobby-invite' && onInviteNotificationTap) {
            onInviteNotificationTap();
        }
    });

    // Return cleanup function
    return () => {
        receivedSubscription.remove();
        responseSubscription.remove();
    };
}

/**
 * Cancel all pending notifications
 */
export async function cancelAllNotifications(): Promise<void> {
    await Notifications.cancelAllScheduledNotificationsAsync();
}
