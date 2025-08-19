import React, { useState, useEffect } from 'react';
import axios from 'axios';

const InProgressPlayers = ({
  currentPlayer,
  updateCurrentPlayer,
  puzzleState,
  setHighlightCurrentPlayer,
}) => {
  const [playTime, setPlayTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    let timer;
    if (isRunning) {
      timer = setInterval(() => {
        setPlayTime((prevTime) => prevTime + 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isRunning]);

  const formatTime = (totalSeconds) => {
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
      player.id === currentPlayer.id
        ? { ...player, gamestatus: "InProgress" }
        : player
    );
    updateCurrentPlayer(updatedPuzzleState);
    // ToDo: Update the player status in PlayersTable in Database
  };

  const handleStop = async () => {
    setIsRunning(false);
    setHighlightCurrentPlayer(false);
    setPlayTime(0); // Reset playTime after stopping
    const playedPlayer = {
      timeused: formatTime(playTime),
      timemodified: new Date().toISOString(),
      gamestatus: 'Completed'
    }

    //ToDo: Update the player status in PlayersTable in Database
    try {
      const response = await axios.patch(`http://localhost:5001/editPlayer/${currentPlayer.playerguid}`, playedPlayer);
      console.log('Player updated:', response.data);

      if (response.status === 200) {
        const updatedPuzzleState = puzzleState.filter(
          (player) => player.playerguid !== currentPlayer.playerguid
        );
        updateCurrentPlayer(updatedPuzzleState);
      }
    } catch (error) {
        console.error('Error updating player playTime:', error);
    }
  };

  return (
    <div>
      <h3>Timer: {formatTime(playTime)}</h3>
      <button onClick={handleStart} disabled={isRunning}>
        Start
      </button>
      <button onClick={handleStop} disabled={!isRunning}>
        Stop
      </button>
    </div>
  );
};

export default InProgressPlayers;
