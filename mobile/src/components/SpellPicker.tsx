import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, Modal } from 'react-native';
import { Button } from '@rneui/themed';

interface Spell {
    id: number;
    name: string;
    iconPath: string;
}

interface SpellPickerProps {
    visible: boolean;
    onSelect: (spellId: number) => void;
    onClose: () => void;
    spells: Spell[];
    currentSpellId?: number;
    allowedSpellIds?: number[] | null;
}

export default function SpellPicker({ visible, onSelect, onClose, spells, currentSpellId, allowedSpellIds }: SpellPickerProps) {
    const allowedSet = allowedSpellIds && allowedSpellIds.length > 0 ? new Set(allowedSpellIds) : null;
    return (
        <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={styles.container}>
                    <Text style={styles.title}>Select Summoner Spell</Text>
                    <ScrollView contentContainerStyle={styles.grid}>
                        {spells.map((spell) => {
                            const isAllowed = allowedSet ? allowedSet.has(spell.id) : true;
                            const iconUri = spell.iconPath && spell.iconPath.trim().length > 0 ? spell.iconPath : undefined;
                            return (
                                <TouchableOpacity
                                    key={spell.id}
                                    style={[
                                        styles.spellItem,
                                        currentSpellId === spell.id && styles.selectedSpell,
                                        !isAllowed && styles.disabledSpell
                                    ]}
                                    onPress={() => {
                                        if (!isAllowed) return;
                                        onSelect(spell.id);
                                    }}
                                    disabled={!isAllowed}
                                >
                                    {iconUri ? (
                                        <Image source={{ uri: iconUri }} style={styles.spellIcon} />
                                    ) : (
                                        <View style={[styles.spellIcon, styles.spellPlaceholder]} />
                                    )}
                                    <Text style={styles.spellName}>{spell.name}</Text>
                                    {!isAllowed && <Text style={styles.spellNotAllowed}>Not allowed</Text>}
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                    <Button title="Cancel" onPress={onClose} buttonStyle={styles.cancelButton} />
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.8)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    container: {
        backgroundColor: '#1e1e1e',
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
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 15,
    },
    spellItem: {
        width: 80,
        alignItems: 'center',
        marginBottom: 15,
        padding: 5,
        borderRadius: 8,
        borderWidth: 2,
        borderColor: 'transparent',
    },
    selectedSpell: {
        borderColor: '#d4af37',
        backgroundColor: '#3a3a3a',
    },
    disabledSpell: {
        opacity: 0.4,
    },
    spellIcon: {
        width: 50,
        height: 50,
        borderRadius: 8,
        marginBottom: 5,
    },
    spellPlaceholder: {
        backgroundColor: '#2a2a2a',
    },
    spellName: {
        color: '#ccc',
        fontSize: 10,
        textAlign: 'center',
    },
    spellNotAllowed: {
        color: '#f87171',
        fontSize: 9,
        textAlign: 'center',
        marginTop: 2,
    },
    cancelButton: {
        backgroundColor: '#757575',
        marginTop: 20,
    },
});
