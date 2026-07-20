import React, { useContext } from 'react';
import { AuthContext } from '../Context/auth-context';
import { useUserProfile } from '../Context/UserProfileContext';
import { Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from '../../dashboard/pages/Dashboard';
import InProgressPlayers from '../../GamePlayers/Components/InProgressPlayers';
import User from '../../user/User';
import AuthenticateUser from '../Authenticate/Auth';
import ProfilePage from '../../user/Profile';
import PlayerBuilder from '../../GamePlayers/Components/PlayerBuilder';
import DailyPlayers from '../../GamePlayers/Components/DailyPlayers';
import Reps from '../../GamePlayers/Components/Reps';
import StartCatTimer from '../../GamePlayers/Components/StartCatTimer';
import StopCatTimer from '../../GamePlayers/Components/StopCatTimer';
import StartDogTimer from '../../GamePlayers/Components/StartDogTimer';
import StopDogTimer from '../../GamePlayers/Components/StopDogTimer';
import TvDisplay from '../../GamePlayers/Components/TvDisplay';
import Admin from '../../GamePlayers/Components/Admin';
import Stopwatch from '../../GamePlayers/Components/Stopwatch';

const Router = () => {
    const auth = useContext(AuthContext);
    const { user, profile, loading } = useUserProfile();
    console.log("👤 [Router] Logged in user property:", user);
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
                <Route path="/:business" element={<Dashboard />} />

                {/* Prefix business to all sub-routes */}
                <Route path="/:business/User" element={<User />} />
                <Route path="/:business/InProgressPlayers" element={<InProgressPlayers />} />
                <Route path="/:business/DailyPlayers" element={<DailyPlayers />} />
                <Route path="/:business/Profile" element={<ProfilePage />} />
                <Route path="/:business/PlayerBuilder" element={<PlayerBuilder />} />
                <Route path="/:business/startcat" element={<StartCatTimer />} />
                <Route path="/:business/stopcat" element={<StopCatTimer />} />
                <Route path="/:business/startdog" element={<StartDogTimer />} />
                <Route path="/:business/stopdog" element={<StopDogTimer />} />
                <Route path="/:business/tvdisplay" element={<TvDisplay />} />
                <Route path="/:business/Reps" element={<Reps />} />
                {permissionGroup !== 'Agent' && (
                    <Route path="/:business/Admin" element={<Admin />} />
                )}
                <Route
                    path="/:business/stopwatch"
                    element={isAnotherDevice ? <Stopwatch /> : <Navigate to={`/${business}`} replace />}
                />

                {/* Fallbacks for non-prefixed urls to redirect to prefixed versions */}
                <Route path="/User" element={<Navigate to={`/${business}/User`} replace />} />
                <Route path="/InProgressPlayers" element={<Navigate to={`/${business}/InProgressPlayers`} replace />} />
                <Route path="/DailyPlayers" element={<Navigate to={`/${business}/DailyPlayers`} replace />} />
                <Route path="/Profile" element={<Navigate to={`/${business}/Profile`} replace />} />
                <Route path="/PlayerBuilder" element={<Navigate to={`/${business}/PlayerBuilder`} replace />} />
                <Route path="/startcat" element={<Navigate to={`/${business}/startcat`} replace />} />
                <Route path="/stopcat" element={<Navigate to={`/${business}/stopcat`} replace />} />
                <Route path="/startdog" element={<Navigate to={`/${business}/startdog`} replace />} />
                <Route path="/stopdog" element={<Navigate to={`/${business}/stopdog`} replace />} />
                <Route path="/tvdisplay" element={<Navigate to={`/${business}/tvdisplay`} replace />} />
                <Route path="/Reps" element={<Navigate to={`/${business}/Reps`} replace />} />
                {permissionGroup !== 'Agent' && (
                    <Route path="/Admin" element={<Navigate to={`/${business}/Admin`} replace />} />
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