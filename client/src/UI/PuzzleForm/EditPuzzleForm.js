import React, { useState } from 'react';
import './PuzzleForm.css'; // Assuming you have some basic styles in this file
import axios from 'axios';

const EditPuzzleForm = ({ player, puzzleState, updateCurrentPlayer, setShowEditPuzzleForm }) => {
    const [formState, setFormState] = useState({
        contact: player.email || player.phonenumber || '',
        username: player.username || '',
        puzzletype: player.puzzletype || '',
    });
    const [errors, setErrors] = useState({
      contact: "",
      username: "",
      puzzlePet: "",
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
      if (!value) return "Username is required";
      if (value.length < 5)
        return "Username must be at least 5 characters long";
      return "";
    };

    const validatePuzzlePet = (value) => {
      if (!value) return "Please select a puzzle pet";
      return "";
    };

    const handleInputChange = (e) => {
      const { id, value } = e.target;
      setFormState((prevState) => ({ ...prevState, [id]: value }));

      let error = "";
      if (id === "username") error = validateUsername(value);
      setErrors((prevErrors) => ({ ...prevErrors, [id]: error }));
    };

    const handleSelectChange = (e) => {
        const value = e.target.value;
        setFormState((prevState) => ({ ...prevState, puzzlePet: value }));

        const error = validatePuzzlePet(value);
        setErrors((prevErrors) => ({ ...prevErrors, puzzlePet: error }));
    };

    const handleEditPuzzleForm = async (e) => {
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
            const editedPlayer = {
                username: formState.username,
                email: formState.contact.includes('@') ? formState.contact : '',
                phonenumber: formState.contact.match(/^\d{10}$/) ? formState.contact : '',
                puzzletype: formState.puzzlePet,
            };
            try {
                const response = await axios.patch(`http://localhost:5001/editPlayerForm/${player.playerguid}`, editedPlayer);
                console.log('Player updated:', response.data);
          
                if (response.status === 200) {
                  const updatedPuzzleState = puzzleState.filter(
                    (player) => player.playerguid !== player.playerguid
                  );
                  updateCurrentPlayer(updatedPuzzleState);
                }
              } catch (error) {
                  console.error('Error updating player playTime:', error);
              }
              setShowEditPuzzleForm(false);
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
    const cancleForm = () => {
        setShowEditPuzzleForm(false);
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
        <form 
            onSubmit={handleEditPuzzleForm} 
            className='puzzleForm'
        >
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
                    <option value="CAT">Cat</option>
                    <option value="DOG">Dog</option>
                </select>
                {errors.puzzlePet && <p>{errors.puzzlePet}</p>}
            </div>
            <div className='button-group'>
                <button className='addPlayerBtn' type="submit">Submit</button>
                <button
                    className='cancelBtn'
                    type="button"
                    onClick={cancleForm}
                >
                    Cancel
                </button>
            </div>
        </form>
    );
};

export default EditPuzzleForm;