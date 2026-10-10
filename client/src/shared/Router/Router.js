import React, { useContext } from 'react';
import { AuthContext } from '../Context/auth-context';
import { useUserProfile } from '../Context/UserProfileContext';
import { Routes, Route, Navigate } from 'react-router-dom';
import InProgressPlayers from '../../GamePlayers/Components/InProgressPlayers';
import Home from '../../user/Home';
import AuthenticateUser from '../Authenticate/Auth';
import ProfilePage from '../../user/Profile';
import PlayerBuilder from '../../GamePlayers/Components/PlayerBuilder';
import DailyPlayers from '../../GamePlayers/Components/DailyPlayers';
import PlayersMonitor from '../../GamePlayers/Components/PlayersMonitor';
import BusinessManager from '../../GamePlayers/Components/BusinessManager';
import PlayerScanner from '../../GamePlayers/Components/PlayerScanner';

const Router = () => {
    const auth = useContext(AuthContext);
    const { profile, loading, isTV } = useUserProfile();
    let routes;

    if (auth.isLoggedIn && loading) {
        return (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
                <p>Loading session...</p>
            </div>
        );
    }

    const business = profile?.business || "non_business";
    const permissionGroup = profile?.permission_group || null;
    const isAgent = !isTV && (permissionGroup === 'Agent' || Boolean(profile?.rep_id));

    if (auth.isLoggedIn) {
        if (isTV) {
            // TV devices are restricted exclusively to PlayersMonitor
            routes = (
                <>
                    <Route path="/:business/PlayersMonitor" element={<PlayersMonitor />} />
                    <Route path="/PlayersMonitor" element={<Navigate to={`/${business}/PlayersMonitor`} replace />} />
                    <Route path="*" element={<Navigate to={`/${business}/PlayersMonitor`} replace />} />
                </>
            );
        } else {
            routes = (
                <>
                    <Route path="/" element={<Navigate to={`/${business}`} replace />} />
                    <Route path="/:business" element={
                        permissionGroup === 'Agent' ? <PlayerBuilder /> : <BusinessManager />
                    } />

                    {/* Prefix business to all sub-routes */}
                    <Route path="/:business/Home" element={<Home />} />
                    <Route path="/:business/InProgressPlayers" element={<InProgressPlayers />} />
                    <Route path="/:business/DailyPlayers" element={<DailyPlayers />} />
                    <Route path="/:business/Profile" element={<ProfilePage />} />
                    <Route path="/:business/PlayerBuilder" element={<PlayerBuilder />} />
                    {isAgent && (
                        <Route path="/:business/PlayerScanner" element={<PlayerScanner />} />
                    )}
                    <Route path="/:business/PlayersMonitor" element={<PlayersMonitor />} />
                    {permissionGroup !== 'Agent' && (
                        <Route path="/:business/BusinessManager" element={<BusinessManager />} />
                    )}

                    {/* Fallbacks for non-prefixed urls to redirect to prefixed versions */}
                    <Route path="/Home" element={<Navigate to={`/${business}/Home`} replace />} />
                    <Route path="/InProgressPlayers" element={<Navigate to={`/${business}/InProgressPlayers`} replace />} />
                    <Route path="/DailyPlayers" element={<Navigate to={`/${business}/DailyPlayers`} replace />} />
                    <Route path="/Profile" element={<Navigate to={`/${business}/Profile`} replace />} />
                    <Route path="/PlayerBuilder" element={<Navigate to={`/${business}/PlayerBuilder`} replace />} />
                    {isAgent && (
                        <Route path="/PlayerScanner" element={<Navigate to={`/${business}/PlayerScanner`} replace />} />
                    )}
                    <Route path="/PlayersMonitor" element={<Navigate to={`/${business}/PlayersMonitor`} replace />} />
                    {permissionGroup !== 'Agent' && (
                        <Route path="/BusinessManager" element={<Navigate to={`/${business}/BusinessManager`} replace />} />
                    )}
                    <Route path="/Auth" element={<Navigate to={`/${business}`} replace />} />

                    <Route path="*" element={<Navigate to={`/${business}`} replace />} />
                </>
            );
        }
    } else {
        routes = (
            <>
                <Route path="/Auth" element={<AuthenticateUser />} />
                <Route path="*" element={<Navigate to="/Auth" replace />} />
            </>
        );
    }

    return (
        <Routes>
            {routes}
        </Routes>
    );
}

export default Router;