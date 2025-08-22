import React, { useState } from 'react';
import axios from 'axios';
import './PuzzleForm.css';
import { type Player } from '../../GamePlayers/Components/PlayerInterface'; // Adjust the import path as necessary
 // Assuming you have some basic styles in this file

const representativeID = 'GUID10001';
const eventID = 'GUID2000';
const timeused = "00:00:00";
const timeupdated = null;

// Define types for props
interface PuzzleFormProps {
  setShowPuzzleForm: (value: boolean) => void;
  setAllPlayers: React.Dispatch<React.SetStateAction<Player[]>>;
}

// Define types for form state
interface FormState {
  contact: string;
  username: string;
  puzzlePet: string;
}

// Define types for errors
interface FormErrors {
  contact: string;
  username: string;
  puzzlePet: string;
}

const PlayerPuzzleForm = ({ setShowPuzzleForm, setAllPlayers }: PuzzleFormProps) => {
  const [formState, setFormState] = useState<FormState>({
    contact: '',
    username: '',
    puzzlePet: '',
  });

  const [errors, setErrors] = useState<FormErrors>({
    contact: '',
    username: '',
    puzzlePet: '',
  });

  const validateContact = (value: string): string => {
    if (!value) return '';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^\d{10}$/;
    if (!emailRegex.test(value) && !phoneRegex.test(value)) {
      return 'Please enter a valid phone number or email';
    }
    return '';
  };

  const validateUsername = (value: string): string => {
    if (!value) return 'Username is required';
    if (value.length < 5) return 'Username must be at least 5 characters long';
    return '';
  };

  const validatePuzzlePet = (value: string): string => {
    if (!value) return 'Please select a puzzle pet';
    return '';
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const { id, value } = e.target;
    setFormState((prevState) => ({ ...prevState, [id]: value }));

    let error = '';
    if (id === 'username') error = validateUsername(value);
    setErrors((prevErrors) => ({ ...prevErrors, [id]: error }));
  };

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    const value = e.target.value;
    setFormState((prevState) => ({ ...prevState, puzzlePet: value }));

    const error = validatePuzzlePet(value);
    setErrors((prevErrors) => ({ ...prevErrors, puzzlePet: error }));
  };

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
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
      const uniqueId = 'PLAYERGUID' + Date.now().toString();
      const newPlayer: Player = {
        id: '',
        gamestatus: 'Created',
        playerguid: uniqueId,
        username: formState.username,
        email: formState.contact.includes('@') ? formState.contact : '',
        phonenumber: formState.contact.match(/^\d{10}$/) ? formState.contact : '',
        puzzletype: formState.puzzlePet as "CAT" | "DOG",
        timeused,
        timecreated: new Date().toISOString(),
        timeupdated,
        repid: representativeID,
        eventid: eventID,
      };
      try {
        const { id, ...newPlayerWithoutId } = newPlayer;
        
        const response = await axios.post('http://localhost:5001/addToTable', newPlayerWithoutId);
        if (response.status === 201) {
          setAllPlayers((prev) => [...prev, { ...newPlayer, gamestatus: 'Created' }]);
        }
      } catch (error) {
        console.error('Error adding player:', error);
      }
      setShowPuzzleForm(false);
      setFormState({
        contact: '',
        username: '',
        puzzlePet: '',
      });
      setErrors({
        contact: '',
        username: '',
        puzzlePet: '',
      });
    }
  };

  const cancelForm = (): void => {
    setShowPuzzleForm(false);
    setFormState({
      contact: '',
      username: '',
      puzzlePet: '',
    });
    setErrors({
      contact: '',
      username: '',
      puzzlePet: '',
    });
  };

  return (
    <form onSubmit={handleSubmit} className="puzzleForm">
      <div className="input-group">
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
      <div className="input-group">
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
      <div className="input-group">
        <label htmlFor="puzzlePet">Puzzle pet</label>
        <select
          id="puzzlePet"
          value={formState.puzzlePet}
          onChange={handleSelectChange}
        >
          <option value="">Select a pet</option>
          <option value="CAT">Cat</option>
          <option value="DOG">Dog</option>
        </select>
        {errors.puzzlePet && <p>{errors.puzzlePet}</p>}
      </div>
      <div className="button-group">
        <button className="addPlayerBtn" type="submit">
          Submit
        </button>
        <button className="cancelBtn" type="button" onClick={cancelForm}>
          Cancel
        </button>
      </div>
    </form>
  );
};

export default PlayerPuzzleForm;