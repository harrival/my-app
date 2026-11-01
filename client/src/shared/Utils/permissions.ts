import { type UserProfile } from '../Context/UserProfileContext';

export const ELEVATED_ROLES = ['Admin', 'Supervisor', 'Agent'] as const;

export const isAdminProfile = (profile?: UserProfile | null): boolean => {
  if (!profile) return false;
  return profile.permission_group === 'Admin' || profile.is_admin === true;
};

export const isSupervisorProfile = (profile?: UserProfile | null): boolean => {
  if (!profile) return false;
  return profile.permission_group === 'Supervisor';
};

export const isAgentProfile = (profile?: UserProfile | null): boolean => {
  if (!profile) return false;
  return profile.permission_group === 'Agent';
};

export const isElevatedStaff = (profile?: UserProfile | null): boolean => {
  return isAdminProfile(profile) || isSupervisorProfile(profile) || isAgentProfile(profile);
};

export const isCustomerProfile = (profile?: UserProfile | null): boolean => {
  return !isElevatedStaff(profile);
};

export type EffectiveRole = 'Admin' | 'Supervisor' | 'Agent' | 'Customer';

export const getEffectiveRole = (profile?: UserProfile | null): EffectiveRole => {
  if (isAdminProfile(profile)) return 'Admin';
  if (isSupervisorProfile(profile)) return 'Supervisor';
  if (isAgentProfile(profile)) return 'Agent';
  return 'Customer';
};

export const canAccessSupervisorPanel = (
  profile?: UserProfile | null,
  targetBusiness?: string | null
): boolean => {
  if (!isElevatedStaff(profile)) return false;
  const userBusiness = String(profile?.business || '').trim().toLowerCase();
  if (!userBusiness) return false;
  if (!targetBusiness) return true;
  return userBusiness === String(targetBusiness).trim().toLowerCase();
};

/** Roles allowed to open the Configuration page and change business settings. */
export const canConfigure = (profile?: UserProfile | null): boolean => {
  return isAdminProfile(profile) || isSupervisorProfile(profile);
};
