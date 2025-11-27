import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Overlay } from '@rneui/themed';

// Role icons (using text for now, can be replaced with images)
const ROLES = [
    { id: 'TOP', name: 'Top', icon: '🛡️' },
    { id: 'JUNGLE', name: 'Jungle', icon: '🌲' },
    { id: 'MIDDLE', name: 'Mid', icon: '⚔️' },
    { id: 'BOTTOM', name: 'Bot', icon: '🏹' },
    { id: 'UTILITY', name: 'Support', icon: '❤️' },
    { id: 'FILL', name: 'Fill', icon: '🔄' },
];

interface RolePickerProps {
    visible: boolean;
    onSelect: (role: string) => void;
    onClose: () => void;
    currentRole?: string;
}

export default function RolePicker({ visible, onSelect, onClose, currentRole }: RolePickerProps) {
    return (
        <Overlay isVisible={visible} onBackdropPress={onClose} overlayStyle={styles.overlay}>
            <View style={styles.container}>
                <Text style={styles.title}>Select Role</Text>
                <View style={styles.grid}>
                    {ROLES.map((role) => (
                        <TouchableOpacity
                            key={role.id}
                            style={[
                                styles.roleItem,
                                currentRole === role.id && styles.selectedRole
                            ]}
                            onPress={() => onSelect(role.id)}
                        >
                            <Text style={styles.roleIcon}>{role.icon}</Text>
                            <Text style={styles.roleName}>{role.name}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>
        </Overlay>
    );
}

const styles = StyleSheet.create({
    overlay: {
        backgroundColor: '#1e1e1e',
        borderRadius: 12,
        padding: 20,
        width: '80%',
    },
    container: {
        alignItems: 'center',
    },
    title: {
        color: 'white',
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 20,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 10,
    },
    roleItem: {
        width: 80,
        height: 80,
        backgroundColor: '#2a2a2a',
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: 'transparent',
    },
    selectedRole: {
        borderColor: '#d4af37', // Gold color
        backgroundColor: '#3a3a3a',
    },
    roleIcon: {
        fontSize: 30,
        marginBottom: 5,
    },
    roleName: {
        color: '#ccc',
        fontSize: 12,
    },
});
