import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { type Player } from './PlayerInterface';
import { BASE_URL } from '../../shared/Utils/apiConfig';

import classes from '../Styles/PlayerBuilder.module.scss';

const TopPlayers = () => {
    const [topPlayers, setTopPlayers] = useState<Player[]>([]);

    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const response = await axios.get<Player[]>(`${BASE_URL}/completedPlayers`, {
                    params: {
                        limit: 3,
                        sortBy: 'time_used_in_sec',
                        sortDir: 'ASC'
                    }
                });
                setTopPlayers(response.data);
            } catch (error) {
                console.error('Error fetching top players:', error);
            }
        };

        fetchUsers();
    }, []);

    return (
        <div className={classes.centeredContainer}>
            <h1 className={classes.completedDaily}>Leaderboard - Top 3</h1>
            <table
                border={1}
                className={`${classes.playerTable} ${classes.borderedTable}`}
            >
                <thead>
                    <tr>
                        <th>Rank</th>
                        <th>Username</th>
                        <th>Type</th>
                        <th>Time</th>
                    </tr>
                </thead>
                <tbody>
                    {topPlayers.map((player, index) => (
                        <tr key={player.player_guid}>
                            <td>{index + 1}</td>
                            <td>{player.username}</td>
                            <td>{player.puzzle_type}</td>
                            <td>{player.time_used}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default TopPlayers;