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
import classes from './Auth.module.scss';
import PasswordStrengthChecklist from './PasswordStrengthChecklist';
import PasswordInput from './PasswordInput';
import { evaluatePasswordStrength } from '../Utils/passwordValidation';

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
    const [signInPassword, setSignInPassword] = useState('');
    const [signInStep, setSignInStep] = useState('lookup'); // 'lookup' | 'verify_2fa' | 'staff_first_time' | 'staff_password' | 'staff_2fa' | 'customer_password' | 'forgot_password'
    const [authenticatedUser, setAuthenticatedUser] = useState(null);
    const [customerHasPassword, setCustomerHasPassword] = useState(true);
    const [maskedPhone, setMaskedPhone] = useState('');
    const [twoFaData, setTwoFaData] = useState(null);
    const [verificationOtp, setVerificationOtp] = useState('');

    // First-time staff setup state
    const [staffNewPassword, setStaffNewPassword] = useState('');
    const [staffConfirmPassword, setStaffConfirmPassword] = useState('');
    const [staffSetupOtp, setStaffSetupOtp] = useState('');

    // Returning staff state
    const [staffPassword, setStaffPassword] = useState('');
    const [staff2faOtp, setStaff2faOtp] = useState('');

    // Forgot / reset password state
    const [resetIdentifier, setResetIdentifier] = useState('');
    const [resetOtp, setResetOtp] = useState('');
    const [resetStep, setResetStep] = useState('enter_code'); // 'enter_code' | 'set_password'
    const [resetToken, setResetToken] = useState('');
    const [resetNewPassword, setResetNewPassword] = useState('');
    const [resetConfirmPassword, setResetConfirmPassword] = useState('');
    const [devPin, setDevPin] = useState('');

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

    const handleBackToLookup = () => {
        setSignInStep('lookup');
        setAuthenticatedUser(null);
        setTwoFaData(null);
        setVerificationOtp('');
        setSignInPassword('');
        setMaskedPhone('');
        setStaffNewPassword('');
        setStaffConfirmPassword('');
        setStaffSetupOtp('');
        setStaffPassword('');
        setStaff2faOtp('');
        setResetIdentifier('');
        setResetOtp('');
        setResetNewPassword('');
        setResetConfirmPassword('');
        setCustomerPassword('');
        setDevPin('');
        setError('');
        setInfoMessage('');
    };

    const handleLoginSuccess = async (profileData) => {
        if (!profileData?.user_guid) {
            setError('Login succeeded but could not establish profile session.');
            return;
        }
        await refreshProfile(profileData.user_guid);
        auth.login();
        if (profileData.permission_group && profileData.permission_group.toLowerCase() !== 'customer') {
            navigateStaffUser(profileData);
        } else if (requestedProtectedPath) {
            navigate(requestedProtectedPath, { replace: true });
        } else {
            navigate('/', { replace: true });
        }
    };

    const handleSignInSubmit = async (event) => {
        event.preventDefault();
        setError('');
        setInfoMessage('');

        const trimmed = identifier.trim();
        if (!trimmed) {
            setError('Please enter your phone number or email.');
            return;
        }

        if (!signInPassword) {
            setError('Please enter your password.');
            return;
        }

        setLoading(true);
        try {
            const currentApiUrl = getResolvedBaseUrl();
            const response = await axios.post(`${currentApiUrl}/auth/login`, {
                identifier: trimmed,
                password: signInPassword
            });

            const data = response.data;

            if (data?.require_2fa || data?.requires_2fa) {
                setTwoFaData({
                    identifier: trimmed,
                    user_guid: data.user_guid,
                    customer_guid: data.customer_guid,
                    source: data.source,
                    masked_phone: data.masked_phone
                });
                setMaskedPhone(data.masked_phone || '');
                if (data.dev_pin) {
                    console.log('====================================================');
                    console.log(`📱 [DEV OTP CONSOLE] 🔐 6-DIGIT VERIFICATION PIN:`, data.dev_pin);
                    console.log(`   Account:`, trimmed);
                    console.log('====================================================');
                    setDevPin(data.dev_pin);
                }
                setSignInStep('verify_2fa');
                setVerificationOtp('');
                setInfoMessage(
                    data.message ||
                    `Credentials verified! Enter the 6-digit verification code sent to ${data.masked_phone ? data.masked_phone : 'your phone/email'}.`
                );
            } else if (data?.profile) {
                await handleLoginSuccess(data.profile);
            }
        } catch (err) {
            if (err?.response?.data?.is_first_time) {
                setSignInStep('staff_first_time');
                if (err.response.data.dev_pin) {
                    setDevPin(err.response.data.dev_pin);
                }
                if (err.response.data.masked_phone) {
                    setMaskedPhone(err.response.data.masked_phone);
                }
                setInfoMessage(err.response.data.error || 'Welcome! Please set up your password.');
            } else {
                setError(err?.response?.data?.error || 'Invalid email/phone or password. Please try again.');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleVerify2faSubmit = async (event) => {
        event.preventDefault();
        setError('');
        setInfoMessage('');

        const trimmedOtp = verificationOtp.trim();
        if (!trimmedOtp || trimmedOtp.length !== 6) {
            setError('Please enter the 6-digit verification code.');
            return;
        }

        setLoading(true);
        try {
            const currentApiUrl = getResolvedBaseUrl();
            const response = await axios.post(`${currentApiUrl}/auth/verify-2fa`, {
                identifier: twoFaData?.identifier || identifier.trim(),
                otp: trimmedOtp,
                user_guid: twoFaData?.user_guid,
                customer_guid: twoFaData?.customer_guid,
                source: twoFaData?.source
            });

            const profileData = response.data?.profile;
            if (profileData?.user_guid) {
                await handleLoginSuccess(profileData);
            } else {
                setError('Verification failed. Please try again.');
            }
        } catch (err) {
            setError(err?.response?.data?.error || 'Invalid or expired verification code. Please try again.');
        } finally {
            setLoading(false);
        }
    };


    const navigateStaffUser = (staffAccount) => {
        if (isTV) {
            navigate(`/${staffAccount.business}/PlayersMonitor`, { replace: true });
        } else if (requestedProtectedPath) {
            navigate(requestedProtectedPath, { replace: true });
        } else {
            navigate(`/${staffAccount.business || 'alpha_rentals'}`, { replace: true });
        }
    };

    const handleStaffFirstTimeSubmit = async (event) => {
        event.preventDefault();
        setError('');
        setInfoMessage('');

        if (!staffNewPassword) {
            setError('Please create a password.');
            return;
        }

        const strength = evaluatePasswordStrength(staffNewPassword);
        if (!strength.isValid) {
            setError(`Password requirement: ${strength.errors[0]}`);
            return;
        }

        if (staffNewPassword !== staffConfirmPassword) {
            setError('Passwords do not match. Please verify both passwords.');
            return;
        }

        if (!staffSetupOtp || staffSetupOtp.trim().length !== 6) {
            setError('Please enter the 6-digit verification code sent to your phone.');
            return;
        }

        setLoading(true);
        try {
            const currentApiUrl = getResolvedBaseUrl();
            const res = await axios.post(`${currentApiUrl}/auth/staff/setup-password`, {
                identifier: identifier.trim(),
                user_guid: authenticatedUser?.user_guid,
                password: staffNewPassword,
                otp: staffSetupOtp.trim()
            });

            const profileData = res.data?.profile || authenticatedUser;
            if (profileData?.user_guid) {
                await refreshProfile(profileData.user_guid);
                auth.login();
                navigateStaffUser(profileData);
            } else {
                setError('Could not complete setup. Please try again.');
            }
        } catch (err) {
            setError(err?.response?.data?.error || 'Unable to set password. Please check your verification code.');
        } finally {
            setLoading(false);
        }
    };

    const handleStaffPasswordSubmit = async (event) => {
        event.preventDefault();
        setError('');
        setInfoMessage('');

        if (!staffPassword) {
            setError('Please enter your password.');
            return;
        }

        setLoading(true);
        try {
            const currentApiUrl = getResolvedBaseUrl();
            const res = await axios.post(`${currentApiUrl}/auth/staff/login`, {
                identifier: identifier.trim(),
                password: staffPassword
            });

            if (res.data?.require_2fa || res.data?.requires_2fa) {
                setSignInStep('staff_2fa');
                setStaff2faOtp('');
                setMaskedPhone(res.data.masked_phone || maskedPhone);
                if (res.data.dev_pin) {
                    console.log('====================================================');
                    console.log(`📱 [DEV OTP CONSOLE] 🔐 6-DIGIT STAFF 2FA PIN:`, res.data.dev_pin);
                    console.log(`   Account:`, identifier);
                    console.log('====================================================');
                    setDevPin(res.data.dev_pin);
                }
                setInfoMessage(res.data.message || 'Password verified! Enter the 6-digit verification code sent to your phone.');
            } else if (res.data?.profile) {
                await refreshProfile(res.data.profile.user_guid);
                auth.login();
                navigateStaffUser(res.data.profile);
            }
        } catch (err) {
            if (err?.response?.data?.is_first_time) {
                setSignInStep('staff_first_time');
                setInfoMessage(err.response.data.error);
            } else {
                setError(err?.response?.data?.error || 'Invalid password. Please try again or reset your password.');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleStaff2faSubmit = async (event) => {
        event.preventDefault();
        setError('');
        setInfoMessage('');

        if (!staff2faOtp || staff2faOtp.trim().length !== 6) {
            setError('Please enter the 6-digit verification code.');
            return;
        }

        setLoading(true);
        try {
            const currentApiUrl = getResolvedBaseUrl();
            const res = await axios.post(`${currentApiUrl}/auth/staff/verify-2fa`, {
                identifier: identifier.trim(),
                user_guid: authenticatedUser?.user_guid,
                otp: staff2faOtp.trim()
            });

            const profileData = res.data?.profile || authenticatedUser;
            if (profileData?.user_guid) {
                await refreshProfile(profileData.user_guid);
                auth.login();
                navigateStaffUser(profileData);
            } else {
                setError('Verification failed. Please try again.');
            }
        } catch (err) {
            setError(err?.response?.data?.error || 'Invalid or expired verification code. Please try again.');
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

    const handleForgotPasswordRequest = async (targetIdent) => {
        const ident = (targetIdent || resetIdentifier || identifier).trim();
        if (!ident) {
            setError('Please enter your email address or phone number to reset your password.');
            return;
        }

        setResetIdentifier(ident);
        setError('');
        setInfoMessage('');
        setLoading(true);
        try {
            const currentApiUrl = getResolvedBaseUrl();
            const res = await axios.post(`${currentApiUrl}/auth/forgot-password`, {
                identifier: ident
            });

            setMaskedPhone(res.data?.masked_phone || '');
            setSignInStep('forgot_password');
            setResetStep('enter_code');
            setResetToken('');
            setResetOtp('');
            setResetNewPassword('');
            setResetConfirmPassword('');
            if (res.data?.dev_pin) {
                console.log('====================================================');
                console.log(`📱 [DEV OTP CONSOLE] 🔐 6-DIGIT PASSWORD RESET PIN:`, res.data.dev_pin);
                console.log(`   Account:`, ident);
                console.log('====================================================');
                setDevPin(res.data.dev_pin);
            }
            setInfoMessage(
                res.data?.message ||
                'A 6-digit verification code has been dispatched. Enter the code below to verify your identity.'
            );
        } catch (err) {
            setError(err?.response?.data?.error || 'Unable to request password reset. Please check your details and try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyResetCode = async (event) => {
        if (event) event.preventDefault();
        setError('');
        setInfoMessage('');

        const code = resetOtp.trim();
        if (!code || code.length !== 6) {
            setError('Please enter the 6-digit verification code.');
            return;
        }

        setLoading(true);
        try {
            const currentApiUrl = getResolvedBaseUrl();
            const res = await axios.post(`${currentApiUrl}/auth/verify-reset-code`, {
                identifier: resetIdentifier.trim(),
                otp: code
            });

            if (res.data?.reset_token) {
                setResetToken(res.data.reset_token);
            }
            setResetStep('set_password');
            setInfoMessage('Identity verified successfully! Please enter and confirm your new password below.');
        } catch (err) {
            setError(err?.response?.data?.error || 'Invalid or expired verification code. Please check the code and try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleResetPasswordSubmit = async (event) => {
        event.preventDefault();
        setError('');
        setInfoMessage('');

        if (!resetNewPassword) {
            setError('Please enter a new password.');
            return;
        }

        const strength = evaluatePasswordStrength(resetNewPassword);
        if (!strength.isValid) {
            setError(`Password requirement: ${strength.errors[0]}`);
            return;
        }

        if (resetNewPassword !== resetConfirmPassword) {
            setError('Passwords do not match. Please verify both passwords.');
            return;
        }

        setLoading(true);
        try {
            const currentApiUrl = getResolvedBaseUrl();
            const res = await axios.post(`${currentApiUrl}/auth/reset-password`, {
                identifier: resetIdentifier.trim(),
                otp: resetOtp.trim(),
                reset_token: resetToken,
                new_password: resetNewPassword
            });

            const loggedInProfile = res.data?.profile;
            if (loggedInProfile?.user_guid) {
                // Clear the reset form
                setDevPin('');
                setResetOtp('');
                setResetToken('');
                setResetStep('enter_code');
                setResetNewPassword('');
                setResetConfirmPassword('');

                // Immediately log in user without asking for password or verification code
                await handleLoginSuccess(loggedInProfile);
            } else {
                setInfoMessage(
                    res.data?.message || 'Password reset successfully! Please sign in with your new password.'
                );
                setDevPin('');
                setResetOtp('');
                setResetToken('');
                setResetStep('enter_code');
                setResetNewPassword('');
                setResetConfirmPassword('');
                setSignInStep('lookup');
                setIdentifier(resetIdentifier);
            }
        } catch (err) {
            setError(err?.response?.data?.error || 'Unable to reset password. Please verify your details and try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleResendOtp = async (purpose) => {
        let ident = (purpose === 'password_reset' ? resetIdentifier : (twoFaData?.identifier || identifier)).trim();
        let targetPurpose = purpose;
        if (purpose === 'verify_2fa' || purpose === '2fa') {
            targetPurpose = twoFaData?.source === 'customers' ? 'customer_2fa' : 'staff_2fa';
        }

        if (!ident) {
            setError('Identifier is missing. Please restart sign in.');
            return;
        }

        setError('');
        setLoading(true);
        try {
            const currentApiUrl = getResolvedBaseUrl();
            const res = await axios.post(`${currentApiUrl}/auth/resend-otp`, {
                identifier: ident,
                purpose: targetPurpose
            });
            if (res.data?.dev_pin) {
                console.log('====================================================');
                console.log(`📱 [DEV OTP CONSOLE] 🔐 6-DIGIT VERIFICATION PIN (${targetPurpose || 'verification'}):`, res.data.dev_pin);
                console.log(`   Account:`, ident);
                console.log('====================================================');
                setDevPin(res.data.dev_pin);
            }
            setInfoMessage(res.data?.message || 'A fresh 6-digit verification code has been dispatched.');
            if (res.data?.masked_phone) {
                setMaskedPhone(res.data.masked_phone);
            }
        } catch (err) {
            setError(err?.response?.data?.error || 'Could not resend code. Please try again.');
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

        const pwdStrength = evaluatePasswordStrength(signUpPassword);
        if (!pwdStrength.isValid) {
            setError(`Password requirement: ${pwdStrength.errors[0]}`);
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

    const formatCountdown = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    };

    return (
        <Card>
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
                            {signInStep === 'lookup' && (
                                <form className={classes.form} onSubmit={handleSignInSubmit}>
                                    <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '1rem' }}>
                                        <label htmlFor="identifier" style={{ fontWeight: '600', color: '#333', marginBottom: '0.4rem' }}>
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

                                    <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '1.5rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                                            <label htmlFor="signInPassword" style={{ fontWeight: '600', color: '#333' }}>
                                                Password:
                                            </label>
                                            <button
                                                type="button"
                                                onClick={() => handleForgotPasswordRequest(identifier)}
                                                disabled={loading}
                                                style={{ background: 'none', border: 'none', color: '#174b0f', fontSize: '0.84rem', fontWeight: 'bold', cursor: 'pointer', padding: 0 }}
                                            >
                                                Forgot Password?
                                            </button>
                                        </div>
                                        <PasswordInput
                                            id="signInPassword"
                                            placeholder="Enter your password"
                                            value={signInPassword}
                                            onChange={(e) => setSignInPassword(e.target.value)}
                                            disabled={loading}
                                            required
                                            style={{
                                                padding: '0.8rem',
                                                border: '1px solid #ccc',
                                                borderRadius: '6px',
                                                fontSize: '1rem'
                                            }}
                                        />
                                    </div>

                                    <div className={classes.buttonBar}>
                                        <Button type="submit" disabled={loading}>
                                            {loading ? 'Verifying...' : 'Sign In'}
                                        </Button>
                                    </div>
                                </form>
                            )}

                            {/* 2FA VERIFICATION CODE STEP (Shown only after correct email/phone + password) */}
                            {signInStep === 'verify_2fa' && (
                                <form className={classes.form} onSubmit={handleVerify2faSubmit}>
                                    <div style={{
                                        backgroundColor: '#f0fdf4',
                                        border: '1px solid #bbf7d0',
                                        color: '#166534',
                                        padding: '0.75rem',
                                        borderRadius: '6px',
                                        fontSize: '0.85rem',
                                        marginBottom: '1rem'
                                    }}>
                                        <strong>Two-Factor Verification:</strong> Enter the 6-digit verification code sent to {maskedPhone ? `(${maskedPhone})` : 'your registered phone/email'}.
                                    </div>

                                    {devPin && (
                                        <div style={{
                                            backgroundColor: '#ecfdf5',
                                            border: '1px solid #10b981',
                                            color: '#065f46',
                                            padding: '0.6rem 0.8rem',
                                            borderRadius: '6px',
                                            fontSize: '0.9rem',
                                            fontWeight: 'bold',
                                            marginBottom: '1rem',
                                            textAlign: 'center'
                                        }}>
                                            🔐 DEV PIN (CONSOLE LOGGED): <span style={{ fontSize: '1.2rem', letterSpacing: '2px', color: '#047857' }}>{devPin}</span>
                                        </div>
                                    )}

                                    <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '1.5rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                                            <label htmlFor="auth-verification-otp" style={{ fontWeight: '600', color: '#333' }}>
                                                6-Digit Verification Code:
                                            </label>
                                            <button
                                                type="button"
                                                onClick={() => handleResendOtp('verify_2fa')}
                                                disabled={loading}
                                                style={{ background: 'none', border: 'none', color: '#174b0f', fontSize: '0.82rem', fontWeight: 'bold', cursor: 'pointer', padding: 0 }}
                                            >
                                                Resend Code
                                            </button>
                                        </div>
                                        <input
                                            type="text"
                                            id="auth-verification-otp"
                                            maxLength={6}
                                            placeholder="123456"
                                            value={verificationOtp}
                                            onChange={(e) => setVerificationOtp(e.target.value.replace(/\D/g, ''))}
                                            disabled={loading}
                                            required
                                            autoFocus
                                            style={{
                                                padding: '0.8rem',
                                                border: '2px solid #174b0f',
                                                borderRadius: '6px',
                                                fontSize: '1.2rem',
                                                letterSpacing: '0.3rem',
                                                textAlign: 'center',
                                                width: '100%',
                                                boxSizing: 'border-box',
                                                fontWeight: 'bold'
                                            }}
                                        />
                                    </div>

                                    <div className={classes.buttonBar} style={{ flexDirection: 'column', gap: '10px' }}>
                                        <Button type="submit" disabled={loading}>
                                            {loading ? 'Verifying...' : 'Verify & Sign In'}
                                        </Button>
                                        <Button inverse type="button" onClick={handleBackToLookup} disabled={loading}>
                                            ← Back to Sign In
                                        </Button>
                                    </div>
                                </form>
                            )}

                            {/* STAFF FIRST-TIME SETUP */}
                            {signInStep === 'staff_first_time' && (
                                <form className={classes.form} onSubmit={handleStaffFirstTimeSubmit}>
                                    <div style={{
                                        backgroundColor: '#f0fdf4',
                                        border: '1px solid #bbf7d0',
                                        color: '#166534',
                                        padding: '0.75rem',
                                        borderRadius: '6px',
                                        fontSize: '0.85rem',
                                        marginBottom: '1rem'
                                    }}>
                                        <strong>First-Time Staff Setup:</strong> Create a strong password and enter the 6-digit code sent to your phone {maskedPhone ? `(${maskedPhone})` : ''}.
                                    </div>

                                    {devPin && (
                                        <div style={{
                                            backgroundColor: '#ecfdf5',
                                            border: '1px solid #10b981',
                                            color: '#065f46',
                                            padding: '0.6rem 0.8rem',
                                            borderRadius: '6px',
                                            fontSize: '0.9rem',
                                            fontWeight: 'bold',
                                            marginBottom: '1rem',
                                            textAlign: 'center'
                                        }}>
                                            🔐 DEV PIN (CONSOLE LOGGED): <span style={{ fontSize: '1.2rem', letterSpacing: '2px', color: '#047857' }}>{devPin}</span>
                                        </div>
                                    )}

                                    <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '1rem' }}>
                                        <label htmlFor="auth-staff-new-pwd" style={{ fontWeight: '600', marginBottom: '0.35rem', color: '#333' }}>
                                            New Password *
                                        </label>
                                        <PasswordInput
                                            id="auth-staff-new-pwd"
                                            placeholder="Create strong password"
                                            value={staffNewPassword}
                                            onChange={(e) => setStaffNewPassword(e.target.value)}
                                            disabled={loading}
                                            required
                                            style={{ padding: '0.8rem', border: '1px solid #ccc', borderRadius: '6px', fontSize: '1rem' }}
                                        />
                                        <PasswordStrengthChecklist password={staffNewPassword} />
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '1rem' }}>
                                        <label htmlFor="auth-staff-confirm-pwd" style={{ fontWeight: '600', marginBottom: '0.35rem', color: '#333' }}>
                                            Confirm Password *
                                        </label>
                                        <PasswordInput
                                            id="auth-staff-confirm-pwd"
                                            placeholder="Confirm password"
                                            value={staffConfirmPassword}
                                            onChange={(e) => setStaffConfirmPassword(e.target.value)}
                                            disabled={loading}
                                            required
                                            style={{ padding: '0.8rem', border: '1px solid #ccc', borderRadius: '6px', fontSize: '1rem' }}
                                        />
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '1.5rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                                            <label htmlFor="auth-staff-setup-otp" style={{ fontWeight: '600', color: '#333' }}>
                                                6-Digit Verification Code *
                                            </label>
                                            <button
                                                type="button"
                                                onClick={() => handleResendOtp('staff_first_time')}
                                                disabled={loading}
                                                style={{ background: 'none', border: 'none', color: '#174b0f', fontSize: '0.82rem', fontWeight: 'bold', cursor: 'pointer', padding: 0 }}
                                            >
                                                Resend Code
                                            </button>
                                        </div>
                                        <input
                                            type="text"
                                            id="auth-staff-setup-otp"
                                            maxLength={6}
                                            placeholder="123456"
                                            value={staffSetupOtp}
                                            onChange={(e) => setStaffSetupOtp(e.target.value.replace(/\D/g, ''))}
                                            disabled={loading}
                                            required
                                            style={{
                                                padding: '0.8rem',
                                                border: '2px solid #174b0f',
                                                borderRadius: '6px',
                                                fontSize: '1.2rem',
                                                letterSpacing: '0.3rem',
                                                textAlign: 'center',
                                                width: '100%',
                                                boxSizing: 'border-box',
                                                fontWeight: 'bold'
                                            }}
                                        />
                                    </div>

                                    <div className={classes.buttonBar} style={{ flexDirection: 'column', gap: '10px' }}>
                                        <Button type="submit" disabled={loading}>
                                            {loading ? 'Setting Password...' : 'Save Password & Sign In'}
                                        </Button>
                                        <Button inverse type="button" onClick={handleBackToLookup} disabled={loading}>
                                            Back
                                        </Button>
                                    </div>
                                </form>
                            )}

                            {/* STAFF PASSWORD */}
                            {signInStep === 'staff_password' && (
                                <form className={classes.form} onSubmit={handleStaffPasswordSubmit}>
                                    <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '1.5rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                                            <label htmlFor="auth-staff-password" style={{ fontWeight: '600', color: '#333' }}>
                                                Staff Password:
                                            </label>
                                            <button
                                                type="button"
                                                onClick={() => handleForgotPasswordRequest(identifier)}
                                                disabled={loading}
                                                style={{ background: 'none', border: 'none', color: '#174b0f', fontSize: '0.82rem', fontWeight: 'bold', cursor: 'pointer', padding: 0 }}
                                            >
                                                Forgot Password?
                                            </button>
                                        </div>
                                        <PasswordInput
                                            id="auth-staff-password"
                                            placeholder="Enter your password"
                                            value={staffPassword}
                                            onChange={(e) => setStaffPassword(e.target.value)}
                                            disabled={loading}
                                            required
                                            style={{
                                                padding: '0.8rem',
                                                border: '1px solid #ccc',
                                                borderRadius: '6px',
                                                fontSize: '1rem'
                                            }}
                                        />
                                    </div>

                                    <div className={classes.buttonBar} style={{ flexDirection: 'column', gap: '10px' }}>
                                        <Button type="submit" disabled={loading}>
                                            {loading ? 'Verifying...' : 'Continue'}
                                        </Button>
                                        <Button inverse type="button" onClick={handleBackToLookup} disabled={loading}>
                                            Back
                                        </Button>
                                    </div>
                                </form>
                            )}

                            {/* STAFF 2FA */}
                            {signInStep === 'staff_2fa' && (
                                <form className={classes.form} onSubmit={handleStaff2faSubmit}>
                                    <div style={{
                                        backgroundColor: '#f0fdf4',
                                        border: '1px solid #bbf7d0',
                                        color: '#166534',
                                        padding: '0.75rem',
                                        borderRadius: '6px',
                                        fontSize: '0.85rem',
                                        marginBottom: '1rem'
                                    }}>
                                        <strong>Two-Factor Authentication:</strong> Enter the 6-digit code sent to your phone {maskedPhone ? `(${maskedPhone})` : ''}.
                                    </div>

                                    {devPin && (
                                        <div style={{
                                            backgroundColor: '#ecfdf5',
                                            border: '1px solid #10b981',
                                            color: '#065f46',
                                            padding: '0.6rem 0.8rem',
                                            borderRadius: '6px',
                                            fontSize: '0.9rem',
                                            fontWeight: 'bold',
                                            marginBottom: '1rem',
                                            textAlign: 'center'
                                        }}>
                                            🔐 DEV PIN (CONSOLE LOGGED): <span style={{ fontSize: '1.2rem', letterSpacing: '2px', color: '#047857' }}>{devPin}</span>
                                        </div>
                                    )}

                                    <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '1.5rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                                            <label htmlFor="auth-staff-2fa-otp" style={{ fontWeight: '600', color: '#333' }}>
                                                6-Digit Verification Code:
                                            </label>
                                            <button
                                                type="button"
                                                onClick={() => handleResendOtp('staff_2fa')}
                                                disabled={loading}
                                                style={{ background: 'none', border: 'none', color: '#174b0f', fontSize: '0.82rem', fontWeight: 'bold', cursor: 'pointer', padding: 0 }}
                                            >
                                                Resend Code
                                            </button>
                                        </div>
                                        <input
                                            type="text"
                                            id="auth-staff-2fa-otp"
                                            maxLength={6}
                                            placeholder="123456"
                                            value={staff2faOtp}
                                            onChange={(e) => setStaff2faOtp(e.target.value.replace(/\D/g, ''))}
                                            disabled={loading}
                                            required
                                            style={{
                                                padding: '0.8rem',
                                                border: '2px solid #174b0f',
                                                borderRadius: '6px',
                                                fontSize: '1.2rem',
                                                letterSpacing: '0.3rem',
                                                textAlign: 'center',
                                                width: '100%',
                                                boxSizing: 'border-box',
                                                fontWeight: 'bold'
                                            }}
                                        />
                                    </div>

                                    <div className={classes.buttonBar} style={{ flexDirection: 'column', gap: '10px' }}>
                                        <Button type="submit" disabled={loading}>
                                            {loading ? 'Verifying...' : 'Verify & Sign In'}
                                        </Button>
                                        <Button inverse type="button" onClick={() => setSignInStep('staff_password')} disabled={loading}>
                                            Back to Password
                                        </Button>
                                    </div>
                                </form>
                            )}

                            {/* CUSTOMER PASSWORD */}
                            {signInStep === 'customer_password' && (
                                <form className={classes.form} onSubmit={handleCustomerPasswordSubmit}>
                                    <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '1.5rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                                            <label htmlFor="customer-password" style={{ fontWeight: '600', color: '#333' }}>
                                                {customerHasPassword ? 'Password:' : 'Create Password:'}
                                            </label>
                                            {customerHasPassword && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleForgotPasswordRequest(identifier)}
                                                    disabled={loading}
                                                    style={{ background: 'none', border: 'none', color: '#174b0f', fontSize: '0.82rem', fontWeight: 'bold', cursor: 'pointer', padding: 0 }}
                                                >
                                                    Forgot Password?
                                                </button>
                                            )}
                                        </div>
                                        <PasswordInput
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
                                                fontSize: '1rem'
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

                            {/* FORGOT PASSWORD */}
                            {signInStep === 'forgot_password' && (
                                <div className={classes.form}>
                                    {/* Multi-step progress indicator */}
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '8px',
                                        marginBottom: '1rem',
                                        fontSize: '0.85rem'
                                    }}>
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            padding: '4px 10px',
                                            borderRadius: '16px',
                                            backgroundColor: resetStep === 'enter_code' ? '#174b0f' : '#dcfce7',
                                            color: resetStep === 'enter_code' ? '#ffffff' : '#166534',
                                            fontWeight: 700
                                        }}>
                                            <span>{resetStep === 'set_password' ? '✓' : '1'}</span>
                                            <span>Verify Identity</span>
                                        </div>
                                        <span style={{ color: '#94a3b8', fontWeight: 'bold' }}>&rarr;</span>
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            padding: '4px 10px',
                                            borderRadius: '16px',
                                            backgroundColor: resetStep === 'set_password' ? '#174b0f' : '#f1f5f9',
                                            color: resetStep === 'set_password' ? '#ffffff' : '#64748b',
                                            fontWeight: resetStep === 'set_password' ? 700 : 500
                                        }}>
                                            <span>2</span>
                                            <span>Set New Password</span>
                                        </div>
                                    </div>

                                    {/* STEP 1: VERIFY CODE (New Password and Confirm Password remain HIDDEN!) */}
                                    {resetStep === 'enter_code' && (
                                        <form onSubmit={handleVerifyResetCode}>
                                            <div style={{
                                                backgroundColor: '#fef3c7',
                                                border: '1px solid #fde68a',
                                                color: '#92400e',
                                                padding: '0.75rem',
                                                borderRadius: '6px',
                                                fontSize: '0.85rem',
                                                marginBottom: '1rem'
                                            }}>
                                                <strong>Step 1 of 2:</strong> Enter the 6-digit code sent to {maskedPhone ? `(${maskedPhone})` : (resetIdentifier || 'your phone/email')} to verify your identity.
                                            </div>

                                            {devPin && (
                                                <div style={{
                                                    backgroundColor: '#ecfdf5',
                                                    border: '1px solid #10b981',
                                                    color: '#065f46',
                                                    padding: '0.6rem 0.8rem',
                                                    borderRadius: '6px',
                                                    fontSize: '0.9rem',
                                                    fontWeight: 'bold',
                                                    marginBottom: '1rem',
                                                    textAlign: 'center'
                                                }}>
                                                    🔐 DEV PIN (CONSOLE LOGGED): <span style={{ fontSize: '1.2rem', letterSpacing: '2px', color: '#047857' }}>{devPin}</span>
                                                </div>
                                            )}

                                            <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '1.25rem' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                                                    <label htmlFor="auth-reset-otp" style={{ fontWeight: '600', color: '#333' }}>
                                                        6-Digit Reset Code *
                                                    </label>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleResendOtp('password_reset')}
                                                        disabled={loading}
                                                        style={{ background: 'none', border: 'none', color: '#174b0f', fontSize: '0.82rem', fontWeight: 'bold', cursor: 'pointer', padding: 0 }}
                                                    >
                                                        Resend Code
                                                    </button>
                                                </div>
                                                <input
                                                    type="text"
                                                    id="auth-reset-otp"
                                                    maxLength={6}
                                                    placeholder="123456"
                                                    value={resetOtp}
                                                    onChange={(e) => setResetOtp(e.target.value.replace(/\D/g, ''))}
                                                    disabled={loading}
                                                    required
                                                    autoFocus
                                                    style={{
                                                        padding: '0.8rem',
                                                        border: '2px solid #b45309',
                                                        borderRadius: '6px',
                                                        fontSize: '1.2rem',
                                                        letterSpacing: '0.3rem',
                                                        textAlign: 'center',
                                                        width: '100%',
                                                        boxSizing: 'border-box',
                                                        fontWeight: 'bold'
                                                    }}
                                                />
                                            </div>

                                            <div className={classes.buttonBar} style={{ flexDirection: 'column', gap: '10px' }}>
                                                <Button type="submit" disabled={loading || resetOtp.length !== 6}>
                                                    {loading ? 'Verifying Code...' : 'Verify Code'}
                                                </Button>
                                                <Button inverse type="button" onClick={handleBackToLookup} disabled={loading}>
                                                    Back to Sign In
                                                </Button>
                                            </div>
                                        </form>
                                    )}

                                    {/* STEP 2: SET NEW PASSWORD (Revealed ONLY after identity verification!) */}
                                    {resetStep === 'set_password' && (
                                        <form onSubmit={handleResetPasswordSubmit}>
                                            <div style={{
                                                backgroundColor: '#f0fdf4',
                                                border: '1px solid #bbf7d0',
                                                color: '#166534',
                                                padding: '0.75rem',
                                                borderRadius: '6px',
                                                fontSize: '0.85rem',
                                                marginBottom: '1rem',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '8px'
                                            }}>
                                                <span style={{ fontSize: '1.2rem' }}>✓</span>
                                                <div>
                                                    <strong>Identity Verified!</strong> Please enter and confirm your new password below (cannot be your last password).
                                                </div>
                                            </div>

                                            <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '1rem' }}>
                                                <label htmlFor="auth-reset-new-pwd" style={{ fontWeight: '600', marginBottom: '0.35rem', color: '#333' }}>
                                                    New Password *
                                                </label>
                                                <PasswordInput
                                                    id="auth-reset-new-pwd"
                                                    placeholder="Enter new strong password"
                                                    value={resetNewPassword}
                                                    onChange={(e) => setResetNewPassword(e.target.value)}
                                                    disabled={loading}
                                                    required
                                                    autoFocus
                                                    style={{ padding: '0.8rem', border: '1px solid #ccc', borderRadius: '6px', fontSize: '1rem' }}
                                                />
                                                <PasswordStrengthChecklist password={resetNewPassword} />
                                            </div>

                                            <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '1.5rem' }}>
                                                <label htmlFor="auth-reset-confirm-pwd" style={{ fontWeight: '600', marginBottom: '0.35rem', color: '#333' }}>
                                                    Confirm New Password *
                                                </label>
                                                <PasswordInput
                                                    id="auth-reset-confirm-pwd"
                                                    placeholder="Confirm new password"
                                                    value={resetConfirmPassword}
                                                    onChange={(e) => setResetConfirmPassword(e.target.value)}
                                                    disabled={loading}
                                                    required
                                                    style={{ padding: '0.8rem', border: '1px solid #ccc', borderRadius: '6px', fontSize: '1rem' }}
                                                />
                                            </div>

                                            <div className={classes.buttonBar} style={{ flexDirection: 'column', gap: '10px' }}>
                                                <Button type="submit" disabled={loading}>
                                                    {loading ? 'Resetting Password...' : 'Reset Password'}
                                                </Button>
                                                <Button inverse type="button" onClick={handleBackToLookup} disabled={loading}>
                                                    Back to Sign In
                                                </Button>
                                            </div>
                                        </form>
                                    )}
                                </div>
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
                                        placeholder="First Name"
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
                                        placeholder="Last Name"
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
                                    placeholder="name@example.com"
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
                                    placeholder="(555) 000-0000"
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
                                <PasswordInput
                                    placeholder="Create strong password"
                                    value={signUpPassword}
                                    onChange={(e) => setSignUpPassword(e.target.value)}
                                    required
                                    disabled={loading}
                                    style={{ padding: '0.65rem', border: '1px solid #ccc', borderRadius: '6px' }}
                                />
                                <PasswordStrengthChecklist password={signUpPassword} />
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
