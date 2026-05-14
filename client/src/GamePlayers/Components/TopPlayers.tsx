import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { type Player } from './PlayerInterface';
import { BASE_URL } from '../../shared/Utils/apiConfig';
import classes from '../Styles/PlayerBuilder.module.scss';

const TopPlayer: React.FC = () => {
  const [topPlayers, setTopPlayers] = useState<Player[]>([]);

  useEffect(() => {
    const fetchTopPlayers = async () => {
      try {
        // Fetching top 10 completed players sorted by fastest time
        const response = await axios.get<Player[]>(`${BASE_URL}/completedPlayers`, {
          params: { limit: 3, sortBy: 'time_used_in_sec', sortDir: 'ASC' }
        });
        setTopPlayers(response.data);
      } catch (error) {
        console.error('Error fetching top players:', error);
      }
    };

    fetchTopPlayers();
  }, []);

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