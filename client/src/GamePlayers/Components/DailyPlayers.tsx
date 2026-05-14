import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { type Player } from './PlayerInterface';
import { BASE_URL } from '../../shared/Utils/apiConfig';

import classes from '../Styles/PlayerBuilder.module.scss';

const DailyPlayers = () => {
    const [playedPlayers, setPlayedPlayers] = useState<Player[]>([]);

    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const response = await axios.get<Player[]>(`${BASE_URL}/completedPlayers`, {
                    params: {
                        limit: 3,
                        sortBy: 'time_modified',
                        sortDir: 'DESC'
                    }
                });
                console.log(response.data);
                setPlayedPlayers(response.data);
            } catch (error) {
                console.error('Error fetching users:', error);
            }
        };

        fetchUsers();
    }, []);

    return (
        <div className={classes.centeredContainer}>
            <h1 className={classes.completedDaily}>Last three players</h1>
            <table
                border={1}
                className={`${classes.playerTable} ${classes.borderedTable}`}
            >
                <thead>
                    <tr>
                        <th>Username</th>
                        <th>Puzzle Type</th>
                        <th>Time Used</th>
                    </tr>
                </thead>
                <tbody>
                    {playedPlayers.map((player) => (
                        <tr key={player.player_guid}>
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

export default DailyPlayers;