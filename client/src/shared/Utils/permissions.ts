import { type UserProfile } from '../Context/UserProfileContext';

export const ELEVATED_ROLES = ['Admin', 'Business_Owner', 'Supervisor', 'Agent'] as const;

export const isAdminProfile = (profile?: UserProfile | null): boolean => {
  if (!profile) return false;
  const pg = (profile.permission_group || '').toLowerCase();
  return pg === 'admin' || profile.is_admin === true;
};

export const isBusinessOwnerProfile = (profile?: UserProfile | null): boolean => {
  if (!profile) return false;
  const pg = (profile.permission_group || '').toLowerCase();
  return pg === 'business_owner' || pg === 'supervisor';
};

export const isSupervisorProfile = (profile?: UserProfile | null): boolean => {
  return isBusinessOwnerProfile(profile);
};

export const isAgentProfile = (profile?: UserProfile | null): boolean => {
  if (!profile) return false;
  const pg = (profile.permission_group || '').toLowerCase();
  return pg === 'agent';
};

export const isElevatedStaff = (profile?: UserProfile | null): boolean => {
  return isAdminProfile(profile) || isBusinessOwnerProfile(profile) || isAgentProfile(profile);
};

export const isCustomerProfile = (profile?: UserProfile | null): boolean => {
  return !isElevatedStaff(profile);
};

export type EffectiveRole = 'Admin' | 'Business_Owner' | 'Supervisor' | 'Agent' | 'Customer';

export const getEffectiveRole = (profile?: UserProfile | null): EffectiveRole => {
  if (isAdminProfile(profile)) return 'Admin';
  if (isBusinessOwnerProfile(profile)) return 'Business_Owner';
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
