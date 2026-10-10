import React, { useState, useContext, useEffect, useCallback } from 'react';
import { AuthContext } from '../Context/auth-context';
import { useUserProfile } from '../Context/UserProfileContext';
import { useRefresh } from '../Context/RefreshContext';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { QRCodeSVG } from 'qrcode.react';
import { getResolvedBaseUrl } from '../../shared/Utils/apiConfig';
import Card from '../../UI/Card/Card';
import Button from '../../UI/Button/Button';
import appLogo from '../../assets/38.jpg';
import classes from './Auth.module.scss';

const MAX_OTP_ATTEMPTS = 3;

const AuthenticateUser = () => {
    const auth = useContext(AuthContext);
    const { profile, setProfile, refreshProfile } = useUserProfile();
    const { socket } = useRefresh();
    const navigate = useNavigate();

    // Detect client device type accurately: mobile phones are NEVER TVs
    const isMobile = typeof window !== 'undefined' && (
        /android.*mobile|iphone|ipod|blackberry|iemobile|opera mini/i.test(navigator.userAgent) ||
        (window.innerWidth <= 768 && /android|mobile/i.test(navigator.userAgent))
    );
    const isTV = typeof window !== 'undefined' && !isMobile && (
        /smart-?tv|googletv|apple-?tv|android tv|tizen|webos|viera|bravia|netcast|roku|aftb|aftt|aftm|afts/i.test(navigator.userAgent)
    );
    const detectedDeviceType = isTV ? 'Television' : isMobile ? 'Phone / Tablet' : 'Computer';

    // Mode: 'phone' (Primary account login with SMS) vs 'link' (WhatsApp-style companion link)
    // On computer or TV, default to 'link' for seamless WhatsApp-style experience, or 'phone' if preferred
    const [authMode, setAuthMode] = useState(isMobile ? 'phone' : 'link');

    // Phone & OTP state
    const [phoneNumber, setPhoneNumber] = useState('+1 ');
    const [step, setStep] = useState(1); // 1: phone input, 2: OTP input
    const [generatedOtp, setGeneratedOtp] = useState('');
    const [otpInput, setOtpInput] = useState('');
    const [error, setError] = useState('');
    const [infoMessage, setInfoMessage] = useState('');
    const [authenticatedUser, setAuthenticatedUser] = useState(null);
    const [otpAttempts, setOtpAttempts] = useState(0);
    const [loading, setLoading] = useState(false);

    // Device Linking state
    const [linkTicket, setLinkTicket] = useState(null);
    const [ticketTimeLeft, setTicketTimeLeft] = useState(0);
    const [linkingStatus, setLinkingStatus] = useState('waiting'); // 'waiting' | 'approved' | 'expired'

    // Generate or refresh pairing ticket
    const generateNewTicket = useCallback(async () => {
        try {
            setLoading(true);
            setError('');
            const currentApiUrl = getResolvedBaseUrl();
            console.log('[Auth] Requesting ticket from:', currentApiUrl);

            const res = await axios.post(`${currentApiUrl}/device-link/ticket`, {
                deviceType: isTV ? 'Television' : isMobile ? 'Mobile Companion' : 'Computer / Browser',
                userAgent: navigator.userAgent
            });

            setLinkTicket(res.data);
            setLinkingStatus('waiting');
            setTicketTimeLeft(Math.max(0, Math.round((res.data.expiresAt - Date.now()) / 1000)));
        } catch (err) {
            console.error('Failed to create device link ticket:', err);
            setError('Could not generate linking code. Check server connection.');
        } finally {
            setLoading(false);
        }
    }, [isTV, isMobile]);

    // Create ticket when in 'link' mode
    useEffect(() => {
        if (authMode === 'link') {
            generateNewTicket();
        }
    }, [authMode, generateNewTicket]);

    // Countdown timer for ticket validity
    useEffect(() => {
        if (authMode !== 'link' || !linkTicket) return;

        const timer = setInterval(() => {
            const remaining = Math.max(0, Math.round((linkTicket.expiresAt - Date.now()) / 1000));
            setTicketTimeLeft(remaining);
            if (remaining <= 0) {
                setLinkingStatus('expired');
            }
        }, 1000);

        return () => clearInterval(timer);
    }, [authMode, linkTicket]);

    // Listen for WebSocket approval of the pairing ticket
    useEffect(() => {
        if (!socket || authMode !== 'link' || !linkTicket) return;

        socket.emit('join_ticket_room', linkTicket.ticketId);

        const handleApproved = async (sessionPayload) => {
            console.log('[Auth] Device link approved:', sessionPayload);
            setLinkingStatus('approved');
            setInfoMessage('✓ Linking approved! Signing into session...');

            try {
                // If this is a mobile phone, it is NEVER a TV
                const isTVDevice = !isMobile && Boolean(
                    sessionPayload.isTV || 
                    sessionPayload.deviceType === 'Television' || 
                    isTV
                );

                const sessionDurationMs = isTVDevice ? (24 * 60 * 60 * 1000) : (60 * 60 * 1000);

                // Store session with 24h expiry for TV or 1h for mobile companion
                const sessionToSave = {
                    loggedIn: true,
                    userGuid: sessionPayload.userGuid,
                    business: sessionPayload.business,
                    permissionGroup: sessionPayload.permissionGroup,
                    deviceId: sessionPayload.deviceId,
                    deviceName: sessionPayload.deviceName,
                    deviceType: isTVDevice ? 'Television' : (isMobile ? 'Mobile Companion' : sessionPayload.deviceType),
                    isTV: isTVDevice,
                    isLinkedDevice: true,
                    linkedAt: sessionPayload.linkedAt,
                    expiresAt: Date.now() + sessionDurationMs,
                    sessionDurationMs: sessionDurationMs
                };
                localStorage.setItem('userSession', JSON.stringify(sessionToSave));

                await refreshProfile(sessionPayload.userGuid);
                if (isTVDevice) {
                    navigate(`/${sessionPayload.business}/PlayersMonitor`, { replace: true });
                } else {
                    navigate('/', { replace: true });
                }
                auth.login();
            } catch (err) {
                console.error('Failed to finalize linked login:', err);
                setError('Failed to initialize session. Please try again.');
            }
        };

        socket.on('device_link_approved', handleApproved);
        return () => {
            socket.off('device_link_approved', handleApproved);
        };
    }, [socket, authMode, linkTicket, navigate, auth, refreshProfile]);

    const handlePhoneSubmit = async (event) => {
        event.preventDefault();
        setError('');
        setInfoMessage('');

        const clean = phoneNumber.replace(/\D/g, '');
        const dbPhone = clean.length === 11 && clean.startsWith('1') ? clean.substring(1) : clean;

        if (dbPhone.length !== 10) {
            setError('Please enter a valid 10-digit phone number.');
            return;
        }

        setLoading(true);
        try {
            const currentApiUrl = getResolvedBaseUrl();
            const response = await axios.get(`${currentApiUrl}/getAll`, {
                params: {
                    tableName: 'users_table',
                    phone_number: dbPhone
                }
            });

            if (response.data && response.data.length > 0) {
                setAuthenticatedUser(response.data[0]);
                const otp = Math.floor(100000 + Math.random() * 900000).toString();
                setGeneratedOtp(otp);
                console.log('--- GENERATED OTP CODE ---');
                console.log(`OTP: ${otp}`);
                console.log('--------------------------');

                setOtpAttempts(0);
                setStep(2);
                setInfoMessage('Verification code generated. Please check your console.');
            } else {
                setError('Phone number not found in registered accounts.');
            }
        } catch (err) {
            console.error('Error verifying phone number:', err);
            setError('Connection error. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleOtpSubmit = async (event) => {
        event.preventDefault();
        setError('');

        if (otpAttempts >= MAX_OTP_ATTEMPTS) {
            setError('Too many failed attempts. Please go back and request a new code.');
            return;
        }

        if (otpInput !== generatedOtp) {
            const newAttempts = otpAttempts + 1;
            setOtpAttempts(newAttempts);
            const remaining = MAX_OTP_ATTEMPTS - newAttempts;
            if (remaining > 0) {
                setError(`Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`);
            } else {
                setError('Too many failed attempts. Please go back and request a new code.');
            }
            return;
        }

        setLoading(true);
        try {
            const currentApiUrl = getResolvedBaseUrl();
            await axios.post(`${currentApiUrl}/profile/${authenticatedUser.user_guid}`, authenticatedUser);
            await refreshProfile(authenticatedUser.user_guid);
            if (isTV) {
                navigate(`/${authenticatedUser.business}/PlayersMonitor`, { replace: true });
            } else {
                navigate('/', { replace: true });
            }
            auth.login();
        } catch (err) {
            console.error('Error storing profile on server:', err);
            setError('Failed to log in on server. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleSignOut = async () => {
        setLoading(true);
        try {
            if (profile?.user_guid) {
                const currentApiUrl = getResolvedBaseUrl();
                await axios.post(`${currentApiUrl}/profile/${profile.user_guid}`, {});
            }
        } catch (err) {
            console.error('Error clearing profile on server:', err);
        } finally {
            localStorage.removeItem('userSession');
            setProfile(null);
            auth.logout();
            setLoading(false);
        }
    };

    const handleBackToPhone = () => {
        setStep(1);
        setOtpInput('');
        setGeneratedOtp('');
        setOtpAttempts(0);
        setError('');
        setInfoMessage('');
    };

    const formatCountdown = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    };

    const isLocked = otpAttempts >= MAX_OTP_ATTEMPTS;

    return (
        <Card>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '0.75rem' }}>
                <img 
                    src={appLogo} 
                    alt="Triple Great Logo" 
                    style={{ 
                        width: '76px', 
                        height: '76px', 
                        borderRadius: '16px', 
                        objectFit: 'cover',
                        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)',
                        border: '2px solid rgba(23, 75, 15, 0.3)',
                        marginBottom: '0.75rem'
                    }} 
                />
                <h2 className={classes.authentication} style={{ margin: 0 }}>Triple Great</h2>
            </div>
            <div style={{ textAlign: 'center', fontSize: '0.85rem', color: '#64748b', marginBottom: '1rem' }}>
                Access from your <strong>{detectedDeviceType}</strong>
            </div>
            <hr style={{ marginBottom: '1.25rem', borderColor: '#ccc' }} />

            {auth.isLoggedIn ? (
                <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
                    <p style={{ marginBottom: '1.5rem', fontSize: '1.1rem', fontWeight: '500', color: '#333' }}>
                        You are currently signed in.
                    </p>
                    <div className={classes.buttonBar}>
                        <Button onClick={handleSignOut} disabled={loading}>
                            {loading ? 'Signing out...' : 'Sign Out'}
                        </Button>
                    </div>
                </div>
            ) : (
                <>
                    {/* Navigation Tabs: Primary Account Login vs WhatsApp-style Linked Device */}
                    <div style={{
                        display: 'flex',
                        gap: '8px',
                        marginBottom: '1.5rem',
                        backgroundColor: '#f1f5f9',
                        padding: '4px',
                        borderRadius: '8px'
                    }}>
                        <button
                            type="button"
                            onClick={() => { setAuthMode('phone'); setError(''); setInfoMessage(''); }}
                            style={{
                                flex: 1,
                                padding: '10px 12px',
                                border: 'none',
                                borderRadius: '6px',
                                fontWeight: '700',
                                fontSize: '0.9rem',
                                cursor: 'pointer',
                                backgroundColor: authMode === 'phone' ? '#ffffff' : 'transparent',
                                color: authMode === 'phone' ? '#1e293b' : '#64748b',
                                boxShadow: authMode === 'phone' ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            🔑 Account Sign In (SMS)
                        </button>
                        <button
                            type="button"
                            onClick={() => { setAuthMode('link'); setError(''); setInfoMessage(''); }}
                            style={{
                                flex: 1,
                                padding: '10px 12px',
                                border: 'none',
                                borderRadius: '6px',
                                fontWeight: '700',
                                fontSize: '0.9rem',
                                cursor: 'pointer',
                                backgroundColor: authMode === 'link' ? '#ffffff' : 'transparent',
                                color: authMode === 'link' ? '#16a34a' : '#64748b',
                                boxShadow: authMode === 'link' ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            🔗 Link This {detectedDeviceType} (QR Code)
                        </button>
                    </div>

                    {error && (
                        <div style={{ color: '#dc3545', marginBottom: '1rem', fontWeight: '500', textAlign: 'center' }}>
                            {error}
                        </div>
                    )}

                    {infoMessage && (
                        <div style={{ color: '#28a745', marginBottom: '1rem', fontWeight: '500', textAlign: 'center' }}>
                            {infoMessage}
                        </div>
                    )}


                    {/* MODE 1: Standard Account Login with Phone Number & SMS */}
                    {authMode === 'phone' && (
                        <>
                            {step === 1 && (
                                <form className={classes.form} onSubmit={handlePhoneSubmit}>
                                    <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '1.5rem' }}>
                                        <label htmlFor="phone" style={{ fontWeight: '600', marginBottom: '0.5rem', color: '#333' }}>
                                            Registered Phone Number:
                                        </label>
                                        <input
                                            type="text"
                                            id="phone"
                                            placeholder="+1 (555) 000-0000"
                                            value={phoneNumber}
                                            onChange={(e) => setPhoneNumber(e.target.value)}
                                            disabled={loading}
                                            required
                                            style={{
                                                padding: '0.8rem',
                                                border: '1px solid #ccc',
                                                borderRadius: '6px',
                                                fontSize: '1rem',
                                                width: '100%',
                                                boxSizing: 'border-box'
                                            }}
                                        />
                                        <span style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.4rem' }}>
                                            Primary device login for phones, tablets, or computers
                                        </span>
                                    </div>

                                    <div className={classes.buttonBar}>
                                        <Button type="submit" disabled={loading}>
                                            {loading ? 'Sending Code...' : 'Send SMS Code'}
                                        </Button>
                                    </div>
                                </form>
                            )}

                            {step === 2 && (
                                <form className={classes.form} onSubmit={handleOtpSubmit}>
                                    <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '1.5rem' }}>
                                        <label htmlFor="otp" style={{ fontWeight: '600', marginBottom: '0.5rem', color: '#333' }}>
                                            Verification Code (6-digit):
                                        </label>
                                        <input
                                            type="text"
                                            id="otp"
                                            maxLength={6}
                                            placeholder="Enter 6-digit code"
                                            value={otpInput}
                                            onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, ''))}
                                            disabled={loading || isLocked}
                                            required
                                            style={{
                                                padding: '0.8rem',
                                                border: `2px solid ${isLocked ? '#dc3545' : '#007bff'}`,
                                                borderRadius: '6px',
                                                fontSize: '1.2rem',
                                                letterSpacing: '0.3rem',
                                                textAlign: 'center',
                                                width: '100%',
                                                boxSizing: 'border-box',
                                                fontWeight: 'bold',
                                                opacity: isLocked ? 0.5 : 1
                                            }}
                                        />
                                    </div>

                                    <div className={classes.buttonBar} style={{ flexDirection: 'column', gap: '10px' }}>
                                        <Button type="submit" disabled={loading || isLocked}>
                                            {loading ? 'Verifying...' : 'Verify & Login'}
                                        </Button>
                                        <Button inverse type="button" onClick={handleBackToPhone} disabled={loading}>
                                            Back
                                        </Button>
                                    </div>
                                </form>
                            )}
                        </>
                    )}

                    {/* MODE 2: WhatsApp-Style Companion Device Linking (For TV, Computer, Secondary Tablet) */}
                    {authMode === 'link' && (
                        <div style={{ textAlign: 'center', padding: '0.5rem 0' }}>
                            {loading && !linkTicket ? (
                                <p style={{ color: '#64748b' }}>Connecting to server & generating pairing ticket...</p>
                            ) : linkTicket ? (
                                <div>
                                    {/* QR Code */}
                                    <div style={{
                                        display: 'inline-block',
                                        padding: '16px',
                                        backgroundColor: '#ffffff',
                                        borderRadius: '12px',
                                        border: '2px solid #e2e8f0',
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
                                        marginBottom: '1rem'
                                    }}>
                                        <QRCodeSVG
                                            value={JSON.stringify({ ticketId: linkTicket.ticketId, pairCode: linkTicket.pairCode })}
                                            size={200}
                                            level="M"
                                        />
                                    </div>

                                    {/* Pairing Code */}
                                    <div style={{ marginBottom: '1.25rem' }}>
                                        <span style={{ fontSize: '0.85rem', color: '#64748b', textTransform: 'uppercase', fontWeight: '700' }}>
                                            Pairing Code:
                                        </span>
                                        <div style={{
                                            fontSize: '2rem',
                                            fontWeight: '800',
                                            letterSpacing: '4px',
                                            color: '#16a34a',
                                            fontFamily: 'monospace',
                                            marginTop: '4px'
                                        }}>
                                            {linkTicket.pairCode}
                                        </div>
                                    </div>

                                    {/* Instructions */}
                                    <div style={{
                                        backgroundColor: '#f8fafc',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '8px',
                                        padding: '1rem',
                                        textAlign: 'left',
                                        fontSize: '0.9rem',
                                        color: '#333',
                                        lineHeight: '1.5',
                                        marginBottom: '1.25rem'
                                    }}>
                                        <strong>To link this {detectedDeviceType}:</strong>
                                        <ol style={{ margin: '6px 0 0', paddingLeft: '20px' }}>
                                            <li>Open this app on your already signed-in phone or tablet.</li>
                                            <li>Tap <strong>📱 Linked Devices</strong> in the top header.</li>
                                            <li>Enter the code <strong>{linkTicket.pairCode}</strong> above.</li>
                                            <li>Session automatically ends after <strong>1 hour of inactiveness</strong>.</li>
                                        </ol>
                                    </div>

                                    {/* Status Message */}
                                    <div style={{
                                        marginBottom: '1rem',
                                        padding: '8px 12px',
                                        borderRadius: '6px',
                                        fontSize: '0.9rem',
                                        fontWeight: '600',
                                        backgroundColor: linkingStatus === 'approved' ? '#dcfce7' : linkingStatus === 'expired' ? '#fee2e2' : '#eff6ff',
                                        color: linkingStatus === 'approved' ? '#16a34a' : linkingStatus === 'expired' ? '#dc2626' : '#2563eb',
                                    }}>
                                        {linkingStatus === 'waiting' && '⏳ Waiting for authorization from your phone or tablet...'}
                                        {linkingStatus === 'approved' && '✅ Approved! Launching session...'}
                                        {linkingStatus === 'expired' && '⚠️ Code expired. Please click "Refresh Code" below.'}
                                    </div>

                                    {/* Status & Expiry */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: '0.85rem', color: ticketTimeLeft > 60 ? '#64748b' : '#dc2626' }}>
                                            ⏱️ Code expires in: <strong>{formatCountdown(ticketTimeLeft)}</strong>
                                        </span>

                                        <button
                                            type="button"
                                            onClick={generateNewTicket}
                                            disabled={loading}
                                            style={{
                                                background: 'transparent',
                                                border: '1px solid #cbd5e1',
                                                padding: '6px 12px',
                                                borderRadius: '6px',
                                                fontSize: '0.85rem',
                                                cursor: 'pointer',
                                                fontWeight: '600'
                                            }}
                                        >
                                            🔄 Refresh Code
                                        </button>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    )}
                </>
            )}
        </Card>
    );
};

export default AuthenticateUser;
