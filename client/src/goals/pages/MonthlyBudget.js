import React from 'react';
import PlayerBuilder from '../../Budget/Components/PlayerBuilder';
import localstorage from '../../localstorage.json'

const MonthlyBudget = () => {
    localStorage.setItem('testObject', JSON.stringify(localstorage));
    var retrievedObject = JSON.parse(localStorage.getItem('testObject'));

    var test = retrievedObject.map(i => {
        return i.ItemComponent
    });

    return (
        <>
            <PlayerBuilder />
            {/* {test} */}
        </>
    );
}

export default MonthlyBudget;