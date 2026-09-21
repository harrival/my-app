import React, { useState } from 'react';
import classes from '../Styles/Admin.module.css';
import Reps from './Reps';
import Events from './Events';
import Users from './Users';
import NumberQue from './NumberQue';

const Admin: React.FC = () => {
    const [activeTable, setActiveTable] = useState<string | null>(null);

    if (activeTable === 'reps') {
        return <Reps onBack={() => setActiveTable(null)} />;
    }

    if (activeTable === 'users') {
        return <Users onBack={() => setActiveTable(null)} />;
    }

    if (activeTable === 'events') {
        return <Events onBack={() => setActiveTable(null)} />;
    }

    if (activeTable === 'que') {
        return <NumberQue onBack={() => setActiveTable(null)} />;
    }

    return (
        <div className={classes.adminPanel}>
            <h1>Admin Panel</h1>
            <div className={classes.buttonGrid}>
                <button 
                    className={classes.adminButton} 
                    type="button"
                    onClick={() => setActiveTable('users')}
                >
                    Users...
                </button>
                <button 
                    className={classes.adminButton} 
                    type="button"
                    onClick={() => setActiveTable('events')}
                >
                    Event table
                </button>
                <button className={classes.adminButton} type="button">Puzzle type</button>
                <button 
                    className={classes.adminButton} 
                    type="button"
                    onClick={() => setActiveTable('reps')}
                >
                    Reps table
                </button>
                <button 
                    className={classes.adminButton} 
                    type="button"
                    onClick={() => setActiveTable('que')}
                >
                    Que number table
                </button>
            </div>
        </div>
    );
};

export default Admin;