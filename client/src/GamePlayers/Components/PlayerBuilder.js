import React, { useState, useEffect } from 'react';
import Button from '../../UI/Button/Button';
import Card from '../../UI/Card/Card';
import classes from '../Styles/PlayerBuilder.module.scss';
import PuzzleForm from '../../UI/PuzzleForm/PuzzleForm';
import InProgressPlayers from './InProgressPlayers';
import DailyPlayers from './DailyPlayers';
import EditPuzzleForm from '../../UI/PuzzleForm/EditPuzzleForm';
import axios from 'axios';

const PlayerBuilder = (props) => {
    const [allPlayers, setAllPlayers] = useState([]);
    const [catPlayers, setCatPlayers] = useState([]);
    const [dogPlayers, setDogPlayers] = useState([]);
    const [showPuzzleForm, setShowPuzzleForm] = useState(false);
    const [showEditPuzzleForm, setShowEditPuzzleForm] = useState(false);
    const [update, setUpdate] = useState(false);
    const [isDogPlayInProgress, setIsDogPlayInProgress] = useState(false);
    const [isCatPlayInProgress, setIsCatPlayInProgress] = useState(false);

    useEffect(() => {
      console.log('All players:', allPlayers);
        const cats = allPlayers.filter(player => player.puzzletype === 'CAT' && player.gamestatus === 'Created');
        const dogs = allPlayers.filter(player => player.puzzletype === 'DOG' && player.gamestatus === 'Created');
        
        setCatPlayers(cats);
        setDogPlayers(dogs);
    }, [allPlayers]);

    useEffect(() => {
      const fetchUsers = async () => {
        try {
          const response = await axios.get('http://localhost:5001/players');
          setAllPlayers(response.data);
        } catch (error) {
          console.error('Error fetching users:', error);
        }
      };
  
      fetchUsers();
    }, []);

    const showPuzzleFormHandler = () => {
        setShowPuzzleForm(!showPuzzleForm);
    };

    const editPlayerHandler = (player) => {
        <EditPuzzleForm
            player={player}
            puzzleState={allPlayers}
            updateCurrentPlayer={setAllPlayers}
            setShowEditPuzzleForm={setShowEditPuzzleForm}
        />;
    };

    const deletePlayerHandler = async (playerId) => {
      try {
        
        const response = await axios.delete(`http://localhost:5001/deletePlayer/${playerId}`);
        console.log('Player deleted:', response.data);
        if (response.data.message === 'Deleted') {
          setAllPlayers(prevPlayers => prevPlayers.filter(player => player.playerguid !== playerId));
        }
        
      } catch (error) {
        console.error('Error deleting player:', error);
        
      }
        
      allPlayers.splice(allPlayers.findIndex(player => player.id === playerId), 1);
        setTimeout(() => {
            setUpdate(prev => !prev); // Trigger update to refresh the UI after delay
        }, 2000);
    };

    const searchPlayersHandler = (searchTerm) => {
        const lowerCaseSearchTerm = searchTerm.toLowerCase();
        const highlightPlayers = (players) => {
            return players.map(player => ({
                ...player,
                highlight: player.username.toLowerCase().includes(lowerCaseSearchTerm)
            }));
        };
    };

    return (
      <div className="playerBoard">
      {showPuzzleForm && (
        <div className={classes.puzzleForm}>
        <PuzzleForm
          setShowPuzzleForm={setShowPuzzleForm}
          setAllPlayers={setAllPlayers}
        />
        </div>
      )}

      <div className={classes.centerButton}>
        <Button onClick={showPuzzleFormHandler}>Add player</Button>
      </div>
      <div className={classes.searchBox}>
        <input
        type="text"
        placeholder="Search players..."
        onChange={(e) => searchPlayersHandler(e.target.value)}
        />
      </div>
      <div className={classes.budgetBuilder}>
        <div className={`${classes.budgetBox} ${classes.centerButton}`}>
        <div className={classes.budgetHeader}>
          <Card>
          <span className={classes.spanCount}>
            Total cat players: {catPlayers.length}
          </span>
          </Card>
        </div>
        <div className={classes.budgetHeader}>
          <Card>
          <InProgressPlayers
            currentPlayer={catPlayers[0]}
            updateCurrentPlayer={setCatPlayers}
            puzzleState={catPlayers}
            setHighlightCurrentPlayer={setIsCatPlayInProgress}
          />
          </Card>
        </div>
        </div>

        <div className={`${classes.budgetBox} ${classes.centerButton}`}>
        <div className={classes.budgetHeader}>
          <Card>
          <span className={classes.spanCount}>
            Total dog players: {dogPlayers.length}
          </span>
          </Card>
        </div>
        <div className={classes.budgetHeader}>
          <Card>
          <InProgressPlayers
            currentPlayer={dogPlayers[0]}
            updateCurrentPlayer={setDogPlayers}
            puzzleState={dogPlayers}
            setHighlightCurrentPlayer={setIsDogPlayInProgress}
          />
          </Card>
        </div>
        </div>
      </div>
      <div className={classes.budgetBuilder}>
        <div className={classes.budgetBox}>
        <table
          className={`${classes.playerTable} ${classes.borderedTable}`}
        >
          <thead>
          <tr>
            <th>No</th>
            <th>Username</th>
            <th>Actions</th>
          </tr>
          </thead>
          <tbody>
          {catPlayers.map((player, index) => (
            <tr
            key={player.playerguid}
            className={
              index === 0 && isCatPlayInProgress
              ? classes.inProgressPlayer
              : index === 0 && !isCatPlayInProgress
              ? classes.nextPlayer
              : index === 1 && isCatPlayInProgress
              ? classes.nextPlayer
              : ""
            }
            >
            <td>{index + 1}</td>
            <td
              className={
              player.highlight ? classes.highlight : ""
              }
            >
              {player.username}
            </td>
            <td>
              <span
              className={classes.editPlayer}
              onClick={() => editPlayerHandler(player)}
              >
              Edit
              </span>
              <span
              className={classes.deletePlayer}
              onClick={() => deletePlayerHandler(player.playerguid)}
              >
              Delete
              </span>
            </td>
            </tr>
          ))}
          </tbody>
        </table>
        </div>

        <div className={classes.budgetBox}>
        <table
          className={`${classes.playerTable} ${classes.borderedTable}`}
        >
          <thead>
          <tr>
            <th>No</th>
            <th>Username</th>
            <th>Actions</th>
          </tr>
          </thead>
          <tbody>
          {dogPlayers.map((player, index) => (
            <tr
            key={player.playerguid}
            className={
              index === 0 && isDogPlayInProgress
              ? classes.inProgressPlayer
              : index === 0 && !isDogPlayInProgress
              ? classes.nextPlayer
              : index === 1 && isDogPlayInProgress
              ? classes.nextPlayer
              : ""
            }
            >
            <td>{index + 1}</td>
            <td
              className={
              player.highlight ? classes.highlight : ""
              }
            >
              {player.username}
            </td>
            <td>
              <span
              className={classes.editPlayer}
              onClick={() => editPlayerHandler(player)}
              >
              Edit
              </span>
              <span
              className={classes.deletePlayer}
              onClick={() => deletePlayerHandler(player.playerguid)}
              >
              Delete
              </span>
            </td>
            </tr>
          ))}
          </tbody>
        </table>
        </div>
      </div>
      <DailyPlayers />
      </div>
    );
}

export default PlayerBuilder;