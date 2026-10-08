import React, { useEffect } from 'react';
import classes from '../Styles/PlayerBuilder.module.scss';
import CatPlayersDisplay from './CatPlayersDisplay';
import DogPlayersDisplay from './DogPlayersDisplay';
import DailyPlayers from './DailyPlayers';
import TopPlayers from './TopPlayers';
import { useRefresh } from '../../shared/Context/RefreshContext';

const PlayersMonitor: React.FC = () => {
  const { refreshKey } = useRefresh();
  console.log('refreshKey in players monitor', refreshKey);
  // This is a no-scroll display page: lock document scroll while mounted
  useEffect(() => {
    const prevHtml = document.documentElement.style.overflow;
    const prevBody = document.body.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = prevHtml;
      document.body.style.overflow = prevBody;
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
        <div className={classes.tvQuadrant}>
          <DailyPlayers key={`daily-${refreshKey}`} />
        </div>
        <div className={classes.tvQuadrant}>
          <TopPlayers key={`top-${refreshKey}`} />
        </div>
      </div>
    </div>
  );
};

export default PlayersMonitor;