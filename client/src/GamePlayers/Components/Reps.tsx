import React, { useEffect, useState } from "react";
import { type RepsTypes } from "./RepsInterface";
import axios from "axios";
import { prepareRepsData } from '../../shared/Utils/prepareDBdata';
import { BASE_URL } from '../../shared/Utils/apiConfig';
import classes from '../Styles/Reps.module.css'; // Import CSS module
import AddRepForm from "../../UI/Form/AddRepForm"; // Assuming this form will also use Form.module.css or its own
import EditRepForm from "../../UI/Form/EditRepForm";
import { useUserProfile } from '../../shared/Context/UserProfileContext';

interface RepsProps {
    onBack?: () => void;
}

const Reps: React.FC<RepsProps> = ({ onBack }) => {
    const { profile, user } = useUserProfile();
    console.log("👤 [Reps] Logged in user profile:", profile);
    const [repsTable, setRepsTable] = useState<RepsTypes[]>([]);
    const [refreshTrigger, setRefreshTrigger] = useState<number>(0); // Local state to trigger re-fetch
    const [showAddRep, setShowAddRep] = useState<boolean>(false);
    const [showEditRep, setShowEditRep] = useState<boolean>(false);
    const [selectedRep, setSelectedRep] = useState<RepsTypes | null>(null);

    useEffect(() => {
        const fetchUsers = async () => {
            const dbObject = {
                tableName: "reptable",
                business: profile?.business
            };
            try { // Note: Your /reps endpoint is not a generic /getAll, it has a join.
                const response = await axios.get(`${BASE_URL}/reps`, { params: dbObject });

                setRepsTable(prepareRepsData(response.data));
            } catch (error) {
                console.error('Error fetching users:', error);
            }
        };
        fetchUsers();
    }, [refreshTrigger]); // Re-fetch when local trigger changes

    const handleDeleteRep = async (repGuid: string) => {
        if (window.confirm("Are you sure you want to delete this representative?")) {
            try {
                await axios.delete(`${BASE_URL}/deleteItem/reps_table/rep_guid/${repGuid}`);
                console.log("Representative deleted successfully");
                setRefreshTrigger(prev => prev + 1); // Trigger local re-fetch
            } catch (error) {
                console.error('Error deleting representative:', error);
                alert("Failed to delete representative.");
            }
        }
    };

    const handleEditRep = (rep: RepsTypes) => {
        setSelectedRep(rep);
        setShowEditRep(true);
    };

    const handleCloseAddRepForm = () => {
        setShowAddRep(false);
        setRefreshTrigger(prev => prev + 1); // Trigger local re-fetch
    };

    const handleCloseEditRepForm = () => {
        setShowEditRep(false);
        setSelectedRep(null);
        setRefreshTrigger(prev => prev + 1);
    };

    return (
        <div className={classes.repsManagementPanel}>
            <div className={classes.headerContainer}>
                <h1>Boot Representatives</h1>
                <div className={classes.buttonGroup}>
                    {onBack && <button className={classes.actionButton} onClick={onBack}>Back to Admin</button>}
                    <button className={classes.actionButton} onClick={() => setShowAddRep(true)}>Add Representative</button>
                </div>
            </div>

            {showAddRep && <AddRepForm setShowAddRep={handleCloseAddRepForm} />}
            {showEditRep && selectedRep && (
                <EditRepForm rep={selectedRep} onClose={handleCloseEditRepForm} onSuccess={handleCloseEditRepForm} />
            )}

            <table className={classes.table}>
                <thead>
                    <tr>
                        <th className={classes.tableTh}>Name</th>
                        <th className={classes.tableTh}>Event Type</th>
                        <th className={classes.tableTh}>Is Event Active</th>
                        <th className={classes.tableTh}>Event Location</th>
                        <th className={classes.tableTh}>Event Start Date</th>
                        <th className={classes.tableTh}>Event End Date</th>
                        <th className={classes.tableTh}>Action</th>
                    </tr>
                </thead>
                <tbody>
                    {repsTable.map((rep) => (
                        <tr key={rep.RepGUID}>
                            <td className={classes.tableTd}>{rep.FirstName} {rep.LastName}</td>
                            <td className={classes.tableTd}>{rep.EventType}</td>
                            <td className={classes.tableTd}>{rep.IsActive ? "Yes" : "No"}</td>
                            <td className={classes.tableTd}>{rep.EventLocation}</td>
                            <td className={classes.tableTd}>{new Date(rep.EventFirstDate).toLocaleDateString()}</td>
                            <td className={classes.tableTd}>{new Date(rep.EventLastDate).toLocaleDateString()}</td>
                            <td className={classes.tableTd}>
                                <button className={`${classes.actionButton} ${classes.editButton}`} onClick={() => handleEditRep(rep)}>Edit</button>
                                <button className={classes.actionButton} onClick={() => handleDeleteRep(rep.RepGUID)}>Delete</button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default Reps;