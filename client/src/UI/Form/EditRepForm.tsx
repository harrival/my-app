import React, { useState, useEffect } from 'react';
import classes from '../../GamePlayers/Styles/Form.module.css';
import axios from 'axios';
import { BASE_URL } from '../../shared/Utils/apiConfig';
import { RepsTypes } from '../../GamePlayers/Components/RepsInterface';

interface EditRepFormProps {
    rep: RepsTypes;
    onClose: () => void;
    onSuccess: () => void;
}

const EditRepForm: React.FC<EditRepFormProps> = ({ rep, onClose, onSuccess }) => {
    const [formData, setFormData] = useState<RepsTypes>(rep);
    const [errors, setErrors] = useState<Record<string, string>>({});

    useEffect(() => {
        setFormData(rep);
    }, [rep]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
        setErrors(prev => ({ ...prev, [name]: '' }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!formData.EventType) {
            setErrors({ EventType: 'Event Type is required' });
            return;
        }

        try {
            await axios.patch(`${BASE_URL}/editPlayerForm/${formData.RepGUID}`, {
                tableName: 'reps_table',
                idColumn: 'rep_guid',
                is_active: formData.IsActive,
                // Map other fields as per your schema
            });
            onSuccess();
            onClose();
        } catch (error) {
            console.error('Error updating representative:', error);
            alert('Failed to update representative.');
        }
    };

    return (
        <div className={classes.modalOverlay}>
            <div className={classes.modalContent}>
                <h2>Edit Representative: {rep.FirstName} {rep.LastName}</h2>
                <form onSubmit={handleSubmit}>
                    <div className={classes.formGroup}>
                        <label className={classes.formLabel}>Event Type (Read Only):</label>
                        <input
                            type="text"
                            className={classes.formInput}
                            value={formData.EventType}
                            disabled
                        />
                    </div>
                    <div className={classes.checkboxGroup}>
                        <label htmlFor="IsActive" className={classes.formLabel}>Is Active:</label>
                        <input
                            id="IsActive"
                            name="IsActive"
                            type="checkbox"
                            checked={formData.IsActive}
                            onChange={handleChange}
                            className={classes.checkboxInput}
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

export default EditRepForm;