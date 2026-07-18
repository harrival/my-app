import React, { useEffect, useState } from "react";
import axios from "axios";
import { BASE_URL } from '../../shared/Utils/apiConfig';
import classes from '../Styles/Events.module.css'; // Reusing event styles for consistency

interface QueNumberType {
    id: number;
    last_number: number;
    event_id: string;
}

interface NumberQueProps {
    onBack?: () => void;
}

const NumberQue: React.FC<NumberQueProps> = ({ onBack }) => {
    const [queNumbers, setQueNumbers] = useState<QueNumberType[]>([]);
    const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

    useEffect(() => {
        const fetchQueNumbers = async () => {
            try {
                const response = await axios.get(`${BASE_URL}/getAll`, {
                    params: { tableName: "que_number_table" }
                });
                setQueNumbers(response.data);
            } catch (error) {
                console.error('Error fetching queue numbers:', error);
            }
        };
        fetchQueNumbers();
    }, [refreshTrigger]);

    const handleDelete = async (id: number) => {
        if (window.confirm("Are you sure you want to delete this queue record?")) {
            try {
                await axios.delete(`${BASE_URL}/deleteItem/que_number_table/id/${id}`);
                setRefreshTrigger(prev => prev + 1);
            } catch (error) {
                console.error('Error deleting record:', error);
                alert("Failed to delete record.");
            }
        }
    };

    return (
        <div className={classes.eventsManagementPanel}>
            <div className={classes.headerContainer}>
                <h1>Queue Number Management</h1>
                <div className={classes.buttonGroup}>
                    {onBack && <button className={classes.actionButton} onClick={onBack}>Back to Admin</button>}
                </div>
            </div>

            <table className={classes.table}>
                <thead>
                    <tr>
                        <th className={classes.tableTh}>Last Number</th>
                        <th className={classes.tableTh}>Event ID</th>
                        <th className={classes.tableTh} style={{ textAlign: "center" }}>Action</th>
                    </tr>
                </thead>
                <tbody>
                    {queNumbers.map((row) => (
                        <tr key={row.id}>
                            <td className={classes.tableTd} style={{ textAlign: "center" }}>{row.last_number}</td>
                            <td className={classes.tableTd} style={{ textAlign: "center" }}>{row.event_id}</td>
                            <td className={`${classes.tableTd} ${classes.tableTdCenter}`}>
                                <button className={classes.actionButton} onClick={() => handleDelete(row.id)}>Delete</button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default NumberQue;