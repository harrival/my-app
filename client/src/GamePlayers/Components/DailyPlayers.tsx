import React, { useEffect, useState } from 'react';
import axios from 'axios';
import Draggable from 'react-draggable';
import { ResizableBox } from 'react-resizable';
import 'react-resizable/css/styles.css';
import { type Player } from './PlayerInterface';

import classes from '../Styles/PlayerBuilder.module.scss';

const DailyPlayers = () => {
    const [playedPlayers, setPlayedPlayers] = useState<Player[]>([]);

    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const response = await axios.get<Player[]>('http://192.168.4.188:5001/completedPlayers');
                console.log(response.data);
                setPlayedPlayers(response.data);
            } catch (error) {
                console.error('Error fetching users:', error);
            }
        };

        fetchUsers();
    }, []);

    return (
        <Draggable>
            <ResizableBox width={400} height={300} minConstraints={[200, 150]} maxConstraints={[800, 600]}>
                <div className={classes.resizableContainer}>
                    <h1 className={classes.completedDaily}>Daily Players</h1>
                    <table
                        border={1}
                        className={`${classes.playerTable} ${classes.borderedTable}`}
                    >
                        <thead>
                            <tr>
                                <th>Name</th>
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
            </ResizableBox>
        </Draggable>
    );
};

export default DailyPlayers;