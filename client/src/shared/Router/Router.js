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
import Reps from '../../GamePlayers/Components/Reps';
import StartCatTimer from '../../GamePlayers/Components/StartCatTimer';
import StopCatTimer from '../../GamePlayers/Components/StopCatTimer';
import StartDogTimer from '../../GamePlayers/Components/StartDogTimer';
import StopDogTimer from '../../GamePlayers/Components/StopDogTimer';
import TvDisplay from '../../GamePlayers/Components/TvDisplay';
import Admin from '../../GamePlayers/Components/Admin';

const Router = () => {
    const auth = true;
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
                <Route path="/startcat" element={<StartCatTimer />} />
                <Route path="/stopcat" element={<StopCatTimer />} />
                <Route path="/startdog" element={<StartDogTimer />} />
                <Route path="/stopdog" element={<StopDogTimer />} />
                <Route path="/tvdisplay" element={<TvDisplay />} />
                <Route path="/Reps" element={<Reps />} />
                <Route path="/Admin" element={<Admin />} />
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