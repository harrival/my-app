import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { FaCamera } from 'react-icons/fa';
import { BASE_URL } from '../Utils/apiConfig';
import { useUserProfile } from '../Context/UserProfileContext';
import { useRefresh } from '../Context/RefreshContext';
import QrScanner from '../../UI/Scanner/QrScanner';
import classes from './LinkedDevicesModal.module.scss';

const LinkedDevicesModal = ({ onClose }) => {
  const { profile, isLinkedDevice } = useUserProfile();
  const { socket } = useRefresh();

  const [pairCodeInput, setPairCodeInput] = useState('');
  const [deviceNameInput, setDeviceNameInput] = useState('');
  const [deviceTypeInput, setDeviceTypeInput] = useState('Mobile / Companion');
  const [isScanning, setIsScanning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [devices, setDevices] = useState([]);
  const [feedback, setFeedback] = useState(null); // { type: 'success' | 'error', message: string }

  // Fetch all active linked devices for this user
  const fetchDevices = useCallback(async () => {
    if (!profile?.user_guid || isLinkedDevice || profile?.isLinkedDevice) return;
    try {
      const res = await axios.get(`${BASE_URL}/device-link/devices/${profile.user_guid}`);
      setDevices(res.data || []);
    } catch (err) {
      console.error('Failed to fetch linked devices:', err);
    }
  }, [profile?.user_guid, isLinkedDevice, profile?.isLinkedDevice]);

  // Fetch once on modal open (real-time updates are handled by the Socket.IO event below)
  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  // Real-time synchronization when any device logs out or links
  useEffect(() => {
    if (!socket || !profile?.user_guid) return;
    socket.emit('join_user_room', profile.user_guid);

    const handleDevicesUpdated = () => {
      console.log('[DeviceLink] Received devices_updated notification');
      fetchDevices();
    };

    socket.on('devices_updated', handleDevicesUpdated);
    return () => {
      socket.off('devices_updated', handleDevicesUpdated);
    };
  }, [socket, profile?.user_guid, fetchDevices]);

  // Core authorization function
  const authorizeDevice = async (codeToUse, customName) => {
    setFeedback(null);

    const cleanCode = (codeToUse || pairCodeInput).trim().toUpperCase();
    if (!cleanCode) {
      setFeedback({ type: 'error', message: 'Please enter the 6-character pairing code.' });
      return;
    }

    setLoading(true);
    try {
      const res = await axios.post(`${BASE_URL}/device-link/approve`, {
        identifier: cleanCode,
        userGuid: profile.user_guid,
        deviceName: (customName || deviceNameInput).trim() || '',
        deviceType: deviceTypeInput,
        userProfile: profile,
      });

      if (res.data.success) {
        setFeedback({
          type: 'success',
          message: '✓ Device linked successfully! The companion screen is now logged in.',
        });
        setPairCodeInput('');
        setDeviceNameInput('');
        setIsScanning(false);
        fetchDevices();
      }
    } catch (err) {
      console.error('Error approving device link:', err);
      const msg = err.response?.data?.error || 'Failed to link device. Please check the code.';
      setFeedback({ type: 'error', message: msg });
    } finally {
      setLoading(false);
    }
  };

  // Handle manual form submission
  const handleApproveLink = async (e) => {
    e.preventDefault();
    await authorizeDevice(pairCodeInput);
  };

  // Handle in-app camera scan detection
  const handleScanSuccess = async (decodedRaw) => {
    let extractedCode = decodedRaw.trim();
    try {
      const parsed = JSON.parse(decodedRaw);
      extractedCode = parsed.pairCode || parsed.ticketId || decodedRaw;
    } catch (e) {
      if (decodedRaw.includes('code=')) {
        const match = decodedRaw.match(/code=([A-Za-z0-9-]+)/);
        if (match) extractedCode = match[1];
      }
    }

    setPairCodeInput(extractedCode);
    setIsScanning(false);
    await authorizeDevice(extractedCode);
  };

  // Revoke / Log Out a specific linked device
  const handleRevokeDevice = async (deviceId) => {
    if (!profile?.user_guid || !deviceId) return;
    try {
      await axios.delete(`${BASE_URL}/device-link/device/${profile.user_guid}/${deviceId}`);
      setDevices((prev) => prev.filter((d) => d.deviceId !== deviceId));
      setFeedback({ type: 'success', message: 'Device logged out successfully.' });
    } catch (err) {
      console.error('Failed to revoke device:', err);
    }
  };

  if (isLinkedDevice || profile?.isLinkedDevice) {
    return (
      <div className={classes.backdrop} onClick={onClose}>
        <div className={classes.modal} onClick={(e) => e.stopPropagation()}>
          <div className={classes.modalHeader}>
            <h2>Linked Devices</h2>
            <button className={classes.closeBtn} onClick={onClose} aria-label="Close">
              &times;
            </button>
          </div>
          <div className={classes.modalBody} style={{ textAlign: 'center', padding: '2rem 1.5rem' }}>
            <p style={{ color: '#64748b', fontSize: '0.95rem', margin: 0 }}>
              This is a linked companion device. Only the primary device can authorize new devices or view active linked devices.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={classes.backdrop} onClick={onClose}>
      <div className={classes.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={classes.modalHeader}>
          <h2>Linked Devices</h2>
          <button className={classes.closeBtn} onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        {/* Content */}
        <div className={classes.modalBody}>
          {feedback && (
            <div className={`${classes.feedbackMsg} ${classes[feedback.type]}`}>
              {feedback.message}
            </div>
          )}

          {/* Section 1: Link New Device */}
          <div className={classes.sectionBox}>
            <h3>Link a New Device (TV, Tablet, or PC)</h3>
            <p>
              Scan the companion screen with your camera, or enter the 6-character code shown on screen.
            </p>

            {isScanning ? (
              <QrScanner
                onScanSuccess={handleScanSuccess}
                onClose={() => setIsScanning(false)}
                showManualFallback={true}
              />
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setIsScanning(true)}
                  className={classes.scanQrBtn}
                >
                  <FaCamera /> Scan QR Code with Camera
                </button>

                <div className={classes.orDivider}>
                  <span>or enter code manually</span>
                </div>

                <form onSubmit={handleApproveLink} className={classes.linkForm}>
                  <div className={classes.inputGroup}>
                    <input
                      type="text"
                      placeholder="e.g. 7KP-9X2"
                      value={pairCodeInput}
                      onChange={(e) => setPairCodeInput(e.target.value)}
                      maxLength={8}
                      className={classes.codeInput}
                      autoFocus
                    />
                    <button type="submit" disabled={loading} className={classes.submitBtn}>
                      {loading ? 'Linking...' : 'Link Device'}
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                    <input
                      type="text"
                      placeholder="Device Name (e.g. My Phone, Living Room TV)"
                      value={deviceNameInput}
                      onChange={(e) => setDeviceNameInput(e.target.value)}
                      className={classes.deviceNameInput}
                      style={{ flex: 1, margin: 0 }}
                    />
                    <select
                      value={deviceTypeInput}
                      onChange={(e) => setDeviceTypeInput(e.target.value)}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: '1.5px solid #cbd5e1',
                        fontSize: '0.88rem',
                        backgroundColor: '#ffffff',
                        color: '#1e293b',
                        fontWeight: 500,
                        cursor: 'pointer'
                      }}
                    >
                      <option value="Mobile / Companion">📱 Phone / Tablet</option>
                      <option value="Television">📺 Television</option>
                      <option value="Computer">💻 Computer</option>
                    </select>
                  </div>
                </form>
              </>
            )}
          </div>

          {/* Section 2: Active Linked Devices */}
          <div>
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.05rem', color: '#0f172a' }}>
              Active Linked Devices ({devices.length})
            </h3>
            <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: '#64748b' }}>
              TV devices expire after <strong>24 hours</strong>; mobile companion devices end after <strong>1 hour of inactivity</strong>. You can also log out any device immediately.
            </p>

            {devices.length === 0 ? (
              <div className={classes.emptyDevices}>No other devices currently linked.</div>
            ) : (
              <div className={classes.deviceList}>
                {devices.map((device) => (
                  <div key={device.deviceId} className={classes.deviceItem}>
                    <div className={classes.deviceInfo}>
                      <span className={classes.deviceName}>
                        📺 {device.deviceName}
                      </span>
                      <span className={classes.deviceMeta}>
                        Linked: {new Date(device.linkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className={classes.inactivityBadge}>
                        ⏱️ {device.isTV ? 'Session expires' : 'Inactivity timeout'} in ~{device.remainingMinutes} min
                      </span>
                    </div>

                    <button
                      type="button"
                      className={classes.revokeBtn}
                      onClick={() => handleRevokeDevice(device.deviceId)}
                    >
                      Log Out
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LinkedDevicesModal;
