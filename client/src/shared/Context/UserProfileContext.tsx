import React, { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback } from 'react';
import axios from 'axios';
import { BASE_URL } from '../../shared/Utils/apiConfig';

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
  [key: string]: any;
}

interface UserProfileContextType {
  profile: UserProfile | null;
  user_guid?: string;
  hasProfile: boolean;
  loading: boolean;
  setProfile: (profile: UserProfile | null) => void;
  refreshProfile: (loginUserGuid?: string) => Promise<void>;
}

const UserProfileContext = createContext<UserProfileContextType | undefined>(undefined);

// 30 minutes of idle time before session expires
const SESSION_DURATION_MS = 30 * 60 * 1000;

// Capture the original path on initial load, before any react-router redirects happen
const originalPath = window.location.pathname;

/** Extend the session expiry in localStorage by SESSION_DURATION_MS from now */
const extendSession = () => {
  const sessionStr = localStorage.getItem('userSession');
  if (!sessionStr) return;
  try {
    const session = JSON.parse(sessionStr);
    session.expiresAt = Date.now() + SESSION_DURATION_MS;
    localStorage.setItem('userSession', JSON.stringify(session));
  } catch { /* ignore corrupted session */ }
};

export const UserProfileProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [profile, setProfileState] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const lastActivityRef = useRef<number>(0);

  // Track user activity and extend session on interaction (throttled to once per minute)
  useEffect(() => {
    const THROTTLE_MS = 60 * 1000;
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

  const setProfile = useCallback((newProfile: UserProfile | null) => {
    setProfileState(newProfile);
  }, []);

  const refreshProfile = useCallback(async (loginUserGuid?: string) => {
    setLoading(true);
    // 1. Use provided userGuid, or check local session
    let userGuid: string | null = loginUserGuid || null;
    let business: string | null = null;

    if (!userGuid) {
      const sessionStr = localStorage.getItem('userSession');
      if (sessionStr) {
        try {
          const session = JSON.parse(sessionStr);
          if (session.expiresAt > Date.now()) {
            userGuid = session.userGuid;
            business = session.business;
          } else {
            localStorage.removeItem('userSession');
          }
        } catch (e) {
          console.error(e);
        }
      }
    }

    // If still no userGuid, try to parse business name from captured path
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
        // Fetch profile by userGuid
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
        // Fetch active profile by business name
        const response = await axios.get<UserProfile>(`${BASE_URL}/active-profile/${business}`);
        if (response.data && Object.keys(response.data).length > 0) {
          profileData = response.data;
        }
      }

      if (profileData) {
        // Store lightweight session for auth persistence across page refreshes
        const expiryTime = Date.now() + SESSION_DURATION_MS;
        const session = {
          loggedIn: true,
          expiresAt: expiryTime,
          userGuid: profileData.user_guid,
          business: profileData.business,
          permissionGroup: profileData.permission_group
        };
        localStorage.setItem('userSession', JSON.stringify(session));

        // Profile data lives in context — access via useUserProfile()
        setProfileState({
          ...profileData,
          ...repData
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

  const hasProfile = !!profile;

  return (
    <UserProfileContext.Provider value={{
      profile,
      user_guid: profile?.user_guid,
      hasProfile,
      loading,
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
