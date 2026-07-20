import React, { useState, useEffect, useRef } from 'react';
import Card from '../../UI/Card/Card';
import Button from '../../UI/Button/Button';

const Stopwatch: React.FC = () => {
  const [time, setTime] = useState<number>(0);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    if (isRunning) {
      timerRef.current = setInterval(() => {
        setTime((prevTime) => prevTime + 10);
      }, 10);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isRunning]);

  const formatTime = (timeMs: number) => {
    const minutes = Math.floor(timeMs / 60000);
    const seconds = Math.floor((timeMs % 60000) / 1000);
    const milliseconds = Math.floor((timeMs % 1000) / 10);

    const mStr = minutes.toString().padStart(2, '0');
    const sStr = seconds.toString().padStart(2, '0');
    const msStr = milliseconds.toString().padStart(2, '0');

    return `${mStr}:${sStr}.${msStr}`;
  };

  return (
    <Card>
      <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
        <h2 style={{ marginBottom: '1.5rem', color: '#333' }}>Stopwatch</h2>

        <div style={{
          fontSize: '3.5rem',
          fontWeight: 'bold',
          fontFamily: 'monospace',
          color: '#174b0f',
          background: '#f4fbf4',
          padding: '1.5rem',
          borderRadius: '12px',
          border: '2px solid #e2efe2',
          marginBottom: '2rem',
          letterSpacing: '0.1rem',
          boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.06)'
        }}>
          {formatTime(time)}
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '15px' }}>
          <Button onClick={() => setIsRunning(!isRunning)}>
            {isRunning ? 'Pause' : 'Start'}
          </Button>
          {/* <Button inverse onClick={() => { setTime(0); setIsRunning(false); }}>
            Reset
          </Button> */}
        </div>
      </div>
    </Card>
  );
};

export default Stopwatch;
