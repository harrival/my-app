import React, { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback } from 'react';
import axios from 'axios';
import { BASE_URL } from '../../shared/Utils/apiConfig';
import { useRefresh } from './RefreshContext';

export interface UserProfile {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string;
  address: string;
  permission_group: string;
  is_admin: boolean;
  business?: string;
  business_value?: string;
  rep_id?: string | null;
  event_id?: string | null;
  isLinkedDevice?: boolean;
  deviceId?: string;
  [key: string]: any;
}

interface UserProfileContextType {
  profile: UserProfile | null;
  user_guid?: string;
  hasProfile: boolean;
  loading: boolean;
  isLinkedDevice: boolean;
  isTV: boolean;
  setProfile: (profile: UserProfile | null) => void;
  refreshProfile: (loginUserGuid?: string) => Promise<void>;
}

const UserProfileContext = createContext<UserProfileContextType | undefined>(undefined);

// Inactivity rules:
// - TV devices: 24 hours
// - Mobile linked companion devices: 1 hour of inactiveness
// - Primary devices: 24 hours of idle time
const TV_SESSION_LIMIT_MS = 24 * 60 * 60 * 1000; // 24 hours
const LINKED_DEVICE_INACTIVITY_MS = 60 * 60 * 1000; // 1 hour
const PRIMARY_DEVICE_IDLE_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Accurately detect if current device is a TV */
export const checkIsTV = (): boolean => {
  if (typeof window === 'undefined') return false;

  const ua = navigator.userAgent.toLowerCase();

  // 1. Mobile devices (phones & tablets) are NEVER TVs
  const isMobile =
    /android.*mobile|iphone|ipod|blackberry|iemobile|opera mini/i.test(ua) ||
    (typeof window !== 'undefined' && window.innerWidth <= 768 && /android|mobile/i.test(ua));

  if (isMobile) {
    // If the phone was previously tagged with isTV: true due to a previous bug, self-heal localStorage
    try {
      const sessionStr = localStorage.getItem('userSession');
      if (sessionStr) {
        const s = JSON.parse(sessionStr);
        if (s.isTV || s.deviceType === 'Television') {
          s.isTV = false;
          s.deviceType = 'Mobile';
          localStorage.setItem('userSession', JSON.stringify(s));
        }
      }
    } catch {}
    return false;
  }

  // 2. Check session stored data (only for non-mobile devices)
  try {
    const sessionStr = localStorage.getItem('userSession');
    if (sessionStr) {
      const s = JSON.parse(sessionStr);
      if (s.isTV === true && s.deviceType === 'Television') {
        return true;
      }
    }
  } catch {}

  // 3. User agent matching specific smart TV operating systems
  return (
    ua.includes('smarttv') ||
    ua.includes('smart-tv') ||
    ua.includes('googletv') ||
    ua.includes('android tv') ||
    ua.includes('apple tv') ||
    ua.includes('appletv') ||
    ua.includes('tizen') ||
    ua.includes('webos') ||
    ua.includes('viera') ||
    ua.includes('bravia') ||
    ua.includes('netcast') ||
    ua.includes('roku') ||
    /\b(aftb|aftt|aftm|afts|aftn)\b/.test(ua)
  );
};

// Capture the original path on initial load, before any react-router redirects happen
const originalPath = typeof window !== 'undefined' ? window.location.pathname : '/';

/** Extend the session expiry in localStorage based on device type */
const extendSession = async () => {
  const sessionStr = localStorage.getItem('userSession');
  if (!sessionStr) return;
  try {
    const session = JSON.parse(sessionStr);
    const isTV = checkIsTV();
    const duration = isTV 
      ? TV_SESSION_LIMIT_MS 
      : (session.isLinkedDevice ? LINKED_DEVICE_INACTIVITY_MS : PRIMARY_DEVICE_IDLE_MS);
    
    session.expiresAt = Date.now() + duration;
    session.isTV = isTV;
    localStorage.setItem('userSession', JSON.stringify(session));

    // Touch server activity if linked device
    if (session.isLinkedDevice && session.deviceId) {
      try {
        const res = await axios.post(`${BASE_URL}/device-link/touch`, { deviceId: session.deviceId });
        if (res.data && res.data.active === false) {
          localStorage.removeItem('userSession');
          alert('This device was logged out by the primary device.');
          window.location.href = '/Auth';
        }
      } catch {}
    }
  } catch { /* ignore corrupted session */ }
};

