import React from 'react';
import ExpenseChart from '../components/ExpenseChart';
import SavingsGoal from '../components/SavingsGoal';
import SortedExpenses from '../components/SortedExpenses';
import {createIndexedDB} from '../../Budget/Components/IndexDB';

// CSS Modules let you use the same CSS class name in different files without worrying about naming clashes.
import classes from '../styles/Dashboard.module.scss';
import { useEffect } from 'react';

const Dashboard = () => {

    useEffect(() => {
        const myDBConfig = [
            {
              storeName: 'mazePuzzlePlayers',
              keyPath: 'id',
              autoIncrement: true,
              indexes: [
                { indexName: 'Username', keyPath: 'Username', options: { unique: false } },
                { indexName: 'Email', keyPath: 'Email', options: { unique: false } },
                { indexName: 'PhoneNumber', keyPath: 'PhoneNumber', options: { unique: false } },
                { indexName: 'PuzzleType', keyPath: 'PuzzleType', options: { unique: false } },
                { indexName: 'TimeUsed', keyPath: 'TimeUsed', options: { unique: false } },
                { indexName: 'PuzzleStatus', keyPath: 'PuzzleStatus', options: { unique: false } },
                { indexName: 'TimeCreated', keyPath: 'TimeCreated', options: { unique: false } },
                { indexName: 'TimeUpdated', keyPath: 'TimeUpdated', options: { unique: false } },
                { indexName: 'RepresentativeID', keyPath: 'RepresentativeID', options: { unique: false } },
                { indexName: 'EventID', keyPath: 'EventID', options: { unique: false } },
                
              ],
            },
            // {
            //   storeName: 'products',
            //   keyPath: 'productId',
            //   indexes: [
            //     { indexName: 'category', keyPath: 'category', options: { unique: false } },
            //   ],
            // },
          ];
          
          // Call the function to create the database.
          createIndexedDB('mazePuzzlePlayerDB', 1, myDBConfig)
    }, []);

    return (
        <>
            {/* Savings Goal - Total Saved - Goal $$$ - Potential Goal End Date */}
            {/* Chart breakdown of expenses food vs online purchase vs whatever; Dropdown filter*/}
            <div className={classes.dashboard}>
                {/* <div className={classes.dashboardItem}>
                    <SavingsGoal />
                </div> */}
                <div className={classes.dashboardItem}>
                    {/* <ExpenseChart /> */}
                    <SortedExpenses />
                </div>

            </div>
        </>
    );
}

export default Dashboard;