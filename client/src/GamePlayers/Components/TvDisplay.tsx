import React, { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import classes from '../Styles/PlayerBuilder.module.scss';
import CatPlayersDisplay from './CatPlayersDisplay';
import DogPlayersDisplay from './DogPlayersDisplay';
import DailyPlayers from './DailyPlayers';

const TvDisplay: React.FC = () => {
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    // Establish connection to the backend
    const socket = io('http://192.168.4.188:5001', {
        transports: ['websocket', 'polling'],
        reconnection: true
    });

    socket.on('connect', () => console.log('✅ Connected to Update Server'));
    socket.on('connect_error', (err) => console.error('❌ Connection Error:', err));

    socket.on('game_players_updated', () => {
      console.log('⚡ DB Update Signal Received: Re-rendering components...');
      setRefreshKey(prev => prev + 1);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <div className={classes.tvLayout}>
      <div className={classes.tvTopHalf}>
        <div className={classes.tvQuadrant}>
          <CatPlayersDisplay key={`cat-${refreshKey}`} />
        </div>
        <div className={classes.tvQuadrant}>
          <DogPlayersDisplay key={`dog-${refreshKey}`} />
        </div>
      </div>
      <div className={classes.tvBottomHalf}>
        <DailyPlayers key={`daily-${refreshKey}`} />
      </div>
    </div>
  );
};

export default TvDisplay;