import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import Modal from './Modal';

export default function Login() {
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [modalState, setModalState] = useState<{ isOpen: boolean; title: string; message: string; type: 'info' | 'error' }>({
        isOpen: false,
        title: '',
        message: '',
        type: 'info'
    });

    const showModal = (title: string, message: string, type: 'info' | 'error' = 'info') => {
        setModalState({ isOpen: true, title, message, type });
    };

    const closeModal = () => {
        setModalState(prev => ({ ...prev, isOpen: false }));
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
            showModal('Login Failed', error.message, 'error');
        }
        setLoading(false);
    };

    const handleSignUp = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        const { error } = await supabase.auth.signUp({
            email,
            password,
        });

        if (error) {
            showModal('Sign Up Failed', error.message, 'error');
        } else {
            showModal('Success', "Check your email for the confirmation link!", 'info');
        }
        setLoading(false);
    };

    return (
        <div className="flex flex-col items-center justify-center h-full w-full p-8">
            <Modal
                isOpen={modalState.isOpen}
                title={modalState.title}
                message={modalState.message}
                type={modalState.type}
                onClose={closeModal}
            />

            <h2 className="text-3xl font-bold mb-2 text-white">Auto Champ Select</h2>
            <p className="text-neutral-400 mb-8 text-center">Sign in to connect with your mobile app.</p>

            <form onSubmit={handleLogin} className="w-full max-w-xs flex flex-col gap-4">
                <input
                    type="email"
                    placeholder="Your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="bg-neutral-800 border border-neutral-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:border-indigo-500 transition-colors"
                />
                <input
                    type="password"
                    placeholder="Your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="bg-neutral-800 border border-neutral-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:border-indigo-500 transition-colors"
                />

                <div className="flex flex-col gap-3 mt-2">
                    <button
                        type="submit"
                        disabled={loading}
                        className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-800 disabled:cursor-not-allowed text-white font-medium py-3 rounded-lg transition-colors"
                    >
                        {loading ? 'Loading...' : 'Sign In'}
                    </button>
                    <button
                        type="button"
                        onClick={handleSignUp}
                        disabled={loading}
                        className="bg-transparent border border-neutral-600 hover:bg-neutral-800 text-neutral-300 font-medium py-3 rounded-lg transition-colors"
                    >
                        Sign Up
                    </button>
                </div>
            </form>
        </div>
    );
}
