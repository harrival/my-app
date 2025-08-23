import axios from 'axios';
import React, { useEffect, useState } from 'react';

import { prepareCustomersData } from '../../shared/Utils/prepareDBdata';
import { type NewRep } from '../../shared/Utils/prepareDBdata';
import {type RepsTypes} from '../../Rep/component/RepsInterface';

interface AddRepProps {
    setShowAddRep: (value: boolean) => void;
}
interface Representative {
    RepGUID: string;
    CustomerGUID: string;
    FirstName: string;
    LastName: string;
    IsActive: boolean;
    EventFirstDate: string;
    EventLastDate: string;
    EventLocation: string;
    EventType: string;
}

const AddRepForm = ({ setShowAddRep }: AddRepProps) => {
    const [reps, setReps] = useState<NewRep[]>([]);
    const [firstNameOptions, setFirstNameOptions] = useState<string[]>([]);
    const [lastNameOptions, setLastNameOptions] = useState<string[]>([]);
    const [rep, setRep] = useState<Representative | null>(null);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        if (rep) {
            setRep({ ...rep, [name]: value });
        }
    };

    const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const { name, value } = e.target;
        const selectedRep = reps.filter(rep => rep[name as keyof NewRep] === value);

        if (selectedRep.length === 1) {
            setRep({
                ...rep,
                CustomerGUID: selectedRep[0]?.CustomerGUID,
                FirstName: selectedRep[0]?.FirstName,
                LastName: selectedRep[0]?.LastName,
            } as Representative);
        } else if (selectedRep.length > 1 && name === 'FirstName') {
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

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        // console.log('Form Submitted:', newRep);
        // Add your form submission logic here
    };

    useEffect(() => {
    const fetchUsers = async () => {
      const dbObject = {
        tableName: "customers_table"
      };
      try {
        const response = await axios.get('http://localhost:5001/getAll/', { params: dbObject });
        const preparedData = prepareCustomersData(response.data);
        setReps(preparedData);
      } catch (error) {
        console.error('Error fetching users:', error);
      }
    };

    fetchUsers();
  }, []);

  useEffect(() => {
    const firstNames = reps.map(rep => rep.FirstName);
    const lastNames = reps.map(rep => rep.LastName);
    setFirstNameOptions(firstNames);
    setLastNameOptions(lastNames);
  }, [reps]);

    return (
        <form onSubmit={handleSubmit}>
            <div className="input-group" style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'space-between' }}>
            <label htmlFor="firstName" style={{ display: 'inline-block', flex: '1' }}>First Name:</label>
            <select
                id="firstName"
                name="FirstName"
                value={rep?.FirstName || ''}
                onChange={handleSelectChange}
                style={{ display: 'inline-block', flex: '2' }}
            >
                <option value="" disabled>Select your first name</option>
                {firstNameOptions.map((firstName) => (
                <option key={firstName} value={firstName}>
                    {firstName}
                </option>
                ))}
            </select>
            </div>
            <div className="input-group" style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'space-between' }}>
            <label htmlFor="lastName" style={{ display: 'inline-block', flex: '1' }}>Last Name:</label>
            <select
                id="lastName"
                name="LastName"
                value={rep?.LastName || ''}
                onChange={handleSelectChange}
                style={{ display: 'inline-block', flex: '2' }}
            >
                <option value="" disabled>Select your last name</option>
                {lastNameOptions.map((lastName) => (
                <option key={lastName} value={lastName}>
                    {lastName}
                </option>
                ))}
            </select>
            </div>
            <div className="input-group" style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'space-between' }}>
            <label htmlFor="eventType" style={{ display: 'inline-block', flex: '1' }}>Event Type:</label>
            <input
                id="eventType"
                name="eventType"
                type="text"
                placeholder="Enter event type"
                value={rep?.EventType || ''}
                onChange={handleChange}
                style={{ display: 'inline-block', flex: '2' }}
            />
            </div>
            <div className="input-group" style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'space-between' }}>
            <label htmlFor="eventFirstDate" style={{ display: 'inline-block', flex: '1' }}>Event First Date:</label>
            <input
                id="eventFirstDate"
                name="eventFirstDate"
                type="text"
                disabled={true}
                placeholder='Enter event first date'
                value={rep?.EventFirstDate || ''}
                onChange={handleChange}
                style={{ display: 'inline-block', flex: '2' }}
            />
            </div>
            <div className="input-group" style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'space-between' }}>
            <label htmlFor="eventLastDate" style={{ display: 'inline-block', flex: '1' }}>Event Last Date:</label>
            <input
                id="eventLastDate"
                name="eventLastDate"
                type="text"
                disabled={true}
                placeholder='Enter event last date'
                value={rep?.EventLastDate || ''}
                onChange={handleChange}
                style={{ display: 'inline-block', flex: '2' }}
            />
            </div>
            <div className="input-group" style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'space-between' }}>
            <label htmlFor="eventLocation" style={{ display: 'inline-block', flex: '1' }}>Event Location:</label>
            <input
                id="eventLocation"
                name="eventLocation"
                type="text"
                disabled={true}
                placeholder="Enter event location"
                value={rep?.EventLocation || ''}
                onChange={handleChange}
                style={{ display: 'inline-block', flex: '2' }}
            />
            </div>
            <div className="input-group" style={{ display: 'flex', alignItems: 'center', gap: '15px', justifyContent: 'space-between' }}>
            <label htmlFor="isActive" style={{ display: 'inline-block', flex: '1', fontSize: '1.2rem' }}>Is Active:</label>
            <input
                id="isActive"
                name="isActive"
                type="checkbox"
                checked={rep?.IsActive || false}
                // onChange={(e) =>
                // setRep({ ...rep, IsActive: e.target.checked })
                // }
                style={{ display: 'inline-block', flex: '2', transform: 'scale(1.5)' }}
            />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px' }}>
                <button type="submit" style={{ flex: '1', marginRight: '10px' }}>Submit</button>
                <button type="button" style={{ flex: '1', marginLeft: '10px' }} onClick={() => setShowAddRep(false)}>Cancel</button>
            </div>
        </form>
    );
};

export default AddRepForm;