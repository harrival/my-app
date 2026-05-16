import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import maze from '../assets/maze.jpeg';
import classes from './Header.module.scss';
import Button from '../UI/Button/Button'
import SideDrawer from './SideDrawer';
import HoverMenuButton from './HoverMenuButton.js'

const Header = (props) => {
    // auth is now an object that will hold the isLoggedIn, login, logout
    // const auth = useContext(AuthContext);
    const auth = true
    let navigate = useNavigate();

    // the Drawer is for small screens and mobile views
    const [drawerOpen, setDrawerOpen] = useState(false);

    const navLinks =
        <div className={classes.navLinks}>
            {auth &&
                <>
                    <NavLink
                        to="/"
                        className={classes.link}
                        onClick={() => props.setColor("#ebe3ff")}>Home
                    </NavLink>

                    <NavLink
                        to="/PlayerBuilder"
                        className={classes.link}
                        onClick={() => props.setColor("#e7ffe3")}>Play Ground
                    </NavLink>

                    <NavLink
                        to="/Reps"
                        className={classes.link}
                        onClick={() => props.setColor("#e7ffe3")}>Reps
                    </NavLink>

                    <NavLink
                        to="/Admin"
                        className={classes.link}
                        onClick={() => props.setColor("#fdfae1")}>Admin
                    </NavLink>
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
                    {auth.isLoggedIn && <Button onClick={props.onShowModal}>Add Expense</Button>}
                    {auth && <div className={classes.hoverMenu}>
                        <span>Profile</span>
                        <div className={classes.subMenu}>
                            <HoverMenuButton props={props} />
                        </div>
                    </div>}
                </div>
            </header>

            <div className={classes['main-image']}>
                <img src={maze} alt="corn farm" />
            </div>
        </div>
    );
}

export default Header;