import React, { useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    TouchableWithoutFeedback,
    Animated,
    Dimensions,
} from 'react-native';

const { width } = Dimensions.get('window');

export interface CustomModalButton {
    text: string;
    onPress: () => void;
    style?: 'default' | 'cancel' | 'destructive' | 'primary';
}

interface CustomModalProps {
    visible: boolean;
    title: string;
    message?: string;
    buttons?: CustomModalButton[];
    onClose?: () => void;
    children?: React.ReactNode;
    type?: 'info' | 'success' | 'warning' | 'error';
    autoDismissMs?: number;
}

const getIconForType = (type: string) => {
    switch (type) {
        case 'success':
            return '✓';
        case 'warning':
            return '⚠';
        case 'error':
            return '✕';
        default:
            return 'ℹ';
    }
};

const getColorForType = (type: string) => {
    switch (type) {
        case 'success':
            return '#22c55e';
        case 'warning':
            return '#f59e0b';
        case 'error':
            return '#ef4444';
        default:
            return '#4f46e5';
    }
};

export default function CustomModal({
    visible,
    title,
    message,
    buttons = [{ text: 'OK', onPress: () => {}, style: 'primary' }],
    onClose,
    children,
    type = 'info',
    autoDismissMs,
}: CustomModalProps) {
    const color = getColorForType(type);
    const icon = getIconForType(type);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    const getButtonStyle = (style?: string) => {
        switch (style) {
            case 'cancel':
                return styles.cancelButton;
            case 'destructive':
                return styles.destructiveButton;
            case 'primary':
                return [styles.primaryButton, { backgroundColor: color }];
            default:
                return styles.defaultButton;
        }
    };

    const getButtonTextStyle = (style?: string) => {
        switch (style) {
            case 'cancel':
                return styles.cancelButtonText;
            case 'destructive':
                return styles.destructiveButtonText;
            case 'primary':
                return styles.primaryButtonText;
            default:
                return styles.defaultButtonText;
        }
    };

    useEffect(() => {
        // Auto-dismiss non-critical modals to avoid lingering overlay blocks
        if (visible && (type === 'success' || type === 'info') && buttons.length === 1 && buttons[0].text === 'OK') {
            const timeout = autoDismissMs ?? 1500;
            timerRef.current = setTimeout(() => {
                onClose?.();
            }, timeout);
        }
        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
        };
    }, [visible, type, buttons, autoDismissMs, onClose]);

    // If not visible, render nothing to avoid stray transparent overlays
    if (!visible) {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        return null;
    }

    return (
        <View style={styles.portal} pointerEvents="box-none">
            <TouchableWithoutFeedback onPress={onClose}>
                <View style={styles.overlay}>
                    <TouchableWithoutFeedback>
                        <View style={styles.container}>
                            <View style={[styles.iconContainer, { backgroundColor: color + '20' }]}>
                                <Text style={[styles.icon, { color }]}>{icon}</Text>
                            </View>
                            
                            <Text style={styles.title}>{title}</Text>
                            
                            {message && (
                                <Text style={styles.message}>{message}</Text>
                            )}
                            
                            {children}
                            
                            <View style={styles.buttonContainer}>
                                {buttons.map((button, index) => (
                                    <TouchableOpacity
                                        key={index}
                                        style={[
                                            styles.button,
                                            getButtonStyle(button.style),
                                            buttons.length > 1 && styles.buttonHalf,
                                        ]}
                                        onPress={() => {
                                            button.onPress();
                                            onClose?.();
                                        }}
                                    >
                                        <Text style={getButtonTextStyle(button.style)}>
                                            {button.text}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                    </TouchableWithoutFeedback>
                </View>
            </TouchableWithoutFeedback>
        </View>
    );
}

// Alert helper function to replace Alert.alert
interface AlertOptions {
    title: string;
    message?: string;
    type?: 'info' | 'success' | 'warning' | 'error';
    buttons?: CustomModalButton[];
}

let alertCallback: ((options: AlertOptions) => void) | null = null;

export const setAlertCallback = (callback: (options: AlertOptions) => void) => {
    alertCallback = callback;
};

export const showAlert = (
    title: string,
    message?: string,
    buttons?: CustomModalButton[],
    type?: 'info' | 'success' | 'warning' | 'error'
) => {
    if (alertCallback) {
        alertCallback({ title, message, type, buttons });
    }
};

const styles = StyleSheet.create({
    portal: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        elevation: 9999,
    },
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    container: {
        width: width - 40,
        maxWidth: 400,
        backgroundColor: '#1a1a1a',
        borderRadius: 16,
        padding: 24,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#333',
    },
    iconContainer: {
        width: 56,
        height: 56,
        borderRadius: 28,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    icon: {
        fontSize: 28,
        fontWeight: 'bold',
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#ffffff',
        textAlign: 'center',
        marginBottom: 8,
    },
    message: {
        fontSize: 15,
        color: '#a3a3a3',
        textAlign: 'center',
        marginBottom: 20,
        lineHeight: 22,
    },
    buttonContainer: {
        flexDirection: 'row',
        width: '100%',
        gap: 12,
        marginTop: 8,
    },
    button: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 10,
        alignItems: 'center',
    },
    buttonHalf: {
        flex: 1,
    },
    primaryButton: {
        backgroundColor: '#4f46e5',
    },
    primaryButtonText: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '600',
    },
    defaultButton: {
        backgroundColor: '#333',
    },
    defaultButtonText: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '500',
    },
    cancelButton: {
        backgroundColor: '#262626',
        borderWidth: 1,
        borderColor: '#404040',
    },
    cancelButtonText: {
        color: '#a3a3a3',
        fontSize: 16,
        fontWeight: '500',
    },
    destructiveButton: {
        backgroundColor: '#ef4444',
    },
    destructiveButtonText: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '600',
    },
});

