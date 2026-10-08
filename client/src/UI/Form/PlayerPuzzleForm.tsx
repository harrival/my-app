import React, { useState } from 'react';
import axios from 'axios';
import { BASE_URL } from '../../shared/Utils/apiConfig';
import './PuzzleForm.css';
import { type Player } from '../../GamePlayers/Components/PlayerInterface';

const time_used = "00:00:00";
const time_modified = null;

// Define types for props
interface PuzzleFormProps {
  setShowPuzzleForm: (value: boolean) => void;
  setAllPlayers: React.Dispatch<React.SetStateAction<Player[]>>;
  agentGuid: string | undefined | null;
  currentEvent: string | undefined | null;
  business: string | undefined | null;
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

const PlayerPuzzleForm = ({ setShowPuzzleForm, setAllPlayers, agentGuid, currentEvent, business }: PuzzleFormProps) => {
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
    if (value.length < 3) return 'Username must be at least 3 characters long';
    return '';
  };

  const validatePuzzlePet = (value: string): string => {
    if (!value) return 'Please select a puzzle pet';
    return '';
  };

  const validateUniqueUsername = async (username: string): Promise<string> => {
    try {
      const dbObject = {
        tableName: "game_players_table",
        fields: { username },
        rep_id: agentGuid,

      };
      const response = await axios.get(`${BASE_URL}/dbsearch`, { params: dbObject });
      if (response.data.length > 0) {
        return 'Username already exists';
      }
    } catch (error) {
      console.error('Error checking username uniqueness:', error);
    }
    return '';
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const { id, value } = e.target;
    setFormState((prevState) => ({ ...prevState, [id]: value }));
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
    let usernameError = validateUsername(formState.username);
    const puzzlePetError = validatePuzzlePet(formState.puzzlePet);

    if (!usernameError) {
      usernameError = await validateUniqueUsername(formState.username);
    }

    setErrors({
      contact: contactError,
      username: usernameError,
      puzzlePet: puzzlePetError,
    });

    if (!contactError && !usernameError && !puzzlePetError) {

      const uniqueId = crypto.randomUUID();// Generate a new GUID
      const newPlayer: Player = {
        id: 0,
        game_status: 'Created',
        player_guid: uniqueId,
        username: formState.username,
        email: formState.contact.includes('@') ? formState.contact : '',
        phone_number: formState.contact.match(/^\d{10}$/) ? formState.contact : '',
        puzzle_type: formState.puzzlePet as "CAT" | "DOG",
        time_started: '00:00:00',
        time_ended: '00:00:00',
        time_used: '00:00:00',
        played_date: new Date().toISOString().split('T')[0],
        time_created: new Date().toISOString(),
        time_modified,
        business: business,
        rep_id: agentGuid,
        event_id: currentEvent,
      };
      try {
        const { id, ...newPlayerWithoutId } = newPlayer;
        const dbObject = {
          tableName: "game_players_table",
          fields: newPlayerWithoutId
        }

        const response = await axios.post(`${BASE_URL}/addToTable`, dbObject);
        if (response.status === 201) {
          setAllPlayers((prev) => [...prev, { ...newPlayer, game_status: 'Created' }]);
          setShowPuzzleForm(false);
          resetForm();
        }
      } catch (error) {
        console.error('Error adding player:', error);
      }
    }
  };

  const resetForm = () => {
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

  const cancelForm = (): void => {
    setShowPuzzleForm(false);
    resetForm();
  };

  return (
    <form onSubmit={handleSubmit} className="puzzleForm" autoComplete="off">
      <div className="input-group">
        <label htmlFor="contact">Contact:</label>
        <div className="input-wrapper">
          <input
            id="contact"
            type="text"
            placeholder="Enter phone or email"
            value={formState.contact}
            onChange={handleInputChange}
            autoComplete="off"
          />
          {errors.contact && <p className="error-message">{errors.contact}</p>}
        </div>
      </div>
      <div className="input-group">
        <label htmlFor="username">Username:</label>
        <div className="input-wrapper">
          <input
            id="username"
            type="text"
            placeholder="Enter username"
            value={formState.username}
            onChange={handleInputChange}
            autoComplete="off"
          />
          {errors.username && <p className="error-message">{errors.username}</p>}
        </div>
      </div>
      <div className="input-group">
        <label htmlFor="puzzlePet">Puzzle pet:</label>
        <div className="input-wrapper">
          <select
            id="puzzlePet"
            value={formState.puzzlePet}
            onChange={handleSelectChange}
          >
            <option value="">Select a pet</option>
            <option value="CAT">Cat</option>
            <option value="DOG">Dog</option>
          </select>
          {errors.puzzlePet && <p className="error-message">{errors.puzzlePet}</p>}
        </div>
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