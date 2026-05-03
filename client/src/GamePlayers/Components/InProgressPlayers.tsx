import React, { useState, useEffect } from 'react';
import { type Player } from './PlayerInterface';

interface InProgressPlayersProps {
  currentPlayer: Player | undefined;
  updateCurrentPlayer: (updatedPuzzleState: Player[]) => void;
  puzzleState: Player[];
  setHighlightCurrentPlayer: (highlight: boolean) => void;
}

const InProgressPlayers: React.FC<InProgressPlayersProps> = ({
  currentPlayer,
  updateCurrentPlayer,
  puzzleState,
  setHighlightCurrentPlayer,
}) => {
  const [playTime, setPlayTime] = useState<number>(0);
  const [isRunning, setIsRunning] = useState<boolean>(false);

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
    if (currentPlayer?.game_status === 'InProgress') {
      setIsRunning(true);
      setHighlightCurrentPlayer(true);
    } else {
      setIsRunning(false);
      setHighlightCurrentPlayer(false);
      setPlayTime(0);
    }
  }, [currentPlayer?.player_guid, currentPlayer?.game_status, setHighlightCurrentPlayer]);

  const formatTime = (totalSeconds: number): string => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
      2,
      "0"
    )}:${String(seconds).padStart(2, "0")}`;
  };

  const handleStart = () => {
    setIsRunning(true);
    setHighlightCurrentPlayer(true);
    const updatedPuzzleState = puzzleState.map((player) =>
      player.id === currentPlayer?.id
        ? { ...player, game_status: "InProgress" }
        : player
    );
    updateCurrentPlayer(updatedPuzzleState);
    // ToDo: Update the player status in PlayersTable in Database
  };

  const handleStop = () => {
    setIsRunning(false);
    setHighlightCurrentPlayer(false);
    setPlayTime(0); // Reset playTime after stopping

    const updatedPuzzleState = puzzleState.filter(
      (player) => player.player_guid !== currentPlayer?.player_guid
    );
    updateCurrentPlayer(updatedPuzzleState);
  };

  return (
    <div>
      <h3 style={{ margin: 0 }}>Timer: {formatTime(playTime)}</h3>
    </div>
  );
};

export default InProgressPlayers;
