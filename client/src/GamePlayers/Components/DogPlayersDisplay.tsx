import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import Card from '../../UI/Card/Card';
import { type Player } from './PlayerInterface';
import { BASE_URL } from '../../shared/Utils/apiConfig';
import classes from '../Styles/PlayerBuilder.module.scss';
import { useUserProfile } from '../../shared/Context/UserProfileContext';
import { useRefresh } from '../../shared/Context/RefreshContext';

const RowTimer: React.FC<{ timeStarted: string }> = ({ timeStarted }) => {
  const [elapsed, setElapsed] = useState<number>(0);

  useEffect(() => {
    const parseTime = (timeStr: string) => {
      const parts = timeStr.split(':');
      const hrs = Number(parts[0]);
      const mins = Number(parts[1]);
      const secs = Number(parts[2]);
      if (isNaN(hrs) || isNaN(mins) || isNaN(secs)) return 0;
      return hrs * 3600 + mins * 60 + Math.floor(secs);
    };

    const startTimeInSecs = parseTime(timeStarted);

    const getElapsed = () => {
      const now = new Date();
      const nowInSecs = now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds();
      let diff = nowInSecs - startTimeInSecs;
      if (diff < -43200) diff += 86400;
      else if (diff > 43200) diff -= 86400;
      return diff > 0 ? diff : 0;
    };

    setElapsed(getElapsed());

    const interval = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [timeStarted]);

  const formatTime = (totalSeconds: number): string => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };

  return (
    <>
      <style>{`
        @keyframes timerPulse {
          0% { transform: scale(1); box-shadow: 0 4px 10px rgba(255, 59, 48, 0.3); }
          100% { transform: scale(1.03); box-shadow: 0 4px 18px rgba(255, 59, 48, 0.6); }
        }
      `}</style>
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0.4rem 1rem',
        borderRadius: '30px',
        background: 'linear-gradient(135deg, #ff3b30 0%, #ff7b00 100%)',
        color: '#ffffff',
        fontWeight: 'bold',
        fontSize: '1.1rem',
        fontFamily: 'monospace',
        boxShadow: '0 4px 10px rgba(255, 59, 48, 0.3)',
        letterSpacing: '0.5px',
        border: '1.5px solid rgba(255, 255, 255, 0.25)',
        animation: 'timerPulse 1.5s infinite alternate'
      }}>
        {formatTime(elapsed)}
      </div>
    </>
  );
};

const DogPlayersDisplay: React.FC = () => {
  const { profile } = useUserProfile();
  const { socket } = useRefresh();
  const [players, setPlayers] = useState<Player[]>([]);

  const fetchPlayers = useCallback(async () => {
    try {
      const dbObject = {
        tableName: "game_players_table",
        puzzle_type: 'DOG',
        game_status: ['Created', 'In_progress'],
        limit: 20,
        business: profile?.business,
        rep_id: profile?.rep_id,
        played_date: new Date().toISOString().split('T')[0],
        sortBy: "time_created",
        sortDir: "ASC"
      }
      const response = await axios.get<Player[]>(`${BASE_URL}/getAll/`, {
        params: dbObject
      });
      setPlayers(response.data);
    } catch (error) {
      console.error('Error fetching dog players:', error);
    }
  }, []);

  useEffect(() => {
    fetchPlayers();
  }, [fetchPlayers]);

  // Handle namespaced real-time updates (delta mapping)
  useEffect(() => {
    if (!socket || !profile?.business) return;

    // Join room for this business location
    socket.emit('join_business_room', profile.business);

    const handleDelta = (event: { operation: string, player: Player }) => {
      // Check if it belongs to this table's puzzle type
      if (event.player.puzzle_type !== 'DOG') return;

      setPlayers((prevPlayers) => {
        const { operation, player } = event;

        if (operation === 'DELETE') {
          return prevPlayers.filter(p => p.player_guid !== player.player_guid);
        }

        // If it's Completed, remove from display queue
        if (player.game_status === 'Completed') {
          return prevPlayers.filter(p => p.player_guid !== player.player_guid);
        }

        // Add or Update player
        const exists = prevPlayers.some(p => p.player_guid === player.player_guid);
        let updatedList;
        if (exists) {
          updatedList = prevPlayers.map(p => p.player_guid === player.player_guid ? player : p);
        } else {
          updatedList = [...prevPlayers, player];
        }

        // Sort the list so In_progress is first, and others by queue number
        return updatedList.sort((a, b) => {
          if (a.game_status === 'In_progress' && b.game_status !== 'In_progress') return -1;
          if (b.game_status === 'In_progress' && a.game_status !== 'In_progress') return 1;

          const queA = a.id;
          const queB = b.id;
          if (queA === null && queB === null) return 0;
          if (queA === null) return 1;
          if (queB === null) return -1;
          return queA - queB;
        });
      });
    };

    socket.on('game_players_delta', handleDelta);
    return () => {
      socket.off('game_players_delta', handleDelta);
    };
  }, [socket, profile?.business]);

  const hasInProgress = players.some(p => p.game_status === 'In_progress');

  return (
    <div className={classes.displaySection}>
      <div className={classes.budgetHeader} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%' }}>
        <Card>
          <span className={classes.spanCount}>Total Dog Players: {players.length}</span>
        </Card>
      </div>
      <table className={`${classes.playerTable} ${classes.borderedTable}`}>
        <thead>
          <tr>
            <th>Number</th>
            <th>Username</th>
            <th>Timer</th>
          </tr>
        </thead>
        <tbody>
          {players.map((player, index) => (
            <tr
              key={player.player_guid}
              className={
                player.game_status === 'In_progress'
                  ? classes.inProgressPlayer
                  : index === 0 && !hasInProgress
                    ? classes.nextPlayer
                    : index === 1 && hasInProgress
                      ? classes.nextPlayer
                      : ""
              }
            >
              <td>
                <span> {player.id}</span>
              </td>
              <td>{player.username}</td>
              <td>
                {player.game_status === 'In_progress' && player.time_started ? (
                  <RowTimer timeStarted={player.time_started} />
                ) : (
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0.4rem 1rem',
                    borderRadius: '30px',
                    background: '#e9ecef',
                    color: '#6c757d',
                    fontWeight: 'bold',
                    fontSize: '1.1rem',
                    fontFamily: 'monospace',
                    letterSpacing: '0.5px',
                    border: '1.5px solid #dee2e6'
                  }}>
                    00:00:00
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default DogPlayersDisplay;