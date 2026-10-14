import { type UserProfile } from '../Context/UserProfileContext';

/** Roles allowed to open the Configuration page and change business settings. */
const CONFIG_ROLES = ['admin', 'supervisor'];

export const canConfigure = (profile?: UserProfile | null): boolean => {
  if (!profile) return false;
  if (profile.is_admin) return true;
  return CONFIG_ROLES.includes(String(profile.permission_group || '').toLowerCase());
};
