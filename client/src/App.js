import React, { useState, useCallback } from 'react';

import Header from './Header/Header';
import Router from './shared/Router/Router';

import { AuthContext } from './shared/Context/auth-context';
// Import your RefreshProvider here
import { RefreshProvider } from './shared/Context/RefreshContext'; 

import './CSSVars.scss';
import './Global.scss';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [color, setColor] = useState();

  const login = useCallback(() => setIsLoggedIn(true), []);
  const logout = useCallback(() => setIsLoggedIn(false), []);

  const showModalHandler = () => setShowModal(true);

  return (
    <div style={{ background: color, minHeight: '100vh', paddingBottom: '25px', overflowX: 'hidden' }}>
      <AuthContext.Provider value={{ isLoggedIn, login, logout }}>
        <RefreshProvider> 
          <Header onShowModal={showModalHandler} setColor={setColor} />
          <Router />
        </RefreshProvider>
      </AuthContext.Provider>
    </div>
  );
}

export default App;