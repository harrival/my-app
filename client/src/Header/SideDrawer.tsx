import React, { ReactNode } from 'react';
import ReactDom from 'react-dom';
import { FaTimes } from "react-icons/fa";

import classes from './SideDrawer.module.scss';

interface SideDrawerProps {
    onClick?: () => void;
    children?: ReactNode;
}

const SideDrawer: React.FC<SideDrawerProps> = (props) => {
    const content = (
        <>
            <div
                onClick={props.onClick}
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100vh',
                    backgroundColor: 'rgba(0, 0, 0, 0.45)',
                    zIndex: 99
                }}
            />
            <aside className={classes["side-drawer"]} style={{ zIndex: 100 }}>
                <div
                    onClick={props.onClick}
                    className={classes.drawerControl}
                    aria-label="Close navigation"
                >
                    <FaTimes />
                </div>
                {props.children}
            </aside>
        </>
    );

    const drawerHook = typeof document !== 'undefined'
        ? (document.getElementById("drawerHook") || document.body)
        : null;

    if (drawerHook) {
        return ReactDom.createPortal(content, drawerHook);
    }
    return content;
};

export default SideDrawer;
