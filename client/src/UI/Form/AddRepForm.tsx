import axios from 'axios';
import React, { useEffect, useState } from 'react';

import { prepareCustomersData } from '../../shared/Utils/prepareDBdata';
import { BASE_URL } from '../../shared/Utils/apiConfig';
import classes from '../../GamePlayers/Styles/Form.module.css';
import { type NewRep } from '../../shared/Utils/prepareDBdata';
import { type RepsTypes } from '../../GamePlayers/Components/RepsInterface';
import { EventType as EventInterfaceType } from '../../GamePlayers/Components/EventInterface';
import { useUserProfile } from '../../shared/Context/UserProfileContext';

interface AddRepProps {
    setShowAddRep: (value: boolean) => void;
}
interface Representative {
    RepGUID: string;
    // user_guid: string; // This should be user_guid, not CustomerGUID
    CustomerGUID: string;
    FirstName: string;
    LastName: string;
    IsActive: boolean;
    EventFirstDate: string;
    EventLastDate: string;
    EventType: string;
    Business?: string;
}

const AddRepForm = ({ setShowAddRep }: AddRepProps) => {
    const { profile } = useUserProfile();
    const isSupervisor = profile?.permission_group?.toLowerCase() === 'supervisor';

    const [reps, setReps] = useState<NewRep[]>([]);
    const [firstNameOptions, setFirstNameOptions] = useState<string[]>([]);
    const [lastNameOptions, setLastNameOptions] = useState<string[]>([]);
    const [events, setEvents] = useState<EventInterfaceType[]>([]);
    const [rep, setRep] = useState<Partial<Representative>>({}); // Use Partial for initial empty state
    const [errors, setErrors] = useState({
        FirstName: '',
        LastName: '',
        EventType: '',
        CustomerGUID: '',
        EventFirstDate: '',
        EventLastDate: ''
    });

    useEffect(() => {
        if (isSupervisor) {
            const userBusiness = profile?.business || profile?.business_value || '';
            setRep(prev => ({ ...prev, Business: userBusiness }));
        }
    }, [isSupervisor, profile]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;

        if (name === 'EventType') {
            const selectedEvent = events.find(ev => ev.event_guid === value);
            setRep(prev => ({
                ...prev,
                EventType: value,
                EventFirstDate: selectedEvent?.event_first_date ? new Date(selectedEvent.event_first_date).toISOString().split('T')[0] : 'N/A',
                EventLastDate: selectedEvent?.event_last_date ? new Date(selectedEvent.event_last_date).toISOString().split('T')[0] : 'N/A',
            }));
        } else {
            setRep(prev => ({ ...prev, [name]: value }));
        }

        setErrors(prev => ({ ...prev, [name]: '' }));
    };

    const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const { name, value } = e.target;
        setErrors(prev => ({ ...prev, [name]: '', CustomerGUID: '' }));
        const selectedRep = reps.filter(rep => rep[name as keyof NewRep] === value);

        if (selectedRep.length === 1) {
            setRep({
                ...rep,
                CustomerGUID: selectedRep[0]?.CustomerGUID,
                FirstName: selectedRep[0]?.FirstName,
                LastName: selectedRep[0]?.LastName,
            } as Representative);
        } else if (selectedRep.length > 1 && name === 'FirstName') { // This logic seems complex for simple selection
            // Handle multiple selections
            const hasLastName = rep?.LastName;
            if (hasLastName) {
                const filteredReps = selectedRep.filter(rep => rep.LastName === hasLastName
                    && rep[name as keyof NewRep] === value);
                if (filteredReps.length === 1) {
                    setRep({
                        ...rep,
                        CustomerGUID: filteredReps[0]?.CustomerGUID,
                        FirstName: filteredReps[0]?.FirstName,
                        LastName: filteredReps[0]?.LastName,
                    } as Representative);
                }
            } else {
                // If no last name is selected, just set the first name
                const lastNameOptions = selectedRep.map(rep => rep.LastName);
                setLastNameOptions(lastNameOptions);
                setRep({
                    ...rep,
                    FirstName: value,
                } as Representative);
            }
        } else if (selectedRep.length > 1 && name === 'LastName') {
            // Handle multiple selections
            const hasFirstName = rep?.FirstName;
            if (hasFirstName) {
                const filteredReps = selectedRep.filter(rep => rep.FirstName === hasFirstName
                    && rep[name as keyof NewRep] === value);
                if (filteredReps.length === 1) {
                    setRep({
                        ...rep,
                        CustomerGUID: filteredReps[0]?.CustomerGUID,
                        FirstName: filteredReps[0]?.FirstName,
                        LastName: filteredReps[0]?.LastName,
                    } as Representative);
                }
            } else {
                // If no first name is selected, just set the last name
                const firstNameOptions = selectedRep.map(rep => rep.FirstName);
                setFirstNameOptions(firstNameOptions);
                setRep({
                    ...rep,
                    LastName: value,
                } as Representative);
            }
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const newErrors = {
            FirstName: !rep.FirstName ? 'First name is required' : '',
            LastName: !rep.LastName ? 'Last name is required' : '',
            EventType: !rep.EventType ? 'Please select an event' : '',
            CustomerGUID: !rep.CustomerGUID ? 'Please select a valid customer' : '',
            EventFirstDate: !rep.EventFirstDate ? 'First date is required' : '',
            EventLastDate: !rep.EventLastDate ? 'Last date is required' : ''
        };

        if (rep.EventFirstDate && rep.EventLastDate && rep.EventFirstDate !== 'N/A' && rep.EventLastDate !== 'N/A'
            && new Date(rep.EventLastDate) < new Date(rep.EventFirstDate)) {
            newErrors.EventLastDate = 'Event last date cannot be less than event first date';
        }

        setErrors(newErrors);
        if (Object.values(newErrors).some(err => err !== '')) return;

        try {
            // Check for existing rep assignments that would conflict
            const existingRepsRes = await axios.get(`${BASE_URL}/getAll`, {
                params: {
                    tableName: 'reps_table',
                    rep: rep.CustomerGUID,
                    business: rep.Business,
                }
            });

            const existingReps = existingRepsRes.data || [];

            if (existingReps.length > 0) {
                // Get the selected event's dates
                const selectedEvent = events.find(ev => ev.event_guid === rep.EventType);
                const newStart = selectedEvent?.event_first_date ? new Date(selectedEvent.event_first_date) : null;
                const newEnd = selectedEvent?.event_last_date ? new Date(selectedEvent.event_last_date) : null;

                for (const existing of existingReps) {
                    // Get the existing assignment's event to check its dates
                    const existingEvent = events.find(ev => ev.event_guid === existing.event_id);

                    const existingStart = existingEvent?.event_first_date ? new Date(existingEvent.event_first_date) : null;
                    const existingEnd = existingEvent?.event_last_date ? new Date(existingEvent.event_last_date) : null;

                    // If the existing assignment's event has no dates, block creation entirely
                    if (!existingStart && !existingEnd) {
                        setErrors(prev => ({
                            ...prev,
                            CustomerGUID: `${rep.FirstName} ${rep.LastName} already has an assignment with no date boundaries (${existingEvent?.event_type || 'Unknown event'}). Cannot create another assignment.`
                        }));
                        return;
                    }

                    // If the new event has no dates, and the rep already has any assignment, block it
                    if (!newStart && !newEnd) {
                        setErrors(prev => ({
                            ...prev,
                            EventFirstDate: `Cannot assign an event with no dates — ${rep.FirstName} ${rep.LastName} already has existing assignments.`
                        }));
                        return;
                    }

                    // Check for date overlap: two ranges overlap if start1 <= end2 AND start2 <= end1
                    if (newStart && newEnd && existingStart && existingEnd) {
                        if (newStart <= existingEnd && existingStart <= newEnd) {
                            setErrors(prev => ({
                                ...prev,
                                EventType: `Date conflict: ${rep.FirstName} ${rep.LastName} is already assigned to "${existingEvent?.event_type || 'an event'}" (${existingStart.toLocaleDateString()} – ${existingEnd.toLocaleDateString()}) which overlaps with the selected dates.`
                            }));
                            return;
                        }
                    }
                }
            }

            const response = await axios.post(`${BASE_URL}/addToTable`, {
                tableName: 'reps_table',
                fields: {
                    rep_guid: crypto.randomUUID(), // Generate a new GUID
                    rep: rep.CustomerGUID, // Assuming CustomerGUID maps to rep column in reps_table
                    event_id: rep.EventType, // Selected Event GUID
                    is_active: rep.IsActive || false,
                    business: rep.Business,
                }
            });
            setShowAddRep(false); // Close the form
        } catch (error) {
            console.error('Error adding representative:', error);
            alert('Failed to add representative.');
        }
    };

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [customersRes, eventsRes] = await Promise.all([
                    axios.get(`${BASE_URL}/getAll/`, {
                        params: {
                            tableName: "users_table",
                            business: profile?.business
                        }
                    }),
                    axios.get(`${BASE_URL}/getAll/`, {
                        params: {
                            tableName: "events_table",
                            business: profile?.business
                        }
                    })
                ]);

                setReps(prepareCustomersData(customersRes.data));
                setEvents(eventsRes.data);
            } catch (error) {
                console.error('Error fetching data:', error);
            }
        };

        fetchData();
    }, [profile?.business]);

    useEffect(() => {
        const firstNames = reps.map(rep => rep.FirstName);
        const lastNames = reps.map(rep => rep.LastName);
        setFirstNameOptions(firstNames);
        setLastNameOptions(lastNames);
    }, [reps]);

    return (
        <div className={classes.modalOverlay}>
            <div className={classes.modalContent}>
                <form onSubmit={handleSubmit}>
                    <div className={classes.formGroup}>
                        <label htmlFor="firstName" className={classes.formLabel}>First Name:</label>
                        <select
                            id="firstName"
                            name="FirstName"
                            className={classes.formSelect}
                            value={rep?.FirstName || ''}
                            onChange={handleSelectChange}
                        >
                            <option value="">Select First Name</option>
                            {firstNameOptions.map((firstName) => (
                                <option key={firstName} value={firstName}>
                                    {firstName}
                                </option>
                            ))}
                        </select>
                        {errors.FirstName && <p className={classes.errorText}>{errors.FirstName}</p>}
                    </div>
                    <div className={classes.formGroup}>
                        <label htmlFor="lastName" className={classes.formLabel}>Last Name:</label>
                        <select
                            id="lastName"
                            name="LastName"
                            className={classes.formSelect}
                            value={rep?.LastName || ''}
                            onChange={handleSelectChange}
                        >
                            <option value="">Select Last Name</option>
                            {lastNameOptions.map((lastName) => (
                                <option key={lastName} value={lastName}>
                                    {lastName}
                                </option>
                            ))}
                        </select>
                        {errors.LastName && <p className={classes.errorText}>{errors.LastName}</p>}
                    </div>
                    <div className={classes.formGroup}>
                        <label htmlFor="eventType" className={classes.formLabel}>Event Type:</label>
                        <select
                            id="eventType"
                            name="EventType"
                            value={rep?.EventType || ''}
                            onChange={handleChange}
                            className={classes.formSelect}
                        >
                            <option value="">Select an Event</option>
                            {events.map((event) => (
                                <option key={event.event_guid} value={event.event_guid}>
                                    {event.event_type}
                                </option>
                            ))}
                        </select>
                        {errors.EventType && <p className={classes.errorText}>{errors.EventType}</p>}
                    </div>
                    <div className={classes.formGroup}>
                        <label htmlFor="eventFirstDate" className={classes.formLabel}>Event First Date:</label>
                        <input
                            id="eventFirstDate"
                            name="EventFirstDate"
                            type="date"
                            placeholder='Enter event first date'
                            value={rep?.EventFirstDate || ''}
                            onChange={handleChange}
                            className={classes.formInput}
                            readOnly
                            disabled
                        />
                        {errors.EventFirstDate && <p className={classes.errorText}>{errors.EventFirstDate}</p>}
                    </div>
                    <div className={classes.formGroup}>
                        <label htmlFor="eventLastDate" className={classes.formLabel}>Event Last Date:</label>
                        <input
                            id="eventLastDate"
                            name="EventLastDate"
                            type="date"
                            placeholder='Enter event last date'
                            value={rep?.EventLastDate || ''}
                            onChange={handleChange}
                            className={classes.formInput}
                            readOnly
                            disabled
                        />
                        {errors.EventLastDate && <p className={classes.errorText}>{errors.EventLastDate}</p>}
                    </div>
                    {errors.CustomerGUID && <p className={classes.errorText}>{errors.CustomerGUID}</p>}
                    <div className={classes.checkboxGroup}>
                        <label htmlFor="isActive" className={classes.formLabel}>Is Active:</label>
                        <input
                            id="isActive"
                            name="IsActive"
                            type="checkbox"
                            checked={rep?.IsActive || false}
                            onChange={(e) => {
                                setRep(prev => ({ ...prev, IsActive: e.target.checked }));
                            }}
                            className={classes.checkboxInput}
                        />
                    </div>
                    <div className={classes.buttonContainer}>
                        <button type="submit" className={`${classes.formButton} ${classes.primary}`}>Submit</button>
                        <button type="button" className={`${classes.formButton} ${classes.secondary}`} onClick={() => setShowAddRep(false)}>Cancel</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AddRepForm;