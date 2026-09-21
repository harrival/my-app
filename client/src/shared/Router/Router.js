import React, { useContext } from 'react';
import { AuthContext } from '../Context/auth-context';
import { useUserProfile } from '../Context/UserProfileContext';
import { Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from '../../dashboard/pages/Dashboard';
import InProgressPlayers from '../../GamePlayers/Components/InProgressPlayers';
import Home from '../../user/Home';
import AuthenticateUser from '../Authenticate/Auth';
import ProfilePage from '../../user/Profile';
import PlayerBuilder from '../../GamePlayers/Components/PlayerBuilder';
import DailyPlayers from '../../GamePlayers/Components/DailyPlayers';
import TvDisplay from '../../GamePlayers/Components/TvDisplay';
import BusinessManager from '../../GamePlayers/Components/BusinessManager';
import Stopwatch from '../../GamePlayers/Components/Stopwatch';

const Router = () => {
    const auth = useContext(AuthContext);
    const { profile, loading } = useUserProfile();
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

    // Determine if accessing from another device (e.g. mobile, tablet, or smaller viewport)
    const isAnotherDevice = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || window.innerWidth < 1024;

    if (auth.isLoggedIn) {
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
                <Route path="/:business/tvdisplay" element={<TvDisplay />} />
                {permissionGroup !== 'Agent' && (
                    <Route path="/:business/BusinessManager" element={<BusinessManager />} />
                )}
                <Route
                    path="/:business/stopwatch"
                    element={isAnotherDevice ? <Stopwatch /> : <Navigate to={`/${business}`} replace />}
                />

                {/* Fallbacks for non-prefixed urls to redirect to prefixed versions */}
                <Route path="/Home" element={<Navigate to={`/${business}/Home`} replace />} />
                <Route path="/InProgressPlayers" element={<Navigate to={`/${business}/InProgressPlayers`} replace />} />
                <Route path="/DailyPlayers" element={<Navigate to={`/${business}/DailyPlayers`} replace />} />
                <Route path="/Profile" element={<Navigate to={`/${business}/Profile`} replace />} />
                <Route path="/PlayerBuilder" element={<Navigate to={`/${business}/PlayerBuilder`} replace />} />
                <Route path="/tvdisplay" element={<Navigate to={`/${business}/tvdisplay`} replace />} />
                {permissionGroup !== 'Agent' && (
                    <Route path="/BusinessManager" element={<Navigate to={`/${business}/BusinessManager`} replace />} />
                )}
                <Route
                    path="/stopwatch"
                    element={isAnotherDevice ? <Navigate to={`/${business}/stopwatch`} replace /> : <Navigate to={`/${business}`} replace />}
                />
                <Route path="/Auth" element={<AuthenticateUser />} />

                <Route path="*" element={<Navigate to={`/${business}`} replace />} />
            </>
        );
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