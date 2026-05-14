import React, { useState } from 'react';
import axios from 'axios';
import { BASE_URL } from '../../shared/Utils/apiConfig';
import './PuzzleForm.css';
import { type Player } from '../../GamePlayers/Components/PlayerInterface';

const representativeID = 'GUID10001';
const eventID = 'GUID2000';
const time_used = "00:00:00";
const time_modified = null;

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

  const validateUniqueUsername = async (username: string): Promise<string> => {
    try {
      const dbObject = {
        tableName: "game_players_table",
        fields: { username }
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
      let assignedQueNumber = 1;

      try {
        const queResponse = await axios.get(`${BASE_URL}/getOne`, {
          params: { tableName: "que_number_table" }
        });

        if (queResponse.data) {
          assignedQueNumber = Number(queResponse.data.last_number) + 1;
          // Update existing record using the dynamic PATCH route
          await axios.patch(`${BASE_URL}/editPlayerForm/${queResponse.data.id}`, {
            tableName: "que_number_table",
            idColumn: "id",
            last_number: assignedQueNumber
          });
        } else {
          assignedQueNumber = 1;
          await axios.post(`${BASE_URL}/addToTable`, {
            tableName: "que_number_table",
            fields: { last_number: 1 } // If DB uses 'number', change 'last_number' to 'number'
          });
        }
      } catch (error) {
        console.error('Error handling queue number:', error);
      }

      const uniqueId = 'PLAYERG' + Date.now().toString();
      const newPlayer: Player = {
        id: '',
        game_status: 'Created',
        player_guid: uniqueId,
        username: formState.username,
        email: formState.contact.includes('@') ? formState.contact : '',
        phone_number: formState.contact.match(/^\d{10}$/) ? formState.contact : '',
        puzzle_type: formState.puzzlePet as "CAT" | "DOG",
        time_started: '00:00:00',
        time_ended: '00:00:00',
        time_used: '00:00:00',
        played_date: null,
        player_que_number: assignedQueNumber,
        time_created: new Date().toISOString(),
        time_modified,
        rep_id: representativeID,
        event_id: eventID,
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

  const inputGroupStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    marginBottom: '1rem',
    textAlign: 'left'
  };

  const errorStyle: React.CSSProperties = {
    color: 'red',
    fontSize: '0.8rem',
    margin: '4px 0 0 0'
  };

  return (
    <form onSubmit={handleSubmit} className="puzzleForm">
      <div className="input-group" style={inputGroupStyle}>
        <label htmlFor="contact">Contact</label>
        <input
          id="contact"
          type="text"
          placeholder="Enter phone or email"
          value={formState.contact}
          onChange={handleInputChange}
        />
        {errors.contact && <p style={errorStyle}>{errors.contact}</p>}
      </div>

      <div className="input-group" style={inputGroupStyle}>
        <label htmlFor="username">Username</label>
        <input
          id="username"
          type="text"
          placeholder="Enter username"
          value={formState.username}
          onChange={handleInputChange}
        />
        {errors.username && <p style={errorStyle}>{errors.username}</p>}
      </div>

      <div className="input-group" style={inputGroupStyle}>
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
        {errors.puzzlePet && <p style={errorStyle}>{errors.puzzlePet}</p>}
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