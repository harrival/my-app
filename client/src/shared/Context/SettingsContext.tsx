import React, { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import axios from 'axios';
import { BASE_URL } from '../Utils/apiConfig';
import { useUserProfile } from './UserProfileContext';
import { useRefresh } from './RefreshContext';

/* ------------------------------------------------------------------ */
/* Section 3.1: Dynamic Settings Catalog Shape (Per Business Tenant)  */
/* ------------------------------------------------------------------ */
export interface PrinterSettings {
  paperWidthIn: number;
  paperHeightIn: number;
}

export interface BusinessSettings {
  // Business Info
  business_name: string;
  contact_email: string;
  contact_phone: string;
  physical_address: string;
  timezone: string;
  currency: string;

  // Policy Engine
  hold_ttl_seconds: number;
  free_change_cutoff_hours: number;
  late_fee_percentage: number;
  allow_customer_add_days: boolean;
  allow_customer_remove_days: boolean;
  guest_token_ttl_days: number;

  // Pricing & Tax
  tax_rate_percent: number;
  require_full_payment: boolean;

  // Notifications
  sms_enabled: boolean;
  email_enabled: boolean;
  reminder_lead_hours: number;

  // Hardware / Label Printer
  printer: PrinterSettings;
}

export const PAPER_MIN_IN = 1;
export const PAPER_MAX_IN = 12;

export const DEFAULT_SETTINGS: BusinessSettings = {
  business_name: 'Triple Great Business',
  contact_email: 'support@tenant.example.com',
  contact_phone: '+1 (800) 555-0199',
  physical_address: '100 Enterprise Way, Suite 100',
  timezone: 'America/Los_Angeles',
  currency: 'USD',
  hold_ttl_seconds: 600,
  free_change_cutoff_hours: 168,
  late_fee_percentage: 25,
  allow_customer_add_days: true,
  allow_customer_remove_days: true,
  guest_token_ttl_days: 30,
  tax_rate_percent: 8.25,
  require_full_payment: true,
  sms_enabled: true,
  email_enabled: true,
  reminder_lead_hours: 48,
  printer: { paperWidthIn: 4, paperHeightIn: 3 },
};

/** Merge server data over schema fallbacks so missing keys never break consumers. */
const withDefaults = (raw: Partial<BusinessSettings> | undefined | null): BusinessSettings => ({
  ...DEFAULT_SETTINGS,
  ...(raw || {}),
  printer: { ...DEFAULT_SETTINGS.printer, ...(raw?.printer || {}) },
});

interface SettingsContextType {
  settings: BusinessSettings;
  loading: boolean;
  lastModified: string | null;
  saveSettings: (partial: Partial<BusinessSettings>, reason?: string) => Promise<BusinessSettings>;
  reload: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { profile } = useUserProfile();
  const { socket } = useRefresh();
  const business = profile?.business;

  const [settings, setSettings] = useState<BusinessSettings>(DEFAULT_SETTINGS);
  const [lastModified, setLastModified] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const reload = useCallback(async () => {
    if (!business) {
      setSettings(DEFAULT_SETTINGS);
      return;
    }
    setLoading(true);
    try {
      const res = await axios.get(`${BASE_URL}/settings/${encodeURIComponent(business)}`);
      setSettings(withDefaults(res.data?.settings));
      setLastModified(res.data?.time_modified || null);
    } catch (err) {
      console.error('Error loading business settings:', err);
    } finally {
      setLoading(false);
    }
  }, [business]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Live-update every open device when an admin/supervisor saves.
  useEffect(() => {
    if (!socket || !business) return;
    const join = () => socket.emit('join_business_room', business);
    const onUpdated = (next: Partial<BusinessSettings>) => setSettings(withDefaults(next));
    join();
    socket.on('connect', join);
    socket.on('settings_updated', onUpdated);
    return () => {
      socket.off('connect', join);
      socket.off('settings_updated', onUpdated);
    };
  }, [socket, business]);

  const saveSettings = useCallback(
    async (partial: Partial<BusinessSettings>, reason?: string) => {
      if (!business) throw new Error('No business selected.');
      const res = await axios.put(`${BASE_URL}/settings/${encodeURIComponent(business)}`, {
        settings: partial,
        modifiedBy: profile?.user_guid,
        reason: reason || 'Updated dynamic business settings',
      });
      const next = withDefaults(res.data?.settings);
      setSettings(next);
      setLastModified(res.data?.time_modified || null);
      return next;
    },
    [business, profile?.user_guid]
  );

  return (
    <SettingsContext.Provider value={{ settings, loading, lastModified, saveSettings, reload }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within a SettingsProvider');
  return ctx;
};
