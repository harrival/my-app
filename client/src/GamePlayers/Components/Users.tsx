import React, { useEffect, useState } from "react";
import axios from "axios";
import { BASE_URL } from '../../shared/Utils/apiConfig';
import classes from '../Styles/Users.module.css'; // Import CSS module
import { UserType } from './UserInterface'; // Import UserType from the new interface file
import AddUserForm from '../../UI/Form/AddUserForm';
import EditUserForm from '../../UI/Form/EditUserForm';

interface UsersProps {
    onBack?: () => void;
}

const Users: React.FC<UsersProps> = ({ onBack }) => {
    const [users, setUsers] = useState<UserType[]>([]);
    const [selectedUser, setSelectedUser] = useState<UserType | null>(null);
    const [showEditUserForm, setShowEditUserForm] = useState<boolean>(false); // New state for edit form
    const [showAddUser, setShowAddUser] = useState<boolean>(false);
    const [refreshTrigger, setRefreshTrigger] = useState<number>(0); // Local state to trigger re-fetch

    useEffect(() => {
        const fetchUsers = async () => {
            try {
                // Calling the generic getAll endpoint with the specific table name
                const response = await axios.get(`${BASE_URL}/getAll`, {
                    params: { tableName: "users_table" }
                });
                setUsers(response.data);
            } catch (error) {
                console.error('Error fetching users:', error);
            }
        };
        fetchUsers();
    }, [refreshTrigger]); // Re-fetch when local trigger changes

    const handleDeleteUser = async (userGuid: string) => {
        if (window.confirm("Are you sure you want to delete this user?")) {
            try {
                // Using the new generic deleteItem route
                await axios.delete(`${BASE_URL}/deleteItem/users_table/user_guid/${userGuid}`);
                console.log("User deleted successfully");
                setRefreshTrigger(prev => prev + 1); // Trigger local re-fetch
            } catch (error) {
                console.error('Error deleting user:', error);
                alert("Failed to delete user.");
            }
        }
    };

    const handleEditUser = (user: UserType) => {
        setSelectedUser(user);
        // For now, we'll just log and show a placeholder form.
        // In a real app, you'd open a modal with an EditUserForm pre-filled.
        setShowEditUserForm(true);
    };

    const handleAddUser = () => {
        setShowAddUser(true);
        setSelectedUser(null); // Ensure no user is selected when adding
    };

    const handleCloseAddUserForm = () => {
        setShowAddUser(false);
        setRefreshTrigger(prev => prev + 1); // Trigger local re-fetch
    };

    const handleCloseEditUserForm = () => {
        setShowEditUserForm(false);
        setSelectedUser(null);
        setRefreshTrigger(prev => prev + 1); // Trigger local re-fetch
    };

    return (
        <div className={classes.usersManagementPanel}>
            <div className={classes.headerContainer}>
                <h1>Users Management</h1>
                <div className={classes.buttonGroup}>
                    {onBack && <button className={classes.actionButton} onClick={onBack}>Back to Admin</button>}
                    <button className={classes.actionButton} onClick={() => setShowAddUser(true)}>Add User</button>
                </div>
            </div>
            
            {showAddUser && <AddUserForm onClose={handleCloseAddUserForm} onSuccess={handleCloseAddUserForm} />}
            {showEditUserForm && selectedUser && <EditUserForm user={selectedUser} onClose={handleCloseEditUserForm} onSuccess={handleCloseEditUserForm} />}

            <table className={classes.table}>
                <thead>
                    <tr>
                        <th className={classes.tableTh}>First Name</th>
                        <th className={classes.tableTh}>Last Name</th>
                        <th className={classes.tableTh}>Email</th>
                        <th className={classes.tableTh}>Phone Number</th>
                        <th className={classes.tableTh}>Action</th>
                    </tr>
                </thead>
                <tbody>
                    {users.map((user) => (
                        <tr key={user.user_guid}>
                            <td className={classes.tableTd}>{user.first_name}</td>
                            <td className={classes.tableTd}>{user.last_name}</td>
                            <td className={classes.tableTd}>{user.email}</td>
                            <td className={classes.tableTd}>{user.phone_number}</td>
                            <td className={`${classes.tableTd} ${classes.tableTdCenter}`}>
                                <button className={`${classes.actionButton} ${classes.editButton}`} onClick={() => handleEditUser(user)}>
                                    Edit
                                </button>
                                <button className={classes.actionButton} onClick={() => handleDeleteUser(user.user_guid)}>
                                    Delete
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default Users;