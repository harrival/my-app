import React, { useEffect, useState } from 'react';
import axios from 'axios';
import Draggable from 'react-draggable';
import { ResizableBox } from 'react-resizable';
import 'react-resizable/css/styles.css';

import 'react-resizable/css/styles.css'; // Import styles for react-resizable
import classes from '../Styles/PlayerBuilder.module.scss';

const DailyPlayers = ({ PlayersTable }) => {
    const [playedPlayers, setPlayedPlayers] = useState([]);

    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const response = await axios.get('http://localhost:5001/completedPlayers');
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
                        border="1"
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
                                <tr key={player.playerguid}>
                                    <td>{player.username}</td>
                                    <td>{player.puzzletype}</td>
                                    <td>{player.timeused}</td>
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