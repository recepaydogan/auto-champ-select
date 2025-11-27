import React from 'react';

export interface CustomModalButton {
    text: string;
    onClick: () => void;
    variant?: 'default' | 'cancel' | 'destructive' | 'primary';
}

interface CustomModalProps {
    isOpen: boolean;
    title: string;
    message?: string;
    buttons?: CustomModalButton[];
    onClose?: () => void;
    children?: React.ReactNode;
    type?: 'info' | 'success' | 'warning' | 'error';
}

const getIconForType = (type: string) => {
    switch (type) {
        case 'success':
            return (
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
            );
        case 'warning':
            return (
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
            );
        case 'error':
            return (
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
            );
        default:
            return (
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            );
    }
};

const getColorForType = (type: string) => {
    switch (type) {
        case 'success':
            return 'text-green-500 bg-green-500/10';
        case 'warning':
            return 'text-amber-500 bg-amber-500/10';
        case 'error':
            return 'text-red-500 bg-red-500/10';
        default:
            return 'text-indigo-500 bg-indigo-500/10';
    }
};

export default function CustomModal({
    isOpen,
    title,
    message,
    buttons = [{ text: 'OK', onClick: () => {}, variant: 'primary' }],
    onClose,
    children,
    type = 'info',
}: CustomModalProps) {
    if (!isOpen) return null;

    const colorClasses = getColorForType(type);

    const getButtonClasses = (variant?: string) => {
        switch (variant) {
            case 'cancel':
                return 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-neutral-700';
            case 'destructive':
                return 'bg-red-600 hover:bg-red-500 text-white';
            case 'primary':
                return 'bg-indigo-600 hover:bg-indigo-500 text-white';
            default:
                return 'bg-neutral-700 hover:bg-neutral-600 text-white';
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div 
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                onClick={onClose}
            />
            
            {/* Modal */}
            <div className="relative bg-neutral-900 border border-neutral-800 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                {/* Icon */}
                <div className={`w-14 h-14 rounded-full ${colorClasses} flex items-center justify-center mx-auto mb-4`}>
                    {getIconForType(type)}
                </div>
                
                {/* Title */}
                <h2 className="text-xl font-bold text-white text-center mb-2">
                    {title}
                </h2>
                
                {/* Message */}
                {message && (
                    <p className="text-neutral-400 text-center mb-6 leading-relaxed">
                        {message}
                    </p>
                )}
                
                {/* Custom Content */}
                {children}
                
                {/* Buttons */}
                <div className={`flex gap-3 ${buttons.length > 1 ? '' : 'justify-center'}`}>
                    {buttons.map((button, index) => (
                        <button
                            key={index}
                            className={`flex-1 py-3 px-4 rounded-xl font-medium transition-all ${getButtonClasses(button.variant)}`}
                            onClick={() => {
                                button.onClick();
                                onClose?.();
                            }}
                        >
                            {button.text}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

// Global alert state management
type AlertOptions = {
    title: string;
    message?: string;
    type?: 'info' | 'success' | 'warning' | 'error';
    buttons?: CustomModalButton[];
};

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

