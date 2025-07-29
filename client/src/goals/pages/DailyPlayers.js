import React, { useEffect, useState } from 'react';
import PlayersTable from '../../PlayersTable.json';

const DailyPlayers = () => {
    const [players, setPlayers] = useState([]);

    useEffect(() => {
        const fetchPlayers = async () => {
            try {
                const completedPlayers = PlayersTable
                    .filter(player => player.PuzzleStatus === 'Completed')
                    .sort((a, b) => a.TimeUsed - b.TimeUsed);
                setPlayers(completedPlayers);
            } catch (error) {
                console.error('Error fetching players:', error);
            }
        };

        fetchPlayers();
    }, []);

    return (
        <div>
            <h1>Daily Players</h1>
            <table border="1">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Puzzle Status</th>
                        <th>Time Used</th>
                    </tr>
                </thead>
                <tbody>
                    {players.map(player => (
                        <tr key={player.id}>
                            <td>{player.Username}</td>
                            <td>{player.PuzzleStatus}</td>
                            <td>{player.TimeUsed}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default DailyPlayers;