export const UserProfileProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [profile, setProfileState] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const lastActivityRef = useRef<number>(0);
  const { socket } = useRefresh();

  // Determine if current running session is a linked device
  const isLinkedDevice = (() => {
    try {
      const s = localStorage.getItem('userSession');
      return Boolean(s && JSON.parse(s).isLinkedDevice);
    } catch {
      return false;
    }
  })();

  // Track user activity and extend session on interaction (throttled to once every 30 seconds)
  useEffect(() => {
    const THROTTLE_MS = 30 * 1000;
    const handleActivity = () => {
      const now = Date.now();
      if (now - lastActivityRef.current > THROTTLE_MS) {
        lastActivityRef.current = now;
        extendSession();
      }
    };

    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'] as const;
    events.forEach(evt => window.addEventListener(evt, handleActivity));
    return () => {
      events.forEach(evt => window.removeEventListener(evt, handleActivity));
    };
  }, []);

  // Periodic local session expiration check (runs in-memory without spamming HTTP requests)
  useEffect(() => {
    const checkExpiry = () => {
      const sessionStr = localStorage.getItem('userSession');
      if (!sessionStr) return;
      try {
        const session = JSON.parse(sessionStr);
        if (session.expiresAt && Date.now() > session.expiresAt) {
          localStorage.removeItem('userSession');
          setProfileState(null);
          if (session.isLinkedDevice) {
            alert(session.isTV ? 'Your TV session has expired after 24 hours.' : 'Your linked device session has ended after 1 hour of inactivity.');
          }
          window.location.href = '/Auth';
        }
      } catch {}
    };

    const interval = setInterval(checkExpiry, 30000); // Check every 30 seconds locally
    return () => clearInterval(interval);
  }, []);

  // Listen for socket notifications (e.g. primary device revokes this linked device)
  useEffect(() => {
    if (!socket) return;

    const joinRoomAndListen = () => {
      try {
        const sessionStr = localStorage.getItem('userSession');
        if (!sessionStr) return;
        const session = JSON.parse(sessionStr);

        if (session.isLinkedDevice && session.deviceId) {
          console.log('[DeviceLink] Joining device room:', session.deviceId);
          socket.emit('join_device_room', session.deviceId);
        }
      } catch {}
    };

    joinRoomAndListen();

    const handleRevocation = (data: any) => {
      console.log('[DeviceLink] Device revoked event received:', data);
      localStorage.removeItem('userSession');
      setProfileState(null);
      alert(data?.reason || 'This device was logged out by the primary device.');
      window.location.href = '/Auth';
    };

    socket.on('connect', joinRoomAndListen);
    socket.on('device_revoked', handleRevocation);
    socket.on('device_session_expired', handleRevocation);

    return () => {
      socket.off('connect', joinRoomAndListen);
      socket.off('device_revoked', handleRevocation);
      socket.off('device_session_expired', handleRevocation);
    };
  }, [socket, profile]);

  const setProfile = useCallback((newProfile: UserProfile | null) => {
    setProfileState(newProfile);
  }, []);

  const refreshProfile = useCallback(async (loginUserGuid?: string) => {
    setLoading(true);
    let userGuid: string | null = loginUserGuid || null;
    let business: string | null = null;
    let existingSession: any = {};

    const sessionStr = localStorage.getItem('userSession');
    if (sessionStr) {
      try {
        existingSession = JSON.parse(sessionStr);
        if (existingSession.expiresAt > Date.now()) {
          if (!userGuid) userGuid = existingSession.userGuid;
          business = existingSession.business;
        } else {
          localStorage.removeItem('userSession');
          existingSession = {};
        }
      } catch (e) {
        console.error(e);
      }
    }

    // Fallback: try to parse business name from captured path
    if (!userGuid) {
      const segments = originalPath.split('/').filter(Boolean);
      if (segments.length > 0) {
        const firstSegment = segments[0];
        if (firstSegment.toLowerCase() !== 'auth') {
          business = firstSegment;
        }
      }
    }

    try {
      let profileData: UserProfile | null = null;
      let repData: { rep_id?: string; event_id?: string } = {};

      if (userGuid) {
        const response = await axios.get<UserProfile>(`${BASE_URL}/profile/${userGuid}`);
        if (response.data && Object.keys(response.data).length > 0) {
          profileData = response.data;
        }
        const responseRep = await axios.get(`${BASE_URL}/getOne`, {
          params: {
            tableName: 'reps_table',
            rep: userGuid,
            is_active: true
          }
        });
        if (responseRep.data?.rep_guid) {
          repData = {
            rep_id: responseRep.data.rep_guid,
            event_id: responseRep.data.event_id
          };
        }
      } else if (business) {
        const response = await axios.get<UserProfile>(`${BASE_URL}/active-profile/${business}`);
        if (response.data && Object.keys(response.data).length > 0) {
          profileData = response.data;
        }
      }

      if (profileData) {
        const isTV = checkIsTV();
        const isLinked = Boolean(existingSession.isLinkedDevice);
        const duration = isTV 
          ? TV_SESSION_LIMIT_MS 
          : (isLinked ? LINKED_DEVICE_INACTIVITY_MS : PRIMARY_DEVICE_IDLE_MS);
        const expiryTime = Date.now() + duration;

        const session = {
          ...existingSession,
          loggedIn: true,
          expiresAt: expiryTime,
          userGuid: profileData.user_guid,
          business: profileData.business,
          permissionGroup: profileData.permission_group,
          isLinkedDevice: isLinked,
          isTV,
          deviceType: isTV ? 'Television' : (existingSession.deviceType === 'Television' ? 'Mobile' : (existingSession.deviceType || 'Web')),
        };
        localStorage.setItem('userSession', JSON.stringify(session));

        setProfileState({
          ...profileData,
          ...repData,
          isLinkedDevice: isLinked,
          isTV,
          deviceId: existingSession.deviceId,
        });
      } else {
        setProfileState(null);
      }
    } catch (err) {
      console.error('Error loading session in UserProfileProvider:', err);
      setProfileState(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  const isTV = checkIsTV();

  return (
    <UserProfileContext.Provider value={{
      profile,
      user_guid: profile?.user_guid,
      hasProfile: Boolean(profile),
      loading,
      isLinkedDevice,
      isTV,
      setProfile,
      refreshProfile
    }}>
      {children}
    </UserProfileContext.Provider>
  );
};

export const useUserProfile = () => {
  const context = useContext(UserProfileContext);
  if (!context) {
    throw new Error('useUserProfile must be used within a UserProfileProvider');
  }
  return context;
};
