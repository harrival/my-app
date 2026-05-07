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
                const response = await axios.get<Player[]>(`${BASE_URL}/completedPlayers`);
                // Sort by time_used ascending (fastest first) and take the top 3
                const sorted = response.data
                    .filter(p => p.time_used && p.time_used !== "00:00:00")
                    .sort((a, b) => a.time_used.localeCompare(b.time_used))
                    .slice(0, 3);
                setTopPlayers(sorted);
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