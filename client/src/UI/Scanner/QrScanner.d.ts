import React from 'react';

export interface QrScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onClose?: () => void;
  showManualFallback?: boolean;
  continuous?: boolean;
  cooldownMs?: number;
  initialFacingMode?: 'user' | 'environment';
}

declare const QrScanner: React.FC<QrScannerProps>;
export default QrScanner;
