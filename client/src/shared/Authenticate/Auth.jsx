import React, { useState, useContext, useEffect, useCallback } from 'react';
import { AuthContext } from '../Context/auth-context';
import { useUserProfile } from '../Context/UserProfileContext';
import { useRefresh } from '../Context/RefreshContext';
import { useNavigate, useLocation } from 'react-router-dom';
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
    const location = useLocation();

    const requestedProtectedPath = location.state?.from || null;

    // Detect client device type accurately: mobile phones are NEVER TVs
    const isMobile = typeof window !== 'undefined' && (
        /android.*mobile|iphone|ipod|blackberry|iemobile|opera mini/i.test(navigator.userAgent) ||
        (window.innerWidth <= 768 && /android|mobile/i.test(navigator.userAgent))
    );
    const isTV = typeof window !== 'undefined' && !isMobile && (
        /smart-?tv|googletv|apple-?tv|android tv|tizen|webos|viera|bravia|netcast|roku|aftb|aftt|aftm|afts/i.test(navigator.userAgent)
    );
    const detectedDeviceType = isTV ? 'Television' : isMobile ? 'Phone / Tablet' : 'Computer';

    // Mode: 'phone' (Sign In), 'signup' (Create Account), 'link' (Link Device via QR)
    const [authMode, setAuthMode] = useState(isTV ? 'link' : 'phone');

    // Account Sign-In state
    const [identifier, setIdentifier] = useState('');
    const [step, setStep] = useState(1); // 1: identifier, 2: verify
    const [matchedSource, setMatchedSource] = useState(null);
    const [authenticatedUser, setAuthenticatedUser] = useState(null);
    const [customerHasPassword, setCustomerHasPassword] = useState(true);

    // 6-digit verification code state
    const [generatedOtp, setGeneratedOtp] = useState('');
    const [otpInput, setOtpInput] = useState('');
    const [otpAttempts, setOtpAttempts] = useState(0);

    // Password state
    const [customerPassword, setCustomerPassword] = useState('');

    // Create Account state (customer information is personal and not tied to a business)
    const [signUpFirstName, setSignUpFirstName] = useState('');
    const [signUpLastName, setSignUpLastName] = useState('');
    const [signUpEmail, setSignUpEmail] = useState('');
    const [signUpPhone, setSignUpPhone] = useState('');
    const [signUpPassword, setSignUpPassword] = useState('');
    const [signUpSmsOptIn, setSignUpSmsOptIn] = useState(true);

    const [error, setError] = useState('');
    const [infoMessage, setInfoMessage] = useState('');
    const [loading, setLoading] = useState(false);

    // Device Linking state
    const [linkTicket, setLinkTicket] = useState(null);
    const [ticketTimeLeft, setTicketTimeLeft] = useState(0);
    const [linkingStatus, setLinkingStatus] = useState('waiting'); // 'waiting' | 'approved' | 'expired'

    const generateNewTicket = useCallback(async () => {
        try {
            setLoading(true);
            setError('');
            const currentApiUrl = getResolvedBaseUrl();

            const res = await axios.post(`${currentApiUrl}/device-link/ticket`, {
                deviceType: isTV ? 'Television' : isMobile ? 'Mobile Companion' : 'Computer / Browser',
                userAgent: navigator.userAgent
            });

            setLinkTicket(res.data);
            setLinkingStatus('waiting');
            setTicketTimeLeft(Math.max(0, Math.round((res.data.expiresAt - Date.now()) / 1000)));
        } catch (err) {
            console.error('Failed to create device link ticket:', err);
            setError('Could not generate linking code. Please check your connection.');
        } finally {
            setLoading(false);
        }
    }, [isTV, isMobile]);

    useEffect(() => {
        if (authMode === 'link') {
            generateNewTicket();
        }
    }, [authMode, generateNewTicket]);

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

    useEffect(() => {
        if (!socket || authMode !== 'link' || !linkTicket) return;

        socket.emit('join_ticket_room', linkTicket.ticketId);

        const handleApproved = async (sessionPayload) => {
            setLinkingStatus('approved');
            setInfoMessage('✓ Device linked! Signing in...');

            try {
                const isTVDevice = !isMobile && Boolean(
                    sessionPayload.isTV ||
                    sessionPayload.deviceType === 'Television' ||
                    isTV
                );

                const sessionDurationMs = isTVDevice ? (24 * 60 * 60 * 1000) : (60 * 60 * 1000);

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
                auth.login();
                if (isTVDevice) {
                    navigate(`/${sessionPayload.business}/PlayersMonitor`, { replace: true });
                } else if (requestedProtectedPath) {
                    navigate(requestedProtectedPath, { replace: true });
                } else {
                    navigate('/', { replace: true });
                }
            } catch (err) {
                console.error('Failed to finalize linked login:', err);
                setError('Failed to initialize session. Please try again.');
            }
        };

        socket.on('device_link_approved', handleApproved);
        return () => {
            socket.off('device_link_approved', handleApproved);
        };
    }, [socket, authMode, linkTicket, navigate, auth, refreshProfile, isMobile, isTV, requestedProtectedPath]);

    const handleLookupSubmit = async (event) => {
        event.preventDefault();
        setError('');
        setInfoMessage('');

        const trimmed = identifier.trim();
        if (!trimmed) {
            setError('Please enter your phone number or email.');
            return;
        }

        setLoading(true);
        try {
            const currentApiUrl = getResolvedBaseUrl();
            const response = await axios.post(`${currentApiUrl}/auth/lookup`, {
                identifier: trimmed
            });

            const data = response.data;

            if (data?.found && data.source === 'users_table') {
                setMatchedSource('users_table');
                setAuthenticatedUser(data.account);
                const otp = Math.floor(100000 + Math.random() * 900000).toString();
                setGeneratedOtp(otp);
                console.log('--- VERIFICATION CODE ---');
                console.log(`Code: ${otp}`);
                console.log('-------------------------');

                setOtpAttempts(0);
                setOtpInput('');
                setStep(2);
                setInfoMessage('Please enter your 6-digit verification code.');
            } else if (data?.found && data.source === 'customers') {
                setMatchedSource('customers');
                setAuthenticatedUser(data.account);
                setCustomerHasPassword(Boolean(data.has_password));
                setCustomerPassword('');
                setStep(2);
                setInfoMessage(
                    data.has_password
                        ? 'Please enter your password to sign in.'
                        : 'Please create a password below to complete your sign in.'
                );
            } else {
                setError('No account found with those details. Please create an account to continue.');
                if (trimmed.includes('@')) {
                    setSignUpEmail(trimmed);
                } else {
                    setSignUpPhone(trimmed);
                }
            }
        } catch (err) {
            setError(err?.response?.data?.error || 'Connection error. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleStaffOtpSubmit = async (event) => {
        event.preventDefault();
        setError('');

        if (otpAttempts >= MAX_OTP_ATTEMPTS) {
            setError('Too many failed attempts. Please go back and request a new code.');
            return;
        }

        if (otpInput.trim() !== generatedOtp) {
            const newAttempts = otpAttempts + 1;
            setOtpAttempts(newAttempts);
            const remaining = MAX_OTP_ATTEMPTS - newAttempts;
            if (remaining > 0) {
                setError(`Incorrect verification code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`);
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
            auth.login();
            if (isTV) {
                navigate(`/${authenticatedUser.business}/PlayersMonitor`, { replace: true });
            } else if (requestedProtectedPath) {
                navigate(requestedProtectedPath, { replace: true });
            } else {
                navigate(`/${authenticatedUser.business || 'alpha_rentals'}`, { replace: true });
            }
        } catch {
            setError('Unable to sign in right now. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleCustomerPasswordSubmit = async (event) => {
        event.preventDefault();
        setError('');

        if (!customerPassword) {
            setError('Please enter your password.');
            return;
        }

        setLoading(true);
        try {
            const currentApiUrl = getResolvedBaseUrl();
            const res = await axios.post(`${currentApiUrl}/auth/customer/login`, {
                customer_guid: authenticatedUser?.customer_guid || authenticatedUser?.user_guid,
                identifier: identifier.trim(),
                password: customerPassword
            });

            const loggedInProfile = res.data?.profile;
            if (loggedInProfile?.user_guid) {
                await refreshProfile(loggedInProfile.user_guid);
                auth.login();
                if (requestedProtectedPath) {
                    navigate(requestedProtectedPath, { replace: true });
                } else {
                    navigate('/', { replace: true });
                }
            } else {
                setError('Unable to complete sign in. Please try again.');
            }
        } catch (err) {
            setError(err?.response?.data?.error || 'Invalid password. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleCustomerSignUp = async (event) => {
        event.preventDefault();
        setError('');
        setInfoMessage('');

        const cleanDigits = signUpPhone.replace(/\D/g, '');
        const dbPhone = cleanDigits.length === 11 && cleanDigits.startsWith('1') ? cleanDigits.slice(1) : cleanDigits;

        if (!signUpFirstName.trim() || !signUpLastName.trim() || !signUpEmail.trim() || !dbPhone || !signUpPassword) {
            setError('Please fill in all required fields.');
            return;
        }

        if (dbPhone.length !== 10) {
            setError('Please enter a valid 10-digit phone number.');
            return;
        }

        if (signUpPassword.length < 4) {
            setError('Password must be at least 4 characters.');
            return;
        }

        setLoading(true);
        try {
            const currentApiUrl = getResolvedBaseUrl();
            const res = await axios.post(`${currentApiUrl}/auth/customer/signup`, {
                first_name: signUpFirstName.trim(),
                last_name: signUpLastName.trim(),
                email: signUpEmail.trim().toLowerCase(),
                phone_number: dbPhone,
                password: signUpPassword,
                sms_opt_in: signUpSmsOptIn
            });

            const createdProfile = res.data?.profile;
            if (createdProfile?.user_guid) {
                await refreshProfile(createdProfile.user_guid);
                auth.login();
                if (requestedProtectedPath) {
                    navigate(requestedProtectedPath, { replace: true });
                } else {
                    navigate('/', { replace: true });
                }
            }
        } catch (err) {
            setError(err?.response?.data?.error || 'Unable to create your account. Please try again.');
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
        } catch {
            // Ignore sign-out errors
        } finally {
            localStorage.removeItem('userSession');
            setProfile(null);
            auth.logout();
            setLoading(false);
            navigate('/', { replace: true });
        }
    };

    const handleBackToLookup = () => {
        setStep(1);
        setMatchedSource(null);
        setAuthenticatedUser(null);
        setOtpInput('');
        setGeneratedOtp('');
        setCustomerPassword('');
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

            {requestedProtectedPath && !auth.isLoggedIn && (
                <div
                    style={{
                        backgroundColor: '#fffbeb',
                        border: '1px solid #fde68a',
                        color: '#92400e',
                        padding: '0.6rem 0.9rem',
                        borderRadius: '8px',
                        fontSize: '0.84rem',
                        textAlign: 'center',
                        marginBottom: '0.85rem'
                    }}
                >
                    Please sign in to continue.
                </div>
            )}

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
                    {/* Navigation Tabs: Sign In vs Create Account vs Link Device */}
                    <div style={{
                        display: 'flex',
                        gap: '6px',
                        marginBottom: '1.5rem',
                        backgroundColor: '#f1f5f9',
                        padding: '4px',
                        borderRadius: '8px',
                        flexWrap: 'wrap'
                    }}>
                        <button
                            type="button"
                            onClick={() => { setAuthMode('phone'); setError(''); setInfoMessage(''); }}
                            style={{
                                flex: 1,
                                padding: '10px 10px',
                                border: 'none',
                                borderRadius: '6px',
                                fontWeight: '700',
                                fontSize: '0.86rem',
                                cursor: 'pointer',
                                backgroundColor: authMode === 'phone' ? '#ffffff' : 'transparent',
                                color: authMode === 'phone' ? '#1e293b' : '#64748b',
                                boxShadow: authMode === 'phone' ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            Sign In
                        </button>
                        <button
                            type="button"
                            onClick={() => { setAuthMode('signup'); setError(''); setInfoMessage(''); }}
                            style={{
                                flex: 1,
                                padding: '10px 10px',
                                border: 'none',
                                borderRadius: '6px',
                                fontWeight: '700',
                                fontSize: '0.86rem',
                                cursor: 'pointer',
                                backgroundColor: authMode === 'signup' ? '#ffffff' : 'transparent',
                                color: authMode === 'signup' ? '#174b0f' : '#64748b',
                                boxShadow: authMode === 'signup' ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            Create Account
                        </button>
                        <button
                            type="button"
                            onClick={() => { setAuthMode('link'); setError(''); setInfoMessage(''); }}
                            style={{
                                flex: 1,
                                padding: '10px 10px',
                                border: 'none',
                                borderRadius: '6px',
                                fontWeight: '700',
                                fontSize: '0.86rem',
                                cursor: 'pointer',
                                backgroundColor: authMode === 'link' ? '#ffffff' : 'transparent',
                                color: authMode === 'link' ? '#16a34a' : '#64748b',
                                boxShadow: authMode === 'link' ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            Link {detectedDeviceType}
                        </button>
                    </div>

                    {error && (
                        <div style={{ color: '#dc3545', marginBottom: '1rem', fontWeight: '500', textAlign: 'center', fontSize: '0.9rem' }}>
                            {error}
                        </div>
                    )}

                    {infoMessage && (
                        <div style={{ color: '#28a745', marginBottom: '1rem', fontWeight: '500', textAlign: 'center', fontSize: '0.9rem' }}>
                            {infoMessage}
                        </div>
                    )}

                    {/* MODE 1: Sign In */}
                    {authMode === 'phone' && (
                        <>
                            {step === 1 && (
                                <form className={classes.form} onSubmit={handleLookupSubmit}>
                                    <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '1.5rem' }}>
                                        <label htmlFor="identifier" style={{ fontWeight: '600', marginBottom: '0.5rem', color: '#333' }}>
                                            Phone Number or Email:
                                        </label>
                                        <input
                                            type="text"
                                            id="identifier"
                                            placeholder="Enter your phone number or email"
                                            value={identifier}
                                            onChange={(e) => setIdentifier(e.target.value)}
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
                                    </div>

                                    <div className={classes.buttonBar}>
                                        <Button type="submit" disabled={loading}>
                                            {loading ? 'Please wait...' : 'Continue'}
                                        </Button>
                                    </div>
                                </form>
                            )}

                            {step === 2 && matchedSource === 'users_table' && (
                                <form className={classes.form} onSubmit={handleStaffOtpSubmit}>
                                    <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '1.5rem' }}>
                                        <label htmlFor="otp" style={{ fontWeight: '600', marginBottom: '0.5rem', color: '#333' }}>
                                            6-Digit Verification Code:
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
                                            {loading ? 'Verifying...' : 'Verify & Sign In'}
                                        </Button>
                                        <Button inverse type="button" onClick={handleBackToLookup} disabled={loading}>
                                            Back
                                        </Button>
                                    </div>
                                </form>
                            )}

                            {step === 2 && matchedSource === 'customers' && (
                                <form className={classes.form} onSubmit={handleCustomerPasswordSubmit}>
                                    <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '1.5rem' }}>
                                        <label htmlFor="customer-password" style={{ fontWeight: '600', marginBottom: '0.5rem', color: '#333' }}>
                                            {customerHasPassword ? 'Password:' : 'Create Password:'}
                                        </label>
                                        <input
                                            type="password"
                                            id="customer-password"
                                            placeholder="Enter your password"
                                            value={customerPassword}
                                            onChange={(e) => setCustomerPassword(e.target.value)}
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
                                    </div>

                                    <div className={classes.buttonBar} style={{ flexDirection: 'column', gap: '10px' }}>
                                        <Button type="submit" disabled={loading}>
                                            {loading ? 'Signing In...' : 'Sign In'}
                                        </Button>
                                        <Button inverse type="button" onClick={handleBackToLookup} disabled={loading}>
                                            Back
                                        </Button>
                                    </div>
                                </form>
                            )}
                        </>
                    )}

                    {/* MODE 2: Create Account (Customer information is personal and not tied to a business) */}
                    {authMode === 'signup' && (
                        <form className={classes.form} onSubmit={handleCustomerSignUp}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                                <div>
                                    <label style={{ fontWeight: '600', fontSize: '0.85rem', color: '#333', display: 'block', marginBottom: '0.3rem' }}>
                                        First Name *
                                    </label>
                                    <input
                                        type="text"
                                        value={signUpFirstName}
                                        onChange={(e) => setSignUpFirstName(e.target.value)}
                                        required
                                        disabled={loading}
                                        style={{ padding: '0.65rem', border: '1px solid #ccc', borderRadius: '6px', width: '100%', boxSizing: 'border-box' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontWeight: '600', fontSize: '0.85rem', color: '#333', display: 'block', marginBottom: '0.3rem' }}>
                                        Last Name *
                                    </label>
                                    <input
                                        type="text"
                                        value={signUpLastName}
                                        onChange={(e) => setSignUpLastName(e.target.value)}
                                        required
                                        disabled={loading}
                                        style={{ padding: '0.65rem', border: '1px solid #ccc', borderRadius: '6px', width: '100%', boxSizing: 'border-box' }}
                                    />
                                </div>
                            </div>

                            <div style={{ marginBottom: '0.75rem' }}>
                                <label style={{ fontWeight: '600', fontSize: '0.85rem', color: '#333', display: 'block', marginBottom: '0.3rem' }}>
                                    Email *
                                </label>
                                <input
                                    type="email"
                                    value={signUpEmail}
                                    onChange={(e) => setSignUpEmail(e.target.value)}
                                    required
                                    disabled={loading}
                                    style={{ padding: '0.65rem', border: '1px solid #ccc', borderRadius: '6px', width: '100%', boxSizing: 'border-box' }}
                                />
                            </div>

                            <div style={{ marginBottom: '0.75rem' }}>
                                <label style={{ fontWeight: '600', fontSize: '0.85rem', color: '#333', display: 'block', marginBottom: '0.3rem' }}>
                                    Phone Number *
                                </label>
                                <input
                                    type="tel"
                                    value={signUpPhone}
                                    onChange={(e) => setSignUpPhone(e.target.value)}
                                    required
                                    disabled={loading}
                                    style={{ padding: '0.65rem', border: '1px solid #ccc', borderRadius: '6px', width: '100%', boxSizing: 'border-box' }}
                                />
                            </div>

                            <div style={{ marginBottom: '0.75rem' }}>
                                <label style={{ fontWeight: '600', fontSize: '0.85rem', color: '#333', display: 'block', marginBottom: '0.3rem' }}>
                                    Password *
                                </label>
                                <input
                                    type="password"
                                    value={signUpPassword}
                                    onChange={(e) => setSignUpPassword(e.target.value)}
                                    required
                                    disabled={loading}
                                    style={{ padding: '0.65rem', border: '1px solid #ccc', borderRadius: '6px', width: '100%', boxSizing: 'border-box' }}
                                />
                            </div>

                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', color: '#475569', marginBottom: '1rem' }}>
                                <input
                                    type="checkbox"
                                    checked={signUpSmsOptIn}
                                    onChange={(e) => setSignUpSmsOptIn(e.target.checked)}
                                    disabled={loading}
                                />
                                Receive SMS booking confirmations and reminders
                            </label>

                            <div className={classes.buttonBar}>
                                <Button type="submit" disabled={loading}>
                                    {loading ? 'Creating Account...' : 'Create Account'}
                                </Button>
                            </div>
                        </form>
                    )}

                    {/* MODE 3: Companion Device Linking (For TV, Computer, Secondary Tablet) */}
                    {authMode === 'link' && (
                        <div style={{ textAlign: 'center', padding: '0.5rem 0' }}>
                            {loading && !linkTicket ? (
                                <p style={{ color: '#64748b' }}>Generating pairing code...</p>
                            ) : linkTicket ? (
                                <div>
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
                                            <li>Tap <strong>Linked Devices</strong> in the top header.</li>
                                            <li>Enter the code <strong>{linkTicket.pairCode}</strong> above.</li>
                                        </ol>
                                    </div>

                                    <div style={{
                                        marginBottom: '1rem',
                                        padding: '8px 12px',
                                        borderRadius: '6px',
                                        fontSize: '0.9rem',
                                        fontWeight: '600',
                                        backgroundColor: linkingStatus === 'approved' ? '#dcfce7' : linkingStatus === 'expired' ? '#fee2e2' : '#eff6ff',
                                        color: linkingStatus === 'approved' ? '#16a34a' : linkingStatus === 'expired' ? '#dc2626' : '#2563eb',
                                    }}>
                                        {linkingStatus === 'waiting' && 'Waiting for authorization from your phone or tablet...'}
                                        {linkingStatus === 'approved' && 'Approved! Launching session...'}
                                        {linkingStatus === 'expired' && 'Code expired. Please click "Refresh Code" below.'}
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: '0.85rem', color: ticketTimeLeft > 60 ? '#64748b' : '#dc2626' }}>
                                            Code expires in: <strong>{formatCountdown(ticketTimeLeft)}</strong>
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
                                            Refresh Code
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
