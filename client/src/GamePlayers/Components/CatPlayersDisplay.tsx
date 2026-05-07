import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import Card from '../../UI/Card/Card';
import InProgressPlayers from './InProgressPlayers';
import { type Player } from './PlayerInterface';
import classes from '../Styles/PlayerBuilder.module.scss';

const CatPlayersDisplay: React.FC = () => {
  const [players, setPlayers] = useState<Player[]>([]);
  const [isPlayInProgress, setIsPlayInProgress] = useState<boolean>(false);

  const fetchPlayers = useCallback(async () => {
    try {
      const response = await axios.get<Player[]>('http://192.168.4.188:5001/getAll/', {
        params: { tableName: "game_players_table" }
      });
      // Filter for both Created and InProgress so players don't disappear while playing
      const cats = response.data
        .filter(p => p.puzzle_type === 'CAT' && (p.game_status === 'Created' || p.game_status === 'In_progress'))
        // Ensure InProgress players are at the top of the list
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
      const response = await axios.delete(`http://192.168.4.188:5001/deletePlayer/${playerId}`);
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
          />
        </Card>
      </div>
      <table className={`${classes.playerTable} ${classes.borderedTable}`}>
        <thead>
          <tr>
            <th>No</th>
            <th>Username</th>
            <th>Actions</th>
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
              <td>{index + 1}</td>
              <td>{player.username}</td>
              <td>
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
  );
};

export {};
export default CatPlayersDisplay;