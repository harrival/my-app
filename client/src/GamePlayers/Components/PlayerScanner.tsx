import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { FaCamera, FaQrcode } from 'react-icons/fa';
import { BASE_URL } from '../../shared/Utils/apiConfig';
import { useUserProfile } from '../../shared/Context/UserProfileContext';
import { useRefresh } from '../../shared/Context/RefreshContext';
import { type Player } from './PlayerInterface';
import QrScanner from '../../UI/Scanner/QrScanner';
import classes from '../Styles/PlayerScanner.module.scss';

const padZero = (num: number): string => String(num).padStart(2, '0');

const getCurrentTimeString = (): string => {
  const now = new Date();
  return `${padZero(now.getHours())}:${padZero(now.getMinutes())}:${padZero(now.getSeconds())}`;
};

const parseElapsedSeconds = (timeVal?: string | number | Date | null): number => {
  if (!timeVal) return 0;

  if (typeof timeVal === 'number') {
    const diff = Math.floor((Date.now() - timeVal) / 1000);
    return diff > 0 ? diff : 0;
  }

  if (timeVal instanceof Date) {
    const diff = Math.floor((Date.now() - timeVal.getTime()) / 1000);
    return diff > 0 ? diff : 0;
  }

  const str = String(timeVal).trim();
  if (!str || str === '00:00:00') return 0;

  // 1. If it includes date indicators (ISO or SQL timestamp: contains '-' or 'T')
  if (str.includes('-') || str.includes('T')) {
    const isoStr = str.includes(' ') && !str.includes('T') ? str.replace(' ', 'T') : str;
    const parsed = Date.parse(isoStr);
    if (!isNaN(parsed)) {
      const diff = Math.floor((Date.now() - parsed) / 1000);
      if (diff >= 0) return diff;
    }
  }

  // 2. Parse time string (HH:MM:SS, HH:MM, optional fractional seconds, AM/PM, timezone)
  const timeMatch = str.match(/(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
  if (!timeMatch) return 0;

  let hrs = parseInt(timeMatch[1], 10);
  const mins = parseInt(timeMatch[2], 10);
  const secs = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;

  if (isNaN(hrs) || isNaN(mins)) return 0;

  // Handle 12-hour AM/PM if present
  const lowerStr = str.toLowerCase();
  if (lowerStr.includes('pm') && hrs < 12) hrs += 12;
  if (lowerStr.includes('am') && hrs === 12) hrs = 0;

  const startSecOfDay = hrs * 3600 + mins * 60 + secs;

  const now = new Date();
  const nowLocalSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const nowUtcSec = now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds();

  // Calculate local time difference with midnight wrap-around
  let diffLocal = nowLocalSec - startSecOfDay;
  if (diffLocal < -43200) diffLocal += 86400;
  else if (diffLocal > 43200) diffLocal -= 86400;

  // Calculate UTC time difference with midnight wrap-around (in case startTime was stored in UTC)
  let diffUtc = nowUtcSec - startSecOfDay;
  if (diffUtc < -43200) diffUtc += 86400;
  else if (diffUtc > 43200) diffUtc -= 86400;

  const candidates: number[] = [];
  if (diffLocal >= 0) candidates.push(diffLocal);
  if (diffUtc >= 0) candidates.push(diffUtc);

  if (candidates.length === 0) return 0;
  return Math.min(...candidates);
};

const calculateElapsedSeconds = (
  startTimeStr?: string | null,
  fallbackTimeStr?: string | null
): number => {
  if (startTimeStr && startTimeStr !== '00:00:00') {
    const sec = parseElapsedSeconds(startTimeStr);
    if (sec > 0) return sec;
  }
  if (fallbackTimeStr && fallbackTimeStr !== '00:00:00') {
    const fallbackSec = parseElapsedSeconds(fallbackTimeStr);
    if (fallbackSec > 0) return fallbackSec;
  }
  return 0;
};

const formatTimeUsed = (totalSeconds: number): string => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${padZero(hours)}:${padZero(minutes)}:${padZero(seconds)}`;
};

const PlayerScanner: React.FC = () => {
  const navigate = useNavigate();
  const { profile, isTV } = useUserProfile();
  const { socket } = useRefresh();

  const isAgent = !isTV && (profile?.permission_group === 'Agent' || Boolean(profile?.rep_id));
  const business = profile?.business || 'non_business';

  const [isCameraActive, setIsCameraActive] = useState<boolean>(true);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // Audio & haptic feedback for hands-free operation with loud, clear volume
  const playAudioFeedback = useCallback((type: 'start' | 'complete' | 'info' | 'error') => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      if (type === 'start') {
        // Upbeat rising chime (start of puzzle) - High volume
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = 'sine';
        osc2.type = 'triangle';
        osc1.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
        osc1.frequency.setValueAtTime(880, ctx.currentTime + 0.12); // A5
        osc2.frequency.setValueAtTime(880, ctx.currentTime + 0.12);

        gain.gain.setValueAtTime(0.8, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start();
        osc2.start(ctx.currentTime + 0.12);
        osc1.stop(ctx.currentTime + 0.4);
        osc2.stop(ctx.currentTime + 0.4);
      } else if (type === 'complete') {
        // Fanfare tones (C5 -> E5 -> G5) - High volume
        const freqs = [523.25, 659.25, 783.99];
        freqs.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.1);
          gain.gain.setValueAtTime(0.85, ctx.currentTime + idx * 0.1);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.1 + 0.3);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(ctx.currentTime + idx * 0.1);
          osc.stop(ctx.currentTime + idx * 0.1 + 0.3);
        });
      } else if (type === 'error') {
        // Warning buzz - High volume
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, ctx.currentTime);
        gain.gain.setValueAtTime(0.75, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      } else {
        // Info chime - High volume
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        gain.gain.setValueAtTime(0.8, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.28);
      }
    } catch (e) {
      // Audio playback ignored
    }

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        if (type === 'complete') {
          navigator.vibrate([100, 50, 150]);
        } else if (type === 'start') {
          navigator.vibrate(100);
        } else if (type === 'error') {
          navigator.vibrate(250);
        }
      } catch (e) { }
    }
  }, []);

  // Hands-free automated scan handler
  // 1. Reads username from QR
  // 2. Gets today's date
  // 3. If game_status is Created -> updates to In_progress and records time_started
  // 4. If game_status is In_progress and time_used < 1 min -> plays info chime without completing
  // 5. If game_status is In_progress and time_used >= 1 min -> updates to Completed
  const handleAutoScan = useCallback(async (rawText: string) => {
    let cleanUsername = rawText.trim();
    try {
      const parsed = JSON.parse(rawText);
      if (parsed.username) cleanUsername = parsed.username;
    } catch (e) {
      if (cleanUsername.includes('/')) {
        const parts = cleanUsername.split('/');
        cleanUsername = parts[parts.length - 1];
      }
    }

    if (!cleanUsername) return;

    const today = new Date().toISOString().split('T')[0];
    const currentTime = getCurrentTimeString();

    setIsProcessing(true);

    try {
      // 1. Fetch player by username (check today first)
      const params: Record<string, any> = {
        tableName: 'game_players_table',
        username: cleanUsername,
        played_date: today,
        sortBy: 'time_created',
        sortDir: 'DESC',
        ...(profile?.rep_id ? { rep_id: profile.rep_id } : {}),
      };

      let response = await axios.get<Player[]>(`${BASE_URL}/getAll/`, { params });
      let player: Player | undefined = response.data?.[0];

      // Fallback: check without played_date if not found today (e.g. crossing midnight or slight date discrepancy)
      if (!player) {
        const fallbackParams: Record<string, any> = {
          tableName: 'game_players_table',
          username: cleanUsername,
          sortBy: 'time_created',
          sortDir: 'DESC',
          ...(profile?.rep_id ? { rep_id: profile.rep_id } : {}),
        };
        const fallbackRes = await axios.get<Player[]>(`${BASE_URL}/getAll/`, { params: fallbackParams });
        player = fallbackRes.data?.[0];
      }

      if (!player) {
        playAudioFeedback('error');
        return;
      }

      // 2. Automated status transitions
      const currentStatus = (player.game_status || '').toLowerCase().replace(/[\s_-]+/g, '');

      if (currentStatus === 'created') {
        // Action: Start game
        const updatePayload: Partial<Player> = {
          game_status: 'In_progress',
          time_started: currentTime,
          time_modified: new Date().toISOString(),
        };

        await axios.patch(`${BASE_URL}/editPlayerForm/${player.player_guid}`, updatePayload);
        playAudioFeedback('start');
        socket?.emit('game_players_changed');
      } else if (currentStatus === 'inprogress') {
        // Action: Check elapsed time
        const elapsedSec = calculateElapsedSeconds(
          player.time_started,
          player.time_modified || player.time_created
        );

        console.log(`[PlayerScanner] player ${player.username} (status: ${player.game_status}) elapsedSec: ${elapsedSec}, time_started: ${player.time_started}, time_created: ${player.time_created}`);

        // If time_started in DB was missing or 00:00:00, repair it in background so DB has it populated
        if (!player.time_started || player.time_started === '00:00:00') {
          axios.patch(`${BASE_URL}/editPlayerForm/${player.player_guid}`, { time_started: currentTime }).catch(() => {});
        }

        // If game_status is InProgress and time_used is less than 1 minute (60 seconds), play audio info and do not complete
        if (elapsedSec < 60) {
          playAudioFeedback('info');
          return;
        }

        // Action: Complete game
        const time_used = formatTimeUsed(elapsedSec);

        const updatePayload: Partial<Player> = {
          game_status: 'Completed',
          time_ended: currentTime,
          time_used,
          time_used_in_sec: elapsedSec,
          played_date: today,
          time_modified: new Date().toISOString(),
        };

        await axios.patch(`${BASE_URL}/editPlayerForm/${player.player_guid}`, updatePayload);
        playAudioFeedback('complete');
        socket?.emit('game_players_changed');
      } else if (currentStatus === 'completed') {
        // Already completed
        playAudioFeedback('info');
      }
    } catch (err: any) {
      console.error('Scan processing error:', err);
      playAudioFeedback('error');
    } finally {
      setIsProcessing(false);
    }
  }, [profile?.rep_id, playAudioFeedback, socket]);

  // Guard: Agents only
  if (!isAgent) {
    return (
      <div className={classes.restrictedContainer}>
        <h2>Access Restricted</h2>
        <p>
          This QR scanner station is only accessible to authorized game agents. Please log in with an
          agent account.
        </p>
        <button type="button" onClick={() => navigate(`/${business}`)}>
          Return to Play Ground
        </button>
      </div>
    );
  }

  return (
    <div className={classes.scannerPage}>
      {/* Page Header */}
      <div className={classes.pageHeader}>
        <div className={classes.headerTitle}>
          <h1>
            <FaQrcode /> Scan Player
          </h1>
          <p>Continuous Hands-Free Station: Auto-starts and auto-completes game timers upon scan.</p>
        </div>

        <div className={classes.agentBadge}>
          <span className={classes.pulseDot} />
          <span>Agent: {profile?.first_name || profile?.rep_id || 'Active'}</span>
        </div>
      </div>

      {/* Main Scanner Section */}
      <div className={classes.scannerCard}>
        <div className={classes.cameraToggleSection}>
          <button
            type="button"
            className={`${classes.cameraToggleBtn} ${isCameraActive ? classes.active : ''}`}
            onClick={() => setIsCameraActive(!isCameraActive)}
          >
            <FaCamera />
            {isCameraActive ? 'Pause Camera Scanner' : 'Resume Camera Scanner'}
          </button>
        </div>

        {isCameraActive ? (
          <div className={classes.cameraContainer}>
            <QrScanner
              continuous={true}
              cooldownMs={2500}
              onScanSuccess={handleAutoScan}
              showManualFallback={false}
              onClose={() => setIsCameraActive(false)}
            />
          </div>
        ) : (
          <div className={classes.cameraPaused}>
            <FaCamera style={{ fontSize: '2.5rem', color: '#94a3b8', marginBottom: '0.75rem' }} />
            <p>Camera scanner is paused.</p>
            <button
              type="button"
              className={classes.resumeBtn}
              onClick={() => setIsCameraActive(true)}
            >
              Resume Camera
            </button>
          </div>
        )}

        {/* Live scanner readiness pill */}
        <div className={classes.scannerStatusPill}>
          {isProcessing ? (
            <span className={classes.statusProcessing}>
              <span className={classes.pulseDotAmber} /> Processing scanned ticket...
            </span>
          ) : isCameraActive ? (
            <span className={classes.statusReady}>
              <span className={classes.pulseDotGreen} /> Camera Ready — Point at player QR ticket
            </span>
          ) : (
            <span className={classes.statusPaused}>Scanner paused</span>
          )}
        </div>
      </div>

    </div>
  );
};

export default PlayerScanner;
