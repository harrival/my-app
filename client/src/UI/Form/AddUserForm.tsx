import React, { useState, useEffect, useMemo } from 'react';
import classes from '../../GamePlayers/Styles/Form.module.css';
import axios from 'axios';
import { BASE_URL } from '../../shared/Utils/apiConfig';
import { UserType } from '../../GamePlayers/Components/UserInterface';
import { useUserProfile } from '../../shared/Context/UserProfileContext';
import { formatUserFriendlyBusinessName } from '../../shared/Utils/businessInfo';

interface AddUserFormProps {
    onClose: () => void;
    onSuccess: () => void;
}

interface RoleItem {
    id: number;
    role: string;
    description?: string;
}

interface BusinessItem {
    id?: number;
    business_guid?: string;
    business: string;
    business_name?: string;
}

const AddUserForm: React.FC<AddUserFormProps> = ({ onClose, onSuccess }) => {
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
    const creatorBusiness = profile?.business || profile?.business_value || '';

    const [errors, setErrors] = useState({
        first_name: '',
        last_name: '',
        email: '',
        phone_number: '',
        permission_group: '',
        business: '',
    });

    const [formData, setFormData] = useState<Omit<UserType, 'id' | 'user_guid' | 'is_admin' | 'time_created'> & { business?: string }>({
        first_name: '',
        last_name: '',
        email: '',
        phone_number: '',
        address: '',
        permission_group: '',
        business: isCreatorBusinessOwner ? creatorBusiness : '',
    });

    const [roles, setRoles] = useState<RoleItem[]>([]);
    const [businesses, setBusinesses] = useState<BusinessItem[]>([]);
    const [businessMode, setBusinessMode] = useState<'existing' | 'new'>('existing');
    const [newBusinessName, setNewBusinessName] = useState<string>('');
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

    // Keep creator's business synchronized for Business Owner creator
    useEffect(() => {
        if (isCreatorBusinessOwner && creatorBusiness) {
            setFormData(prev => ({ ...prev, business: creatorBusiness }));
        }
    }, [isCreatorBusinessOwner, creatorBusiness]);

    const creatorFriendlyName = useMemo(() => {
        if (!creatorBusiness) return 'None';
        const found = businesses.find(b => b.business.toLowerCase() === creatorBusiness.toLowerCase());
        return formatUserFriendlyBusinessName(creatorBusiness, found?.business_name);
    }, [creatorBusiness, businesses]);

    // Fetch Roles from roles_table
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
                try {
                    const fallback = await axios.get(`${BASE_URL}/getAll`, {
                        params: { tableName: 'roles_table' }
                    });
                    if (Array.isArray(fallback.data) && fallback.data.length > 0) {
                        setRoles(fallback.data);
                    }
                } catch (fbErr) {
                    console.error('Fallback fetching roles failed:', fbErr);
                }
            }
        };
        fetchRoles();
    }, []);

    // Fetch Businesses from business_table
    useEffect(() => {
        const fetchBusinesses = async () => {
            const sortBiz = (list: BusinessItem[]) =>
                list.slice().sort((a, b) => {
                    const nameA = formatUserFriendlyBusinessName(a.business, a.business_name);
                    const nameB = formatUserFriendlyBusinessName(b.business, b.business_name);
                    return nameA.localeCompare(nameB);
                });

            try {
                const response = await axios.get(`${BASE_URL}/api/businesses`);
                const bizData = Array.isArray(response.data)
                    ? response.data
                    : (response.data?.businesses || []);
                if (bizData.length > 0) {
                    setBusinesses(sortBiz(bizData));
                } else {
                    const fallback = await axios.get(`${BASE_URL}/getAll`, {
                        params: { tableName: 'business_table' }
                    });
                    if (Array.isArray(fallback.data) && fallback.data.length > 0) {
                        setBusinesses(sortBiz(fallback.data));
                    }
                }
            } catch (error) {
                console.error('Error fetching businesses:', error);
                try {
                    const fallback = await axios.get(`${BASE_URL}/getAll`, {
                        params: { tableName: 'business_table' }
                    });
                    if (Array.isArray(fallback.data) && fallback.data.length > 0) {
                        setBusinesses(sortBiz(fallback.data));
                    }
                } catch (fbErr) {
                    console.error('Fallback fetching businesses failed:', fbErr);
                }
            }
        };
        fetchBusinesses();
    }, []);

    // Filter roles according to creator's permissions
    const availableRoles = useMemo(() => {
        const sourceRoles: RoleItem[] = roles.length > 0
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
            // Admin can assign Admin, Business Owner, or Agent (excludes customer accounts)
            return sourceRoles.filter(r => r.role.toLowerCase() !== 'customer');
        }

        // Default fallback
        return sourceRoles.filter(r => r.role.toLowerCase() !== 'admin' && r.role.toLowerCase() !== 'customer');
    }, [roles, isCreatorAdmin, isCreatorBusinessOwner]);

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

    const handleRoleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedRole = e.target.value;
        const norm = selectedRole.toLowerCase();

        if (norm === 'admin') {
            // If Permission Group is Admin, there should be no business
            setFormData(prev => ({
                ...prev,
                permission_group: selectedRole,
                business: '',
            }));
            setBusinessMode('existing');
            setNewBusinessName('');
        } else if (isCreatorBusinessOwner) {
            // Creator is business owner: prepopulate with creator's business
            setFormData(prev => ({
                ...prev,
                permission_group: selectedRole,
                business: creatorBusiness,
            }));
        } else {
            // Admin creator selecting Agent or Business Owner
            setFormData(prev => ({
                ...prev,
                permission_group: selectedRole,
                business: '',
            }));
            setBusinessMode('existing');
            setNewBusinessName('');
        }

        if (errors.permission_group) {
            setErrors(prev => ({ ...prev, permission_group: '' }));
        }
        if (errors.business) {
            setErrors(prev => ({ ...prev, business: '' }));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const selectedRoleNorm = (formData.permission_group || '').toLowerCase();
        const isRoleAdmin = selectedRoleNorm === 'admin';
        const isRoleAgent = selectedRoleNorm === 'agent';
        const isRoleBusinessOwner = selectedRoleNorm === 'business_owner' || selectedRoleNorm === 'supervisor';

        let businessError = '';
        let targetBusinessSlug: string | null = null;

        if (isRoleAdmin) {
            // Admin role: no business assigned
            targetBusinessSlug = null;
        } else if (isCreatorBusinessOwner) {
            // Creator is business owner: prepopulate with creator's business
            if (!creatorBusiness) {
                businessError = 'Creator business identifier not found.';
            } else {
                targetBusinessSlug = creatorBusiness;
            }
        } else if (isCreatorAdmin) {
            if (isRoleAgent) {
                // Agent must select from existing business
                if (!formData.business?.trim()) {
                    businessError = 'Please select an existing business for the Agent.';
                } else {
                    targetBusinessSlug = formData.business.trim();
                }
            } else if (isRoleBusinessOwner) {
                // Business Owner can select existing or create new business
                if (businessMode === 'existing') {
                    if (!formData.business?.trim()) {
                        businessError = 'Please select an existing business for the Business Owner.';
                    } else {
                        targetBusinessSlug = formData.business.trim();
                    }
                } else {
                    // Creating new business
                    if (!newBusinessName.trim()) {
                        businessError = 'Please enter a name for the new business.';
                    } else {
                        const slug = newBusinessName
                            .trim()
                            .toLowerCase()
                            .replace(/[^a-z0-9]+/g, '_')
                            .replace(/^_+|_+$/g, '');
                        if (!slug) {
                            businessError = 'Please enter a valid business name.';
                        } else if (businesses.some(b => b.business.toLowerCase() === slug)) {
                            businessError = `A business with identifier "${slug}" already exists. Please select it from existing businesses or choose another name.`;
                        } else {
                            targetBusinessSlug = slug;
                        }
                    }
                }
            } else if (!formData.permission_group) {
                businessError = 'Please select a Permission Group first.';
            }
        }

        const newErrors = {
            first_name: !formData.first_name?.trim() ? 'First name is required' : '',
            last_name: !formData.last_name?.trim() ? 'Last name is required' : '',
            email: !formData.email?.trim()
                ? 'Email is required'
                : !/\S+@\S+\.\S+/.test(formData.email.trim())
                ? 'Invalid email format'
                : '',
            phone_number: formData.phone_number && !/^\d{10}$/.test(formData.phone_number.replace(/\D/g, ''))
                ? 'Phone must be 10 digits'
                : '',
            permission_group: !formData.permission_group ? 'Permission Group is required' : '',
            business: businessError,
        };

        setErrors(newErrors);

        if (Object.values(newErrors).some(err => Boolean(err))) {
            return;
        }

        // Validate unique email
        const emailDuplicateError = await validateUniqueEmail(formData.email.trim());
        if (emailDuplicateError) {
            setErrors(prev => ({ ...prev, email: emailDuplicateError }));
            return;
        }

        setIsSubmitting(true);
        try {
            const userGuid = crypto.randomUUID();

            // If Admin created a new business for Business Owner, create the business record first
            if (isCreatorAdmin && isRoleBusinessOwner && businessMode === 'new' && targetBusinessSlug) {
                try {
                    await axios.post(`${BASE_URL}/api/business`, {
                        business: targetBusinessSlug,
                        business_name: newBusinessName.trim(),
                        user_guid: userGuid,
                        contact_email: formData.email.trim(),
                        contact_phone: formData.phone_number ? formData.phone_number.replace(/\D/g, '') : '',
                        physical_address: formData.address?.trim() || '',
                    });
                } catch (bizErr) {
                    console.warn('Note on business creation:', bizErr);
                    // linkSupervisorBusiness on server will also ensure record exists
                }
            }

            // Insert new user into users_table
            await axios.post(`${BASE_URL}/addToTable`, {
                tableName: 'users_table',
                fields: {
                    user_guid: userGuid,
                    first_name: formData.first_name.trim(),
                    last_name: formData.last_name.trim(),
                    email: formData.email.trim(),
                    phone_number: formData.phone_number ? formData.phone_number.replace(/\D/g, '') : '',
                    address: formData.address?.trim() || '',
                    permission_group: formData.permission_group,
                    business: isRoleAdmin ? null : targetBusinessSlug,
                    is_admin: isRoleAdmin,
                    time_created: new Date().toISOString(),
                }
            });

            // Clear form
            setFormData({
                first_name: '',
                last_name: '',
                email: '',
                phone_number: '',
                address: '',
                permission_group: '',
                business: isCreatorBusinessOwner ? creatorBusiness : '',
            });
            setNewBusinessName('');
            setBusinessMode('existing');
            setErrors({
                first_name: '',
                last_name: '',
                email: '',
                phone_number: '',
                permission_group: '',
                business: '',
            });

            onSuccess();
            onClose();
        } catch (error: any) {
            console.error('Error adding user:', error);
            alert(error?.response?.data?.error || 'Failed to add user.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className={classes.modalOverlay}>
            <div className={classes.modalContent}>
                <h2>Add New User</h2>
                <form onSubmit={handleSubmit}>
                    <div className={classes.formGroup}>
                        <label htmlFor="first_name" className={classes.formLabel}>
                            First Name: <span style={{ color: '#ef4444' }}>*</span>
                        </label>
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
                        <label htmlFor="last_name" className={classes.formLabel}>
                            Last Name: <span style={{ color: '#ef4444' }}>*</span>
                        </label>
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
                        <label htmlFor="email" className={classes.formLabel}>
                            Email: <span style={{ color: '#ef4444' }}>*</span>
                        </label>
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

                    {/* Permission Group dropdown */}
                    <div className={classes.formGroup}>
                        <label htmlFor="permission_group" className={classes.formLabel}>
                            Permission Group: <span style={{ color: '#ef4444' }}>*</span>
                        </label>
                        <select
                            id="permission_group"
                            name="permission_group"
                            className={classes.formSelect}
                            value={formData.permission_group}
                            onChange={handleRoleChange}
                            required
                        >
                            <option value="">Select Role...</option>
                            {availableRoles.map(r => (
                                <option key={r.role} value={r.role}>
                                    {r.role.replace(/_/g, ' ')}
                                </option>
                            ))}
                        </select>
                        {errors.permission_group && <p className={classes.errorText}>{errors.permission_group}</p>}
                    </div>

                    {/* Business assignment logic */}
                    {isCreatorBusinessOwner ? (
                        <div className={classes.formGroup}>
                            <label htmlFor="business" className={classes.formLabel}>Business:</label>
                            <input
                                type="text"
                                id="business"
                                name="business"
                                className={classes.formInput}
                                value={creatorFriendlyName}
                                disabled
                                style={{ backgroundColor: '#f3f4f6', color: '#374151', cursor: 'not-allowed', fontWeight: 600 }}
                            />
                            <p style={{ margin: '4px 0 0 2px', fontSize: '0.8rem', color: '#6b7280' }}>
                                New user will be assigned to your business: <strong>{creatorFriendlyName}</strong>
                            </p>
                            {errors.business && <p className={classes.errorText}>{errors.business}</p>}
                        </div>
                    ) : isCreatorAdmin ? (
                        <>
                            {formData.permission_group?.toLowerCase() === 'admin' ? (
                                <div className={classes.formGroup}>
                                    <label className={classes.formLabel}>Business:</label>
                                    <input
                                        type="text"
                                        className={classes.formInput}
                                        value="None (Global System Administrator)"
                                        disabled
                                        style={{ backgroundColor: '#f3f4f6', color: '#6b7280', cursor: 'not-allowed' }}
                                    />
                                    <p style={{ margin: '4px 0 0 2px', fontSize: '0.8rem', color: '#6b7280' }}>
                                        Admin accounts have system-wide access without a specific business assignment.
                                    </p>
                                </div>
                            ) : formData.permission_group?.toLowerCase() === 'agent' ? (
                                <div className={classes.formGroup}>
                                    <label htmlFor="business" className={classes.formLabel}>
                                        Business: <span style={{ color: '#ef4444' }}>*</span>
                                    </label>
                                    <select
                                        id="business"
                                        name="business"
                                        className={classes.formSelect}
                                        value={formData.business || ''}
                                        onChange={handleChange}
                                        required
                                    >
                                        <option value="">Select Existing Business...</option>
                                        {businesses.map(b => (
                                            <option key={b.business} value={b.business}>
                                                {formatUserFriendlyBusinessName(b.business, b.business_name)}
                                            </option>
                                        ))}
                                    </select>
                                    {errors.business && <p className={classes.errorText}>{errors.business}</p>}
                                    <p style={{ margin: '4px 0 0 2px', fontSize: '0.8rem', color: '#6b7280' }}>
                                        Agents must be assigned to an existing registered business.
                                    </p>
                                </div>
                            ) : (formData.permission_group?.toLowerCase() === 'business_owner' || formData.permission_group?.toLowerCase() === 'supervisor') ? (
                                <div className={classes.formGroup}>
                                    <label className={classes.formLabel}>
                                        Business Assignment: <span style={{ color: '#ef4444' }}>*</span>
                                    </label>
                                    <div style={{ display: 'flex', gap: '20px', margin: '8px 0' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600 }}>
                                            <input
                                                type="radio"
                                                name="businessMode"
                                                value="existing"
                                                checked={businessMode === 'existing'}
                                                onChange={() => {
                                                    setBusinessMode('existing');
                                                    setFormData(prev => ({ ...prev, business: '' }));
                                                    setNewBusinessName('');
                                                    setErrors(prev => ({ ...prev, business: '' }));
                                                }}
                                            />
                                            Select Existing Business
                                        </label>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600 }}>
                                            <input
                                                type="radio"
                                                name="businessMode"
                                                value="new"
                                                checked={businessMode === 'new'}
                                                onChange={() => {
                                                    setBusinessMode('new');
                                                    setFormData(prev => ({ ...prev, business: '' }));
                                                    setNewBusinessName('');
                                                    setErrors(prev => ({ ...prev, business: '' }));
                                                }}
                                            />
                                            Create New Business
                                        </label>
                                    </div>

                                    {businessMode === 'existing' ? (
                                        <>
                                            <select
                                                id="business"
                                                name="business"
                                                className={classes.formSelect}
                                                value={formData.business || ''}
                                                onChange={handleChange}
                                                required
                                            >
                                                <option value="">Select Existing Business...</option>
                                                {businesses.map(b => (
                                                    <option key={b.business} value={b.business}>
                                                        {formatUserFriendlyBusinessName(b.business, b.business_name)}
                                                    </option>
                                                ))}
                                            </select>
                                            <p style={{ margin: '4px 0 0 2px', fontSize: '0.8rem', color: '#6b7280' }}>
                                                Assign to an existing registered business.
                                            </p>
                                        </>
                                    ) : (
                                        <>
                                            <input
                                                type="text"
                                                id="new_business_name"
                                                name="new_business_name"
                                                placeholder="Enter new business name (e.g., Summit Rentals)"
                                                className={classes.formInput}
                                                value={newBusinessName}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setNewBusinessName(val);
                                                    const slug = val
                                                        .trim()
                                                        .toLowerCase()
                                                        .replace(/[^a-z0-9]+/g, '_')
                                                        .replace(/^_+|_+$/g, '');
                                                    setFormData(prev => ({ ...prev, business: slug }));
                                                    if (errors.business) {
                                                        setErrors(prev => ({ ...prev, business: '' }));
                                                    }
                                                }}
                                                required
                                            />
                                            {newBusinessName.trim() && (
                                                <p style={{ margin: '4px 0 0 2px', fontSize: '0.8rem', color: '#4b5563' }}>
                                                    New Business: <strong>{newBusinessName.trim()}</strong>
                                                </p>
                                            )}
                                        </>
                                    )}
                                    {errors.business && <p className={classes.errorText}>{errors.business}</p>}
                                </div>
                            ) : (
                                <div className={classes.formGroup}>
                                    <label className={classes.formLabel}>Business:</label>
                                    <input
                                        type="text"
                                        className={classes.formInput}
                                        placeholder="Select a Permission Group above first"
                                        disabled
                                        style={{ backgroundColor: '#f9fafb', color: '#9ca3af', cursor: 'not-allowed' }}
                                    />
                                </div>
                            )}
                        </>
                    ) : (
                        <div className={classes.formGroup}>
                            <label htmlFor="business" className={classes.formLabel}>Business:</label>
                            <input
                                type="text"
                                id="business"
                                name="business"
                                className={classes.formInput}
                                value={formData.business || creatorBusiness || ''}
                                onChange={handleChange}
                            />
                        </div>
                    )}

                    <div className={classes.buttonContainer}>
                        <button
                            type="submit"
                            className={`${classes.formButton} ${classes.primary}`}
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? 'Adding...' : 'Add User'}
                        </button>
                        <button
                            type="button"
                            className={`${classes.formButton} ${classes.secondary}`}
                            onClick={onClose}
                            disabled={isSubmitting}
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AddUserForm;
