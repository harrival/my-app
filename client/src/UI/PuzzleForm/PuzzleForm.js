import React, { useState } from 'react';
import Button from '../Button/Button';
import './PuzzleForm.css'; // Assuming you have some basic styles in this file

const PuzzleForm = () => {
    const [formState, setFormState] = useState({
        contact: '',
        username: '',
        puzzlePet: '',
    });

    const [errors, setErrors] = useState({
        contact: '',
        username: '',
        puzzlePet: '',
    });

    const validateContact = (value) => {
        if (!value) return '';
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const phoneRegex = /^\d{10}$/;
        if (!emailRegex.test(value) && !phoneRegex.test(value)) {
            return 'Please enter a valid phone number or email';
        }
        return '';
    };

    const validateUsername = (value) => {
        if (!value) return 'Username is required';
        if (value.length < 5) return 'Username must be at least 5 characters long';
        return '';
    };

    const validatePuzzlePet = (value) => {
        if (!value) return 'Please select a puzzle pet';
        return '';
    };

    const handleInputChange = (e) => {
        const { id, value } = e.target;
        setFormState((prevState) => ({ ...prevState, [id]: value }));

        let error = '';
        if (id === 'username') error = validateUsername(value);
        setErrors((prevErrors) => ({ ...prevErrors, [id]: error }));
    };

    const handleSelectChange = (e) => {
        const value = e.target.value;
        setFormState((prevState) => ({ ...prevState, puzzlePet: value }));

        const error = validatePuzzlePet(value);
        setErrors((prevErrors) => ({ ...prevErrors, puzzlePet: error }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();

        const contactError = validateContact(formState.contact);
        const usernameError = validateUsername(formState.username);
        const puzzlePetError = validatePuzzlePet(formState.puzzlePet);

        setErrors({
            contact: contactError,
            username: usernameError,
            puzzlePet: puzzlePetError,
        });

        if (!contactError && !usernameError && !puzzlePetError) {
            console.log('Form submitted:', formState);
        } else {
            console.log('Form is invalid!');
        }
    };

    return (
        <form onSubmit={handleSubmit}>
            <div className='input-group'>
                <label htmlFor="contact">Contact</label>
                <input
                    id="contact"
                    type="text"
                    placeholder="Enter phone or email"
                    value={formState.contact}
                    onChange={handleInputChange}
                />
                {errors.contact && <p>{errors.contact}</p>}
            </div>
            <div className='input-group'>
                <label htmlFor="username">Username</label>
                <input
                    id="username"
                    type="text"
                    placeholder="Enter username"
                    value={formState.username}
                    onChange={handleInputChange}
                />
                {errors.username && <p>{errors.username}</p>}
            </div>
            <div className='input-group'>
                <label htmlFor="puzzlePet">Puzzle pet</label>
                <select
                    id="puzzlePet"
                    value={formState.puzzlePet}
                    onChange={handleSelectChange}
                >
                    <option value="">Select a pet</option>
                    <option value="Dog">Dog</option>
                    <option value="Cat">Cat</option>
                </select>
                {errors.puzzlePet && <p>{errors.puzzlePet}</p>}
            </div>
            <button className='addPlayerBtn' type="submit">Submit</button>
        </form>
    );
};

export default PuzzleForm;