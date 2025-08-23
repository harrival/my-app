import React, { useEffect, useState } from "react";
import { type RepsTypes } from "./RepsInterface";
import axios from "axios";
import { prepareRepsData } from '../../shared/Utils/prepareDBdata';
import AddRepForm from "../../UI/Form/AddRepForm";

const Reps = () => {
    const [repsTable, setRepsTable] = useState<RepsTypes[]>([]);
    const [showAddRep, setShowAddRep] = useState<boolean>(false);

    useEffect(() => {
        const fetchUsers = async () => {
            const dbObject = {
                tableName: "reptable"
            };
            try {
                const response = await axios.get('http://localhost:5001/reps', { params: dbObject });

                setRepsTable(prepareRepsData(response.data));
            } catch (error) {
                console.error('Error fetching users:', error);
            }
        };
        fetchUsers();
    }, []);

    return (
        <div style={{ maxHeight: "200px", padding: "10px", overflowY: repsTable.length > 5 ? "scroll" : "auto" }}>
            <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h1>Boot Representatives</h1>
                    <button onClick={() => setShowAddRep(!showAddRep)}>Add Representative</button>
                </div>
                
                {showAddRep && (
                    <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 1000, backgroundColor: "white", padding: "20px", boxShadow: "0px 4px 6px rgba(0, 0, 0, 0.1)", borderRadius: "8px" }}>
                        <AddRepForm
                            setShowAddRep={setShowAddRep}
                        />
                    </div>
                )}
            </div>
            
            <table
                border={1}
                style={{ width: "100%" }}
            >
                <thead>
                    <tr>
                        <th style={{ textAlign: "center" }}>Name</th>
                        <th style={{ textAlign: "center" }}>Event Type</th>
                        <th style={{ textAlign: "center" }}>Is Event Active</th>
                        <th style={{ textAlign: "center" }}>Event Location</th>
                        <th style={{ textAlign: "center" }}>Event Start Date</th>
                        <th style={{ textAlign: "center" }}>Event End Date</th>
                        <th style={{ textAlign: "center" }}>Action</th>
                    </tr>
                </thead>
                <tbody>
                    {repsTable.map((rep) => (
                        <tr key={rep.RepGUID}>
                            <td style={{ textAlign: "center" }}>{rep.FirstName} {rep.LastName}</td>
                            <td style={{ textAlign: "center" }}>{rep.EventType}</td>
                            <td style={{ textAlign: "center" }}>{rep.IsActive ? "Yes" : "No"}</td>
                            <td style={{ textAlign: "center" }}>{rep.EventLocation}</td>
                            <td style={{ textAlign: "center" }}>{rep.EventFirstDate.toLocaleDateString()}</td>
                            <td style={{ textAlign: "center" }}>{rep.EventLastDate.toLocaleDateString()}</td>
                            <td style={{ textAlign: "center" }}>
                                <button style={{ marginRight: "8px" }}>Edit</button>
                                <button>Delete</button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default Reps;