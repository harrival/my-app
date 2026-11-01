import React from 'react';
import Card from '../UI/Card/Card';
import { useUserProfile } from '../shared/Context/UserProfileContext';

const ProfilePage = () => {
    const { profile, hasProfile, loading, isElevatedStaff } = useUserProfile();

    if (loading) {
        return (
            <Card>
                <div style={{ textAlign: 'center', padding: '2rem' }}>
                    <p>Loading profile...</p>
                </div>
            </Card>
        );
    }

    const firstName = profile?.first_name || profile?.firstname || '';
    const lastName = profile?.last_name || profile?.lastname || '';
    const email = profile?.email || '';
    const phoneNumber = profile?.phone_number || profile?.phoneNumber || '';
    const address = profile?.address || '';
    const business = profile?.business || '';

    return (
        <>
            <Card>
                {hasProfile ? (
                    <div>
                        <h2>Welcome back, {firstName}!</h2>
                        <div style={{ marginTop: '1.5rem', lineHeight: '2' }}>
                            <p><strong>Full Name:</strong> {firstName} {lastName}</p>
                            <p><strong>Email:</strong> {email || '—'}</p>
                            <p><strong>Phone Number:</strong> {phoneNumber || '—'}</p>
                            {address && <p><strong>Address:</strong> {address}</p>}
                            {isElevatedStaff && business && (
                                <p>
                                    <strong>Location:</strong>{' '}
                                    <span style={{ color: '#28a745', fontWeight: 'bold' }}>{business}</span>
                                </p>
                            )}
                        </div>
                    </div>
                ) : (
                    <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
                        <h2>No Active Profile</h2>
                        <p style={{ color: '#666', marginTop: '0.5rem' }}>
                            Please sign in to view your profile details.
                        </p>
                    </div>
                )}
            </Card>
        </>
    );
};

export default ProfilePage;
