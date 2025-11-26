import { useEffect, useRef } from 'react';

interface QRCodeProps {
  value: string;
  size?: number;
}

export default function QRCode({ value, size = 200 }: QRCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !value) return;

    // Simple QR code generation using a library or API
    // For now, we'll use a simple approach with qrcode library
    // If not available, we can use an online QR code API
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, size, size);

    // Use QR code API as fallback
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}`;
    
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      ctx.drawImage(img, 0, 0, size, size);
    };
    img.onerror = () => {
      // Fallback: draw text if QR fails
      ctx.fillStyle = 'black';
      ctx.font = '16px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(value, size / 2, size / 2);
    };
    img.src = qrUrl;
  }, [value, size]);

  return (
    <div className="flex items-center justify-center p-4 bg-white rounded-lg">
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        className="border border-neutral-300 rounded"
      />
    </div>
  );
}
