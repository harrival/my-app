import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';
import axios from 'axios';
import { BASE_URL } from '../../shared/Utils/apiConfig';
import { useUserProfile } from '../../shared/Context/UserProfileContext';
import { useRefresh } from '../../shared/Context/RefreshContext';

export interface TenantPolicies {
  hold_ttl_seconds: number;
  free_change_cutoff_hours: number;
  late_fee_percentage: number;
  allow_customer_add_days: boolean;
  allow_customer_remove_days: boolean;
  guest_token_ttl_days: number;
}

export interface TenantPricing {
  tax_rate_percent: number;
  require_full_payment: boolean;
}

export interface TenantNotifications {
  sms_enabled: boolean;
  email_enabled: boolean;
  reminder_lead_hours: number;
}

export interface TenantPublicConfig {
  business: string;
  business_name: string;
  contact_email: string;
  contact_phone: string;
  physical_address: string;
  timezone: string;
  currency: string;
  policies: TenantPolicies;
  pricing: TenantPricing;
  notifications: TenantNotifications;
  time_modified: string | null;
}

interface TenantContextType {
  tenantBusiness: string | null;
  tenantConfig: TenantPublicConfig | null;
  loadingConfig: boolean;
  isElevatedRole: boolean;
  isCustomer: boolean;
  isSupervisorForActiveTenant: boolean;
  refreshTenantConfig: (overrideBusiness?: string) => Promise<void>;
}

const RESERVED_ROOT_SEGMENTS = new Set([
  'auth',
  'home',
  'inprogressplayers',
  'dailyplayers',
  'profile',
  'playerbuilder',
  'playerscanner',
  'playersmonitor',
  'businessmanager',
  'configuration',
  'dev',
  'book',
  'admin',
]);

const ELEVATED_ROLES = ['admin', 'supervisor', 'agent'];

/**
 * Resolve tenant business identifier from pathname (`/book/:business`, `/admin/:business`, `/:business/*`),
 * subdomain, or stored session context.
 */
export function resolveBusinessFromLocation(
  pathname: string,
  fallbackBusiness?: string | null
): string | null {
  const segments = (pathname || '').split('/').filter(Boolean);

  if (segments.length >= 2) {
    const first = segments[0].toLowerCase();
    if (first === 'book' || first === 'admin') {
      return decodeURIComponent(segments[1]);
    }
  }

  if (segments.length >= 1) {
    const first = segments[0];
    if (!RESERVED_ROOT_SEGMENTS.has(first.toLowerCase())) {
      return decodeURIComponent(first);
    }
  }

  if (typeof window !== 'undefined') {
    const host = window.location.hostname.toLowerCase();
    if (
      host !== 'localhost' &&
      host !== '127.0.0.1' &&
      !host.endsWith('.up.railway.app') &&
      !/^\d+\.\d+\.\d+\.\d+$/.test(host)
    ) {
      const parts = host.split('.');
      if (parts.length >= 3 && parts[0] !== 'www' && parts[0] !== 'api') {
        return parts[0];
      }
    }
  }

  return fallbackBusiness || null;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export const TenantProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const location = useLocation();
  const {
    profile,
    isElevatedStaff: isElevatedRole,
    isCustomer,
    canAccessSupervisorPanel,
  } = useUserProfile();
  const { socket } = useRefresh();

  const tenantBusiness = useMemo(
    () => resolveBusinessFromLocation(location.pathname, profile?.business || null),
    [location.pathname, profile?.business]
  );

  const [tenantConfig, setTenantConfig] = useState<TenantPublicConfig | null>(null);
  const [loadingConfig, setLoadingConfig] = useState<boolean>(false);

  const isSupervisorForActiveTenant = useMemo(
    () => canAccessSupervisorPanel(tenantBusiness),
    [canAccessSupervisorPanel, tenantBusiness]
  );

  const refreshTenantConfig = useCallback(
    async (overrideBusiness?: string) => {
      const target = overrideBusiness || tenantBusiness;
      if (!target || target === 'non_business') {
        setTenantConfig(null);
        return;
      }
      setLoadingConfig(true);
      try {
        const res = await axios.get<TenantPublicConfig>(
          `${BASE_URL}/api/${encodeURIComponent(target)}/config`
        );
        setTenantConfig(res.data);
      } catch (err) {
        console.error(`Failed to load tenant config for '${target}':`, err);
      } finally {
        setLoadingConfig(false);
      }
    },
    [tenantBusiness]
  );

  useEffect(() => {
    refreshTenantConfig();
  }, [refreshTenantConfig]);

  // Subscribe to real-time tenant settings updates via Socket.IO room
  useEffect(() => {
    if (!socket || !tenantBusiness || tenantBusiness === 'non_business') return;

    const joinTenantRoom = () => {
      socket.emit('join_business_room', tenantBusiness);
    };
    const handleSettingsUpdated = () => {
      refreshTenantConfig(tenantBusiness);
    };

    joinTenantRoom();
    socket.on('connect', joinTenantRoom);
    socket.on('settings_updated', handleSettingsUpdated);

    return () => {
      socket.off('connect', joinTenantRoom);
      socket.off('settings_updated', handleSettingsUpdated);
    };
  }, [socket, tenantBusiness, refreshTenantConfig]);

  return (
    <TenantContext.Provider
      value={{
        tenantBusiness,
        tenantConfig,
        loadingConfig,
        isElevatedRole,
        isCustomer,
        isSupervisorForActiveTenant,
        refreshTenantConfig,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
};

export const useTenant = () => {
  const ctx = useContext(TenantContext);
  if (!ctx) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return ctx;
};

