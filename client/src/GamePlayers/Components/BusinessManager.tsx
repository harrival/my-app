import React, { useEffect, useState } from 'react';
import { fetchBusinessInfo } from '../../shared/Utils/businessInfo';
import { useNavigate } from 'react-router-dom';
import classes from '../Styles/Admin.module.css';
import Reps from './Reps';
import Events from './Events';
import Users from './Users';
import NumberQue from './NumberQue';
import Configuration from './Configuration';
import BusinessInfo from './BusinessInfo';
import { useUserProfile } from '../../shared/Context/UserProfileContext';
import { canConfigure } from '../../shared/Utils/permissions';

const Admin: React.FC = () => {
    const [activeTable, setActiveTable] = useState<string | null>(null);
    const { profile } = useUserProfile();
    const navigate = useNavigate();
    const business = profile?.business || 'non_business';
    const [businessName, setBusinessName] = useState<string>('');

    useEffect(() => {
        if (!profile?.business) return;
        fetchBusinessInfo(profile.business, profile.user_guid)
            .then(info => setBusinessName(info?.business_name || ''))
            .catch(() => {});
    }, [profile?.business, profile?.user_guid, activeTable]);

    if (activeTable === 'reps') {
        return <Reps onBack={() => setActiveTable(null)} />;
    }

    if (activeTable === 'users') {
        return <Users onBack={() => setActiveTable(null)} />;
    }

    if (activeTable === 'events') {
        return <Events onBack={() => setActiveTable(null)} />;
    }

    if (activeTable === 'businessInfo') {
        return <BusinessInfo onBack={() => setActiveTable(null)} />;
    }

    if (activeTable === 'que') {
        return <NumberQue onBack={() => setActiveTable(null)} />;
    }

    if (activeTable === 'config') {
        return (
            <div>
                <div style={{ maxWidth: '980px', margin: '12px auto 0', padding: '0 20px' }}>
                    <button
                        type="button"
                        className={classes.adminButton}
                        style={{ padding: '8px 16px', width: 'auto' }}
                        onClick={() => setActiveTable(null)}
                    >
                        ← Back to Admin Panel
                    </button>
                </div>
                <Configuration />
            </div>
        );
    }

    return (
        <div className={classes.adminPanel}>
            <h1>Admin Panel ({businessName || business})</h1>
            <div className={classes.buttonGrid}>
                <button
                    className={classes.adminButton}
                    type="button"
                    onClick={() => setActiveTable('businessInfo')}
                >
                    Business Info
                </button>
                <button 
                    className={classes.adminButton} 
                    type="button"
                    onClick={() => setActiveTable('users')}
                >
                    Users...
                </button>
                <button 
                    className={classes.adminButton} 
                    type="button"
                    onClick={() => setActiveTable('events')}
                >
                    Event table
                </button>
                <button className={classes.adminButton} type="button">Puzzle type</button>
                <button 
                    className={classes.adminButton} 
                    type="button"
                    onClick={() => setActiveTable('reps')}
                >
                    Reps table
                </button>
                <button 
                    className={classes.adminButton} 
                    type="button"
                    onClick={() => setActiveTable('que')}
                >
                    Que number table
                </button>
                {canConfigure(profile) && (
                    <button
                        className={classes.adminButton}
                        type="button"
                        onClick={() => setActiveTable('config')}
                    >
                        Printer Config
                    </button>
                )}
                <button
                    className={classes.adminButton}
                    type="button"
                    onClick={() => navigate(`/admin/${encodeURIComponent(business)}`)}
                >
                    Supervisor Control Panel
                </button>
                <button
                    className={classes.adminButton}
                    type="button"
                    onClick={() => navigate(`/book/${encodeURIComponent(business)}`)}
                >
                    Booking Portal
                </button>
            </div>
        </div>
    );
};

export default Admin;