import React from 'react';
import { evaluatePasswordStrength } from '../Utils/passwordValidation';

interface Props {
  password: string;
  showAlways?: boolean;
}

export const PasswordStrengthChecklist: React.FC<Props> = ({ password, showAlways = false }) => {
  if (!password && !showAlways) {
    return null;
  }

  const { requirements, score } = evaluatePasswordStrength(password);

  const getStrengthLabel = () => {
    if (score <= 2) return { text: 'Weak', color: '#ef4444' };
    if (score === 3) return { text: 'Fair', color: '#f59e0b' };
    if (score === 4) return { text: 'Good', color: '#3b82f6' };
    return { text: 'Strong', color: '#10b981' };
  };

  const strength = getStrengthLabel();

  return (
    <div style={{
      marginTop: '8px',
      marginBottom: '12px',
      padding: '10px 12px',
      backgroundColor: '#f8fafc',
      borderRadius: '8px',
      border: '1px solid #e2e8f0',
      fontSize: '0.82rem',
      color: '#334155'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <span style={{ fontWeight: 600 }}>Password Strength:</span>
        <span style={{ fontWeight: 700, color: strength.color }}>{strength.text}</span>
      </div>

      {/* Progress bar */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '8px', height: '4px' }}>
        {[1, 2, 3, 4, 5].map((level) => (
          <div
            key={level}
            style={{
              flex: 1,
              borderRadius: '2px',
              backgroundColor: score >= level ? strength.color : '#e2e8f0',
              transition: 'background-color 0.2s ease'
            }}
          />
        ))}
      </div>

      {/* Requirements list */}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>
        <li style={{ display: 'flex', alignItems: 'center', gap: '6px', color: requirements.minLength ? '#166534' : '#64748b' }}>
          <span>{requirements.minLength ? '✓' : '○'}</span>
          <span>At least 8 characters</span>
        </li>
        <li style={{ display: 'flex', alignItems: 'center', gap: '6px', color: requirements.hasUpper ? '#166534' : '#64748b' }}>
          <span>{requirements.hasUpper ? '✓' : '○'}</span>
          <span>At least 1 uppercase letter (A-Z)</span>
        </li>
        <li style={{ display: 'flex', alignItems: 'center', gap: '6px', color: requirements.hasLower ? '#166534' : '#64748b' }}>
          <span>{requirements.hasLower ? '✓' : '○'}</span>
          <span>At least 1 lowercase letter (a-z)</span>
        </li>
        <li style={{ display: 'flex', alignItems: 'center', gap: '6px', color: requirements.hasNumber ? '#166534' : '#64748b' }}>
          <span>{requirements.hasNumber ? '✓' : '○'}</span>
          <span>At least 1 number (0-9)</span>
        </li>
        <li style={{ display: 'flex', alignItems: 'center', gap: '6px', color: requirements.hasSpecial ? '#166534' : '#64748b' }}>
          <span>{requirements.hasSpecial ? '✓' : '○'}</span>
          <span>At least 1 special character (!@#$%^&*...)</span>
        </li>
      </ul>
    </div>
  );
};

export default PasswordStrengthChecklist;
