import React from 'react';

// CSS Modules let you use the same CSS class name in different files without worrying about naming clashes.
import classes from '../styles/Dashboard.module.scss';

const Dashboard = () => {

    return (
        <>
            {/* Savings Goal - Total Saved - Goal $$$ - Potential Goal End Date */}
            {/* Chart breakdown of expenses food vs online purchase vs whatever; Dropdown filter*/}
            <div className={classes.dashboard}>
                {/* <div className={classes.dashboardItem}>
                    <SavingsGoal />
                </div> */}
                <div className={classes.dashboardItem}>
                </div>

            </div>
        </>
    );
}

export default Dashboard;