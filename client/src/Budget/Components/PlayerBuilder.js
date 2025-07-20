import React, { useState, useEffect } from 'react';
import Input from '../../UI/Input/Input';
import Button from '../../UI/Button/Button';
import Card from '../../UI/Card/Card';

import classes from '../Styles/BudgetBuilder.module.scss';
import { db, LIST_TITLES } from '../../shared/LocalBase/localbase';
import BudgetExpenseList from './BudgetExpenseList';
import BudgetIncomeList from './BudgetIncomeList';
import PuzzleForm from '../../UI/PuzzleForm/PuzzleForm';

const PlayerBuilder = (props) => {


    // getTotalSumFromExpenses is written here and called in the useEffect to avoid the issue 
    // `cannot update a component while rendering a different component`
    // https://github.com/facebook/react/issues/18178
    const getTotalSumFromExpenses = (totalExpenseValueFromChild) => {
        // setTotalExpenses(totalExpenseValueFromChild);
    };
    const getTotalSumFromIncome = (totalExpenseValueFromChild) => {
        // setTotalIncome(totalExpenseValueFromChild);
    };

    useEffect(() => {
        const getData = async () => {
            await db.collection(LIST_TITLES.budgetExpenses).get().then(expenses => {
                // setBudgetData(expenses);
            });
            await db.collection(LIST_TITLES.budgetIncome).get().then(income => {
                // setIncomeData(income);
            });
        }
        getTotalSumFromExpenses();
        getTotalSumFromIncome();
        getData();
    }, []);


    const [showPuzzleForm, setShowPuzzleForm] = useState(false);

    const showPuzzleFormHandler = () => {
        setShowPuzzleForm(!showPuzzleForm);
    };

    return (
        <div className='playerBoard'>
            
            <div className={classes.centerButton}>
                <Button onClick={() => showPuzzleFormHandler()}>Add player</Button>
            </div>
            <div className={classes.budgetBuilder}>
                
                <div className={`${classes.budgetBox} ${classes.centerButton}`}>
                    <div className={classes.budgetHeader}>
                        <Card><span className={classes.spanCount} >Total cat players:  00</span></Card>
                        
                    </div>
                </div>

                <div className={`${classes.budgetBox} ${classes.centerButton}`}>
                    <div className={classes.budgetHeader}>
                        <Card><span className={classes.spanCount}>Total dog players: 00</span></Card>
                        
                    </div>
                </div>
            </div>
            {showPuzzleForm && (
                <div className={classes.puzzleForm}>
                    <PuzzleForm />
                </div>
            )}
        </div>
    );
}

export default PlayerBuilder;