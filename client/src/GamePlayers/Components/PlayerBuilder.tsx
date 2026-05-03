import React, { useState, useEffect } from 'react';
import Button from '../../UI/Button/Button';
import Card from '../../UI/Card/Card';
import classes from '../Styles/PlayerBuilder.module.scss';
import PlayerPuzzleForm from '../../UI/Form/PlayerPuzzleForm';
import EditPuzzleForm from '../../UI/Form/EditPuzzleForm';
import axios from 'axios';
import {type Player} from './PlayerInterface';

const PlayerBuilder: React.FC = () => {
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [catPlayers, setCatPlayers] = useState<Player[]>([]);
  const [dogPlayers, setDogPlayers] = useState<Player[]>([]);
  const [showPuzzleForm, setShowPuzzleForm] = useState<boolean>(false);
  const [showEditPuzzleForm, setShowEditPuzzleForm] = useState<boolean>(false);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);

  useEffect(() => {
    console.log('All players:', allPlayers);
    const cats = allPlayers.filter(player => player.puzzle_type === 'CAT' && player.game_status === 'Created');
    const dogs = allPlayers.filter(player => player.puzzle_type === 'DOG' && player.game_status === 'Created');

    setCatPlayers(cats);
    setDogPlayers(dogs);
  }, [allPlayers]);

  useEffect(() => {
    const fetchUsers = async () => {
      const dbObject = {
        tableName: "game_players_table"
      };
      try {
        const response = await axios.get<Player[]>('http://192.168.4.188:5001/getAll/', { params: dbObject });
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

  const editPlayerHandler = (player: Player) => {
    setSelectedPlayer(player);
    setShowEditPuzzleForm(true);
  };

  const deletePlayerHandler = async (playerId: string) => {
    try {
      const response = await axios.delete(`http://192.168.4.188:5001/deletePlayer/${playerId}`);
      console.log('Player deleted:', response.data);
      if (response.data.message === 'Deleted') {
        setAllPlayers(prevPlayers => prevPlayers.filter(player => player.player_guid !== playerId));
      }
    } catch (error) {
      console.error('Error deleting player:', error);
    }
  };

  const searchPlayersHandler = (searchTerm: string) => {
    const lowerCaseSearchTerm = searchTerm.toLowerCase().trim();
    const highlightPlayers = (players: Player[]) => {
      return players.map(player => ({
        ...player,
        highlight: lowerCaseSearchTerm !== "" && player.username.toLowerCase().includes(lowerCaseSearchTerm),
      }));
    };

    setCatPlayers(highlightPlayers(catPlayers));
    setDogPlayers(highlightPlayers(dogPlayers));
  };

  return (
    <div className={classes.playerBoard}>
      {showPuzzleForm && (
        <div className={classes.puzzleForm}>
          <PlayerPuzzleForm
            setShowPuzzleForm={setShowPuzzleForm}
            setAllPlayers={setAllPlayers}
          />
        </div>
      )}

      {showEditPuzzleForm && selectedPlayer && (
        <div className={classes.puzzleForm}>
          <EditPuzzleForm
            player={selectedPlayer}
            puzzleState={allPlayers}
            updateCurrentPlayer={(updatedPuzzleState) => setAllPlayers(updatedPuzzleState as Player[])}
            setShowEditPuzzleForm={setShowEditPuzzleForm}
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
        </div>

        <div className={`${classes.budgetBox} ${classes.centerButton}`}>
          <div className={classes.budgetHeader}>
            <Card>
              <span className={classes.spanCount}>
                Total dog players: {dogPlayers.length}
              </span>
            </Card>
          </div>
        </div>
      </div>
      <div className={classes.budgetBuilder}>
        <div className={`${classes.budgetBox} ${classes.staticTableContainer}`}>
          <table className={`${classes.playerTable} ${classes.borderedTable}`}>
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
                  key={player.player_guid}
                  className={index === 0 ? classes.nextPlayer : ""}
                >
                  <td>{index + 1}</td>
                  <td className={player.highlight ? classes.highlight : ""}>
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
                      onClick={() => deletePlayerHandler(player.player_guid)}
                    >
                      Delete
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={`${classes.budgetBox} ${classes.staticTableContainer}`}>
          <table className={`${classes.playerTable} ${classes.borderedTable}`}>
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
                  key={player.player_guid}
                  className={index === 0 ? classes.nextPlayer : ""}
                >
                  <td>{index + 1}</td>
                  <td className={player.highlight ? classes.highlight : ""}>
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
                      onClick={() => deletePlayerHandler(player.player_guid)}
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
    </div>
  );
};

export default PlayerBuilder;
