import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { type Player } from './PlayerInterface';
import { BASE_URL } from '../../shared/Utils/apiConfig';
import { useUserProfile } from '../../shared/Context/UserProfileContext';
import { useRefresh } from '../../shared/Context/RefreshContext';

import classes from '../Styles/PlayerBuilder.module.scss';

const DailyPlayers = () => {
    const { user } = useUserProfile();
    const { socket } = useRefresh();
    const [playedPlayers, setPlayedPlayers] = useState<Player[]>([]);

    const fetchUsers = useCallback(async () => {
        try {
            const response = await axios.get<Player[]>(`${BASE_URL}/completedPlayers`, {
                params: {
                    limit: 3,
                    sortBy: 'time_modified',
                    sortDir: 'DESC',
                    business: user?.business
                }
            });
            setPlayedPlayers(response.data || []);
        } catch (error) {
            console.error('Error fetching users:', error);
        }
    }, [user?.business]);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    useEffect(() => {
        if (!socket || !user?.business) return;

        socket.emit('join_business_room', user.business);

        const handleDelta = (event: { operation: string, player: Player }) => {
            // Refetch when a player is completed or deleted
            if (event.player.game_status === 'Completed' || event.operation === 'DELETE') {
                fetchUsers();
            }
        };

        socket.on('game_players_delta', handleDelta);
        return () => {
            socket.off('game_players_delta', handleDelta);
        };
    }, [socket, user?.business, fetchUsers]);

    return (
        <div className={classes.centeredContainer}>
            <h2 className={classes.completedDaily} style={{ textAlign: 'center' }}>Last three players</h2>
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
                    {playedPlayers.map((player, index) => (
                        <tr
                            key={player.player_guid}
                            style={{
                                backgroundColor:
                                    index === 0 ? 'lightgreen' :
                                    index === 1 ? 'lightyellow' :
                                    index === 2 ? '#ffcccc' : undefined
                            }}
                        >
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