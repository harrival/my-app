import React, { useState, useContext } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import maze from '../assets/maze.jpeg';
import appLogo from '../assets/38.jpg';
import classes from './Header.module.scss';
import SideDrawer from './SideDrawer';
import { AuthContext } from '../shared/Context/auth-context';
import { useUserProfile } from '../shared/Context/UserProfileContext';
import axios from 'axios';
import { BASE_URL } from '../shared/Utils/apiConfig';
import LinkedDevicesModal from '../shared/Authenticate/LinkedDevicesModal';

interface HeaderProps {
    setColor?: (color: string) => void;
    color?: string;
}

const Header: React.FC<HeaderProps> = (props) => {
    const auth = useContext(AuthContext);
    const { profile, setProfile, isLinkedDevice, isTV } = useUserProfile();
    const navigate = useNavigate();

    const business = profile?.business || "non_business";
    const permissionGroup = profile?.permission_group || null;
    const isAgent = !isTV && (permissionGroup === 'Agent' || Boolean(profile?.rep_id));

    const logoutHandler = async () => {
        try {
            const sessionStr = localStorage.getItem('userSession');
            let session: any = null;
            if (sessionStr) {
                try { session = JSON.parse(sessionStr); } catch { }
            }

            // If this is a linked child device, revoke it on server so parent device updates immediately
            if (session?.isLinkedDevice && session?.deviceId && profile?.user_guid) {
                await axios.delete(`${BASE_URL}/device-link/device/${profile.user_guid}/${session.deviceId}`);
            } else if (profile?.user_guid) {
                await axios.post(`${BASE_URL}/profile/${profile.user_guid}`, {});
            }
        } catch (err) {
            console.error('Error during logout:', err);
        }
        localStorage.removeItem('userSession');
        setProfile(null);
        auth.logout();
        navigate('/Auth', { replace: true });
    };

    // Mobile SideDrawer state
    const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
    const [showLinkedDevicesModal, setShowLinkedDevicesModal] = useState<boolean>(false);

    const openDrawerHandler = () => {
        setDrawerOpen(true);
    };

    const closeDrawerHandler = () => {
        setDrawerOpen(false);
    };

    const handleNavClick = () => {
        if (props.setColor) {
            props.setColor("#e7ffe3");
        }
        closeDrawerHandler();
    };

    const navLinks = (
        <div className={classes.navLinks}>
            {auth.isLoggedIn && (
                <>
                    {isTV ? (
                        <NavLink
                            to={`/${business}/PlayersMonitor`}
                            className={classes.link}
                            onClick={handleNavClick}
                        >
                            Monitor
                        </NavLink>
                    ) : (
                        <>
                            <NavLink
                                to={`/${business}/PlayerBuilder`}
                                className={classes.link}
                                onClick={handleNavClick}
                            >
                                Play Ground
                            </NavLink>

                            {isAgent && (
                                <NavLink
                                    to={`/${business}/PlayerScanner`}
                                    className={classes.link}
                                    onClick={handleNavClick}
                                >
                                    Scan Player
                                </NavLink>
                            )}

                            {isAgent && (
                                <NavLink
                                    to={`/${business}/PlayersMonitor`}
                                    className={classes.link}
                                    onClick={handleNavClick}
                                >
                                    Monitor
                                </NavLink>
                            )}

                            {permissionGroup !== 'Agent' && (
                                <NavLink
                                    to={`/${business}/BusinessManager`}
                                    className={classes.link}
                                    onClick={handleNavClick}
                                >
                                    Business Manager
                                </NavLink>
                            )}
                        </>
                    )}
                </>
            )}
        </div>
    );

    return (
        <div>
            <header className={classes.header}>
                {/* Mobile hamburger menu button */}
                <div
                    className={classes["main-navigation__menu-btn"]}
                    onClick={openDrawerHandler}
                    role="button"
                    tabIndex={0}
                    aria-label="Open Navigation Menu"
                >
                    <span />
                    <span />
                    <span />
                </div>

                {/* Mobile Side Drawer displaying the hidden header */}
                {drawerOpen && (
                    <SideDrawer onClick={closeDrawerHandler}>
                        <nav className={classes["main-navigation__drawer-nav"]}>
                            <div className={classes.drawerHeader}>
                                <img src={appLogo} alt="Triple Great Logo" className={classes.drawerLogo} />
                                <div>
                                    <h2 style={{ margin: 0, color: '#ffffff', fontSize: '1.25rem', fontWeight: 800 }}>Triple Great</h2>
                                    <p style={{ margin: '4px 0 0 0', color: 'rgba(255, 255, 255, 0.75)', fontSize: '0.8rem' }}>Navigation Menu</p>
                                </div>
                            </div>
                            <div className={classes.drawerNav} style={{ flexDirection: 'column', padding: '16px' }}>
                                {navLinks}

                                <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.2)', paddingTop: '16px', marginTop: '16px' }}>
                                    {!auth.isLoggedIn ? (
                                        <NavLink
                                            to="/Auth"
                                            className={classes.link}
                                            onClick={handleNavClick}
                                            style={{
                                                display: 'block',
                                                padding: '10px 14px',
                                                backgroundColor: '#ffffff',
                                                color: '#174b0f',
                                                borderRadius: '8px',
                                                textAlign: 'center',
                                                fontWeight: 'bold',
                                                textDecoration: 'none',
                                                fontSize: '0.95rem'
                                            }}
                                        >
                                            Sign In
                                        </NavLink>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                            {!isTV && !isLinkedDevice && (
                                                <div
                                                    onClick={() => {
                                                        setShowLinkedDevicesModal(true);
                                                        closeDrawerHandler();
                                                    }}
                                                    style={{
                                                        padding: '10px 14px',
                                                        borderRadius: '8px',
                                                        backgroundColor: 'rgba(255, 255, 255, 0.12)',
                                                        border: '1px solid rgba(255, 255, 255, 0.25)',
                                                        color: '#ffffff',
                                                        fontWeight: '600',
                                                        cursor: 'pointer',
                                                        fontSize: '0.9rem',
                                                        textAlign: 'center'
                                                    }}
                                                >
                                                    Linked Devices
                                                </div>
                                            )}
                                            {!isTV && (
                                                <NavLink
                                                    to={`/${business}/Profile`}
                                                    onClick={handleNavClick}
                                                    style={{
                                                        padding: '10px 14px',
                                                        borderRadius: '8px',
                                                        backgroundColor: 'rgba(255, 255, 255, 0.12)',
                                                        border: '1px solid rgba(255, 255, 255, 0.25)',
                                                        color: '#ffffff',
                                                        fontWeight: '600',
                                                        textDecoration: 'none',
                                                        fontSize: '0.9rem',
                                                        textAlign: 'center',
                                                        display: 'block'
                                                    }}
                                                >
                                                    Profile
                                                </NavLink>
                                            )}
                                            <div
                                                onClick={() => {
                                                    logoutHandler();
                                                    closeDrawerHandler();
                                                }}
                                                style={{
                                                    padding: '10px 14px',
                                                    borderRadius: '8px',
                                                    backgroundColor: 'rgba(239, 68, 68, 0.25)',
                                                    border: '1px solid rgba(239, 68, 68, 0.5)',
                                                    color: '#ffffff',
                                                    fontWeight: '600',
                                                    cursor: 'pointer',
                                                    fontSize: '0.9rem',
                                                    textAlign: 'center'
                                                }}
                                            >
                                                Sign Out
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </nav>
                    </SideDrawer>
                )}

                {/* Mobile brand logo */}
                <div className={classes.mobileBrand}>
                    <NavLink to={`/${business}`} className={classes.mobileBrandLink}>
                        <img src={appLogo} alt="Triple Great Logo" className={classes.brandLogoMobile} />
                        <span>Triple Great</span>
                    </NavLink>
                </div>

                {/* Mobile balance spacer */}
                <div className={classes.mobileSpacer} />

                {/* Desktop navigation */}
                <div className={classes.mainNav}>
                    <NavLink to={`/${business}`} className={classes.brandContainer}>
                        <img src={appLogo} alt="Triple Great Logo" className={classes.brandLogo} />
                        <h1>Triple Great</h1>
                    </NavLink>
                    {navLinks}
                </div>

                {/* Desktop logged in buttons */}
                <div className={classes.loggedInButtons}>
                    {!auth.isLoggedIn ? (
                        <NavLink to="/Auth" className={classes.link} style={{ fontWeight: 'bold', textDecoration: 'none' }}>
                            Sign in
                        </NavLink>
                    ) : (
                        <>
                            {!isTV && !isLinkedDevice && (
                                <span
                                    onClick={() => setShowLinkedDevicesModal(true)}
                                    className={classes.link}
                                    style={{ marginRight: '15px', fontWeight: 'bold', textDecoration: 'none', cursor: 'pointer' }}
                                    title="Link companion devices (TV, tablet, PC)"
                                >
                                    Linked Devices
                                </span>
                            )}
                            {!isTV && (
                                <NavLink to={`/${business}/Profile`} className={classes.link} style={{ marginRight: '15px', fontWeight: 'bold', textDecoration: 'none' }}>
                                    Profile
                                </NavLink>
                            )}
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

            {showLinkedDevicesModal && (
                <LinkedDevicesModal onClose={() => setShowLinkedDevicesModal(false)} />
            )}

            <div className={classes['main-image']}>
                <img src={maze} alt="corn farm" />
            </div>
        </div>
    );
};

export default Header;
