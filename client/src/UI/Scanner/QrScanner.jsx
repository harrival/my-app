import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { FaTimes, FaCamera, FaSyncAlt } from 'react-icons/fa';
import classes from './QrScanner.module.scss';

/**
 * @typedef {Object} QrScannerProps
 * @property {(decodedText: string) => void} onScanSuccess
 * @property {(() => void)} [onClose]
 * @property {boolean} [showManualFallback]
 * @property {boolean} [continuous]
 * @property {number} [cooldownMs]
 * @property {'user' | 'environment'} [initialFacingMode]
 */

/**
 * @param {QrScannerProps} props
 */
const QrScanner = ({ 
  onScanSuccess, 
  onClose, 
  showManualFallback = false, 
  continuous = false, 
  cooldownMs = 3000,
  initialFacingMode = 'environment'
}) => {
  const [errorMsg, setErrorMsg] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isSwitching, setIsSwitching] = useState(false);
  const [availableCameras, setAvailableCameras] = useState([]);
  const [facingMode, setFacingMode] = useState(() => {
    return localStorage.getItem('preferred_scanner_facing_mode') || initialFacingMode;
  });

  const scannerRef = useRef(null);
  const isStoppingRef = useRef(false);
  const isMountedRef = useRef(true);
  const onScanSuccessRef = useRef(onScanSuccess);
  onScanSuccessRef.current = onScanSuccess;

  const hasScannedRef = useRef(false);
  const lastScannedTimeRef = useRef(0);
  const lastScannedCodeRef = useRef('');

  // Safely enumerate available video devices without starting/stopping media streams
  const updateAvailableCameras = useCallback(async () => {
    if (!navigator?.mediaDevices?.enumerateDevices) return [];
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter((d) => d.kind === 'videoinput');
      if (isMountedRef.current && videoInputs.length > 0) {
        setAvailableCameras(videoInputs);
      }
      return videoInputs;
    } catch (e) {
      return [];
    }
  }, []);

  // Stop active scanner safely and release hardware locks
  const stopCurrentScanner = useCallback(async () => {
    if (isStoppingRef.current) return;
    isStoppingRef.current = true;

    const currentScanner = scannerRef.current;
    if (currentScanner) {
      try {
        if (currentScanner.isScanning) {
          await currentScanner.stop();
        }
      } catch (err) {
        console.warn('Error while stopping scanner instance:', err);
      }
      try {
        currentScanner.clear();
      } catch (err) {}
      scannerRef.current = null;
    }

    // Clear DOM container to ensure no orphaned video elements
    const container = document.getElementById('in-app-qr-reader');
    if (container) {
      container.innerHTML = '';
    }

    isStoppingRef.current = false;
  }, []);

  // Ensure video element plays inline on iOS WebKit / Safari
  const ensureVideoPlaysInline = useCallback(() => {
    const container = document.getElementById('in-app-qr-reader');
    if (!container) return;
    const video = container.querySelector('video');
    if (video) {
      video.setAttribute('playsinline', 'true');
      video.setAttribute('webkit-playsinline', 'true');
      video.setAttribute('muted', 'true');
      video.setAttribute('autoplay', 'true');
      video.playsInline = true;
      video.muted = true;
      if (video.paused) {
        video.play().catch(() => {});
      }
    }
  }, []);

  // Main camera start routine
  const startCamera = useCallback(async (targetFacing) => {
    if (!isMountedRef.current) return;

    setIsInitializing(true);
    setErrorMsg(null);
    hasScannedRef.current = false;

    // 1. Cleanly stop any existing scanner and allow hardware settling time
    await stopCurrentScanner();
    await new Promise((resolve) => setTimeout(resolve, 80));

    if (!isMountedRef.current) return;

    try {
      const scannerId = 'in-app-qr-reader';
      const html5QrCode = new Html5Qrcode(scannerId, {
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true,
        },
        verbose: false,
      });
      scannerRef.current = html5QrCode;

      const qrSuccessCallback = (decodedText) => {
        if (!isMountedRef.current) return;
        const now = Date.now();

        if (hasScannedRef.current) return;

        // In continuous mode, prevent immediately re-triggering the exact same code
        if (
          continuous &&
          lastScannedCodeRef.current === decodedText &&
          now - lastScannedTimeRef.current < cooldownMs
        ) {
          return;
        }

        hasScannedRef.current = true;
        lastScannedCodeRef.current = decodedText;
        lastScannedTimeRef.current = now;

        if (continuous) {
          if (onScanSuccessRef.current) {
            onScanSuccessRef.current(decodedText);
          }
          // Reset lockout after cooldown so next scan can occur
          setTimeout(() => {
            if (isMountedRef.current) {
              hasScannedRef.current = false;
            }
          }, cooldownMs);
        } else {
          // One-shot mode: stop camera before delivering result
          stopCurrentScanner().finally(() => {
            if (onScanSuccessRef.current) {
              onScanSuccessRef.current(decodedText);
            }
          });
        }
      };

      // Scanner configuration:
      // Note: We deliberately omit 'aspectRatio' and 'qrbox'
      // - Omitting 'aspectRatio' prevents iOS Safari from calling applyConstraints({ aspectRatio: 1.0 }) which turns back camera black
      // - Omitting 'qrbox' scans the full frame, preventing bounding box clipping and ensuring front/back cameras decode instantly
      const config = {
        fps: 15,
        disableFlip: false,
      };

      // Check if we can find a matching device ID from enumerated cameras
      const devices = await updateAvailableCameras();
      let cameraIdOrConfig = { facingMode: targetFacing };

      if (devices && devices.length > 0) {
        if (targetFacing === 'environment') {
          // Look for back camera (prefer standard back / wide over telephoto / ultra-wide)
          const backCameras = devices.filter((d) => /back|rear|environment/i.test(d.label));
          if (backCameras.length > 0) {
            const preferred = backCameras.find((d) => !/ultra|tele|depth/i.test(d.label)) || backCameras[0];
            if (preferred?.deviceId) {
              cameraIdOrConfig = preferred.deviceId;
            }
          }
        } else {
          // Look for front camera
          const frontCamera = devices.find((d) => /front|user|facetime|selfie/i.test(d.label));
          if (frontCamera?.deviceId) {
            cameraIdOrConfig = frontCamera.deviceId;
          }
        }
      }

      // Start scanner with primary target
      try {
        await html5QrCode.start(cameraIdOrConfig, config, qrSuccessCallback, () => {});
      } catch (firstErr) {
        console.warn(`Camera start failed with target "${JSON.stringify(cameraIdOrConfig)}", trying opposite facingMode fallback...`, firstErr);
        const fallbackFacing = targetFacing === 'environment' ? 'user' : 'environment';
        try {
          await html5QrCode.start({ facingMode: fallbackFacing }, config, qrSuccessCallback, () => {});
          if (isMountedRef.current) {
            setFacingMode(fallbackFacing);
            localStorage.setItem('preferred_scanner_facing_mode', fallbackFacing);
          }
        } catch (secondErr) {
          console.warn('Opposite facingMode also failed, attempting any available video camera device...', secondErr);
          const latestDevices = await updateAvailableCameras();
          if (latestDevices && latestDevices.length > 0) {
            await html5QrCode.start(latestDevices[0].deviceId, config, qrSuccessCallback, () => {});
          } else {
            throw secondErr;
          }
        }
      }

      if (isMountedRef.current) {
        setIsInitializing(false);
        setIsSwitching(false);
        ensureVideoPlaysInline();
        // Update device list now that permissions have definitely been granted
        updateAvailableCameras();
      }
    } catch (err) {
      if (isMountedRef.current) {
        console.error('Camera initialization error:', err);
        setIsInitializing(false);
        setIsSwitching(false);
        setErrorMsg(
          showManualFallback
            ? 'Could not access camera. Please allow camera permissions or enter code manually.'
            : 'Could not access camera. Please ensure camera permissions are granted in your browser settings.'
        );
      }
    }
  }, [continuous, cooldownMs, showManualFallback, stopCurrentScanner, updateAvailableCameras, ensureVideoPlaysInline]);

  // Mount effect to start camera
  useEffect(() => {
    isMountedRef.current = true;
    startCamera(facingMode);

    return () => {
      isMountedRef.current = false;
      stopCurrentScanner();
    };
  }, [facingMode, startCamera, stopCurrentScanner]);

  // Toggle between Front and Back camera
  const toggleCameraFacing = async () => {
    if (isSwitching || isInitializing) return;
    setIsSwitching(true);
    const newFacing = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(newFacing);
    localStorage.setItem('preferred_scanner_facing_mode', newFacing);
  };

  const canSwitchCamera = availableCameras.length === 0 || availableCameras.length > 1;

  return (
    <div className={classes.scannerWrapper}>
      <div className={classes.scannerHeader}>
        <div className={classes.title}>
          <FaCamera style={{ marginRight: '6px' }} /> Point Camera at QR Code
        </div>

        <div className={classes.headerActions}>
          {canSwitchCamera && (
            <button
              type="button"
              onClick={toggleCameraFacing}
              disabled={isSwitching || isInitializing}
              className={classes.switchCameraBtn}
              title={`Switch to ${facingMode === 'environment' ? 'Front' : 'Back'} Camera`}
            >
              <FaSyncAlt className={isSwitching ? classes.spinning : ''} />
              <span>{facingMode === 'environment' ? 'Use Front' : 'Use Back'}</span>
            </button>
          )}

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className={classes.closeBtn}
              aria-label="Close camera scanner"
            >
              <FaTimes />
            </button>
          )}
        </div>
      </div>

      {isInitializing && (
        <div className={classes.loadingMessage}>
          {isSwitching ? 'Switching camera...' : 'Starting camera...'}
        </div>
      )}

      {errorMsg ? (
        <div className={classes.errorMessage}>
          <p>{errorMsg}</p>
          {showManualFallback && (
            <button type="button" onClick={onClose} className={classes.fallbackBtn}>
              Enter Code Manually
            </button>
          )}
        </div>
      ) : (
        <div className={classes.viewfinder}>
          <div className={classes.cameraFrameWrapper}>
            <div id="in-app-qr-reader" className={classes.readerBox} />
            <div className={classes.targetFrame}>
              <div className={`${classes.corner} ${classes.tl}`} />
              <div className={`${classes.corner} ${classes.tr}`} />
              <div className={`${classes.corner} ${classes.bl}`} />
              <div className={`${classes.corner} ${classes.br}`} />
              <div className={classes.scanLine} />
            </div>
          </div>
          <p className={classes.scanHint}>
            {facingMode === 'user' ? 'Front Camera' : 'Back Camera'} — Align QR inside box
          </p>
        </div>
      )}
    </div>
  );
};

export default QrScanner;
