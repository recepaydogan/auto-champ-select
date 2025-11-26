import React, { useState, useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import { supabase } from './src/lib/supabase'
import Auth from './src/components/auth'
import HomeScreen from './src/screens/home-screen'
import { Session } from '@supabase/supabase-js'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
  }, [])

  return (
    <View style={styles.container}>
      {session && session.user ? <HomeScreen session={session} /> : <Auth />}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#242424',
  },
})
