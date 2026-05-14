import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import Card from '../../UI/Card/Card';
import InProgressPlayers from './InProgressPlayers';
import { type Player } from './PlayerInterface';
import { BASE_URL } from '../../shared/Utils/apiConfig';
import classes from '../Styles/PlayerBuilder.module.scss';

const CatPlayersDisplay: React.FC = () => {
  const [players, setPlayers] = useState<Player[]>([]);
  const [isPlayInProgress, setIsPlayInProgress] = useState<boolean>(false);

  const fetchPlayers = useCallback(async () => {
    try {
      const response = await axios.get<Player[]>(`${BASE_URL}/getAll/`, {
        params: { 
          tableName: "game_players_table", 
          puzzle_type: 'CAT', 
          game_status: ['Created', 'In_progress'],
          limit: 20 
        }
      });
      // Results are now filtered by the backend, we just sort them for display
      const cats = response.data
        .sort((a, b) => {
            if (a.game_status === 'In_progress') return -1;
            if (b.game_status === 'In_progress') return 1;
            return 0;
        });
      setPlayers(cats);
    } catch (error) {
      console.error('Error fetching cat players:', error);
    }
  }, []);

  useEffect(() => {
    fetchPlayers();
  }, [fetchPlayers]);

  const deletePlayerHandler = async (playerId: string) => {
    try {
      const response = await axios.delete(`${BASE_URL}/deletePlayer/${playerId}`);
      if (response.data.message === 'Deleted') {
        setPlayers(prev => prev.filter(p => p.player_guid !== playerId));
      }
    } catch (error) {
      console.error('Error deleting player:', error);
    }
  };

  return (
    <div className={classes.displaySection}>
      <div className={classes.budgetHeader} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
        <Card>
          <span className={classes.spanCount}>Total Cat Players: {players.length}</span>
        </Card>
        <Card>
          <InProgressPlayers
            currentPlayer={players[0]}
            updateCurrentPlayer={setPlayers}
            puzzleState={players}
            setHighlightCurrentPlayer={setIsPlayInProgress}
            puzzleType="CAT"
          />
        </Card>
      </div>
      <table className={`${classes.playerTable} ${classes.borderedTable}`}>
        <thead>
          <tr>
            <th>Number</th>
            <th>Username</th>
          </tr>
        </thead>
        <tbody>
          {players.map((player, index) => (
            <tr
              key={player.player_guid}
              className={
                index === 0 && isPlayInProgress
                  ? classes.inProgressPlayer
                  : index === 0 || (index === 1 && isPlayInProgress)
                  ? classes.nextPlayer
                  : ""
              }
            >
              <td>
                <span> {player.player_que_number}</span>
              </td>
              <td>{player.username}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export {};
export default CatPlayersDisplay;