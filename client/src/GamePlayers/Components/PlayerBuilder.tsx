import React, { useState, useEffect } from 'react';
import Button from '../../UI/Button/Button';
import Card from '../../UI/Card/Card';
import classes from '../Styles/PlayerBuilder.module.scss';
import PlayerPuzzleForm from '../../UI/Form/PlayerPuzzleForm';
import EditPuzzleForm from '../../UI/Form/EditPuzzleForm';
import axios from 'axios';
import { useRefresh } from '../../shared/Context/RefreshContext';
import { type Player } from './PlayerInterface';
import { BASE_URL } from '../../shared/Utils/apiConfig';
import { useUserProfile } from '../../shared/Context/UserProfileContext';

const isInProgress = (status?: string | null): boolean => {
  if (!status) return false;
  return status.toLowerCase().replace(/[\s_-]+/g, '') === 'inprogress';
};

const PlayerBuilder: React.FC = () => {
  const { profile } = useUserProfile();
  const { refreshKey } = useRefresh();
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [catPlayers, setCatPlayers] = useState<Player[]>([]);
  const [dogPlayers, setDogPlayers] = useState<Player[]>([]);
  const [showPuzzleForm, setShowPuzzleForm] = useState<boolean>(false);
  const [showEditPuzzleForm, setShowEditPuzzleForm] = useState<boolean>(false);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);

  useEffect(() => {
    const cats = allPlayers.filter(player => player.puzzle_type === 'CAT' && player.game_status !== 'Completed');
    const dogs = allPlayers.filter(player => player.puzzle_type === 'DOG' && player.game_status !== 'Completed');

    setCatPlayers(cats);
    setDogPlayers(dogs);
  }, [allPlayers]);

  useEffect(() => {
    console.log('refreshKey in player builder', refreshKey);
    const fetchUsers = async () => {
      const dbObject = {
        tableName: "game_players_table",
        ...(profile?.rep_id && { rep_id: profile.rep_id }),
        // ...(profile?.permission_group === 'Supervisor' && { business: profile.business }),
        played_date: new Date().toISOString().split('T')[0],
        sortBy: "time_created",
      };
      try {
        const response = await axios.get<Player[]>(`${BASE_URL}/getAll/`, { params: dbObject });
        setAllPlayers(response.data);
      } catch (error) {
        console.error('Error fetching users:', error);
      }
    };

    fetchUsers();
  }, [allPlayers, profile?.rep_id]); // Now updates automatically when any view changes the DB

  const showPuzzleFormHandler = () => {
    setShowPuzzleForm(!showPuzzleForm);
  };

  const editPlayerHandler = (player: Player) => {
    setSelectedPlayer(player);
    setShowEditPuzzleForm(true);
  };

  const deletePlayerHandler = async (playerId: string) => {
    try {
      const response = await axios.delete(`${BASE_URL}/deletePlayer/${playerId}`);
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
            agentGuid={profile?.rep_id}
            currentEvent={profile?.event_id}
            business={profile?.business}
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

      {profile?.rep_id && <div className={classes.centerButton}>
        <Button onClick={showPuzzleFormHandler}>Add player</Button>
      </div>}
      <div className={classes.searchBox}>
        <input
          type="text"
          placeholder="Search players..."
          autoComplete="off"
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
                    {!isInProgress(player.game_status) && (
                      <>
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
                      </>
                    )}
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
                    {!isInProgress(player.game_status) && (
                      <>
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
                      </>
                    )}
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
