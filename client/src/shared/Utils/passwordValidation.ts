/**
 * Shared Password Validation & Strength Checker
 * Enforces strong password requirements across the application.
 */

export interface PasswordRequirements {
  minLength: boolean;
  hasUpper: boolean;
  hasLower: boolean;
  hasNumber: boolean;
  hasSpecial: boolean;
}

export interface PasswordStrengthResult {
  isValid: boolean;
  score: number; // 0 - 5
  requirements: PasswordRequirements;
  errors: string[];
}

export function evaluatePasswordStrength(password: string): PasswordStrengthResult {
  const pwd = String(password || '');

  const requirements: PasswordRequirements = {
    minLength: pwd.length >= 8,
    hasUpper: /[A-Z]/.test(pwd),
    hasLower: /[a-z]/.test(pwd),
    hasNumber: /[0-9]/.test(pwd),
    hasSpecial: /[^A-Za-z0-9]/.test(pwd)
  };

  const errors: string[] = [];
  if (!requirements.minLength) errors.push('At least 8 characters');
  if (!requirements.hasUpper) errors.push('At least 1 uppercase letter (A-Z)');
  if (!requirements.hasLower) errors.push('At least 1 lowercase letter (a-z)');
  if (!requirements.hasNumber) errors.push('At least 1 number (0-9)');
  if (!requirements.hasSpecial) errors.push('At least 1 special character (!@#$%^&*...)');

  const score = Object.values(requirements).filter(Boolean).length;
  const isValid = score === 5;

  return {
    isValid,
    score,
    requirements,
    errors
  };
}

