import React from 'react';
import classes from '../Styles/PlayerBuilder.module.scss';
import CatPlayersDisplay from './CatPlayersDisplay';
import DogPlayersDisplay from './DogPlayersDisplay';
import DailyPlayers from './DailyPlayers';
import TopPlayers from './TopPlayers';
import { useRefresh } from '../../shared/Context/RefreshContext';

const TvDisplay: React.FC = () => {
  const { refreshKey } = useRefresh();

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
      <div className={classes.tvTopHalf}>
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

export default TvDisplay;