import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { type Player } from './PlayerInterface';
import { BASE_URL } from '../../shared/Utils/apiConfig';
import { useUserProfile } from '../../shared/Context/UserProfileContext';
import { useRefresh } from '../../shared/Context/RefreshContext';
import classes from '../Styles/PlayerBuilder.module.scss';

const TopPlayer: React.FC = () => {
  const { profile } = useUserProfile();
  const { socket } = useRefresh();
  const [topPlayers, setTopPlayers] = useState<Player[]>([]);

  const fetchTopPlayers = useCallback(async () => {
    if (!profile?.rep_id) return;
    const dbObject = {
      tableName: 'game_players_table',
      limit: 3,
      sortBy: 'time_used_in_sec',
      sortDir: 'ASC',
      rep_id: profile?.rep_id,
      game_status: "Completed",
      played_date: new Date().toISOString().split('T')[0]
    }
    try {
      // Fetching top 10 completed players sorted by fastest time
      const response = await axios.get<Player[]>(`${BASE_URL}/getAll`, {
        params: dbObject
      });
      setTopPlayers(response.data || []);
    } catch (error) {
      console.error('Error fetching top players:', error);
    }
  }, [profile?.rep_id]);

  useEffect(() => {
    fetchTopPlayers();
  }, [fetchTopPlayers]);

  useEffect(() => {
    if (!socket || !profile?.rep_id) return;

    socket.emit('join_rep_room', profile.rep_id);

    const handleDelta = (event: { operation: string, player: Player }) => {
      // Refetch when a player is completed or deleted
      if (event.player.game_status === 'Completed' || event.operation === 'DELETE') {
        fetchTopPlayers();
      }
    };

    socket.on('game_players_delta', handleDelta);
    return () => {
      socket.off('game_players_delta', handleDelta);
    };
  }, [socket, profile?.rep_id, fetchTopPlayers]);

  return (
    <div className={classes.staticTableContainer}>
      <h2 className={classes.completedDaily} style={{ textAlign: 'center' }}>Top Three Players</h2>
      <table className={`${classes.playerTable} ${classes.borderedTable}`}>
        <thead>
          <tr>
            <th>Rank</th>
            <th>Username</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          {topPlayers.map((player, index) => (
            <tr
              key={player.player_guid}
              style={{
                backgroundColor:
                  index === 0 ? 'lightgreen' :
                    index === 1 ? 'lightyellow' :
                      index === 2 ? '#ffcccc' : undefined
              }}
            >
              <td>{index + 1}</td>
              <td>{player.username}</td>
              <td>{player.time_used}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default TopPlayer;