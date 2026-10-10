import React, { useState, useCallback } from 'react';
import axios from 'axios';

import Header from './Header/Header';
import Router from './shared/Router/Router';

import { AuthContext } from './shared/Context/auth-context';
// Import your RefreshProvider here
import { RefreshProvider } from './shared/Context/RefreshContext';
import { UserProfileProvider } from './shared/Context/UserProfileContext';
import { useTVNavigation } from './shared/Hooks/useTVNavigation';

import './CSSVars.scss';
import './Global.scss';

// Axios interceptor to inject Supervisor role and business headers
axios.interceptors.request.use((config) => {
  const sessionStr = localStorage.getItem('userSession');
  if (sessionStr) {
    try {
      const session = JSON.parse(sessionStr);
      if (session.loggedIn) {
        config.headers['x-user-role'] = session.permissionGroup || '';
        config.headers['x-user-business'] = session.business || '';
      }
    } catch (e) {
      console.error(e);
    }
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

// Capture the original path on initial load, before any react-router redirects happen
const originalPath = window.location.pathname;

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    const sessionStr = localStorage.getItem('userSession');
    if (sessionStr) {
      try {
        const session = JSON.parse(sessionStr);
        if (session.expiresAt > Date.now()) {
          return true;
        } else {
          localStorage.removeItem('userSession');
        }
      } catch (e) {
        console.error(e);
      }
    }
    return false;
  });
  const [showModal, setShowModal] = useState(false);
  const [color, setColor] = useState('#e7ffe3');

  const login = useCallback(() => setIsLoggedIn(true), []);
  const logout = useCallback(() => {
    setIsLoggedIn(false);
    localStorage.removeItem('userSession');
  }, []);

  const showModalHandler = () => setShowModal(true);

  // Enable 10-foot TV Remote D-Pad Navigation across the app
  useTVNavigation();

  return (
    <div style={{ background: color, minHeight: '100vh', paddingBottom: '25px', overflowX: 'hidden' }}>
      <AuthContext.Provider value={{ isLoggedIn, login, logout }}>
        <RefreshProvider>
          <UserProfileProvider>
            <Header onShowModal={showModalHandler} setColor={setColor} />
            <Router />
          </UserProfileProvider>
        </RefreshProvider>
      </AuthContext.Provider>
    </div>
  );
}

export default App;