import React, { createContext, useContext, useState, useEffect } from 'react';
import { createIndexedDB } from './IndexDB.js'; // Your existing functions

// 1. Create a Context to hold the db object
const IndexedDBContext = createContext(null);

// 2. Create the Provider component
export const IndexedDBProvider = ({ children }) => {
  const [db, setDb] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // This effect runs once on component mount to open the database
    const myDBConfig = [
      {
        storeName: 'users',
        keyPath: 'id',
        autoIncrement: true,
        indexes: [{ indexName: 'email', keyPath: 'email', options: { unique: false } }],
      },
    ];

    createIndexedDB('mazePuzzlePlayerDB', 1, myDBConfig)
      .then(database => {
        setDb(database);
        setLoading(false);
      })
      .catch(err => {
        setError(err);
        setLoading(false);
      });

    // Cleanup function to close the database when the component unmounts
    return () => {
      if (db) {
        db.close();
      }
    };
  }, []);

  const value = { db, loading, error };

  return (
    <IndexedDBContext.Provider value={value}>
      {children}
    </IndexedDBContext.Provider>
  );
};

// 3. Create a custom hook for easy access
export const useIndexedDB = () => {
  const context = useContext(IndexedDBContext);
  if (!context) {
    throw new Error('useIndexedDB must be used within an IndexedDBProvider');
  }
  return context;
};