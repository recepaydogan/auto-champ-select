import 'react-native-get-random-values'; // Must be imported first for crypto polyfill
import React, { useState, useEffect, useRef } from 'react'
import { StyleSheet, View, SafeAreaView, Platform, StatusBar, AppState, AppStateStatus } from 'react-native'
import { supabase, isSupabaseConfigured } from './src/lib/supabase'
import Auth from './src/components/auth'
import HomeScreen from './src/screens/home-screen'
import { Session } from '@supabase/supabase-js'
import InviteToast from './src/components/InviteToast'
import { useInviteListener } from './src/hooks/useInviteListener'
import {
  registerForPushNotificationsAsync,
  savePushTokenToSupabase,
  setupNotificationHandlers,
  removePushTokenFromSupabase
} from './src/lib/notifications'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const { activeInvite, acceptInvite, declineInvite } = useInviteListener();
  const pushTokenRef = useRef<string | null>(null);
  const appState = useRef(AppState.currentState);

  // Set up notification handlers on app start
  useEffect(() => {
    const cleanup = setupNotificationHandlers(
      // onMatchNotificationTap - the app will already show the ready check screen
      () => console.log('[App] User tapped match notification'),
      // onInviteNotificationTap - the app will already show the invite toast
      () => console.log('[App] User tapped invite notification')
    );

    return cleanup;
  }, []);

  // Register for push notifications when user logs in
  useEffect(() => {
    const registerNotifications = async () => {
      if (session?.user) {
        const token = await registerForPushNotificationsAsync();
        if (token) {
          pushTokenRef.current = token;
          await savePushTokenToSupabase(token);
        }
      }
    };

    registerNotifications();
  }, [session?.user]);

  // Handle app state changes (for notification badge clearing, etc.)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        // App has come to the foreground
        console.log('[App] App came to foreground');
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    // Skip auth if Supabase is not configured
    if (!isSupabaseConfigured) {
      console.warn('Supabase not configured - skipping authentication');
      // Create a dummy session to bypass auth
      setSession({ user: { id: 'guest' } } as Session);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session)

      // Remove push token on logout
      if (_event === 'SIGNED_OUT' && pushTokenRef.current) {
        await removePushTokenFromSupabase(pushTokenRef.current);
        pushTokenRef.current = null;
      }
    })

    return () => {
      subscription.unsubscribe();
    };
  }, [])

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      {activeInvite && (
        <SafeAreaView style={styles.toastContainer} pointerEvents="box-none">
          <InviteToast
            invite={activeInvite}
            onAccept={acceptInvite}
            onDecline={declineInvite}
          />
        </SafeAreaView>
      )}
      {session && session.user ? <HomeScreen session={session} /> : <Auth />}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#242424',
  },
  toastContainer: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 40 : 0, // Adjust for Android status bar
    left: 0,
    right: 0,
    zIndex: 9999,
  }
})
