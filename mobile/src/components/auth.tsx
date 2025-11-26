import React, { useState } from 'react'
import { StyleSheet, View, Text, ScrollView, Modal, TouchableOpacity } from 'react-native'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { Button, Input } from '@rneui/themed'

interface ModalState {
    isOpen: boolean;
    title: string;
    message: string;
    type: 'info' | 'error' | 'success';
}

export default function Auth() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [modalState, setModalState] = useState<ModalState>({
        isOpen: false,
        title: '',
        message: '',
        type: 'info'
    })

    const showModal = (title: string, message: string, type: 'info' | 'error' | 'success' = 'info') => {
        setModalState({ isOpen: true, title, message, type })
    }

    const closeModal = () => {
        setModalState(prev => ({ ...prev, isOpen: false }))
    }

    async function signInWithEmail() {
        if (!isSupabaseConfigured) {
            showModal('Supabase Not Configured', 'Please configure Supabase to use authentication features.', 'error')
            return
        }

        setLoading(true)
        const { error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password,
        })

        if (error) {
            showModal('Login Failed', error.message, 'error')
        }
        setLoading(false)
    }

    async function signUpWithEmail() {
        if (!isSupabaseConfigured) {
            showModal('Supabase Not Configured', 'Please configure Supabase to use authentication features.', 'error')
            return
        }

        setLoading(true)
        const {
            data: { session },
            error,
        } = await supabase.auth.signUp({
            email: email,
            password: password,
        })

        if (error) {
            showModal('Sign Up Failed', error.message, 'error')
        } else if (!session) {
            showModal('Success', 'Please check your inbox for email verification!', 'success')
        }
        setLoading(false)
    }

    return (
        <ScrollView 
            contentContainerStyle={styles.scrollContainer}
            style={styles.container}
            keyboardShouldPersistTaps="handled"
        >
            <View style={styles.content}>
                <Text style={styles.title}>Auto Champ Select</Text>
                <Text style={styles.subtitle}>Sign in to connect with your mobile app.</Text>

                <View style={styles.form}>
                    <Input
                        placeholder="Your email"
                        value={email}
                        onChangeText={setEmail}
                        autoCapitalize="none"
                        keyboardType="email-address"
                        autoComplete="email"
                        inputContainerStyle={styles.inputContainer}
                        inputStyle={styles.input}
                        placeholderTextColor="#737373"
                        containerStyle={styles.inputWrapper}
                        disabled={loading}
                    />
                    <Input
                        placeholder="Your password"
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry
                        autoCapitalize="none"
                        autoComplete="password"
                        inputContainerStyle={styles.inputContainer}
                        inputStyle={styles.input}
                        placeholderTextColor="#737373"
                        containerStyle={styles.inputWrapper}
                        disabled={loading}
                    />

                    <View style={styles.buttonContainer}>
                        <Button
                            title={loading ? 'Loading...' : 'Sign In'}
                            onPress={signInWithEmail}
                            disabled={loading}
                            buttonStyle={styles.primaryButton}
                            titleStyle={styles.primaryButtonText}
                            containerStyle={styles.buttonWrapper}
                        />
                        <Button
                            title="Sign Up"
                            onPress={signUpWithEmail}
                            disabled={loading}
                            buttonStyle={styles.secondaryButton}
                            titleStyle={styles.secondaryButtonText}
                            containerStyle={styles.buttonWrapper}
                        />
                    </View>
                </View>
            </View>

            {/* Modal for messages */}
            <Modal
                visible={modalState.isOpen}
                transparent
                animationType="fade"
                onRequestClose={closeModal}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={[
                                styles.modalTitle,
                                modalState.type === 'error' && styles.modalTitleError,
                                modalState.type === 'success' && styles.modalTitleSuccess
                            ]}>
                                {modalState.title}
                            </Text>
                            <TouchableOpacity onPress={closeModal} style={styles.modalCloseButton}>
                                <Text style={styles.modalCloseText}>✕</Text>
                            </TouchableOpacity>
                        </View>
                        <Text style={styles.modalMessage}>{modalState.message}</Text>
                        <View style={styles.modalActions}>
                            <Button
                                title="Okay"
                                onPress={closeModal}
                                buttonStyle={styles.modalButton}
                                titleStyle={styles.modalButtonText}
                            />
                        </View>
                    </View>
                </View>
            </Modal>
        </ScrollView>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0a0a', // neutral-950
    },
    scrollContainer: {
        flexGrow: 1,
        justifyContent: 'center',
        padding: 32,
    },
    content: {
        alignItems: 'center',
        width: '100%',
        maxWidth: 320,
        alignSelf: 'center',
    },
    title: {
        fontSize: 30,
        fontWeight: 'bold',
        color: '#ffffff',
        marginBottom: 8,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 16,
        color: '#a3a3a3', // neutral-400
        marginBottom: 32,
        textAlign: 'center',
    },
    form: {
        width: '100%',
        gap: 16,
    },
    inputWrapper: {
        paddingHorizontal: 0,
    },
    inputContainer: {
        borderBottomWidth: 0,
        backgroundColor: '#262626', // neutral-800
        borderWidth: 1,
        borderColor: '#404040', // neutral-700
        borderRadius: 8,
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    input: {
        color: '#ffffff',
        fontSize: 16,
    },
    buttonContainer: {
        marginTop: 8,
        gap: 12,
    },
    buttonWrapper: {
        marginHorizontal: 0,
    },
    primaryButton: {
        backgroundColor: '#4f46e5', // indigo-600
        borderRadius: 8,
        paddingVertical: 12,
    },
    primaryButtonText: {
        color: '#ffffff',
        fontWeight: '500',
        fontSize: 16,
    },
    secondaryButton: {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: '#525252', // neutral-600
        borderRadius: 8,
        paddingVertical: 12,
    },
    secondaryButtonText: {
        color: '#d4d4d4', // neutral-300
        fontWeight: '500',
        fontSize: 16,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalContent: {
        backgroundColor: '#262626', // neutral-800
        borderRadius: 12,
        padding: 24,
        width: '100%',
        maxWidth: 384,
        borderWidth: 1,
        borderColor: '#404040', // neutral-700
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 16,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#ffffff',
        flex: 1,
    },
    modalTitleError: {
        color: '#ef4444', // red-500
    },
    modalTitleSuccess: {
        color: '#22c55e', // green-500
    },
    modalCloseButton: {
        padding: 4,
    },
    modalCloseText: {
        color: '#a3a3a3', // neutral-400
        fontSize: 20,
        fontWeight: 'bold',
    },
    modalMessage: {
        color: '#d4d4d4', // neutral-300
        fontSize: 16,
        lineHeight: 24,
        marginBottom: 24,
    },
    modalActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
    },
    modalButton: {
        backgroundColor: '#4f46e5', // indigo-600
        borderRadius: 8,
        paddingVertical: 8,
        paddingHorizontal: 16,
    },
    modalButtonText: {
        color: '#ffffff',
        fontWeight: '500',
    },
})
