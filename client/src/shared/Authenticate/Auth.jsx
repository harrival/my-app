import React, { useState, useContext, useEffect } from 'react';
import { AuthContext } from '../Context/auth-context';
import { useUserProfile } from '../Context/UserProfileContext';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { BASE_URL } from '../../shared/Utils/apiConfig';
import Card from '../../UI/Card/Card';
import Button from '../../UI/Button/Button';
import classes from './Auth.module.scss';

const AuthenticateUser = () => {
    const auth = useContext(AuthContext);
    const { setProfile } = useUserProfile();
    const navigate = useNavigate();

    const [phoneNumber, setPhoneNumber] = useState('+1 ');
    const [step, setStep] = useState(1); // 1: phone input, 2: OTP input
    const [generatedOtp, setGeneratedOtp] = useState('');
    const [otpInput, setOtpInput] = useState('');
    const [error, setError] = useState('');
    const [infoMessage, setInfoMessage] = useState('');
    const [authenticatedUser, setAuthenticatedUser] = useState(null);



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

                setStep(2);
                setInfoMessage('Verification code generated. Please check your console.');
            } else {
                setError('Phone number not found in our records.');
            }
        } catch (err) {
            console.error('Error verifying phone number:', err);
            setError('An error occurred. Please try again.');
        }
    };

    const handleOtpSubmit = async (event) => {
        event.preventDefault();
        setError('');

        if (otpInput === generatedOtp) {
            try {
                // Store on server
                await axios.post(`${BASE_URL}/profile/${authenticatedUser.user_guid}`, authenticatedUser);

                // Store session to expire in 10 hours (10 * 60 * 60 * 1000 ms)
                const expiryTime = Date.now() + 10 * 60 * 60 * 1000;
                localStorage.setItem(
                    'userSession',
                    JSON.stringify({
                        loggedIn: true,
                        expiresAt: expiryTime,
                        userGuid: authenticatedUser.user_guid,
                        business: authenticatedUser.business,
                        permissionGroup: authenticatedUser.permission_group
                    })
                );

                // Log user in
                setProfile(authenticatedUser);
                auth.login();
                navigate('/', { replace: true });
            } catch (err) {
                console.error('Error storing profile on server:', err);
                setError('Failed to log in on server. Please try again.');
            }
        } else {
            setError('Incorrect 6-digit verification code. Please try again.');
        }
    };

    const handleSignOut = async () => {
        try {
            const sessionStr = localStorage.getItem('userSession');
            if (sessionStr) {
                const session = JSON.parse(sessionStr);
                if (session.userGuid) {
                    await axios.post(`${BASE_URL}/profile/${session.userGuid}`, {});
                }
            }
        } catch (err) {
            console.error('Error clearing profile on server:', err);
        }
        setProfile(null);
        auth.logout();
    };

    const handleBackToPhone = () => {
        setStep(1);
        setOtpInput('');
        setGeneratedOtp('');
        setError('');
        setInfoMessage('');
    };

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
                        <Button onClick={handleSignOut}>Sign Out</Button>
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
                                <Button type="submit">Send Code</Button>
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
                                    required
                                    style={{
                                        padding: '0.8rem',
                                        border: '2px solid #007bff',
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
                                <Button type="submit">Verify & Login</Button>
                                <Button inverse type="button" onClick={handleBackToPhone}>
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
