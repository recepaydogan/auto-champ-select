import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Overlay } from '@rneui/themed';

// Role icons
const ROLE_ICONS = {
    TOP: require('../../static/roles/role-top.png'),
    JUNGLE: require('../../static/roles/role-jungle.png'),
    MIDDLE: require('../../static/roles/role-mid.png'),
    BOTTOM: require('../../static/roles/role-bot.png'),
    UTILITY: require('../../static/roles/role-support.png'),
    FILL: require('../../static/roles/role-fill.png'),
    UNSELECTED: require('../../static/roles/role-unselected.png'),
};

export const ROLES = [
    { id: 'TOP', name: 'Top', icon: ROLE_ICONS.TOP },
    { id: 'JUNGLE', name: 'Jungle', icon: ROLE_ICONS.JUNGLE },
    { id: 'MIDDLE', name: 'Mid', icon: ROLE_ICONS.MIDDLE },
    { id: 'BOTTOM', name: 'Bot', icon: ROLE_ICONS.BOTTOM },
    { id: 'UTILITY', name: 'Support', icon: ROLE_ICONS.UTILITY },
    { id: 'FILL', name: 'Fill', icon: ROLE_ICONS.FILL },
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
                            <Image source={role.icon} style={styles.roleIconImage} />
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
    roleIconImage: {
        width: 40,
        height: 40,
        marginBottom: 5,
        resizeMode: 'contain',
    },
    roleName: {
        color: '#ccc',
        fontSize: 12,
    },
});
