import React, { useContext } from 'react';
import { AuthContext } from '../Context/auth-context';
import { Routes, Route } from 'react-router-dom';
import Dashboard from '../../dashboard/pages/Dashboard';
import InProgressPlayers from '../../GamePlayers/Components/InProgressPlayers';
import User from '../../user/pages/User';
import AuthenticateUser from '../Authenticate/Auth';
import ProfilePage from '../../user/pages/Profile';
import PlayerBuilder from '../../GamePlayers/Components/PlayerBuilder';
import DailyPlayers from '../../GamePlayers/Components/DailyPlayers';

const Router = () => {
    const auth = true
    let routes;

    if (auth) {
        routes = (
            <>
                <Route path="/" element={<Dashboard />} />
                <Route path="/User" element={<User />} />
                <Route path="/InProgressPlayers" element={<InProgressPlayers />} />
                <Route path="/DailyPlayers" element={<DailyPlayers />} />
                <Route path="/Profile" element={<ProfilePage />} />
                <Route path="/PlayerBuilder" element={<PlayerBuilder />} />
                <Route path="*" element={<Dashboard to="/" replace />} />
            </>
        );
    } else {
        routes = (
            <>
                <Route path="/Auth" element={<AuthenticateUser />} />
                <Route
                    path="*"
                    element={<AuthenticateUser to="/Auth" replace />} />
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