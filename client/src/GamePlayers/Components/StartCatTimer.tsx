import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
// @ts-ignore
import dogBackground from '../../assets/dog.jpeg';
import { type Player } from './PlayerInterface'; // Import Player interface
import axios from 'axios';
import { useRefresh } from '../../shared/Context/RefreshContext';
import { BASE_URL } from '../../shared/Utils/apiConfig';

interface StartCatTimerProps {
  player?: Player; // Make player prop optional
}

const StartCatTimer: React.FC<StartCatTimerProps> = ({ player }) => {
  const { refreshKey } = useRefresh();

  const [catPlayer, setCatPlayer] = useState<Player[]>([]);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        console.log('request from timer')
        const response = await axios.get<Player[]>(`${BASE_URL}/getAll/`, {
          params: { 
            tableName: "game_players_table", 
            puzzle_type: 'CAT', 
            game_status: ['Created', 'In_progress'],
            limit: 1,
            orderBy: 'time_created'
          }
        });
        setCatPlayer(response.data);
      } catch (error) {
        console.error('Error fetching users:', error);
      }
    };

    fetchUsers();
  }, [refreshKey]); // Triggers re-fetch when global refreshKey changes

  const isStarted = catPlayer[0]?.game_status === 'In_progress';

  const startCatTimer = async () => {
    const nowPlaying = catPlayer[0];
    if (!nowPlaying || isStarted) return;

    console.log(nowPlaying);

    const editedPlayer = {
            game_status: 'In_progress',
            username: nowPlaying.username,
            email: nowPlaying.email,
            phone_number: nowPlaying.phone_number,
            puzzle_type: nowPlaying.puzzle_type,
            time_started: new Date().toLocaleTimeString('it-IT'),
            time_modified: new Date().toISOString(),
            time_used: nowPlaying.time_used,
            rep_id: nowPlaying.rep_id,
            event_id: nowPlaying.event_id,
          };
    try {
      const response = await axios.patch(
        `${BASE_URL}/editPlayerForm/${catPlayer[0].player_guid}`,
        editedPlayer
      );
      console.log('Player updated:', response.data);
    } catch (error) {
      console.error('Error updating player playTime:', error);
    }
  }

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
        disabled={isStarted || catPlayer.length === 0}
        onClick={() => startCatTimer()}
        style={{
          width: '200px',
          height: '200px',
          borderRadius: '50%',
          backgroundColor: isStarted || catPlayer.length === 0 ? 'rgba(128, 128, 128, 0.7)' : 'rgba(0, 128, 0, 0.7)',
          color: 'white',
          fontSize: '2rem',
          fontWeight: 'bold',
          border: 'none',
          cursor: isStarted || catPlayer.length === 0 ? 'not-allowed' : 'pointer',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          boxShadow: '0px 0px 15px rgba(0, 0, 0, 0.5)', // Add some shadow for depth
          touchAction: 'manipulation', // Optimize for touch screens
        }}
      >
        {isStarted ? 'In Progress' : 'Start'}
      </button>
    </div>
  );
};

export default StartCatTimer;