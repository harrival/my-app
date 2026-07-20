import React, { useState, useEffect } from 'react';
import classes from '../../GamePlayers/Styles/Form.module.css';
import axios from 'axios';
import { BASE_URL } from '../../shared/Utils/apiConfig';
import { EventType } from '../../GamePlayers/Components/EventInterface';

interface EditEventFormProps {
    event: EventType;
    onClose: () => void;
    onSuccess: () => void;
}

const EditEventForm: React.FC<EditEventFormProps> = ({ event, onClose, onSuccess }) => {
    // Format dates for input type="date"
    const formatToDateInput = (isoString: string) => {
        if (!isoString) return '';
        const date = new Date(isoString);
        return date.toISOString().split('T')[0];
    };

    const [formData, setFormData] = useState({
        ...event,
        event_first_date: formatToDateInput(event.event_first_date),
        event_last_date: formatToDateInput(event.event_last_date),
        event_type_created_by: (event as any).event_type_created_by || '',
    });
    const [users, setUsers] = useState<any[]>([]);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [isLongTermEvent, setIsLongTermEvent] = useState<boolean>(!event.event_first_date);

    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const response = await axios.get(`${BASE_URL}/getAll/`, {
                    params: {
                        tableName: "users_table",
                        permission_group: ['Admin']
                    }
                });
                setUsers(response.data);
            } catch (error) {
                console.error('Error fetching users:', error);
            }
        };
        fetchUsers();

        setFormData({
            ...event,
            event_first_date: formatToDateInput(event.event_first_date),
            event_last_date: formatToDateInput(event.event_last_date),
            event_type_created_by: (event as any).event_type_created_by || '',
        });
        setIsLongTermEvent(!event.event_first_date);
    }, [event]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        const checked = type === 'checkbox' ? (e.target as HTMLInputElement).checked : undefined;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
        setErrors(prev => ({ ...prev, [name]: '' }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const newErrors: Record<string, string> = {};
        if (!formData.event_type) newErrors.event_type = "Event type is required";
        if (!formData.event_type_created_by) newErrors.event_type_created_by = "Creator selection is required";
        
        if (!isLongTermEvent) {
            if (!formData.event_first_date) newErrors.event_first_date = "Start date is required";
            if (!formData.event_last_date) newErrors.event_last_date = "End date is required";
            if (formData.event_first_date && formData.event_last_date) {
                if (new Date(formData.event_first_date) > new Date(formData.event_last_date)) {
                    newErrors.event_last_date = "End date cannot be before start date";
                }
            }
        }

        setErrors(newErrors);
        if (Object.keys(newErrors).length > 0) return;

        console.log('Updating event:', formData);
        try {
            const response = await axios.patch(`${BASE_URL}/editPlayerForm/${formData.event_guid}`, {
                tableName: 'events_table',
                idColumn: 'event_guid',
                ...formData,
                event_first_date: isLongTermEvent ? null : formData.event_first_date,
                event_last_date: isLongTermEvent ? null : formData.event_last_date,
                time_modified: new Date().toISOString(),
            });
            console.log('Event updated:', response.data);
            onSuccess();
            onClose();
        } catch (error) {
            console.error('Error updating event:', error);
            alert('Failed to update event.');
        }
    };

    return (
        <div className={classes.modalOverlay}>
            <div className={classes.modalContent}>
                <h2>Edit Event: {event.event_type}</h2>
                <form onSubmit={handleSubmit}>
                    <div className={classes.formGroup}>
                        <label htmlFor="event_type" className={classes.formLabel}>Event Type:</label>
                        <input
                            type="text"
                            id="event_type"
                            name="event_type"
                            className={classes.formInput}
                            value={formData.event_type}
                            onChange={handleChange}
                            required
                        />
                        {errors.event_type && <p className={classes.errorText}>{errors.event_type}</p>}
                    </div>
                    <div className={classes.formGroup}>
                        <label htmlFor="event_location" className={classes.formLabel}>Event Location:</label>
                        <input
                            type="text"
                            id="event_location"
                            name="event_location"
                            className={classes.formInput}
                            value={formData.event_location}
                            onChange={handleChange}
                            required
                        />
                    </div>
                    <div className={classes.checkboxGroup} style={{ marginBottom: '1rem' }}>
                        <label htmlFor="isLongTermEvent" className={classes.formLabel}>Is long term event?</label>
                        <input
                            type="checkbox"
                            id="isLongTermEvent"
                            name="isLongTermEvent"
                            className={classes.checkboxInput}
                            checked={isLongTermEvent}
                            onChange={(e) => setIsLongTermEvent(e.target.checked)}
                        />
                    </div>
                    {!isLongTermEvent && (
                        <>
                            <div className={classes.formGroup}>
                                <label htmlFor="event_first_date" className={classes.formLabel}>Start Date:</label>
                                <input
                                    type="date"
                                    id="event_first_date"
                                    name="event_first_date"
                                    className={classes.formInput}
                                    value={formData.event_first_date}
                                    onChange={handleChange}
                                    required={!isLongTermEvent}
                                />
                                {errors.event_first_date && <p className={classes.errorText}>{errors.event_first_date}</p>}
                            </div>
                            <div className={classes.formGroup}>
                                <label htmlFor="event_last_date" className={classes.formLabel}>End Date:</label>
                                <input
                                    type="date"
                                    id="event_last_date"
                                    name="event_last_date"
                                    className={classes.formInput}
                                    value={formData.event_last_date}
                                    onChange={handleChange}
                                    required={!isLongTermEvent}
                                />
                                {errors.event_last_date && <p className={classes.errorText}>{errors.event_last_date}</p>}
                            </div>
                        </>
                    )}
                    <div className={classes.checkboxGroup}>
                        <label htmlFor="event_type_created_by" className={classes.formLabel}>Created By:</label>
                        <select
                            id="event_type_created_by"
                            name="event_type_created_by"
                            className={classes.formSelect}
                            value={formData.event_type_created_by}
                            onChange={handleChange}
                            required
                        >
                            <option value="">Select a creator</option>
                            {users.map(user => (
                                <option key={user.user_guid} value={user.user_guid}>
                                    {user.first_name} {user.last_name}
                                </option>
                            ))}
                        </select>
                        {errors.event_type_created_by && <p className={classes.errorText}>{errors.event_type_created_by}</p>}
                    </div>
                    <div className={classes.checkboxGroup}>
                        <label htmlFor="is_active" className={classes.formLabel}>Is Active:</label>
                        <input
                            type="checkbox"
                            id="is_active"
                            name="is_active"
                            className={classes.checkboxInput}
                            checked={formData.is_active}
                            onChange={handleChange}
                        />
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

export default EditEventForm;