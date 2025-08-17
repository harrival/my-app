import React, { useState, useEffect } from 'react';
import PlayersTable from '../../PlayersTable.json';
import set from 'localbase/localbase/api/actions/set';

const InProgressPlayers = ({
  currentPlayer,
  updateCurrentPlayer,
  puzzleState,
  setHighlightCurrentPlayer,
  setUpdate
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
        ? { ...player, PuzzleStatus: "InProgress" }
        : player
    );
    updateCurrentPlayer(updatedPuzzleState);
    // ToDo: Update the player status in PlayersTable in Database
  };

  const handleStop = async () => {
    setIsRunning(false);
    setHighlightCurrentPlayer(false);
    setPlayTime(0); // Reset playTime after stopping

    // const updatedPuzzleState = puzzleState.filter(
    //   (player) => player.id !== currentPlayer.id
    // );
    // updateCurrentPlayer(updatedPuzzleState);
    // setPlayTime(0);

    //ToDo: Update the player status in PlayersTable in Database
    try {
        const updatedPlayers = PlayersTable.map((player) => {
            if (player.id === currentPlayer.id) {
                return { 
                    ...player, 
                    TimeUsed: formatTime(playTime), 
                    TimeUpdated: new Date().toISOString(), 
                    PuzzleStatus: 'Completed' 
                };
            }
            return player;
        });
        PlayersTable.splice(0, PlayersTable.length, ...updatedPlayers);
        // Assuming you have a way to save the updatedPlayers back to the file or state
        console.log('Updated Players:', updatedPlayers);
        setUpdate(prev => !prev); // Trigger update to refresh the UI
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
