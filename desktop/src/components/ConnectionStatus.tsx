import React from 'react';

export interface ConnectionStatusState {
    riftConnected: boolean;
    mobileConnected: boolean;
    lcuConnected: boolean;
}

interface ConnectionStatusProps {
    status: ConnectionStatusState;
    userEmail?: string;
    onDisconnect?: () => void;
}

interface StatusItemProps {
    label: string;
    connected: boolean;
    hint?: string;
    icon: React.ReactNode;
}

const StatusItem = ({ label, connected, hint, icon }: StatusItemProps) => (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-neutral-800/50">
        <div className={`p-2 rounded-lg ${connected ? 'bg-green-500/10 text-green-500' : 'bg-neutral-700/50 text-neutral-500'}`}>
            {icon}
        </div>
        <div className="flex-1">
            <div className="flex items-center gap-2">
                <span className="text-white font-medium">{label}</span>
                <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-neutral-600'}`} />
            </div>
            {!connected && hint && (
                <p className="text-neutral-500 text-sm mt-1">{hint}</p>
            )}
            {connected && (
                <p className="text-green-500 text-sm mt-1">Connected</p>
            )}
        </div>
    </div>
);

export default function ConnectionStatus({ status, userEmail, onDisconnect }: ConnectionStatusProps) {
    const allConnected = status.riftConnected && status.mobileConnected && status.lcuConnected;

    const getInstructions = () => {
        if (!status.riftConnected) {
            return {
                title: 'Connecting to Server...',
                message: 'Please wait while we connect to the Rift server.',
                emoji: '🔄',
            };
        }
        if (!status.mobileConnected) {
            return {
                title: 'Waiting for Mobile',
                message: 'Open the mobile app and sign in with the same account to connect.',
                emoji: '📱',
            };
        }
        if (!status.lcuConnected) {
            return {
                title: 'League Client Required',
                message: 'Open the League of Legends client to enable game controls.',
                emoji: '🎮',
            };
        }
        return {
            title: 'All Systems Ready!',
            message: 'You can now control League from your mobile device.',
            emoji: '✨',
        };
    };

    const instructions = getInstructions();

    return (
        <div className="flex flex-col items-center gap-6 max-w-md w-full">
            {/* Header */}
            <div className="text-center">
                <div className="text-5xl mb-4">{instructions.emoji}</div>
                <h1 className="text-2xl font-bold text-white mb-2">{instructions.title}</h1>
                <p className="text-neutral-400">{instructions.message}</p>
            </div>

            {/* User Info */}
            {userEmail && (
                <div className="w-full bg-neutral-900/50 rounded-xl p-4 border border-neutral-800">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center">
                            <span className="text-white font-bold">
                                {userEmail.charAt(0).toUpperCase()}
                            </span>
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-neutral-400 text-sm">Signed in as</p>
                            <p className="text-white font-medium truncate">{userEmail}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Status Items */}
            <div className="w-full space-y-3">
                <p className="text-neutral-500 text-xs font-semibold uppercase tracking-wider px-1">
                    Connection Status
                </p>
                
                <StatusItem
                    label="Rift Server"
                    connected={status.riftConnected}
                    hint="Connecting..."
                    icon={
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                        </svg>
                    }
                />
                
                <StatusItem
                    label="Mobile App"
                    connected={status.mobileConnected}
                    hint="Open mobile app & sign in"
                    icon={
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                    }
                />
                
                <StatusItem
                    label="League Client"
                    connected={status.lcuConnected}
                    hint="Open League of Legends"
                    icon={
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    }
                />
            </div>

            {/* Success Banner */}
            {allConnected && (
                <div className="w-full flex items-center justify-center gap-2 bg-green-500/10 border border-green-500/30 rounded-xl py-3 px-4">
                    <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-green-500 font-medium">All systems connected!</span>
                </div>
            )}

            {/* Disconnect Button */}
            {status.riftConnected && (
                <button
                    onClick={onDisconnect}
                    className="text-neutral-500 hover:text-neutral-300 text-sm transition-colors"
                >
                    Disconnect
                </button>
            )}
        </div>
    );
}

