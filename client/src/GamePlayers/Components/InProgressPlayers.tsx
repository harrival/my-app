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
    if (!startTimeStr || startTimeStr === '00:00:00') return 0;
    const timeMatch = startTimeStr.match(/(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
    if (!timeMatch) return 0;
    let hrs = parseInt(timeMatch[1], 10);
    const mins = parseInt(timeMatch[2], 10);
    const secs = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
    if (isNaN(hrs) || isNaN(mins)) return 0;

    const lowerStr = startTimeStr.toLowerCase();
    if (lowerStr.includes('pm') && hrs < 12) hrs += 12;
    if (lowerStr.includes('am') && hrs === 12) hrs = 0;

    const startSecOfDay = hrs * 3600 + mins * 60 + secs;
    const now = new Date();
    const nowLocalSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    const nowUtcSec = now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds();

    let diffLocal = nowLocalSec - startSecOfDay;
    if (diffLocal < -43200) diffLocal += 86400;
    else if (diffLocal > 43200) diffLocal -= 86400;

    let diffUtc = nowUtcSec - startSecOfDay;
    if (diffUtc < -43200) diffUtc += 86400;
    else if (diffUtc > 43200) diffUtc -= 86400;

    const candidates: number[] = [];
    if (diffLocal >= 0) candidates.push(diffLocal);
    if (diffUtc >= 0) candidates.push(diffUtc);

    return candidates.length > 0 ? Math.min(...candidates) : 0;
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
