import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { Button } from '@rneui/themed';
import { supabase } from '../lib/supabase';
import { Session } from '@supabase/supabase-js';

export default function HomeScreen({ session }: { session: Session }) {
    const [status, setStatus] = useState('Idle');
    const [matchFound, setMatchFound] = useState(false);
    const [champSelect, setChampSelect] = useState(false);

    useEffect(() => {
        if (!session?.user) return;

        const channel = supabase.channel(`lobby:${session.user.id}`)
            .on('broadcast', { event: 'match_found' }, (payload) => {
                console.log('Match Found!', payload);
                setMatchFound(true);
                setStatus('Match Found!');
                Alert.alert('Match Found!', 'Accept now!');
            })
            .on('broadcast', { event: 'champ_select_start' }, (payload) => {
                console.log('Champ Select Started!', payload);
                setMatchFound(false);
                setChampSelect(true);
                setStatus('Champion Select');
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [session]);

    const handleAccept = async () => {
        if (!session?.user) return;

        await supabase.channel(`lobby:${session.user.id}`).send({
            type: 'broadcast',
            event: 'accept_match',
            payload: {},
        });
        setMatchFound(false);
        setStatus('Accepted! Waiting...');
    };

    const handlePick = async (champId: number, champName: string) => {
        if (!session?.user) return;

        await supabase.channel(`lobby:${session.user.id}`).send({
            type: 'broadcast',
            event: 'pick_champion',
            payload: { champId, champName },
        });
        Alert.alert(`Picked ${champName}`);
    };

    return (
        <View style={styles.container}>
            <Text style={styles.status}>Status: {status}</Text>

            {matchFound && (
                <View style={styles.actionContainer}>
                    <Button
                        title="ACCEPT MATCH"
                        buttonStyle={styles.acceptButton}
                        titleStyle={{ fontSize: 24, fontWeight: 'bold' }}
                        onPress={handleAccept}
                    />
                </View>
            )}

            {champSelect && (
                <View style={styles.actionContainer}>
                    <Text style={{ color: 'white', marginBottom: 10 }}>Pick a Champion:</Text>
                    <Button title="Pick Ahri" onPress={() => handlePick(103, 'Ahri')} containerStyle={{ margin: 5 }} />
                    <Button title="Pick Yasuo" onPress={() => handlePick(157, 'Yasuo')} containerStyle={{ margin: 5 }} />
                    <Button title="Pick Zed" onPress={() => handlePick(238, 'Zed')} containerStyle={{ margin: 5 }} />
                </View>
            )}

            <View style={{ marginTop: 50 }}>
                <Button title="Sign Out" onPress={() => supabase.auth.signOut()} type="outline" />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#242424',
        padding: 20,
    },
    status: {
        color: 'white',
        fontSize: 20,
        marginBottom: 30,
    },
    actionContainer: {
        width: '100%',
        alignItems: 'center',
        marginBottom: 30,
    },
    acceptButton: {
        backgroundColor: 'green',
        width: 200,
        height: 200,
        borderRadius: 100,
        justifyContent: 'center',
        alignItems: 'center',
    },
});
