import React, { useState, useEffect } from 'react';
import classes from '../../GamePlayers/Styles/Form.module.css';
import axios from 'axios';
import { BASE_URL } from '../../shared/Utils/apiConfig';
import { UserType } from '../../GamePlayers/Components/UserInterface'; // Import UserType
import { useUserProfile } from '../../shared/Context/UserProfileContext';

interface AddUserFormProps {
    onClose: () => void;
    onSuccess: () => void;
}

const AddUserForm: React.FC<AddUserFormProps> = ({ onClose, onSuccess }) => {
    const { profile } = useUserProfile();

    const [errors, setErrors] = useState({
        first_name: '',
        last_name: '',
        email: '',
        phone_number: '',
    });

    const [formData, setFormData] = useState<Omit<UserType, 'id' | 'user_guid' | 'is_admin' | 'time_created'> & { business?: string }>({
        first_name: '',
        last_name: '',
        email: '',
        phone_number: '',
        address: '',
        permission_group: 'agent',
        business: '',
    });

    const isSupervisor = profile?.permission_group?.toLowerCase() === 'supervisor';

    useEffect(() => {
        if (isSupervisor) {
            const userBusiness = profile?.business || profile?.business_value || '';
            setFormData(prev => ({ ...prev, business: userBusiness, permission_group: 'agent' }));
        }
    }, [isSupervisor, profile]);

    const validateUniqueEmail = async (email: string): Promise<string> => {
        try {
            const response = await axios.get(`${BASE_URL}/getOne`, {
                params: {
                    tableName: "users_table",
                    email: email
                }
            });
            return response.data ? 'Email already exists' : '';
        } catch (error) {
            console.error('Error checking email uniqueness:', error);
            return '';
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        if (errors[name as keyof typeof errors]) {
            setErrors(prev => ({ ...prev, [name]: '' }));
        }
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

        if (Object.values(newErrors).some(error => error !== '')) {
            return;
        }

        // Placeholder for actual API call
        const emailDuplicateError = await validateUniqueEmail(formData.email);
        if (emailDuplicateError) {
            setErrors(prev => ({ ...prev, email: emailDuplicateError }));
            return;
        }

        console.log('Submitting new user:', formData);
        try {
            // Example API call (replace with your actual /addToTable endpoint logic)
            const response = await axios.post(`${BASE_URL}/addToTable`, {
                tableName: 'users_table',
                fields: {
                    user_guid: crypto.randomUUID(), // Generate a new GUID
                    ...formData,
                    is_admin: formData.permission_group === 'admin', // Derive from permission_group
                    time_created: new Date().toISOString(),
                }
            });
            console.log('User added:', response.data);
            onSuccess(); // Notify parent to refresh data
            onClose();
        } catch (error) {
            console.error('Error adding user:', error);
            alert('Failed to add user.');
        }
    };

    return (
        <div className={classes.modalOverlay}>
            <div className={classes.modalContent}>
                <h2>Add New User</h2>
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
                            disabled={isSupervisor}
                        >
                            <option value="Admin">Admin</option>
                            <option value="Supervisor">Supervisor</option>
                            <option value="Agent">Agent</option>
                        </select>
                    </div>
                    <div className={classes.formGroup}>
                        <label htmlFor="business" className={classes.formLabel}>Business:</label>
                        <input
                            type="text"
                            id="business"
                            name="business"
                            className={classes.formInput}
                            value={formData.business || ''}
                            onChange={handleChange}
                            disabled={isSupervisor}
                        />
                    </div>
                    <div className={classes.buttonContainer}>
                        <button type="submit" className={`${classes.formButton} ${classes.primary}`}>Add User</button>
                        <button type="button" className={`${classes.formButton} ${classes.secondary}`} onClick={onClose}>Cancel</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AddUserForm;