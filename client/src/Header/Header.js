import React, { useState, useContext } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import maze from '../assets/maze.jpeg';
import classes from './Header.module.scss';
import SideDrawer from './SideDrawer';
import { AuthContext } from '../shared/Context/auth-context';
import { useUserProfile } from '../shared/Context/UserProfileContext';
import axios from 'axios';
import { BASE_URL } from '../shared/Utils/apiConfig';

const Header = (props) => {
    const auth = useContext(AuthContext);
    const { user, profile, setProfile, setUser } = useUserProfile();
    let navigate = useNavigate();
    console.log("Header renders. auth.isLoggedIn =", auth.isLoggedIn);
    console.log("👤 [Header] Logged in user property:", user);

    const business = profile?.business || "non_business";
    const permissionGroup = profile?.permission_group || null;

    const logoutHandler = async () => {
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
        navigate('/Auth', { replace: true });
    };

    // the Drawer is for small screens and mobile views
    const [drawerOpen, setDrawerOpen] = useState(false);

    const navLinks =
        <div className={classes.navLinks}>
            {auth.isLoggedIn &&
                <>
                    <NavLink
                        to={`/${business}`}
                        className={classes.link}
                        onClick={() => props.setColor("#ebe3ff")}>Home
                    </NavLink>

                    <NavLink
                        to={`/${business}/PlayerBuilder`}
                        className={classes.link}
                        onClick={() => props.setColor("#e7ffe3")}>Play Ground
                    </NavLink>

                    <NavLink
                        to={`/${business}/Reps`}
                        className={classes.link}
                        onClick={() => props.setColor("#e7ffe3")}>Reps
                    </NavLink>

                    {permissionGroup !== 'Agent' && (
                        <NavLink
                            to={`/${business}/Admin`}
                            className={classes.link}
                            onClick={() => props.setColor("#fdfae1")}>Admin
                        </NavLink>
                    )}
                </>
            }
        </div>

    const openDrawerHandler = () => {
        setDrawerOpen(true);
    }
    const closeDrawerHandler = () => {
        setDrawerOpen(false);
    }


    return (
        <div>
            <header className={classes.header}>

                <div className={classes["main-navigation__menu-btn"]} onClick={openDrawerHandler}>
                    <span />
                    <span />
                    <span />
                </div>

                {drawerOpen && <SideDrawer onClick={closeDrawerHandler}>
                    <nav className={classes["main-navigation__drawer-nav"]}>
                        <div className={classes.drawerNav}>
                            {navLinks}
                        </div>
                    </nav>
                </SideDrawer>}

                <div className={classes.mainNav}>
                    <h1>Triple Great</h1>
                    {navLinks}
                </div>

                {/* {auth.isLoggedIn && <Button onClick={logoutHandler}><FaUserCircle /> Logout</Button>} */}

                <div className={classes.loggedInButtons}>
                    {!auth.isLoggedIn ? (
                        <NavLink to="/Auth" className={classes.link} style={{ fontWeight: 'bold', textDecoration: 'none' }}>
                            Sign in
                        </NavLink>
                    ) : (
                        <>
                            <NavLink to={`/${business}/Profile`} className={classes.link} style={{ marginRight: '15px', fontWeight: 'bold', textDecoration: 'none' }}>
                                Profile
                            </NavLink>
                            <span
                                onClick={logoutHandler}
                                className={classes.link}
                                style={{ fontWeight: 'bold', textDecoration: 'none', cursor: 'pointer' }}
                            >
                                Sign out
                            </span>
                        </>
                    )}
                </div>
            </header>

            <div className={classes['main-image']}>
                <img src={maze} alt="corn farm" />
            </div>
        </div>
    );
}

export default Header;