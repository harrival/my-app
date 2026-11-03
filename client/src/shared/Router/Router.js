import React, { useContext } from 'react';
import { AuthContext } from '../Context/auth-context';
import { useUserProfile } from '../Context/UserProfileContext';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import InProgressPlayers from '../../GamePlayers/Components/InProgressPlayers';
import Home from '../../user/Home';
import AuthenticateUser from '../Authenticate/Auth';
import ProfilePage from '../../user/Profile';
import PlayerBuilder from '../../GamePlayers/Components/PlayerBuilder';
import DailyPlayers from '../../GamePlayers/Components/DailyPlayers';
import PlayersMonitor from '../../GamePlayers/Components/PlayersMonitor';
import BusinessManager from '../../GamePlayers/Components/BusinessManager';
import PlayerScanner from '../../GamePlayers/Components/PlayerScanner';
import Configuration from '../../GamePlayers/Components/Configuration';
import BusinessInfo from '../../GamePlayers/Components/BusinessInfo';
import CustomerBookingPortal from '../../TripleGreat/Components/CustomerBookingPortal';
import ManageReservation from '../../TripleGreat/Components/ManageReservation';
import SupervisorControlPanel from '../../TripleGreat/Components/SupervisorControlPanel';
import DevSandboxInspector from '../../TripleGreat/Components/DevSandboxInspector';

/**
 * Redirects unauthenticated visitors who copy/visit a protected URL to /Auth,
 * preserving the originally requested path in `location.state.from`.
 */
const RequireAuthRedirect = () => {
    const location = useLocation();
    const requestedPath = `${location.pathname}${location.search || ''}`;
    return <Navigate to="/Auth" state={{ from: requestedPath }} replace />;
};

const Router = () => {
    const auth = useContext(AuthContext);
    const {
        profile,
        loading,
        isTV,
        isAdmin,
        isSupervisor,
        isAgent: isAgentRole,
        isCustomer
    } = useUserProfile();
    let routes;

    if (auth.isLoggedIn && loading) {
        return (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
                <p>Loading session...</p>
            </div>
        );
    }

    const business = profile?.business || "alpha_rentals";
    const isAgent = !isTV && (isAgentRole || Boolean(profile?.rep_id));
    const isAdminOrSupervisor = !isTV && (isAdmin || isSupervisor);

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
        } else if (isCustomer) {
            // Customer accounts (from `customers` table) have access to Home, Booking Portal, and Profile
            routes = (
                <>
                    <Route path="/" element={<Home />} />
                    <Route path="/Home" element={<Home />} />
                    <Route path="/:business/Home" element={<Home />} />
                    <Route path="/book/:business" element={<CustomerBookingPortal />} />
                    <Route path="/book/:business/manage" element={<ManageReservation />} />
                    <Route path="/admin" element={<SupervisorControlPanel />} />
                    <Route path="/admin/:business" element={<SupervisorControlPanel />} />
                    <Route path="/dev/outbox" element={<DevSandboxInspector />} />
                    <Route path="/dev/clock" element={<DevSandboxInspector />} />
                    <Route path="/dev/sandbox" element={<DevSandboxInspector />} />
                    <Route path="/:business/Profile" element={<ProfilePage />} />
                    <Route path="/Profile" element={<Navigate to={`/${business}/Profile`} replace />} />
                    <Route path="/:business" element={<Navigate to={`/book/${business}`} replace />} />
                    <Route path="/Auth" element={<Navigate to={`/book/${business}`} replace />} />
                    <Route path="/auth" element={<Navigate to={`/book/${business}`} replace />} />
                    <Route path="*" element={<Navigate to={`/book/${business}`} replace />} />
                </>
            );
        } else {
            routes = (
                <>
                    <Route path="/" element={<Home />} />
                    {/* Multi-Tenant Public Booking Portal & Supervisor Control Panel Ingress */}
                    <Route path="/book/:business" element={<CustomerBookingPortal />} />
                    <Route path="/book/:business/manage" element={<ManageReservation />} />
                    <Route path="/admin" element={<SupervisorControlPanel />} />
                    <Route path="/admin/:business" element={<SupervisorControlPanel />} />
                    <Route path="/dev/outbox" element={<DevSandboxInspector />} />
                    <Route path="/dev/clock" element={<DevSandboxInspector />} />
                    <Route path="/dev/sandbox" element={<DevSandboxInspector />} />

                    <Route path="/:business" element={
                        isAdminOrSupervisor ? <BusinessManager /> : <PlayerBuilder />
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
                    <Route path="/:business/SupervisorPanel" element={<SupervisorControlPanel />} />
                    {isAdminOrSupervisor && (
                        <>
                            <Route path="/:business/BusinessManager" element={<BusinessManager />} />
                            <Route path="/:business/Configuration" element={<Configuration />} />
                            <Route path="/:business/BusinessInfo" element={<BusinessInfo />} />
                        </>
                    )}

                    {/* Fallbacks for non-prefixed urls to redirect to prefixed versions */}
                    <Route path="/Home" element={<Home />} />
                    <Route path="/InProgressPlayers" element={<Navigate to={`/${business}/InProgressPlayers`} replace />} />
                    <Route path="/DailyPlayers" element={<Navigate to={`/${business}/DailyPlayers`} replace />} />
                    <Route path="/Profile" element={<Navigate to={`/${business}/Profile`} replace />} />
                    <Route path="/PlayerBuilder" element={<Navigate to={`/${business}/PlayerBuilder`} replace />} />
                    {isAgent && (
                        <Route path="/PlayerScanner" element={<Navigate to={`/${business}/PlayerScanner`} replace />} />
                    )}
                    <Route path="/PlayersMonitor" element={<Navigate to={`/${business}/PlayersMonitor`} replace />} />
                    {isAdminOrSupervisor && (
                        <>
                            <Route path="/BusinessManager" element={<Navigate to={`/${business}/BusinessManager`} replace />} />
                            <Route path="/Configuration" element={<Navigate to={`/${business}/Configuration`} replace />} />
                            <Route path="/BusinessInfo" element={<Navigate to={`/${business}/BusinessInfo`} replace />} />
                        </>
                    )}
                    <Route path="/Auth" element={<Navigate to={`/${business}`} replace />} />
                    <Route path="/auth" element={<Navigate to={`/${business}`} replace />} />

                    <Route path="*" element={<Navigate to={`/${business}`} replace />} />
                </>
            );
        }
    } else {
        routes = (
            <>
                {/* Base URL routes directly to Home page without showing /Auth */}
                <Route path="/" element={<Home />} />
                <Route path="/Home" element={<Home />} />
                <Route path="/:business/Home" element={<Home />} />

                {/* Public Reservation Routing is accessible without requiring login */}
                <Route path="/book/:business" element={<CustomerBookingPortal />} />
                    <Route path="/book/:business/manage" element={<ManageReservation />} />
                <Route path="/dev/outbox" element={<DevSandboxInspector />} />
                <Route path="/dev/clock" element={<DevSandboxInspector />} />
                <Route path="/dev/sandbox" element={<DevSandboxInspector />} />

                {/* /Auth shows when user visits /Auth or copies a URL that requires authentication */}
                <Route path="/Auth" element={<AuthenticateUser />} />
                <Route path="/auth" element={<AuthenticateUser />} />
                <Route path="*" element={<RequireAuthRedirect />} />
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
