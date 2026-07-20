import React, { useState, useEffect } from 'react';
import classes from '../../GamePlayers/Styles/Form.module.css';
import axios from 'axios';
import { BASE_URL } from '../../shared/Utils/apiConfig';
import { useUserProfile } from '../../shared/Context/UserProfileContext';

interface AddEventFormProps {
    onClose: () => void;
    onSuccess: () => void;
}

const AddEventForm: React.FC<AddEventFormProps> = ({ onClose, onSuccess }) => {
    const { profile } = useUserProfile();

    const [formData, setFormData] = useState({
        event_type: '',
        event_location: '',
        event_first_date: '',
        event_last_date: '',
        event_type_created_by: '',
        is_active: true,
        business: '',
    });
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [isLongTermEvent, setIsLongTermEvent] = useState<boolean>(false);

    useEffect(() => {
        const userBusiness = profile?.business || profile?.business_value || '';
        const userGuid = profile?.user_guid || '';
        setFormData(prev => ({
            ...prev,
            business: userBusiness,
            event_type_created_by: userGuid,
        }));
    }, [profile]);

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
        if (!formData.event_location) newErrors.event_location = "Location is required";

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

        console.log('Submitting new event:', formData);
        try {
            const response = await axios.post(`${BASE_URL}/addToTable`, {
                tableName: 'events_table',
                fields: {
                    event_guid: crypto.randomUUID(), // Generate a new GUID
                    ...formData,
                    event_first_date: isLongTermEvent ? null : formData.event_first_date,
                    event_last_date: isLongTermEvent ? null : formData.event_last_date,
                    time_created: new Date().toISOString(),
                    time_modified: new Date().toISOString(),
                }
            });
            console.log('Event added:', response.data);
            onSuccess();
            onClose();
        } catch (error) {
            console.error('Error adding event:', error);
            alert('Failed to add event.');
        }
    };

    return (
        <div className={classes.modalOverlay}>
            <div className={classes.modalContent}>
                <h2>Add New Event</h2>
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
                        {errors.event_location && <p className={classes.errorText}>{errors.event_location}</p>}
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
                        <button type="submit" className={`${classes.formButton} ${classes.primary}`}>Add Event</button>
                        <button type="button" className={`${classes.formButton} ${classes.secondary}`} onClick={onClose}>Cancel</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AddEventForm;