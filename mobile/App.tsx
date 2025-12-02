import 'react-native-get-random-values'; // Must be imported first for crypto polyfill
import React, { useState, useEffect } from 'react'
import { StyleSheet, View, SafeAreaView, Platform, StatusBar } from 'react-native'
import { supabase, isSupabaseConfigured } from './src/lib/supabase'
import Auth from './src/components/auth'
import HomeScreen from './src/screens/home-screen'
import { Session } from '@supabase/supabase-js'
import InviteToast from './src/components/InviteToast'
import { useInviteListener } from './src/hooks/useInviteListener'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const { activeInvite, acceptInvite, declineInvite } = useInviteListener();

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

    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
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
