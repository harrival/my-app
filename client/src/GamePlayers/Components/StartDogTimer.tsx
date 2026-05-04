import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
// @ts-ignore
import dogBackground from '../../assets/dog.jpeg';
import { type Player } from './PlayerInterface'; // Import Player interface
import axios from 'axios';
import { useRefresh } from '../../shared/Context/RefreshContext';

interface StartDogTimerProps {
  player?: Player; // Make player prop optional
}

const StartDogTimer: React.FC<StartDogTimerProps> = ({ player }) => {
  const navigate = useNavigate();
  const { refreshKey } = useRefresh();

  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [dogPlayer, setDogPlayer] = useState<Player[]>([]);

  useEffect(() => {
    const fetchUsers = async () => {
      const dbObject = {
        tableName: "game_players_table"
      };
      try {
        console.log('request from timer')
        const response = await axios.get<Player[]>('http://192.168.4.188:5001/getAll/', { params: dbObject });
        setAllPlayers(response.data);
      } catch (error) {
        console.error('Error fetching users:', error);
      }
    };

    fetchUsers();
  }, [refreshKey]); // Triggers re-fetch when global refreshKey changes

   useEffect(() => {
      const dogs = allPlayers.filter(player => player.puzzle_type === 'DOG' && player.game_status !== 'completed');
      console.log(dogs[0])
      setDogPlayer(dogs);
    }, [allPlayers]);

  const startDogTimer = async () => {
    console.log(dogPlayer[0])
    const editedPlayer = {
      game_status: 'InProgress',
    };
    try {
      const response = await axios.patch(
        `http://192.168.4.188:5001/editPlayerForm/${dogPlayer[0].player_guid}`,
        editedPlayer
      );
      console.log('Player updated:', response.data);
    } catch (error) {
      console.error('Error updating player playTime:', error);
    }
  };

  return (
    <div style={{
      backgroundImage: `url(${dogBackground})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat', // Ensure the image doesn't repeat
      width: '100%',
      height: '100vh',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
    }}>
      <button
        onClick={() => startDogTimer()}
        style={{
          width: '200px',
          height: '200px',
          borderRadius: '50%',
          backgroundColor: 'rgba(0, 128, 0, 0.7)', // Green with some transparency
          color: 'white',
          fontSize: '2rem',
          fontWeight: 'bold',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          boxShadow: '0px 0px 15px rgba(0, 0, 0, 0.5)', // Add some shadow for depth
          touchAction: 'manipulation', // Optimize for touch screens
        }}
        >
        Start
      </button>
    </div>
  );
};

export default StartDogTimer;