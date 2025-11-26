import Modal from './Modal';

interface ConnectionApprovalProps {
  isOpen: boolean;
  deviceInfo: { device: string; browser: string; identity: string } | null;
  onAccept: () => void;
  onReject: () => void;
}

export default function ConnectionApproval({ isOpen, deviceInfo, onAccept, onReject }: ConnectionApprovalProps) {
  if (!isOpen || !deviceInfo) return null;

  return (
    <Modal
      isOpen={isOpen}
      title="Connection Request"
      message={`A device wants to connect to your League client.\n\nDevice: ${deviceInfo.device}\nBrowser: ${deviceInfo.browser}\n\nDo you want to accept this connection request?`}
      type="info"
      onClose={onReject}
      customActions={
        <div className="flex gap-4 mt-6">
          <button
            onClick={onReject}
            className="flex-1 bg-neutral-800 hover:bg-neutral-700 text-white font-medium py-3 px-4 rounded-xl border border-neutral-700 transition-all"
          >
            Reject
          </button>
          <button
            onClick={onAccept}
            className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-lg shadow-indigo-900/20"
          >
            Accept
          </button>
        </div>
      }
    />
  );
}
