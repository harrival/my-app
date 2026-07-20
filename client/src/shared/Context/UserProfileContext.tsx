import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import axios from 'axios';
import { BASE_URL } from '../../shared/Utils/apiConfig';

export interface UserProfile {
  id: number;
  user_guid: string;
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string;
  address: string;
  permission_group: string;
  is_admin: boolean;
  business?: string;
  business_value?: string;
  [key: string]: any;
}

interface UserProfileContextType {
  profile: UserProfile | null;
  user: UserProfile | null;
  user_guid?: string;
  hasProfile: boolean;
  loading: boolean;
  setProfile: (profile: UserProfile | null) => void;
  setUser: (user: UserProfile | null) => void;
  refreshProfile: () => Promise<void>;
}

const UserProfileContext = createContext<UserProfileContextType | undefined>(undefined);

// Capture the original path on initial load, before any react-router redirects happen
const originalPath = window.location.pathname;

export const UserProfileProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [profile, setProfileState] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const setProfile = useCallback((newProfile: UserProfile | null) => {
    setProfileState(newProfile);
  }, []);

  const refreshProfile = useCallback(async () => {
    setLoading(true);
    // 1. Check local session
    const sessionStr = localStorage.getItem('userSession');
    let userGuid: string | null = null;
    let business: string | null = null;

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

    // If no local session userGuid, try to parse business name from captured path
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

      if (userGuid) {
        // Fetch profile by userGuid
        const response = await axios.get<UserProfile>(`${BASE_URL}/profile/${userGuid}`);
        if (response.data && Object.keys(response.data).length > 0) {
          profileData = response.data;
        }
      } else if (business) {
        // Fetch active profile by business name
        const response = await axios.get<UserProfile>(`${BASE_URL}/active-profile/${business}`);
        if (response.data && Object.keys(response.data).length > 0) {
          profileData = response.data;
        }
      }

      if (profileData) {
        const expiryTime = Date.now() + 10 * 60 * 60 * 1000;
        const session = {
          loggedIn: true,
          expiresAt: expiryTime,
          userGuid: profileData.user_guid,
          business: profileData.business,
          permissionGroup: profileData.permission_group
        };
        localStorage.setItem('userSession', JSON.stringify(session));
        setProfileState(profileData);

        // Redirect back to the original destination if we are currently at /Auth
        if (window.location.pathname.toLowerCase().endsWith('/auth')) {
          window.location.replace(originalPath);
        }
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

  useEffect(() => {
    console.log("👤 [UserProfileContext] Logged in user property (user):", profile);
  }, [profile]);

  const hasProfile = !!profile;

  return (
    <UserProfileContext.Provider value={{
      profile,
      user: profile,
      user_guid: profile?.user_guid,
      hasProfile,
      loading,
      setProfile,
      setUser: setProfile,
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
