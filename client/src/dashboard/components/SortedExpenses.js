import React, { useState } from 'react';
import MOCK_DATA from '../../MOCK_DATA.json';
import MonthlyCost from './MonthlyCost';
import Select from 'react-select';
import ExpenseChart from './ExpenseChart';

import classes from '../styles/SortedExpenses.module.scss';

const SortedExpenses = () => {
    const [selectedOption, setSelectedOption] = useState(2022);

    const dropdownSelectHandler = (selectedOption) => {
        setSelectedOption(selectedOption);
    };
    var monthsList = [
        { label: "Janurary", value: '01', totalExpenses: 0, totalSavings: 0 },
    ]

    // Parse data
    var data = JSON.parse(JSON.stringify(MOCK_DATA));
    // Slice and compare year
    const dates = data.filter((d) => d.Date.slice(-4) === selectedOption.value);

    dates.forEach(i => {
        var expense = i.Amount;
        // From Date slice to get month
        var month = i.Date.slice(0, 2);
        // Find the month value that equals the sliced out month
        monthsList.find(m => m.value === month);

        for (const element of monthsList) {
            if (element.value === month) {
                // If month value === current month in array then add expense to monthly total
                if (i.Category === "Savings") {
                    element.totalSavings += expense;
                } else {
                    element.totalExpenses += expense;
                }
            }
        }
    });

    // pass props to MonthlyCost function
    const monthlyCost = monthsList.map(item => {
        return <MonthlyCost
            key={item.id}
            id={item.id}
            expenses={item.totalExpenses}
            savings={item.totalSavings}
            label={item.label} />
    });

    // Add dropdown options from list of data
    var options = [...new Set(data.map(item => item.Date.slice(-4)))];
    var dropdownOptions = [];
    options.forEach(element => {
        dropdownOptions.push({ label: element, value: element });
    });
    // Sort in order
    dropdownOptions.sort((a, b) => a.value > b.value ? 1 : -1);

    return (
        <div className={classes.dropdownAndCards}>
            <div className={classes.dropdown}>
                <Select
                    id="categoryDropdown"
                    options={dropdownOptions}
                    onChange={dropdownSelectHandler}
                    defaultValue={selectedOption}
                    selected={selectedOption}
                    isSearchable={false}
                    placeholder="Filter by Year" />
            </div>

            <div className={classes.cards}>{monthlyCost}</div>

            <div class={classes.chart}>
                <ExpenseChart total={monthsList} />
            </div>
        </div>
    );
}

export default SortedExpenses;