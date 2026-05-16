import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { io } from 'socket.io-client';
import { BASE_URL } from '../../shared/Utils/apiConfig'; // Import BASE_URL

interface RefreshContextType {
  refreshKey: number;
}

const RefreshContext = createContext<RefreshContextType | undefined>(undefined);

export const RefreshProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [refreshKey, setRefreshKey] = useState(0);
 
  useEffect(() => {
    // Centralized socket connection for database updates
    const socket = io(BASE_URL, {
        transports: ['websocket', 'polling'],
        reconnection: true
    });

    socket.on('connect', () => console.log('✅ RefreshContext: Connected to Update Server'));
    socket.on('connect_error', (err) => console.error('❌ RefreshContext Error:', err));

    socket.on('game_players_updated', () => {
      console.log('⚡ RefreshContext: DB Update Signal Received');
      setRefreshKey(prev => prev + 1);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <RefreshContext.Provider value={{ refreshKey }}>
      {children}
    </RefreshContext.Provider>
  );
};

export const useRefresh = () => {
  const context = useContext(RefreshContext);
  if (!context) {
    throw new Error('useRefresh must be used within a RefreshProvider');
  }
  return context;
};