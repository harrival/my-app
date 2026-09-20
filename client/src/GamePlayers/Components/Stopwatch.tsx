import React, { useState, useEffect, useRef } from 'react';
import Card from '../../UI/Card/Card';
import axios from 'axios';
import { BASE_URL } from '../../shared/Utils/apiConfig';

interface ColorSample {
  time: number;
  r: number;
  g: number;
  b: number;
}

const Stopwatch: React.FC = () => {
  const [time, setTime] = useState<number>(0);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(true);
  const [cameraError, setCameraError] = useState<string>('');

  const [usernameInput, setUsernameInput] = useState<string>('');
  const [searchedPlayer, setSearchedPlayer] = useState<any>(null);
  const [searchError, setSearchError] = useState<string>('');

  const timerRef = useRef<any>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number | null>(null);
  const displayRef = useRef<HTMLDivElement>(null);

  // Refs to avoid React state closure stale references in the RAF loop
  const isRunningRef = useRef<boolean>(false);
  const timeRef = useRef<number>(0);
  const samplesRef = useRef<ColorSample[]>([]);
  const lastTriggerTimeRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const searchedPlayerRef = useRef<any>(null);

  const logDebug = (msg: string) => {
    console.log(msg);
  };

  // Sync refs with state changes
  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  useEffect(() => {
    timeRef.current = time;
  }, [time]);

  useEffect(() => {
    searchedPlayerRef.current = searchedPlayer;
  }, [searchedPlayer]);

  // Standard Stopwatch Timer Interval
  useEffect(() => {
    if (isRunning) {
      const startTimeStamp = Date.now() - timeRef.current;
      timerRef.current = setInterval(() => {
        const elapsed = Date.now() - startTimeStamp;
        timeRef.current = elapsed;
        if (displayRef.current) {
          displayRef.current.innerText = formatTime(elapsed);
        }
      }, 40); // 25 updates per second is super smooth
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      setTime(timeRef.current);
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isRunning]);

  // Audio Cue player (Web Audio API)
  const playBeep = (frequency: number, duration: number) => {
    try {
      if (!audioCtxRef.current) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        audioCtxRef.current = new AudioContextClass();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(frequency, ctx.currentTime);

      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {
      console.error('Audio beep error:', e);
    }
  };

  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSearchError('');
    setSearchedPlayer(null);

    if (!usernameInput.trim()) {
      setSearchError('Please enter a username');
      return;
    }

    try {
      const response = await axios.get(`${BASE_URL}/getAll`, {
        params: {
          tableName: 'game_players_table',
          username: usernameInput.trim(),
          game_status: 'Created',
          limit: 1
        }
      });

      if (response.data && response.data.length > 0) {
        setSearchedPlayer(response.data[0]);
      } else {
        setSearchError('No active player found with that username');
      }
    } catch (err) {
      console.error('Error searching player:', err);
      setSearchError('Failed to search player. Please try again.');
    }
  };

  // Trigger start function
  const handleStart = async () => {
    lastTriggerTimeRef.current = Date.now();
    setIsRunning(true);
    playBeep(880, 0.1);
    setTimeout(() => playBeep(880, 0.1), 150);
    logDebug("⏱️ START Triggered");

    const player = searchedPlayerRef.current;
    if (player) {
      const startTime = new Date().toLocaleTimeString('it-IT');
      try {
        const editedPlayer = {
          game_status: 'In_progress',
          time_started: startTime,
        };
        await axios.patch(
          `${BASE_URL}/editPlayerForm/${player.player_guid}`,
          editedPlayer
        );
        logDebug(`Updated player ${player.username} status to In_progress`);
        setSearchedPlayer((prev: any) => prev ? { ...prev, game_status: 'In_progress', time_started: startTime } : null);
      } catch (err) {
        console.error("Error updating player to In_progress:", err);
      }
    }
  };

  const timeFormat = (ms: number) => {
    if (isNaN(ms) || ms < 0) return "00:00:00";

    const hrs = Math.floor(ms / 3600000);
    const mins = Math.floor((ms % 3600000) / 60000);
    const secs = Math.floor((ms % 60000) / 1000);

    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Trigger stop function and save
  const handleStop = async () => {
    lastTriggerTimeRef.current = Date.now();
    setIsRunning(false);
    playBeep(440, 0.3);

    const endTime = Date.now();
    const duration = timeRef.current;

    logDebug("⏱️ STOP Triggered. Duration: " + formatTime(duration));

    const player = searchedPlayerRef.current;
    if (player) {
      const timeEnded = new Date().toLocaleTimeString('it-IT');
      const timeUsedSeconds = Math.floor(duration / 1000);
      const playedDate = new Date().toISOString().split('T')[0];
      const timeModified = new Date().toISOString();

      const editedPlayer = {
        game_status: 'Completed',
        time_ended: timeEnded,
        time_used: timeFormat(duration),
        time_used_in_sec: timeUsedSeconds,
        played_date: playedDate,
        time_modified: timeModified
      };

      try {
        await axios.patch(
          `${BASE_URL}/editPlayerForm/${player.player_guid}`,
          editedPlayer
        );
        logDebug(`Updated player ${player.username} status to Completed`);
        setSearchedPlayer(null); // Clear active loaded player after completion
        setUsernameInput('');    // Clear input
      } catch (err) {
        console.error("Error updating player to Completed:", err);
      }
    }

    logDebug("⏱️ Scheduling auto-reset in 5 seconds...");
    setTimeout(() => {
      handleReset();
      logDebug("⏱️ Timer auto-reset completed.");
    }, 5000);
  };

  const handleReset = () => {
    timeRef.current = 0;
    setTime(0);
    setIsRunning(false);
    if (displayRef.current) {
      displayRef.current.innerText = formatTime(0);
    }
  };

  // Frame processing loop
  const processFrame = () => {
    if (!videoRef.current || !canvasRef.current || !isCameraActiveRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (video.videoWidth === 0 || video.videoHeight === 0) {
      return;
    }

    // Draw scaled down frame (30x30 pixels for super fast processing)
    ctx.drawImage(video, 0, 0, 30, 30);
    const imgData = ctx.getImageData(0, 0, 30, 30);

    // Calculate average R, G, B channels
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    for (let i = 0; i < imgData.data.length; i += 4) {
      sumR += imgData.data[i];
      sumG += imgData.data[i + 1];
      sumB += imgData.data[i + 2];
    }
    const avgR = sumR / 900;
    const avgG = sumG / 900;
    const avgB = sumB / 900;

    const now = Date.now();
    samplesRef.current.push({ time: now, r: avgR, g: avgG, b: avgB });

    // Keep rolling window of last 1.5 seconds
    const cutoff = now - 1500;
    samplesRef.current = samplesRef.current.filter((s) => s.time > cutoff);

    const samples = samplesRef.current;
    if (samples.length > 10) {
      let minR = 255, maxR = 0, sumR_total = 0;
      let minG = 255, maxG = 0, sumG_total = 0;

      for (const s of samples) {
        if (s.r < minR) minR = s.r;
        if (s.r > maxR) maxR = s.r;
        sumR_total += s.r;

        if (s.g < minG) minG = s.g;
        if (s.g > maxG) maxG = s.g;
        sumG_total += s.g;
      }

      const ampR = maxR - minR;
      const ampG = maxG - minG;

      const meanR = sumR_total / samples.length;
      const meanG = sumG_total / samples.length;

      // Calculate Green crossings
      const midpointG = (maxG + minG) / 2;
      let crossingsG = 0;
      let isAboveG = samples[0].g > midpointG;
      for (let i = 1; i < samples.length; i++) {
        const val = samples[i].g;
        if (isAboveG) {
          if (val < midpointG - 2) isAboveG = false;
        } else {
          if (val > midpointG + 2) {
            isAboveG = true;
            crossingsG++;
          }
        }
      }

      // Calculate Red crossings
      const midpointR = (maxR + minR) / 2;
      let crossingsR = 0;
      let isAboveR = samples[0].r > midpointR;
      for (let i = 1; i < samples.length; i++) {
        const val = samples[i].r;
        if (isAboveR) {
          if (val < midpointR - 2) isAboveR = false;
        } else {
          if (val > midpointR + 2) {
            isAboveR = true;
            crossingsR++;
          }
        }
      }

      const durationSec = (samples[samples.length - 1].time - samples[0].time) / 1000;
      const hzG = durationSec > 0 ? crossingsG / durationSec : 0;
      const hzR = durationSec > 0 ? crossingsR / durationSec : 0;

      const cooldown = 1500;
      const isGreenFlashing = ampG > 15 && meanG > meanR + 10 && crossingsG >= 2;
      const isRedFlashing = ampR > 15 && meanR > meanG + 10 && crossingsR >= 2;

      if (isGreenFlashing) {
        if (now - lastTriggerTimeRef.current > cooldown) {
          if (!isRunningRef.current) {
            handleStart();
          }
        }
      } else if (isRedFlashing) {
        if (now - lastTriggerTimeRef.current > cooldown) {
          if (isRunningRef.current) {
            handleStop();
          }
        }
      }

    }
  };

  const processFrameRef = useRef<() => void>();
  const isCameraActiveRef = useRef<boolean>(false);

  useEffect(() => {
    isCameraActiveRef.current = isCameraActive;
  }, [isCameraActive]);

  useEffect(() => {
    processFrameRef.current = processFrame;
  });

  const animationLoop = () => {
    if (!isCameraActiveRef.current) return;
    if (processFrameRef.current) {
      processFrameRef.current();
    }
    requestRef.current = requestAnimationFrame(animationLoop);
  };

  // Toggle Camera logic
  useEffect(() => {
    isCameraActiveRef.current = isCameraActive;
    if (isCameraActive) {
      navigator.mediaDevices
        .getUserMedia({
          video: {
            facingMode: 'user',
            frameRate: { ideal: 30 },
          },
        })
        .then((stream) => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.setAttribute('playsinline', 'true');
            videoRef.current.play();
            setCameraError('');
            // Guarantee loop starts
            setTimeout(() => {
              if (!requestRef.current) {
                requestRef.current = requestAnimationFrame(animationLoop);
              }
            }, 300);
          }
        })
        .catch((err: any) => {
          console.error('Camera access denied:', err);
          setCameraError('Camera access denied. Please allow camera permissions.');
          setIsCameraActive(false);
        });
    } else {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
        videoRef.current.srcObject = null;
      }
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
        requestRef.current = null;
      }
    }

    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [isCameraActive]);

  // Start processing frames when camera starts playing
  const handleVideoPlaying = () => {
    if (!requestRef.current) {
      requestRef.current = requestAnimationFrame(animationLoop);
    }
  };

  const formatTime = (timeMs: number) => {
    const minutes = Math.floor(timeMs / 60000);
    const seconds = Math.floor((timeMs % 60000) / 1000);
    const milliseconds = Math.floor((timeMs % 1000) / 10);

    const mStr = minutes.toString().padStart(2, '0');
    const sStr = seconds.toString().padStart(2, '0');
    const msStr = milliseconds.toString().padStart(2, '0');

    return `${mStr}:${sStr}.${msStr}`;
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '1rem', position: 'relative' }}>
      <Card>
        <div style={{ padding: '2rem 1.5rem', textAlign: 'center' }}>
          <h1 style={{ marginBottom: '1.5rem', color: '#1a1a1a', fontSize: '2rem', fontWeight: 700 }}>
            ⏱️ Player's Stopwatch
          </h1>

          {/* Search Box */}
          <form onSubmit={handleSearchSubmit} style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'center', gap: '10px' }}>
            <input
              type="text"
              placeholder="Enter Username"
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              style={{
                padding: '0.8rem 1.2rem',
                fontSize: '1rem',
                border: '2px solid #ccc',
                borderRadius: '8px',
                width: '260px',
                outline: 'none',
                transition: 'border-color 0.2s',
              }}
              onFocus={(e) => e.target.style.borderColor = '#34c759'}
              onBlur={(e) => e.target.style.borderColor = '#ccc'}
            />
            <button
              type="submit"
              style={{
                padding: '0.8rem 1.5rem',
                fontSize: '1rem',
                fontWeight: 'bold',
                backgroundColor: '#34c759',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                boxShadow: '0 4px 6px rgba(52, 199, 89, 0.2)',
                transition: 'background-color 0.2s',
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#2da94d'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#34c759'}
            >
              Load Player
            </button>
          </form>

          {/* Player Info display */}
          {searchedPlayer && (
            <div style={{
              background: '#e7ffe3',
              border: '2px dashed #34c759',
              borderRadius: '12px',
              padding: '1rem',
              marginBottom: '2rem',
              display: 'inline-block',
              minWidth: '320px',
              textAlign: 'left'
            }}>
              <h3 style={{ margin: '0 0 0.5rem 0', color: '#2da94d' }}>Loaded Player:</h3>
              <p style={{ margin: '0.2rem 0' }}><strong>Username:</strong> {searchedPlayer.username}</p>
              <p style={{ margin: '0.2rem 0' }}><strong>Puzzle Type:</strong> {searchedPlayer.puzzle_type}</p>
              <p style={{ margin: '0.2rem 0' }}><strong>Status:</strong> {searchedPlayer.game_status}</p>
            </div>
          )}

          {searchError && (
            <div style={{ color: '#ff3b30', background: '#ffebeb', padding: '0.8rem 1.2rem', borderRadius: '8px', marginBottom: '2rem', display: 'inline-block', minWidth: '320px' }}>
              {searchError}
            </div>
          )}

          <div
            ref={displayRef}
            style={{
              fontSize: '4.5rem',
              fontWeight: 'bold',
              fontFamily: 'monospace',
              color: isRunning ? '#ff3b30' : '#34c759',
              background: '#f8f9fa',
              padding: '1.5rem',
              borderRadius: '16px',
              border: '2px solid #e9ecef',
              marginBottom: '2rem',
              letterSpacing: '0.15rem',
              boxShadow: 'inset 0 3px 6px rgba(0,0,0,0.05)',
              textShadow: '0 1px 2px rgba(0,0,0,0.05)',
              display: 'inline-block',
              minWidth: '320px',
            }}
          >
            {formatTime(time)}
          </div>

          {/* Manual Control Buttons */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '15px', marginBottom: '2rem' }}>
            {!isRunning ? (
              <button
                onClick={handleStart}
                disabled={!searchedPlayer}
                style={{
                  padding: '0.8rem 2rem',
                  fontSize: '1.1rem',
                  fontWeight: 'bold',
                  backgroundColor: searchedPlayer ? '#34c759' : '#a2a2a2',
                  color: 'white',
                  border: 'none',
                  borderRadius: '30px',
                  cursor: searchedPlayer ? 'pointer' : 'not-allowed',
                  boxShadow: searchedPlayer ? '0 4px 10px rgba(52, 199, 89, 0.3)' : 'none',
                  transition: 'background-color 0.2s',
                }}
                onMouseOver={(e) => searchedPlayer && (e.currentTarget.style.backgroundColor = '#2da94d')}
                onMouseOut={(e) => searchedPlayer && (e.currentTarget.style.backgroundColor = '#34c759')}
              >
                Start
              </button>
            ) : (
              <button
                onClick={handleStop}
                style={{
                  padding: '0.8rem 2rem',
                  fontSize: '1.1rem',
                  fontWeight: 'bold',
                  backgroundColor: '#ff3b30',
                  color: 'white',
                  border: 'none',
                  borderRadius: '30px',
                  cursor: 'pointer',
                  boxShadow: '0 4px 10px rgba(255, 59, 48, 0.3)',
                  transition: 'background-color 0.2s',
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#e03126'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#ff3b30'}
              >
                Stop
              </button>
            )}
            <button
              onClick={handleReset}
              style={{
                padding: '0.8rem 2rem',
                fontSize: '1.1rem',
                fontWeight: 'bold',
                backgroundColor: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '30px',
                cursor: 'pointer',
                transition: 'background-color 0.2s',
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#5a6268'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#6c757d'}
            >
              Reset
            </button>
          </div>

          {cameraError && (
            <div style={{ color: '#ff3b30', background: '#ffebeb', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem' }}>
              {cameraError}
            </div>
          )}

          {isCameraActive && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1.5rem' }}>
              <div style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', border: '2px solid #34c759', width: '320px', height: '240px', background: '#000' }}>
                <video
                  ref={videoRef}
                  onPlaying={handleVideoPlaying}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  muted
                  playsInline
                />
                <canvas ref={canvasRef} width="30" height="30" style={{ display: 'none' }} />
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};

export default Stopwatch;
