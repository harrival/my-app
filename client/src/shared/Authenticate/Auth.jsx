import React, { useState, useContext } from 'react';
import { AuthContext } from '../Context/auth-context';
import { useUserProfile } from '../Context/UserProfileContext';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { BASE_URL } from '../../shared/Utils/apiConfig';
import Card from '../../UI/Card/Card';
import Button from '../../UI/Button/Button';
import classes from './Auth.module.scss';

const MAX_OTP_ATTEMPTS = 3;

const AuthenticateUser = () => {
    const auth = useContext(AuthContext);
    const { profile, setProfile, refreshProfile } = useUserProfile();
    const navigate = useNavigate();

    const [phoneNumber, setPhoneNumber] = useState('+1 ');
    const [step, setStep] = useState(1); // 1: phone input, 2: OTP input
    const [generatedOtp, setGeneratedOtp] = useState('');
    const [otpInput, setOtpInput] = useState('');
    const [error, setError] = useState('');
    const [infoMessage, setInfoMessage] = useState('');
    const [authenticatedUser, setAuthenticatedUser] = useState(null);
    const [otpAttempts, setOtpAttempts] = useState(0);
    const [loading, setLoading] = useState(false);

    const handlePhoneSubmit = async (event) => {
        event.preventDefault();
        setError('');
        setInfoMessage('');

        // Extract 10-digit number from input
        const clean = phoneNumber.replace(/\D/g, '');
        const dbPhone = clean.length === 11 && clean.startsWith('1') ? clean.substring(1) : clean;

        if (dbPhone.length !== 10) {
            setError('Please enter a valid 10-digit phone number.');
            return;
        }

        setLoading(true);
        try {
            const response = await axios.get(`${BASE_URL}/getAll`, {
                params: {
                    tableName: 'users_table',
                    phone_number: dbPhone
                }
            });

            if (response.data && response.data.length > 0) {
                setAuthenticatedUser(response.data[0]);
                // Generate 6 digit random number
                const otp = Math.floor(100000 + Math.random() * 900000).toString();
                setGeneratedOtp(otp);
                console.log('--- GENERATED OTP CODE ---');
                console.log(`OTP: ${otp}`);
                console.log('--------------------------');

                setOtpAttempts(0);
                setStep(2);
                setInfoMessage('Verification code generated. Please check your console.');
            } else {
                setError('Phone number not found in our records.');
            }
        } catch (err) {
            console.error('Error verifying phone number:', err);
            setError('An error occurred. Please try again.');
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
            // Store active profile on server
            await axios.post(`${BASE_URL}/profile/${authenticatedUser.user_guid}`, authenticatedUser);

            // Navigate first, THEN flip isLoggedIn — otherwise the route tree
            // switches and this component unmounts before navigate() executes
            await refreshProfile(authenticatedUser.user_guid);
            navigate('/', { replace: true });
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
                await axios.post(`${BASE_URL}/profile/${profile.user_guid}`, {});
            }
        } catch (err) {
            console.error('Error clearing profile on server:', err);
        } finally {
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

    const isLocked = otpAttempts >= MAX_OTP_ATTEMPTS;

    return (
        <Card>
            <h2 className={classes.authentication}>Authentication Required</h2>
            <hr style={{ marginBottom: '1.5rem', borderColor: '#ccc' }} />

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

                    {step === 1 && (
                        <form className={classes.form} onSubmit={handlePhoneSubmit}>
                            <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '1.5rem' }}>
                                <label htmlFor="phone" style={{ fontWeight: '600', marginBottom: '0.5rem', color: '#333' }}>
                                    Phone Number:
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
                                    Default country code is USA (+1)
                                </span>
                            </div>

                            <div className={classes.buttonBar}>
                                <Button type="submit" disabled={loading}>
                                    {loading ? 'Sending...' : 'Send Code'}
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
        </Card>
    );
};

export default AuthenticateUser;
