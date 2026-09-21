import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { io } from 'socket.io-client';
import { BASE_URL } from '../../shared/Utils/apiConfig'; // Import BASE_URL

interface RefreshContextType {
  refreshKey: number;
  socket: any;
}

const RefreshContext = createContext<RefreshContextType | undefined>(undefined);

export const RefreshProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [refreshKey, setRefreshKey] = useState(0);
  const [socket, setSocket] = useState<any>(null);

  useEffect(() => {
    // Centralized socket connection with path definition
    const socketInstance = io(BASE_URL, {
      path: '/socket.io/', // Tells the client to match the backend path structure
      transports: ['websocket', 'polling'],
      secure: true, // Forces secure production connections over HTTPS/WSS
      reconnection: true
    });

    socketInstance.on('connect_error', (err) => console.error('❌ RefreshContext Error:', err));

    socketInstance.on('game_players_updated', () => {
      setRefreshKey(prev => prev + 1);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  return (
    <RefreshContext.Provider value={{ refreshKey, socket }}>
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