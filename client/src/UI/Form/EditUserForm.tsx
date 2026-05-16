import React, { useState, useEffect } from 'react';
import classes from '../../GamePlayers/Styles/Form.module.css';
import axios from 'axios';
import { BASE_URL } from '../../shared/Utils/apiConfig';
import { UserType } from '../../GamePlayers/Components/UserInterface';

interface EditUserFormProps {
    user: UserType;
    onClose: () => void;
    onSuccess: () => void;
}

const EditUserForm: React.FC<EditUserFormProps> = ({ user, onClose, onSuccess }) => {
    const [formData, setFormData] = useState<UserType>(user);
    const [errors, setErrors] = useState({
        first_name: '',
        last_name: '',
        email: '',
        phone_number: '',
    });

    useEffect(() => {
        setFormData(user); // Update form data if the user prop changes
    }, [user]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        setErrors(prev => ({ ...prev, [name]: '' }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const newErrors = {
            first_name: !formData.first_name ? 'First name is required' : '',
            last_name: !formData.last_name ? 'Last name is required' : '',
            email: !formData.email ? 'Email is required' : !/\S+@\S+\.\S+/.test(formData.email) ? 'Invalid email format' : '',
            phone_number: formData.phone_number && !/^\d{10}$/.test(formData.phone_number) ? 'Phone must be 10 digits' : '',
        };

        setErrors(newErrors);
        if (Object.values(newErrors).some(err => err !== '')) return;

        console.log('Updating user:', formData);
        try {
            // Example API call to update user
            const response = await axios.patch(`${BASE_URL}/editPlayerForm/${formData.user_guid}`, {
                tableName: 'users_table',
                idColumn: 'user_guid',
                ...formData,
                is_admin: formData.permission_group === 'admin', // Derive from permission_group
            });
            console.log('User updated:', response.data);
            onSuccess(); // Notify parent to refresh data
            onClose();
        } catch (error) {
            console.error('Error updating user:', error);
            alert('Failed to update user.');
        }
    };

    return (
        <div className={classes.modalOverlay}>
            <div className={classes.modalContent}>
                <h2>Edit User: {user.first_name} {user.last_name}</h2>
                <form onSubmit={handleSubmit}>
                    <div className={classes.formGroup}>
                        <label htmlFor="first_name" className={classes.formLabel}>First Name:</label>
                        <input
                            type="text"
                            id="first_name"
                            name="first_name"
                            className={classes.formInput}
                            value={formData.first_name}
                            onChange={handleChange}
                            required
                        />
                        {errors.first_name && <p className={classes.errorText}>{errors.first_name}</p>}
                    </div>
                    <div className={classes.formGroup}>
                        <label htmlFor="last_name" className={classes.formLabel}>Last Name:</label>
                        <input
                            type="text"
                            id="last_name"
                            name="last_name"
                            className={classes.formInput}
                            value={formData.last_name}
                            onChange={handleChange}
                            required
                        />
                        {errors.last_name && <p className={classes.errorText}>{errors.last_name}</p>}
                    </div>
                    <div className={classes.formGroup}>
                        <label htmlFor="email" className={classes.formLabel}>Email:</label>
                        <input
                            type="email"
                            id="email"
                            name="email"
                            className={classes.formInput}
                            value={formData.email}
                            onChange={handleChange}
                            required
                        />
                        {errors.email && <p className={classes.errorText}>{errors.email}</p>}
                    </div>
                    <div className={classes.formGroup}>
                        <label htmlFor="phone_number" className={classes.formLabel}>Phone Number:</label>
                        <input
                            type="tel"
                            id="phone_number"
                            name="phone_number"
                            className={classes.formInput}
                            value={formData.phone_number}
                            onChange={handleChange}
                        />
                        {errors.phone_number && <p className={classes.errorText}>{errors.phone_number}</p>}
                    </div>
                    <div className={classes.formGroup}>
                        <label htmlFor="address" className={classes.formLabel}>Address:</label>
                        <input
                            type="text"
                            id="address"
                            name="address"
                            className={classes.formInput}
                            value={formData.address}
                            onChange={handleChange}
                        />
                    </div>
                    <div className={classes.formGroup}>
                        <label htmlFor="permission_group" className={classes.formLabel}>Permission Group:</label>
                        <select
                            id="permission_group"
                            name="permission_group"
                            className={classes.formSelect}
                            value={formData.permission_group}
                            onChange={handleChange}
                        >
                            <option value="user">User</option>
                            <option value="admin">Admin</option>
                        </select>
                    </div>
                    <div className={classes.buttonContainer}>
                        <button type="submit" className={`${classes.formButton} ${classes.primary}`}>Save Changes</button>
                        <button type="button" className={`${classes.formButton} ${classes.secondary}`} onClick={onClose}>Cancel</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default EditUserForm;