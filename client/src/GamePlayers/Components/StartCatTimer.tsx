import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const StartCatTimer: React.FC = () => {
  const navigate = useNavigate();

//   useEffect(() => {
//     const timeout = setTimeout(() => {
//       navigate('/tvdisplay');
//     }, 3000);
//     return () => clearTimeout(timeout);
//   }, [navigate]);

  return <div>Starting Cat Timer...</div>;
};

export default StartCatTimer;