import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
// @ts-ignore
import dogBackground from '../../assets/dog.jpeg';
import { type Player } from './PlayerInterface'; // Import Player interface
import axios from 'axios';
import { useRefresh } from '../../shared/Context/RefreshContext';
import { BASE_URL } from '../../shared/Utils/apiConfig';

interface StopCatTimerProps {
  player?: Player; // Make player prop optional
}

const StopCatTimer: React.FC<StopCatTimerProps> = ({ player }) => {
  const navigate = useNavigate();
  const { refreshKey } = useRefresh();

  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [catPlayer, setCatPlayer] = useState<Player[]>([]);

  useEffect(() => {
    const fetchUsers = async () => {
      const dbObject = {
        tableName: "game_players_table"
      };
      try {
        console.log('request from timer');
        const response = await axios.get<Player[]>(`${BASE_URL}/getAll/`, { params: dbObject });
        setAllPlayers(response.data);
      } catch (error) {
        console.error('Error fetching users:', error);
      }
    };

    fetchUsers();
  }, [refreshKey]); // Triggers re-fetch when global refreshKey changes

   useEffect(() => {
      const cats = allPlayers.filter(player => player.puzzle_type === 'CAT' && player.game_status !== 'Completed');
      console.log(cats[0]);
      setCatPlayer(cats);
    }, [allPlayers]);

  const isGameInProgress = catPlayer[0]?.game_status === 'In_progress';

    const timeFormat = (ms: number) => {
  if (isNaN(ms) || ms < 0) return "00:00:00";

  const hrs = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  const secs = Math.floor((ms % 60000) / 1000);

  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const stopCatTimer = async () => {
    const nowPlaying = catPlayer[0];
    if (!isGameInProgress || !nowPlaying) return; // Disable if no game in progress or no player
    console.log(nowPlaying);
    const timeEnded = new Date().toLocaleTimeString('it-IT');

    function timeToSeconds(timeStr: string) {
      const [hrs, mins, secs] = timeStr.split(':').map(Number);
      return (hrs * 3600) + (mins * 60) + secs;
    }

    const timeUsedSeconds = timeToSeconds(timeEnded) - timeToSeconds(nowPlaying.time_started);
    const timeUsed = timeUsedSeconds * 1000;

    const editedPlayer = {
            game_status: 'Completed',
            username: nowPlaying.username,
            email: nowPlaying.email,
            phone_number: nowPlaying.phone_number,
            puzzle_type: nowPlaying.puzzle_type,
            time_started: nowPlaying.time_started,
            time_ended: timeEnded,
            time_used: timeFormat(timeUsed),
            played_date: new Date().toISOString(),
            time_modified: new Date().toISOString(),
            rep_id: nowPlaying.rep_id,
            event_id: nowPlaying.event_id,
          };
    try {
      const response = await axios.patch(
        `${BASE_URL}/editPlayerForm/${nowPlaying.player_guid}`,
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
        disabled={!isGameInProgress || catPlayer.length === 0}
        onClick={() => stopCatTimer()}
        style={{
          width: '200px',
          height: '200px',
          borderRadius: '50%',
          backgroundColor: !isGameInProgress || catPlayer.length === 0 ? 'rgba(128, 128, 128, 0.7)' : 'rgba(255, 0, 0, 0.7)',
          color: 'white',
          fontSize: '2rem',
          fontWeight: 'bold',
          border: 'none',
          cursor: !isGameInProgress || catPlayer.length === 0 ? 'not-allowed' : 'pointer',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          boxShadow: '0px 0px 15px rgba(0, 0, 0, 0.5)', // Add some shadow for depth
          touchAction: 'manipulation', // Optimize for touch screens
        }}
      >
        {isGameInProgress ? 'Stop' : 'Not Started'}
      </button>
    </div>
  );
};

export default StopCatTimer;