import React, { useState, useEffect } from 'react';
import Button from '../../UI/Button/Button';
import Card from '../../UI/Card/Card';
import classes from '../Styles/BudgetBuilder.module.scss';
import PuzzleForm from '../../UI/PuzzleForm/PuzzleForm';
import PlayerTable from '../../PlayersTable.json';
import InProgressPlayers from '../../goals/pages/InProgressPlayers';
import DailyPlayers from '../../goals/pages/DailyPlayers';

const PlayerBuilder = (props) => {
    const [catPlayers, setCatPlayers] = useState([]);
    const [dogPlayers, setDogPlayers] = useState([]);
    const [update, setUpdate] = useState(false);
    const [isDogPlayInProgress, setIsDogPlayInProgress] = useState(false);
    const [isCatPlayInProgress, setIsCatPlayInProgress] = useState(false);



    useEffect(() => {
        const catCount = PlayerTable.filter(player => player.PuzzleType === 'Cat' && player.PuzzleStatus === 'Created');
        const dogCount = PlayerTable.filter(player => player.PuzzleType === 'Dog' && player.PuzzleStatus === 'Created');
        console.log(catCount, dogCount);
        setCatPlayers(catCount);
        setDogPlayers(dogCount);
    }, [update]);

    const [showPuzzleForm, setShowPuzzleForm] = useState(false);

    const showPuzzleFormHandler = () => {
        setShowPuzzleForm(!showPuzzleForm);
    };

    const editPlayerHandler = (playerId, puzzleType) => {
        const updatedPlayers = puzzleType === 'Cat' ? [...catPlayers] : [...dogPlayers];
        const playerIndex = updatedPlayers.findIndex(player => player.id === playerId);
        if (playerIndex !== -1) {
            const playerToEdit = updatedPlayers[playerIndex];
            setShowPuzzleForm(true);
            console.log('Editing player:', playerToEdit);
            // props.setEditingPlayer({ ...playerToEdit, puzzleType });
        }
    };

    const deletePlayerHandler = (playerId, puzzleType) => {
        
        PlayerTable.splice(PlayerTable.findIndex(player => player.id === playerId), 1);
        setTimeout(() => {
            setUpdate(prev => !prev); // Trigger update to refresh the UI after delay
        }, 2000);
    };

    const searchPlayersHandler = (searchTerm) => {
        const lowerCaseSearchTerm = searchTerm.toLowerCase();
        const highlightPlayers = (players) => {
            return players.map(player => ({
                ...player,
                highlight: player.Username.toLowerCase().includes(lowerCaseSearchTerm)
            }));
        };
        console.log(highlightPlayers(PlayerTable.filter(player => player.PuzzleType === 'Cat')));
        const updatedCatPlayers = highlightPlayers(PlayerTable.filter(player => player.PuzzleType === 'Cat'));
        const updatedDogPlayers = highlightPlayers(PlayerTable.filter(player => player.PuzzleType === 'Dog'));
        setCatPlayers(updatedCatPlayers);
        setDogPlayers(updatedDogPlayers);
    };

    return (
      <div className="playerBoard">
      {showPuzzleForm && (
        <div className={classes.puzzleForm}>
        <PuzzleForm
          setShowPuzzleForm={setShowPuzzleForm}
          setUpdate={setUpdate}
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
            setUpdate={setUpdate}
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
            setUpdate={setUpdate}
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
            key={player.id}
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
              {player.Username}
            </td>
            <td>
              <span
              className={classes.editPlayer}
              onClick={() => editPlayerHandler(player.id, "Cat")}
              >
              Edit
              </span>
              <span
              className={classes.deletePlayer}
              onClick={() => deletePlayerHandler(player.id, "Cat")}
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
            key={player.id}
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
              {player.Username}
            </td>
            <td>
              <span
              className={classes.editPlayer}
              onClick={() => editPlayerHandler(player.id, "Dog")}
              >
              Edit
              </span>
              <span
              className={classes.deletePlayer}
              onClick={() => deletePlayerHandler(player.id, "Dog")}
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