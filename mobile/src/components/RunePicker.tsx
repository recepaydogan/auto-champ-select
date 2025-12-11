import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, Image } from 'react-native';
import { Button, Icon } from '@rneui/themed';

interface RunePage {
    id: number;
    name: string;
    isEditable: boolean;
    isActive: boolean;
    primaryStyleId: number;
    subStyleId: number;
    selectedPerkIds?: number[];
}

interface RunePickerProps {
    visible: boolean;
    onSelect: (pageId: number) => void;
    onClose: () => void;
    pages: RunePage[];
    currentPageId?: number;
    perkStyles?: any[];
    runeIconMap?: Record<number, string>;
    normalizeRuneIcon?: (path: string | undefined, id?: number) => string;
}

export default function RunePicker({
    visible,
    onSelect,
    onClose,
    pages,
    currentPageId,
    perkStyles,
    runeIconMap,
    normalizeRuneIcon
}: RunePickerProps) {
    const findStyleIcon = (styleId?: number | null) => {
        if (!styleId || !perkStyles?.length || !normalizeRuneIcon) return '';
        const style = perkStyles.find((s: any) => s.id === styleId);
        return normalizeRuneIcon(style?.iconPath);
    };

    const findPerkIcon = (perkId?: number) => {
        if (!perkId) return '';
        if (runeIconMap && normalizeRuneIcon && runeIconMap[perkId]) {
            return normalizeRuneIcon(runeIconMap[perkId], perkId);
        }
        for (const style of perkStyles || []) {
            for (const slot of style?.slots || []) {
                for (const perk of slot?.perks || []) {
                    const pid = typeof perk === 'number' ? perk : perk?.id;
                    if (pid === perkId) {
                        const iconPath = typeof perk === 'number' ? '' : perk?.iconPath;
                        if (iconPath && normalizeRuneIcon) return normalizeRuneIcon(iconPath, perkId);
                    }
                }
            }
        }
        return '';
    };

    const iconsForPage = (page: RunePage) => {
        const primaryIcon = findStyleIcon(page.primaryStyleId);
        const subIcon = findStyleIcon(page.subStyleId);
        const keystoneId = Array.isArray(page.selectedPerkIds) ? page.selectedPerkIds[0] : undefined;
        const keystoneIcon = findPerkIcon(keystoneId);
        return { primaryIcon, subIcon, keystoneIcon };
    };

    return (
        <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={styles.container}>
                    <Text style={styles.title}>Select Rune Page</Text>
                    <ScrollView contentContainerStyle={styles.list}>
                        {pages.map((page) => (
                            <TouchableOpacity
                                key={page.id}
                                style={[
                                    styles.pageItem,
                                    (currentPageId === page.id || page.isActive) && styles.selectedPage
                                ]}
                                onPress={() => onSelect(page.id)}
                            >
                                <View style={styles.pageInfo}>
                                    {(() => {
                                        const icons = iconsForPage(page);
                                        return (
                                            <View style={styles.runeIconRow}>
                                                {icons.primaryIcon ? (
                                                    <Image source={{ uri: icons.primaryIcon }} style={styles.runeStyleIcon} />
                                                ) : null}
                                                {icons.subIcon ? (
                                                    <Image source={{ uri: icons.subIcon }} style={styles.runeSubIcon} />
                                                ) : null}
                                                {icons.keystoneIcon ? (
                                                    <Image source={{ uri: icons.keystoneIcon }} style={styles.runeKeystoneIcon} />
                                                ) : null}
                                            </View>
                                        );
                                    })()}
                                    <Text style={styles.pageName}>{page.name}</Text>
                                    <Text style={styles.pageType}>{page.isEditable ? 'Custom' : 'Preset'}</Text>
                                </View>
                                {(currentPageId === page.id || page.isActive) && (
                                    <Icon name="check" type="font-awesome" color="#4CAF50" />
                                )}
                            </TouchableOpacity>
                        ))}
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
    list: {
        paddingBottom: 20,
    },
    pageItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#2a2a2a',
        padding: 15,
        borderRadius: 8,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: '#333',
    },
    selectedPage: {
        borderColor: '#4CAF50',
        backgroundColor: '#3a3a3a',
    },
    pageInfo: {
        flex: 1,
    },
    runeIconRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 6,
    },
    runeStyleIcon: { width: 28, height: 28, borderRadius: 14 },
    runeSubIcon: { width: 22, height: 22, borderRadius: 11 },
    runeKeystoneIcon: { width: 26, height: 26, borderRadius: 13 },
    pageName: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
    },
    pageType: {
        color: '#888',
        fontSize: 12,
        marginTop: 2,
    },
    cancelButton: {
        backgroundColor: '#757575',
        marginTop: 10,
    },
});
