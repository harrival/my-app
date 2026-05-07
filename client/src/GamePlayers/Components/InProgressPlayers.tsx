import React, { useState, useEffect, useCallback } from 'react';
import { type Player } from './PlayerInterface';

interface InProgressPlayersProps {
  currentPlayer: Player | undefined;
  updateCurrentPlayer: (updatedPuzzleState: Player[]) => void;
  puzzleState: Player[];
  setHighlightCurrentPlayer: (highlight: boolean) => void;
  puzzleType: string;
}

const InProgressPlayers: React.FC<InProgressPlayersProps> = ({
  currentPlayer,
  updateCurrentPlayer,
  puzzleState,
  setHighlightCurrentPlayer,
  puzzleType,
}) => {
  const [playTime, setPlayTime] = useState<number>(0);
  const [isRunning, setIsRunning] = useState<boolean>(false);

  const calculateElapsedSeconds = useCallback((startTimeStr: string) => {
    const [hrs, mins, secs] = startTimeStr.split(':').map(Number);
    const now = new Date();
    const start = new Date();
    start.setHours(hrs, mins, secs, 0);
    
    const diff = Math.floor((now.getTime() - start.getTime()) / 1000);
    return diff > 0 ? diff : 0;
  }, []);

  useEffect(() => {
    let timer: number | undefined;
    if (isRunning) {
      timer = window.setInterval(() => {
        setPlayTime((prevTime) => prevTime + 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isRunning]);

  useEffect(() => {
    if (currentPlayer?.game_status === 'In_progress' && currentPlayer.time_started) {
      setPlayTime(calculateElapsedSeconds(currentPlayer.time_started));
      setIsRunning(true);
      setHighlightCurrentPlayer(true);
    } else {
      setIsRunning(false);
      setHighlightCurrentPlayer(false);
      setPlayTime(0);
    }
  }, [currentPlayer?.player_guid, currentPlayer?.game_status, currentPlayer?.time_started, setHighlightCurrentPlayer, calculateElapsedSeconds]);

  const formatTime = (totalSeconds: number): string => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
      2,
      "0"
    )}:${String(seconds).padStart(2, "0")}`;
  };

  return (
    <div>
      <h3 style={{ margin: 0 }}>{puzzleType} Timer: <span style={{color: 'red'}}>{formatTime(playTime)}</span></h3>
    </div>
  );
};

export default InProgressPlayers;
