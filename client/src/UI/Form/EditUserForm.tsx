import React, { useState, useEffect, useMemo } from 'react';
import classes from '../../GamePlayers/Styles/Form.module.css';
import axios from 'axios';
import { BASE_URL } from '../../shared/Utils/apiConfig';
import { UserType } from '../../GamePlayers/Components/UserInterface';
import { useUserProfile } from '../../shared/Context/UserProfileContext';

interface EditUserFormProps {
    user: UserType;
    onClose: () => void;
    onSuccess: () => void;
}

const EditUserForm: React.FC<EditUserFormProps> = ({ user, onClose, onSuccess }) => {
    const { profile, isAdmin, isBusinessOwner } = useUserProfile();

    const isCreatorAdmin = Boolean(
        isAdmin ||
        profile?.is_admin ||
        profile?.permission_group?.toLowerCase() === 'admin'
    );
    const isCreatorBusinessOwner = !isCreatorAdmin && Boolean(
        isBusinessOwner ||
        profile?.permission_group?.toLowerCase() === 'business_owner' ||
        profile?.permission_group?.toLowerCase() === 'supervisor'
    );

    const [formData, setFormData] = useState<UserType>(user);
    const [roles, setRoles] = useState<{ id: number; role: string; description?: string }[]>([]);
    const [errors, setErrors] = useState({
        first_name: '',
        last_name: '',
        email: '',
        phone_number: '',
    });

    useEffect(() => {
        setFormData(user); // Update form data if the user prop changes
    }, [user]);

    useEffect(() => {
        const fetchRoles = async () => {
            try {
                const response = await axios.get(`${BASE_URL}/api/roles`);
                const rolesData = Array.isArray(response.data) ? response.data : (response.data?.roles || []);
                if (rolesData.length > 0) {
                    setRoles(rolesData);
                } else {
                    const fallback = await axios.get(`${BASE_URL}/getAll`, {
                        params: { tableName: 'roles_table' }
                    });
                    if (Array.isArray(fallback.data) && fallback.data.length > 0) {
                        setRoles(fallback.data);
                    }
                }
            } catch (error) {
                console.error('Error fetching roles:', error);
            }
        };
        fetchRoles();
    }, []);

    const availableRoles = useMemo(() => {
        const sourceRoles = roles.length > 0
            ? roles
            : [
                { id: 1, role: 'Admin', description: 'System Administrator' },
                { id: 2, role: 'Business_Owner', description: 'Business Owner' },
                { id: 3, role: 'Agent', description: 'Agent' },
            ];

        if (isCreatorBusinessOwner) {
            // Business Owner can ONLY assign Business Owner or Agent; MUST NOT see Admin
            return sourceRoles.filter(r => {
                const norm = r.role.toLowerCase();
                return norm === 'business_owner' || norm === 'agent' || norm === 'supervisor';
            });
        }

        if (isCreatorAdmin) {
            return sourceRoles.filter(r => r.role.toLowerCase() !== 'customer');
        }

        return sourceRoles.filter(r => r.role.toLowerCase() !== 'admin' && r.role.toLowerCase() !== 'customer');
    }, [roles, isCreatorAdmin, isCreatorBusinessOwner]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        setErrors(prev => ({ ...prev, [name]: '' }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const newErrors = {
            first_name: !formData.first_name?.trim() ? 'First name is required' : '',
            last_name: !formData.last_name?.trim() ? 'Last name is required' : '',
            email: !formData.email?.trim() ? 'Email is required' : !/\S+@\S+\.\S+/.test(formData.email.trim()) ? 'Invalid email format' : '',
            phone_number: formData.phone_number && !/^\d{10}$/.test(formData.phone_number.replace(/\D/g, '')) ? 'Phone must be 10 digits' : '',
        };

        setErrors(newErrors);
        if (Object.values(newErrors).some(err => err !== '')) return;

        try {
            await axios.patch(`${BASE_URL}/editPlayerForm/${formData.user_guid}`, {
                tableName: 'users_table',
                idColumn: 'user_guid',
                ...formData,
                first_name: formData.first_name.trim(),
                last_name: formData.last_name.trim(),
                email: formData.email.trim(),
                phone_number: formData.phone_number ? formData.phone_number.replace(/\D/g, '') : '',
                is_admin: formData.permission_group?.toLowerCase() === 'admin', // Derive from permission_group
            });
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
                            placeholder="First Name"
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
                            placeholder="Last Name"
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
                            placeholder="name@example.com"
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
                            placeholder="(555) 000-0000"
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
                            placeholder="Street address"
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
                            {availableRoles.length > 0 ? (
                                availableRoles.map(r => (
                                    <option key={r.role} value={r.role}>
                                        {r.role.replace(/_/g, ' ')}
                                    </option>
                                ))
                            ) : (
                                <option value={formData.permission_group}>
                                    {formData.permission_group ? formData.permission_group.replace(/_/g, ' ') : 'Select Role'}
                                </option>
                            )}
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