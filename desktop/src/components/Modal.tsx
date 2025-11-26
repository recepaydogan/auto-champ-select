import React from 'react';

interface ModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    onClose: () => void;
    type?: 'info' | 'error' | 'success';
    customActions?: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({ isOpen, title, message, onClose, type = 'info', customActions }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-neutral-800 border border-neutral-700 rounded-xl shadow-2xl w-full max-w-sm p-6 transform transition-all scale-100">
                <div className="flex justify-between items-start mb-4">
                    <h3 className={`text-xl font-bold ${
                        type === 'error' ? 'text-red-500' : 
                        type === 'success' ? 'text-green-500' : 
                        'text-white'
                    }`}>
                        {title}
                    </h3>
                    <button
                        onClick={onClose}
                        className="text-neutral-400 hover:text-white transition-colors"
                    >
                        ✕
                    </button>
                </div>
                <p className="text-neutral-300 mb-6 leading-relaxed whitespace-pre-line">
                    {message}
                </p>
                {customActions || (
                    <div className="flex justify-end">
                        <button
                            onClick={onClose}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                        >
                            Okay
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Modal;
