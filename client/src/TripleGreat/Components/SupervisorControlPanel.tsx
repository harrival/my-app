import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { BASE_URL } from '../../shared/Utils/apiConfig';
import { useUserProfile } from '../../shared/Context/UserProfileContext';
import { useTenant } from './TenantContext';
import Configuration from '../../GamePlayers/Components/Configuration';
import { getFallbackPhotoForName, formatImageUrl } from './CustomerBookingPortal';
import { formatUserFriendlyBusinessName } from '../../shared/Utils/businessInfo';
import classes from '../ComponentStyles/TripleGreat.module.scss';

type TabKey =
  | 'overview'
  | 'settings'
  | 'templates'
  | 'catalog'
  | 'reservations'
  | 'printer'
  | 'audit';

interface BusinessTemplateRow {
  template_guid: string;
  business: string;
  event_type: string;
  channel: 'EMAIL' | 'SMS';
  subject: string | null;
  body_template: string;
  is_active: boolean;
  available_tokens?: string[];
  time_modified?: string | null;
}

interface TenantMetrics {
  items_count: number;
  units_count: number;
  customers_count: number;
  reservations_count: number;
  blackouts_count: number;
  audit_logs_count: number;
  configured_settings_count: number;
  templates_count?: number;
}

interface AuditLogEntry {
  log_guid: string;
  business: string;
  actor_guid: string;
  action: string;
  entity_type: string;
  entity_guid: string;
  reason: string | null;
  before_state: any;
  after_state: any;
  time_created: string;
}

const SupervisorControlPanel: React.FC = () => {
  const { business: paramBusiness } = useParams<{ business: string }>();
  const navigate = useNavigate();
  const { profile, isAdmin } = useUserProfile();
  const { isElevatedRole, refreshTenantConfig } = useTenant();

  const [businessOwners, setBusinessOwners] = useState<any[]>([]);
  const [availableBusinesses, setAvailableBusinesses] = useState<
    Array<{ business: string; business_name?: string }>
  >([]);

  // Admin user does not own a business: default to 'all' if no param or if param is 'all'
  const targetBusiness = paramBusiness || (isAdmin ? 'all' : profile?.business || 'alpha_rentals');
  const assignedBusiness = profile?.business || '';
  const isCrossTenantMismatch =
    !isAdmin &&
    Boolean(assignedBusiness) &&
    assignedBusiness.trim().toLowerCase() !== targetBusiness.trim().toLowerCase();

  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [metrics, setMetrics] = useState<TenantMetrics | null>(null);
  const [hasSettings, setHasSettings] = useState<boolean>(false);
  const [isEditingSettings, setIsEditingSettings] = useState<boolean>(false);
  const [savedSettingsForm, setSavedSettingsForm] = useState<Record<string, any>>({});
  const [settingsForm, setSettingsForm] = useState<Record<string, any>>({
    business_name: '',
    contact_email: '',
    contact_phone: '',
    physical_address: '',
    timezone: '',
    currency: '',
    hold_ttl_seconds: '',
    free_change_cutoff_hours: '',
    late_fee_percentage: '',
    guest_token_ttl_days: '',
    allow_customer_add_days: false,
    allow_customer_remove_days: false,
    tax_rate_percent: '',
    require_full_payment: false,
    sms_enabled: false,
    email_enabled: false,
    reminder_lead_hours: '',
  });
  const [auditReason, setAuditReason] = useState<string>('');
  const [savingSettings, setSavingSettings] = useState<boolean>(false);
  const isSettingsFieldDisabled = hasSettings && !isEditingSettings;
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Message Templates state
  const [templates, setTemplates] = useState<BusinessTemplateRow[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<string>('booking.confirmed');
  const [selectedChannel, setSelectedChannel] = useState<'EMAIL' | 'SMS'>('EMAIL');
  const [templateSubject, setTemplateSubject] = useState<string>('');
  const [templateBody, setTemplateBody] = useState<string>('');
  const [templatePreview, setTemplatePreview] = useState<{
    rendered_subject: string | null;
    rendered_body: string;
  } | null>(null);
  const [savingTemplate, setSavingTemplate] = useState<boolean>(false);
  const [isEditingTemplate, setIsEditingTemplate] = useState<boolean>(false);

  // Catalog state
  const [catalogItems, setCatalogItems] = useState<any[]>([]);
  const [newItemName, setNewItemName] = useState('');
  const [newItemDesc, setNewItemDesc] = useState('');
  const [newItemRateDollars, setNewItemRateDollars] = useState('');
  const [newItemImageUrls, setNewItemImageUrls] = useState<string[]>(['']);
  const [newItemSerials, setNewItemSerials] = useState('');
  const [creatingItem, setCreatingItem] = useState(false);
  const [unitInputsByItem, setUnitInputsByItem] = useState<Record<string, string>>({});
  const [showAddItemModal, setShowAddItemModal] = useState<boolean>(false);

  // Edit Catalog Item state
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [editItemName, setEditItemName] = useState<string>('');
  const [editItemDesc, setEditItemDesc] = useState<string>('');
  const [editItemRateDollars, setEditItemRateDollars] = useState<string>('');
  const [editItemImageUrls, setEditItemImageUrls] = useState<string[]>(['']);
  const [editItemIsActive, setEditItemIsActive] = useState<boolean>(true);
  const [savingEditItem, setSavingEditItem] = useState<boolean>(false);

  // Blackout dates state
  const [blackouts, setBlackouts] = useState<any[]>([]);
  const [blackoutBusiness, setBlackoutBusiness] = useState<string>('');
  const [blackoutItemGuid, setBlackoutItemGuid] = useState<string>('');
  const [blackoutStartDate, setBlackoutStartDate] = useState<string>('');
  const [blackoutEndDate, setBlackoutEndDate] = useState<string>('');
  const [blackoutReason, setBlackoutReason] = useState<string>('');
  const [blackoutForceOverride, setBlackoutForceOverride] = useState<boolean>(false);
  const [blackoutError, setBlackoutError] = useState<string | null>(null);
  const [showBlockDatesModal, setShowBlockDatesModal] = useState<boolean>(false);

  // Activity logs state
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);
  const [auditFilterAction, setAuditFilterAction] = useState<string>('');
  const [auditFilterActor, setAuditFilterActor] = useState<string>('');
  const [auditFilterStartDate, setAuditFilterStartDate] = useState<string>('');
  const [auditFilterEndDate, setAuditFilterEndDate] = useState<string>('');

  // Reservations, Manual Booking, Refunds & Override state
  const [tenantReservations, setTenantReservations] = useState<any[]>([]);
  const [refundQueue, setRefundQueue] = useState<any[]>([]);
  const [manualItemGuid, setManualItemGuid] = useState<string>('');
  const manualEndDateInputRef = useRef<HTMLInputElement>(null);
  const [manualStartDate, setManualStartDate] = useState<string>('');
  const [manualEndDate, setManualEndDate] = useState<string>('');
  const [manualPaymentOption, setManualPaymentOption] = useState<
    'OFFLINE_CASH' | 'PAYMENT_LINK' | ''
  >('');
  const [manualCustomer, setManualCustomer] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone_number: '',
  });
  const [manualReservationErrors, setManualReservationErrors] = useState<{
    item_guid?: string;
    payment_option?: string;
    start_date?: string;
    end_date?: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    phone_number?: string;
  }>({});
  const [overrideResGuid, setOverrideResGuid] = useState<string>('');
  const [overrideAction, setOverrideAction] = useState<
    'CANCEL' | 'RESCHEDULE' | 'ADD_DAYS' | 'REMOVE_DAYS' | ''
  >('');
  const [overrideWaiveFee, setOverrideWaiveFee] = useState<boolean>(true);
  const [overrideStartDate, setOverrideStartDate] = useState<string>('');
  const [overrideEndDate, setOverrideEndDate] = useState<string>('');
  const [overrideReason, setOverrideReason] = useState<string>('');
  const [overrideDateError, setOverrideDateError] = useState<string | null>(null);
  const [savingOverride, setSavingOverride] = useState<boolean>(false);
  const overrideFormRef = useRef<HTMLDivElement>(null);
  const overrideEndDateInputRef = useRef<HTMLInputElement>(null);

  const calculateDays = (start: string, end: string): number => {
    if (!start || !end) return 0;
    const s = new Date(start + 'T00:00:00Z').getTime();
    const e = new Date(end + 'T00:00:00Z').getTime();
    if (isNaN(s) || isNaN(e) || e < s) return 0;
    if (s === e) return 1;
    return Math.round((e - s) / (24 * 60 * 60 * 1000));
  };

  const addDaysToIsoDate = (dateStr: string, days: number): string => {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00Z');
    if (isNaN(d.getTime())) return '';
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };

  const selectedOverrideRes = useMemo(
    () => tenantReservations.find((r) => r.reservation_guid === overrideResGuid) || null,
    [tenantReservations, overrideResGuid]
  );

  const originalDurationDays = useMemo(() => {
    if (!selectedOverrideRes) return 0;
    if (selectedOverrideRes.days && Number(selectedOverrideRes.days) > 0) {
      return Number(selectedOverrideRes.days);
    }
    if (selectedOverrideRes.start_date && selectedOverrideRes.end_date) {
      return calculateDays(selectedOverrideRes.start_date, selectedOverrideRes.end_date);
    }
    return 0;
  }, [selectedOverrideRes]);

  const currentSelectionDays = useMemo(() => {
    if (!overrideStartDate || !overrideEndDate) return 0;
    return calculateDays(overrideStartDate, overrideEndDate);
  }, [overrideStartDate, overrideEndDate]);

  const durationValidation = useMemo(() => {
    if (!selectedOverrideRes || !overrideAction || overrideAction === 'CANCEL') {
      return { valid: true, error: null as string | null, delta: 0 };
    }
    if (!overrideStartDate || !overrideEndDate) {
      return { valid: false, error: 'Start and end dates are required.', delta: 0 };
    }
    if (overrideStartDate > overrideEndDate) {
      return { valid: false, error: 'New end date cannot be earlier than start date.', delta: 0 };
    }

    const origDays = originalDurationDays || 1;
    const newDays = currentSelectionDays;
    const delta = newDays - origDays;

    if (overrideAction === 'ADD_DAYS') {
      if (newDays < origDays) {
        return {
          valid: false,
          error: `Extend Rental requires adding days. You selected ${newDays} day(s), which reduces the rental by ${origDays - newDays} day(s). To reduce days, switch action to "Shorten Rental (Remove Days)".`,
          delta,
        };
      }
      if (newDays === origDays) {
        return {
          valid: false,
          error: `Extend Rental requires adding days. The rental is currently ${origDays} day(s). Please choose an extended return date to add at least 1 day.`,
          delta: 0,
        };
      }
      return { valid: true, error: null, delta };
    }

    if (overrideAction === 'REMOVE_DAYS') {
      if (origDays <= 1) {
        return {
          valid: false,
          error: 'A 1-day reservation cannot be shortened further. To cancel this reservation, select "Cancel Reservation".',
          delta: 0,
        };
      }
      if (newDays > origDays) {
        return {
          valid: false,
          error: `Shorten Rental requires reducing days. You selected ${newDays} day(s), which adds ${newDays - origDays} day(s). To add days, switch action to "Extend Rental (Add Days)".`,
          delta,
        };
      }
      if (newDays === origDays) {
        return {
          valid: false,
          error: `Shorten Rental requires reducing days. The rental is currently ${origDays} day(s). Please choose an earlier return date to shorten the rental by at least 1 day.`,
          delta: 0,
        };
      }
      if (newDays < 1) {
        return {
          valid: false,
          error: 'Reservation duration must be at least 1 day.',
          delta,
        };
      }
      return { valid: true, error: null, delta };
    }

    if (overrideAction === 'RESCHEDULE') {
      if (newDays !== origDays) {
        return {
          valid: false,
          error: `Reschedule requires the same duration (${origDays} day(s)). You currently selected ${newDays} day(s). To add days, choose "Extend Rental"; to reduce days, choose "Shorten Rental".`,
          delta,
        };
      }
      return { valid: true, error: null, delta: 0 };
    }

    return { valid: true, error: null, delta: 0 };
  }, [selectedOverrideRes, overrideAction, overrideStartDate, overrideEndDate, originalDurationDays, currentSelectionDays]);

  const minExtendedEndDate = useMemo(() => {
    if (overrideAction !== 'ADD_DAYS' || !selectedOverrideRes) return undefined;
    const start = overrideStartDate || selectedOverrideRes.start_date;
    const days = originalDurationDays || 1;
    return addDaysToIsoDate(start, days + 1);
  }, [overrideAction, selectedOverrideRes, overrideStartDate, originalDurationDays]);

  const maxShortenedEndDate = useMemo(() => {
    if (overrideAction !== 'REMOVE_DAYS' || !selectedOverrideRes) return undefined;
    const start = overrideStartDate || selectedOverrideRes.start_date;
    const days = originalDurationDays || 1;
    return addDaysToIsoDate(start, Math.max(1, days - 1));
  }, [overrideAction, selectedOverrideRes, overrideStartDate, originalDurationDays]);

  const handleActionChange = (act: 'CANCEL' | 'RESCHEDULE' | 'ADD_DAYS' | 'REMOVE_DAYS' | '') => {
    setOverrideAction(act);
    setOverrideDateError(null);
    if (!selectedOverrideRes) return;

    const origStart = selectedOverrideRes.start_date || '';
    const origDays = originalDurationDays || 1;
    const baseStart = overrideStartDate || origStart;

    if (act === 'ADD_DAYS') {
      setOverrideStartDate(baseStart);
      setOverrideEndDate(addDaysToIsoDate(baseStart, origDays + 1));
    } else if (act === 'REMOVE_DAYS') {
      setOverrideStartDate(baseStart);
      if (origDays > 1) {
        setOverrideEndDate(addDaysToIsoDate(baseStart, origDays - 1));
      } else {
        setOverrideEndDate(selectedOverrideRes.end_date || baseStart);
      }
    } else if (act === 'RESCHEDULE') {
      setOverrideStartDate(baseStart);
      setOverrideEndDate(addDaysToIsoDate(baseStart, origDays));
    }
  };

  const handleSelectReservationForOverride = (guid: string) => {
    setOverrideResGuid(guid);
    setOverrideDateError(null);
    const found = tenantReservations.find((r) => r.reservation_guid === guid);
    if (found) {
      const origDays =
        found.days && Number(found.days) > 0
          ? Number(found.days)
          : calculateDays(found.start_date, found.end_date) || 1;
      const start = found.start_date || '';
      setOverrideStartDate(start);
      if (overrideAction === 'ADD_DAYS') {
        setOverrideEndDate(addDaysToIsoDate(start, origDays + 1));
      } else if (overrideAction === 'REMOVE_DAYS') {
        setOverrideEndDate(origDays > 1 ? addDaysToIsoDate(start, origDays - 1) : (found.end_date || start));
      } else if (overrideAction === 'RESCHEDULE') {
        setOverrideEndDate(addDaysToIsoDate(start, origDays));
      } else {
        setOverrideEndDate(found.end_date || start);
      }
    } else {
      setOverrideStartDate('');
      setOverrideEndDate('');
    }
  };

  const handleClearOverrideSelection = () => {
    setOverrideResGuid('');
    setOverrideAction('');
    setOverrideStartDate('');
    setOverrideEndDate('');
    setOverrideReason('');
    setOverrideDateError(null);
  };

  // Notification delivery log state
  const [outboxItems, setOutboxItems] = useState<any[]>([]);
  const [selectedOutboxItem, setSelectedOutboxItem] = useState<any | null>(null);
  const [processingOutbox, setProcessingOutbox] = useState<boolean>(false);

  const authHeaders = {
    'x-user-guid': profile?.user_guid || '',
    'x-user-role': profile?.permission_group || '',
    'x-user-business': profile?.business || '',
    'x-is-admin': String(Boolean(profile?.is_admin)),
  };

  const loadSupervisorData = useCallback(async () => {
    if (!profile || !isElevatedRole || isCrossTenantMismatch) return;
    try {
      const results = await Promise.allSettled([
        axios.get(`${BASE_URL}/api/admin/${encodeURIComponent(targetBusiness)}/tenant-overview`, {
          headers: authHeaders,
        }),
        axios.get(`${BASE_URL}/api/admin/${encodeURIComponent(targetBusiness)}/settings`, {
          headers: authHeaders,
        }),
        axios.get(`${BASE_URL}/api/admin/${encodeURIComponent(targetBusiness)}/items`, {
          headers: authHeaders,
        }),
        axios.get(`${BASE_URL}/api/admin/${encodeURIComponent(targetBusiness)}/audit-logs`, {
          headers: authHeaders,
          params: {
            action: auditFilterAction || undefined,
            actor_guid: auditFilterActor || undefined,
            start_date: auditFilterStartDate || undefined,
            end_date: auditFilterEndDate || undefined,
          },
        }),
        axios.get(`${BASE_URL}/api/admin/${encodeURIComponent(targetBusiness)}/reservations`, {
          headers: authHeaders,
        }),
        axios.get(`${BASE_URL}/api/admin/${encodeURIComponent(targetBusiness)}/blackouts`, {
          headers: authHeaders,
        }),
        axios.get(`${BASE_URL}/api/admin/${encodeURIComponent(targetBusiness)}/refunds/queue`, {
          headers: authHeaders,
        }),
        axios.get(`${BASE_URL}/api/admin/${encodeURIComponent(targetBusiness)}/outbox`, {
          headers: authHeaders,
        }),
      ]);

      const [overviewRes, settingsRes, itemsRes, logsRes, resListRes, blkRes, refRes, outboxRes] = results;

      if (overviewRes.status === 'fulfilled') {
        setMetrics(overviewRes.value.data?.metrics || null);
      } else {
        console.error('Failed to load overview metrics:', overviewRes.reason);
      }

      if (settingsRes.status === 'fulfilled') {
        const settingsPayload =
          typeof settingsRes.value.data?.settings === 'object' && settingsRes.value.data.settings !== null
            ? settingsRes.value.data.settings
            : {};
        const serverHasSettings = Boolean(
          settingsRes.value.data?.has_settings ||
          settingsPayload.physical_address ||
          settingsPayload.contact_email ||
          settingsPayload.contact_phone ||
          settingsPayload.business_name
        );
        setHasSettings(serverHasSettings);
        setIsEditingSettings(false);
        if (serverHasSettings && Object.keys(settingsPayload).length > 0) {
          setSettingsForm(settingsPayload);
          setSavedSettingsForm(settingsPayload);
        } else {
          const emptySettings = {
            business_name: '',
            contact_email: '',
            contact_phone: '',
            physical_address: '',
            timezone: '',
            currency: '',
            hold_ttl_seconds: '',
            free_change_cutoff_hours: '',
            late_fee_percentage: '',
            guest_token_ttl_days: '',
            allow_customer_add_days: false,
            allow_customer_remove_days: false,
            tax_rate_percent: '',
            require_full_payment: false,
            sms_enabled: false,
            email_enabled: false,
            reminder_lead_hours: '',
          };
          setSettingsForm(emptySettings);
          setSavedSettingsForm(emptySettings);
        }
        if (Array.isArray(settingsRes.value.data?.templates)) {
          setTemplates(settingsRes.value.data.templates);
        }
      } else {
        const err: any = settingsRes.reason;
        const msg =
          err?.response?.data?.error?.message ||
          err?.response?.data?.error ||
          err?.message ||
          'Failed to load settings';
        setStatusMessage({ type: 'error', text: String(msg) });
      }

      if (itemsRes.status === 'fulfilled') {
        setCatalogItems(Array.isArray(itemsRes.value.data) ? itemsRes.value.data : []);
      } else {
        console.error('Failed to load items:', itemsRes.reason);
      }
      if (logsRes.status === 'fulfilled') {
        setAuditLogs(Array.isArray(logsRes.value.data) ? logsRes.value.data : []);
      }
      if (resListRes.status === 'fulfilled') {
        const rList = Array.isArray(resListRes.value.data) ? resListRes.value.data : [];
        setTenantReservations(rList);
      }
      if (blkRes.status === 'fulfilled') {
        setBlackouts(Array.isArray(blkRes.value.data) ? blkRes.value.data : []);
      }
      if (refRes.status === 'fulfilled') {
        setRefundQueue(Array.isArray(refRes.value.data) ? refRes.value.data : []);
      }
      if (outboxRes.status === 'fulfilled') {
        setOutboxItems(Array.isArray(outboxRes.value.data?.outbox) ? outboxRes.value.data.outbox : []);
      }
    } catch (err: any) {
      const msg =
        err?.response?.data?.error?.message ||
        err?.response?.data?.error ||
        err?.message ||
        'Failed to load management data';
      setStatusMessage({ type: 'error', text: String(msg) });
    }
  }, [
    profile,
    isElevatedRole,
    isCrossTenantMismatch,
    targetBusiness,
    profile?.user_guid,
    profile?.permission_group,
    profile?.business,
    profile?.is_admin,
    auditFilterAction,
    auditFilterActor,
    auditFilterStartDate,
    auditFilterEndDate,
    manualItemGuid,
    overrideResGuid,
  ]);

  useEffect(() => {
    loadSupervisorData();
  }, [loadSupervisorData]);

  useEffect(() => {
    // Load all registered businesses for clean admin filtering
    axios
      .get(`${BASE_URL}/api/businesses`)
      .then((res) => {
        const list = Array.isArray(res.data)
          ? res.data
          : Array.isArray(res.data?.businesses)
          ? res.data.businesses
          : [];
        if (list.length > 0) {
          setAvailableBusinesses(list);
        }
      })
      .catch((err) => {
        console.error('Failed to load businesses:', err);
      });

    // Also fetch business owners for contact info and details
    axios
      .get(`${BASE_URL}/api/admin/business-owners`, {
        headers: {
          'x-user-guid': profile?.user_guid || '',
          'x-user-role': profile?.permission_group || '',
          'x-is-admin': String(Boolean(profile?.is_admin || isAdmin)),
        },
      })
      .then((res) => {
        if (Array.isArray(res.data)) {
          setBusinessOwners(res.data);
        }
      })
      .catch((err) => {
        console.error('Failed to load business owners:', err);
      });
  }, [profile?.user_guid, profile?.permission_group, profile?.is_admin, isAdmin]);

  const filterBusinessOptions = useMemo(() => {
    const map = new Map<string, { business: string; business_name?: string }>();

    // First populate from availableBusinesses
    availableBusinesses.forEach((b) => {
      if (b.business) {
        map.set(b.business.toLowerCase(), {
          business: b.business,
          business_name: b.business_name,
        });
      }
    });

    // Augment with businessOwners
    businessOwners.forEach((bo) => {
      if (bo.business) {
        const key = bo.business.toLowerCase();
        const existing = map.get(key);
        map.set(key, {
          business: bo.business,
          business_name: bo.business_name || existing?.business_name,
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => {
      const nameA = formatUserFriendlyBusinessName(a.business, a.business_name);
      const nameB = formatUserFriendlyBusinessName(b.business, b.business_name);
      return nameA.localeCompare(nameB);
    });
  }, [availableBusinesses, businessOwners]);

  const activeBusinessFriendlyName = useMemo(() => {
    if (targetBusiness === 'all') return 'All Businesses';
    const match = filterBusinessOptions.find(
      (b) => b.business.toLowerCase() === targetBusiness.toLowerCase()
    );
    return formatUserFriendlyBusinessName(
      targetBusiness,
      match?.business_name || settingsForm?.business_name
    );
  }, [targetBusiness, filterBusinessOptions, settingsForm?.business_name]);

  const handleOwnerFilterChange = (selectedSlug: string) => {
    if (selectedSlug === 'all') {
      navigate('/admin/all');
    } else {
      navigate(`/admin/${encodeURIComponent(selectedSlug)}`);
    }
  };

  const activeTemplateRow = templates.find(
    (t) => t.event_type === selectedEvent && t.channel === selectedChannel
  );

  useEffect(() => {
    if (activeTemplateRow) {
      setTemplateSubject(activeTemplateRow.subject || '');
      setTemplateBody(activeTemplateRow.body_template || '');
      if (activeTemplateRow.body_template?.trim() || activeTemplateRow.subject?.trim()) {
        axios
          .post(
            `${BASE_URL}/api/admin/${encodeURIComponent(targetBusiness)}/templates/preview`,
            {
              subject: selectedChannel === 'EMAIL' ? activeTemplateRow.subject || null : null,
              body_template: activeTemplateRow.body_template || '',
            },
            { headers: authHeaders }
          )
          .then((res) => {
            if (res.data && (res.data.rendered_body?.trim() || res.data.rendered_subject?.trim())) {
              setTemplatePreview(res.data);
            } else {
              setTemplatePreview(null);
            }
          })
          .catch(() => {
            setTemplatePreview(null);
          });
      } else {
        setTemplatePreview(null);
      }
    } else {
      setTemplateSubject('');
      setTemplateBody('');
      setTemplatePreview(null);
    }
    setIsEditingTemplate(false);
  }, [activeTemplateRow?.template_guid, selectedEvent, selectedChannel, targetBusiness]);

  const handlePreviewTemplate = async () => {
    if (!templateBody.trim() && !templateSubject.trim()) {
      setTemplatePreview(null);
      return;
    }
    try {
      const res = await axios.post(
        `${BASE_URL}/api/admin/${encodeURIComponent(targetBusiness)}/templates/preview`,
        {
          subject: selectedChannel === 'EMAIL' ? templateSubject : null,
          body_template: templateBody,
        },
        { headers: authHeaders }
      );
      if (res.data && (res.data.rendered_body?.trim() || res.data.rendered_subject?.trim())) {
        setTemplatePreview(res.data);
      } else {
        setTemplatePreview(null);
      }
    } catch (err: any) {
      const msg =
        err?.response?.data?.error?.message ||
        err?.response?.data?.error ||
        'Could not generate preview';
      setStatusMessage({ type: 'error', text: String(msg) });
    }
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingTemplate(true);
    setStatusMessage(null);
    try {
      await axios.put(
        `${BASE_URL}/api/admin/${encodeURIComponent(targetBusiness)}/templates/${encodeURIComponent(
          selectedEvent
        )}`,
        {
          channel: selectedChannel,
          subject: selectedChannel === 'EMAIL' ? templateSubject : null,
          body_template: templateBody,
          is_active: true,
          reason: `Updated ${selectedChannel} template for ${selectedEvent}`,
        },
        { headers: authHeaders }
      );
      await loadSupervisorData();
      setIsEditingTemplate(false);
      setStatusMessage({
        type: 'success',
        text: `${selectedChannel} template saved.`,
      });
    } catch (err: any) {
      const msg =
        err?.response?.data?.error?.message ||
        err?.response?.data?.error ||
        'Could not save template';
      setStatusMessage({ type: 'error', text: String(msg) });
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleProcessOutbox = async (retryFailed = false, outboxGuid?: string) => {
    setProcessingOutbox(true);
    setStatusMessage(null);
    try {
      const res = await axios.post(
        `${BASE_URL}/api/admin/${encodeURIComponent(targetBusiness)}/outbox/process`,
        {
          retry_failed: retryFailed,
          outbox_guids: outboxGuid ? [outboxGuid] : undefined,
        },
        { headers: authHeaders }
      );
      await loadSupervisorData();
      setStatusMessage({
        type: 'success',
        text: `Processed ${res.data?.processed_count ?? 0} pending notification(s).`,
      });
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: String(err?.response?.data?.error?.message || 'Failed to process notifications'),
      });
    } finally {
      setProcessingOutbox(false);
    }
  };

  const handleDispatchReminders = async () => {
    setProcessingOutbox(true);
    setStatusMessage(null);
    try {
      const res = await axios.post(
        `${BASE_URL}/api/admin/${encodeURIComponent(targetBusiness)}/outbox/reminders`,
        {},
        { headers: authHeaders }
      );
      await loadSupervisorData();
      setStatusMessage({
        type: 'success',
        text: `Sent ${res.data?.reminders_queued_count ?? 0} upcoming reservation reminder(s).`,
      });
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: String(err?.response?.data?.error?.message || 'Failed to send reminders'),
      });
    } finally {
      setProcessingOutbox(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (targetBusiness === 'all') {
      setStatusMessage({
        type: 'error',
        text: 'Please select a specific Business Owner from the filter above before updating location settings.',
      });
      return;
    }
    setSavingSettings(true);
    setStatusMessage(null);
    try {
      const payload = {
        business_name: settingsForm.business_name || '',
        contact_email: settingsForm.contact_email || '',
        contact_phone: settingsForm.contact_phone || '',
        physical_address: settingsForm.physical_address || '',
        timezone: settingsForm.timezone || 'America/Los_Angeles',
        currency: settingsForm.currency || 'USD',
        hold_ttl_seconds: Number(settingsForm.hold_ttl_seconds || 600),
        free_change_cutoff_hours: Number(settingsForm.free_change_cutoff_hours || 168),
        late_fee_percentage: Number(settingsForm.late_fee_percentage || 25),
        guest_token_ttl_days: Number(settingsForm.guest_token_ttl_days || 30),
        allow_customer_add_days: Boolean(settingsForm.allow_customer_add_days),
        allow_customer_remove_days: Boolean(settingsForm.allow_customer_remove_days),
        tax_rate_percent: Number(settingsForm.tax_rate_percent || 8.25),
        require_full_payment: Boolean(settingsForm.require_full_payment),
        sms_enabled: Boolean(settingsForm.sms_enabled),
        email_enabled: Boolean(settingsForm.email_enabled),
        reminder_lead_hours: Number(settingsForm.reminder_lead_hours || 48),
      };

      await axios.put(
        `${BASE_URL}/api/admin/${encodeURIComponent(targetBusiness)}/settings`,
        {
          settings: payload,
          reason: auditReason || (hasSettings ? 'Updated settings' : 'Initial settings created'),
        },
        { headers: authHeaders }
      );

      await refreshTenantConfig(targetBusiness);
      setHasSettings(true);
      setIsEditingSettings(false);
      setSavedSettingsForm(payload);
      setSettingsForm(payload);
      await loadSupervisorData();
      setStatusMessage({
        type: 'success',
        text: hasSettings ? 'Settings saved successfully.' : 'Settings added successfully.',
      });
    } catch (err: any) {
      const msg =
        err?.response?.data?.error?.message ||
        err?.response?.data?.error ||
        'Could not save settings';
      setStatusMessage({ type: 'error', text: String(msg) });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (targetBusiness === 'all') {
      setStatusMessage({
        type: 'error',
        text: 'Please select a specific Business Owner from the filter above before adding inventory items.',
      });
      return;
    }
    if (!newItemName.trim()) {
      setStatusMessage({ type: 'error', text: 'Item name is required.' });
      return;
    }
    const parsedRate = parseFloat(newItemRateDollars);
    if (isNaN(parsedRate) || parsedRate < 0) {
      setStatusMessage({ type: 'error', text: 'Please enter a valid daily rate ($).' });
      return;
    }
    if (!newItemSerials.trim()) {
      setStatusMessage({ type: 'error', text: 'Unit is required. Please enter at least one unit (e.g. Unit 1, SN-101).' });
      return;
    }

    setCreatingItem(true);
    setStatusMessage(null);
    try {
      const rateCents = Math.round(parsedRate * 100);
      let serials = newItemSerials
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      // Support integer count (e.g. entering "3" creates Unit-1, Unit-2, Unit-3)
      if (serials.length === 1 && /^\d+$/.test(serials[0])) {
        const count = parseInt(serials[0], 10);
        if (count > 0 && count <= 100) {
          serials = Array.from({ length: count }, (_, i) => `Unit-${i + 1}`);
        }
      }

      const images = newItemImageUrls
        .map((s) => s.trim())
        .filter(Boolean);

      await axios.post(
        `${BASE_URL}/api/admin/${encodeURIComponent(targetBusiness)}/items`,
        {
          name: newItemName.trim(),
          description: newItemDesc.trim(),
          daily_rate_cents: rateCents,
          images,
          serial_numbers: serials,
        },
        { headers: authHeaders }
      );

      // Clear the form on success
      setNewItemName('');
      setNewItemDesc('');
      setNewItemImageUrls(['']);
      setNewItemRateDollars('');
      setNewItemSerials('');
      setShowAddItemModal(false);

      await loadSupervisorData();
      setStatusMessage({
        type: 'success',
        text: `Added '${newItemName.trim()}' to the rental catalog.`,
      });
    } catch (err: any) {
      const msg =
        err?.response?.data?.error?.message ||
        err?.response?.data?.error ||
        'Could not create item';
      setStatusMessage({ type: 'error', text: String(msg) });
    } finally {
      setCreatingItem(false);
    }
  };

  const handleOpenEditItem = (item: any) => {
    setEditingItem(item);
    setEditItemName(item.name || '');
    setEditItemDesc(item.description || '');
    setEditItemRateDollars(
      item.daily_rate_cents !== undefined ? ((item.daily_rate_cents || 0) / 100).toFixed(2) : ''
    );
    const imgs =
      Array.isArray(item.images) && item.images.length > 0
        ? item.images.filter((u: string) => Boolean(u && typeof u === 'string'))
        : [''];
    setEditItemImageUrls(imgs.length > 0 ? imgs : ['']);
    setEditItemIsActive(item.is_active !== false);
  };

  const handleCloseEditItem = () => {
    setEditingItem(null);
    setEditItemName('');
    setEditItemDesc('');
    setEditItemRateDollars('');
    setEditItemImageUrls(['']);
    setEditItemIsActive(true);
  };

  const handleSaveEditItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    if (!editItemName.trim()) {
      setStatusMessage({ type: 'error', text: 'Item Name is required.' });
      return;
    }
    const parsedRate = parseFloat(editItemRateDollars);
    if (isNaN(parsedRate) || parsedRate <= 0) {
      setStatusMessage({
        type: 'error',
        text: 'Please enter a valid positive daily rate in dollars (e.g. 45.00).',
      });
      return;
    }

    setSavingEditItem(true);
    setStatusMessage(null);
    try {
      const rateCents = Math.round(parsedRate * 100);
      const images = editItemImageUrls
        .map((u) => u.trim())
        .filter((u) => u.length > 0);

      const targetBiz = editingItem.business || targetBusiness;

      await axios.put(
        `${BASE_URL}/api/admin/${encodeURIComponent(targetBiz)}/items/${encodeURIComponent(
          editingItem.item_guid
        )}`,
        {
          name: editItemName.trim(),
          description: editItemDesc.trim(),
          daily_rate_cents: rateCents,
          images,
          is_active: editItemIsActive,
          reason: `Updated inventory item ${editItemName.trim()}`,
        },
        { headers: authHeaders }
      );

      handleCloseEditItem();
      await loadSupervisorData();
      setStatusMessage({
        type: 'success',
        text: `Item "${editItemName.trim()}" updated successfully.`,
      });
    } catch (err: any) {
      const msg =
        err?.response?.data?.error?.message ||
        err?.response?.data?.error ||
        'Could not update inventory item';
      setStatusMessage({ type: 'error', text: String(msg) });
    } finally {
      setSavingEditItem(false);
    }
  };

  const handleAddUnitsToItem = async (itemGuid: string) => {
    const raw = unitInputsByItem[itemGuid] || '';
    let serials = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (serials.length === 1 && /^\d+$/.test(serials[0])) {
      const count = parseInt(serials[0], 10);
      if (count > 0 && count <= 50) {
        serials = Array.from({ length: count }, (_, i) => `Unit-${i + 1}`);
      }
    }

    if (serials.length === 0) {
      setStatusMessage({ type: 'error', text: 'Please enter at least one unit (e.g. Unit 1, SN-201, or quantity).' });
      return;
    }
    setStatusMessage(null);
    try {
      await axios.post(
        `${BASE_URL}/api/admin/${encodeURIComponent(targetBusiness)}/items/${encodeURIComponent(
          itemGuid
        )}/units`,
        { serial_numbers: serials },
        { headers: authHeaders }
      );
      setUnitInputsByItem((prev) => ({ ...prev, [itemGuid]: '' }));
      await loadSupervisorData();
      setStatusMessage({
        type: 'success',
        text: `Added ${serials.length} unit(s) to inventory.`,
      });
    } catch (err: any) {
      const msg =
        err?.response?.data?.error?.message ||
        err?.response?.data?.error ||
        'Could not add unit(s)';
      setStatusMessage({ type: 'error', text: String(msg) });
    }
  };

  const handleDeactivateUnit = async (itemGuid: string, unitGuid: string) => {
    setStatusMessage(null);
    try {
      await axios.delete(
        `${BASE_URL}/api/admin/${encodeURIComponent(targetBusiness)}/items/${encodeURIComponent(
          itemGuid
        )}/units/${encodeURIComponent(unitGuid)}`,
        { headers: authHeaders }
      );
      await loadSupervisorData();
      setStatusMessage({
        type: 'success',
        text: 'Unit deactivated.',
      });
    } catch (err: any) {
      const msg =
        err?.response?.data?.error?.message ||
        err?.response?.data?.error ||
        'Could not deactivate unit';
      setStatusMessage({ type: 'error', text: String(msg) });
    }
  };

  const handleCreateBlackout = async (e: React.FormEvent) => {
    e.preventDefault();
    setBlackoutError(null);

    const effectiveBusiness = isAdmin
      ? blackoutBusiness
      : (profile?.business || (targetBusiness !== 'all' ? targetBusiness : ''));

    if (!effectiveBusiness || effectiveBusiness === 'all') {
      const errText =
        'Please select a specific Business before creating blackout dates.';
      setStatusMessage({ type: 'error', text: errText });
      setBlackoutError(errText);
      return;
    }

    const trimmedReason = (blackoutReason || '').trim();
    const trimmedStart = (blackoutStartDate || '').trim();
    const trimmedEnd = (blackoutEndDate || '').trim();

    if (!trimmedReason && !trimmedStart && !trimmedEnd) {
      const errText = 'Reason, Start Date, and End Date are required.';
      setStatusMessage({ type: 'error', text: errText });
      setBlackoutError(errText);
      return;
    }

    if (!trimmedReason) {
      const errText = 'Please provide a reason for blocking dates.';
      setStatusMessage({ type: 'error', text: errText });
      setBlackoutError(errText);
      return;
    }

    if (!trimmedStart) {
      const errText = 'Please select a Start Date.';
      setStatusMessage({ type: 'error', text: errText });
      setBlackoutError(errText);
      return;
    }

    if (!trimmedEnd) {
      const errText = 'Please select an End Date.';
      setStatusMessage({ type: 'error', text: errText });
      setBlackoutError(errText);
      return;
    }

    if (new Date(trimmedStart) > new Date(trimmedEnd) || trimmedStart > trimmedEnd) {
      const errText = 'Invalid date range: Start Date must be on or before End Date.';
      setStatusMessage({ type: 'error', text: errText });
      setBlackoutError(errText);
      return;
    }

    setStatusMessage(null);
    try {
      await axios.post(
        `${BASE_URL}/api/admin/${encodeURIComponent(effectiveBusiness)}/blackouts`,
        {
          item_guid: blackoutItemGuid || null,
          start_date: trimmedStart,
          end_date: trimmedEnd,
          reason: trimmedReason,
          force_override: blackoutForceOverride,
        },
        { headers: authHeaders }
      );
      await loadSupervisorData();
      setStatusMessage({
        type: 'success',
        text: `Blocked dates from ${trimmedStart} to ${trimmedEnd} created successfully.`,
      });

      // Clear the form on success
      setBlackoutBusiness('');
      setBlackoutItemGuid('');
      setBlackoutReason('');
      setBlackoutStartDate('');
      setBlackoutEndDate('');
      setBlackoutForceOverride(false);
      setBlackoutError(null);
      setShowBlockDatesModal(false);
    } catch (err: any) {
      const msg =
        err?.response?.data?.error?.message ||
        err?.response?.data?.error ||
        'Could not create blackout dates';
      setStatusMessage({ type: 'error', text: String(msg) });
      setBlackoutError(String(msg));
    }
  };

  const handleDeleteBlackout = async (blackoutGuid: string) => {
    if (!window.confirm('Are you sure you want to remove this blocked date period?')) {
      return;
    }
    setStatusMessage(null);
    try {
      await axios.delete(
        `${BASE_URL}/api/admin/${encodeURIComponent(targetBusiness)}/blackouts/${encodeURIComponent(
          blackoutGuid
        )}`,
        { headers: authHeaders }
      );
      await loadSupervisorData();
      setStatusMessage({
        type: 'success',
        text: 'Blocked date period removed successfully.',
      });
    } catch (err: any) {
      const msg =
        err?.response?.data?.error?.message ||
        err?.response?.data?.error ||
        'Could not delete blackout';
      setStatusMessage({ type: 'error', text: String(msg) });
    }
  };

  const handleCreateManualReservation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (targetBusiness === 'all') {
      setStatusMessage({
        type: 'error',
        text: 'Please select a specific Business Owner from the filter above before creating a manual booking.',
      });
      return;
    }

    const errors: {
      item_guid?: string;
      payment_option?: string;
      start_date?: string;
      end_date?: string;
      first_name?: string;
      last_name?: string;
      email?: string;
      phone_number?: string;
    } = {};

    if (!manualItemGuid) {
      errors.item_guid = 'Please select a rental item.';
    }
    if (!manualPaymentOption) {
      errors.payment_option = 'Please select a payment method.';
    }
    if (!manualStartDate) {
      errors.start_date = 'Start date is required.';
    }
    if (!manualEndDate) {
      errors.end_date = 'End date is required.';
    } else if (manualStartDate && manualStartDate > manualEndDate) {
      errors.end_date = 'Return date cannot be earlier than pick-up date';
    }

    if (!manualCustomer.first_name.trim()) {
      errors.first_name = 'Customer first name is required.';
    }
    if (!manualCustomer.last_name.trim()) {
      errors.last_name = 'Customer last name is required.';
    }

    const emailTrimmed = manualCustomer.email.trim();
    const phoneTrimmed = manualCustomer.phone_number.trim();

    if (!emailTrimmed && !phoneTrimmed) {
      errors.email = 'Either email or phone number is required.';
      errors.phone_number = 'Either email or phone number is required.';
    } else {
      if (emailTrimmed && !/\S+@\S+\.\S+/.test(emailTrimmed)) {
        errors.email = 'Please enter a valid email address.';
      }
      if (phoneTrimmed && !/^\d{10}$/.test(phoneTrimmed.replace(/\D/g, ''))) {
        errors.phone_number = 'Please enter a valid 10-digit phone number.';
      }
    }

    if (Object.keys(errors).length > 0) {
      setManualReservationErrors(errors);
      return;
    }

    setManualReservationErrors({});
    setStatusMessage(null);
    try {
      await axios.post(
        `${BASE_URL}/api/admin/${encodeURIComponent(targetBusiness)}/reservations/manual`,
        {
          item_guid: manualItemGuid,
          start_date: manualStartDate,
          end_date: manualEndDate,
          payment_option: manualPaymentOption,
          customer: manualCustomer,
        },
        { headers: authHeaders }
      );
      await loadSupervisorData();
      setStatusMessage({
        type: 'success',
        text: 'Manual reservation created successfully.',
      });

      // Clear the form on success
      setManualItemGuid('');
      setManualPaymentOption('');
      setManualStartDate('');
      setManualEndDate('');
      setManualCustomer({
        first_name: '',
        last_name: '',
        email: '',
        phone_number: '',
      });
      setManualReservationErrors({});
    } catch (err: any) {
      const msg =
        err?.response?.data?.error?.message ||
        err?.response?.data?.error ||
        'Could not create manual reservation';
      setStatusMessage({ type: 'error', text: String(msg) });
    }
  };

  const handleResolveRefundQueue = async (
    paymentGuid: string,
    resolution: 'RETRY' | 'MANUAL'
  ) => {
    setStatusMessage(null);
    try {
      await axios.post(
        `${BASE_URL}/api/admin/${encodeURIComponent(targetBusiness)}/refunds/queue`,
        {
          payment_guid: paymentGuid,
          resolution,
          reason: `Resolved via ${resolution}`,
        },
        { headers: authHeaders }
      );
      await loadSupervisorData();
      setStatusMessage({
        type: 'success',
        text: 'Payment / refund status updated.',
      });
    } catch (err: any) {
      const msg =
        err?.response?.data?.error?.message ||
        err?.response?.data?.error ||
        'Could not update refund status';
      setStatusMessage({ type: 'error', text: String(msg) });
    }
  };

  const handleSupervisorOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideResGuid) {
      setStatusMessage({ type: 'error', text: 'Please select a reservation to modify or cancel.' });
      return;
    }
    if (!overrideAction) {
      setStatusMessage({ type: 'error', text: 'Please select an override action.' });
      return;
    }
    if (!overrideReason.trim()) {
      setStatusMessage({ type: 'error', text: 'Reason for supervisor override is required.' });
      return;
    }
    if (overrideAction !== 'CANCEL') {
      if (!overrideStartDate || !overrideEndDate) {
        setOverrideDateError('Both start and end dates are required.');
        setStatusMessage({ type: 'error', text: 'New start and end dates are required.' });
        return;
      }
      if (overrideStartDate > overrideEndDate) {
        setOverrideDateError('New end date cannot be earlier than start date.');
        setStatusMessage({ type: 'error', text: 'New end date cannot be earlier than start date.' });
        return;
      }
      if (!durationValidation.valid) {
        setOverrideDateError(durationValidation.error);
        setStatusMessage({
          type: 'error',
          text: durationValidation.error || 'Invalid date selection for the chosen action.',
        });
        return;
      }
    }
    setOverrideDateError(null);
    setSavingOverride(true);
    setStatusMessage(null);
    try {
      await axios.post(
        `${BASE_URL}/api/admin/${encodeURIComponent(targetBusiness)}/reservations/${encodeURIComponent(
          overrideResGuid
        )}/override`,
        {
          action: overrideAction,
          waive_fee: overrideWaiveFee,
          new_start_date: overrideAction !== 'CANCEL' ? overrideStartDate : undefined,
          new_end_date: overrideAction !== 'CANCEL' ? overrideEndDate : undefined,
          reason: overrideReason.trim(),
        },
        { headers: authHeaders }
      );
      await loadSupervisorData();
      setStatusMessage({
        type: 'success',
        text:
          overrideAction === 'CANCEL'
            ? 'Reservation cancelled successfully.'
            : 'Reservation updated successfully.',
      });

      // Clear the form on success
      handleClearOverrideSelection();
    } catch (err: any) {
      const msg =
        err?.response?.data?.error?.message ||
        err?.response?.data?.error ||
        'Could not update reservation';
      setStatusMessage({ type: 'error', text: String(msg) });
    } finally {
      setSavingOverride(false);
    }
  };

  if (isCrossTenantMismatch) {
    return (
      <div className={classes.portalWrapper}>
        <div className={classes.card}>
          <h3>Location Access Restricted</h3>
          <p>
            Your account does not have administrative access to this location.
          </p>
          <div className={classes.badgeRow} style={{ marginTop: '14px' }}>
            <button
              type="button"
              className={classes.primaryBtn}
              onClick={() => navigate(`/admin/${encodeURIComponent(assignedBusiness)}`)}
            >
              Go to Assigned Location Panel
            </button>
            <Link
              to={`/book/${encodeURIComponent(targetBusiness)}`}
              className={classes.secondaryBtn}
            >
              View Booking Page
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={classes.portalWrapper}>
      <section className={classes.tenantBanner}>
        <div className={classes.bannerTitleGroup}>
          <h1>{isAdmin ? 'Admin Control Panel' : 'Business Owner Control Panel'}</h1>
          {targetBusiness === 'all' ? (
            <p>Viewing all locations, inventory, reservations, and audit logs across all business owners.</p>
          ) : (
            <div>
              <h2 style={{ margin: '4px 0 6px 0', fontSize: '1.25rem', color: '#174b0f', fontWeight: 700 }}>
                {activeBusinessFriendlyName}
              </h2>
              <p>
                {settingsForm.physical_address && <span>📍 {settingsForm.physical_address} </span>}
                {settingsForm.contact_phone && <span>• 📞 {settingsForm.contact_phone} </span>}
                {settingsForm.contact_email && <span>• ✉️ {settingsForm.contact_email}</span>}
              </p>
            </div>
          )}
        </div>

        <div className={classes.badgeRow}>
          {targetBusiness !== 'all' && (
            <Link
              to={`/book/${encodeURIComponent(targetBusiness)}`}
              className={classes.secondaryBtn}
            >
              View Customer Booking Page
            </Link>
          )}
          <button
            type="button"
            className={classes.secondaryBtn}
            onClick={loadSupervisorData}
          >
            ↻ Refresh Data
          </button>
        </div>
      </section>

      {isAdmin && (
        <div
          style={{
            marginBottom: '1.5rem',
            background: '#f8fafc',
            padding: '1rem 1.25rem',
            borderRadius: '12px',
            border: '1px solid #cbd5e1',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            flexWrap: 'wrap',
          }}
        >
          <label
            htmlFor="admin-owner-filter"
            style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.95rem' }}
          >
            Filter by Business:
          </label>
          <select
            id="admin-owner-filter"
            value={targetBusiness}
            onChange={(e) => handleOwnerFilterChange(e.target.value)}
            style={{
              padding: '0.6rem 1rem',
              borderRadius: '8px',
              border: '1px solid #94a3b8',
              fontSize: '0.95rem',
              minWidth: '240px',
              backgroundColor: '#ffffff',
              color: '#0f172a',
              fontWeight: 500,
            }}
          >
            <option value="all">All Businesses</option>
            {filterBusinessOptions.map((b) => (
              <option key={b.business} value={b.business}>
                {formatUserFriendlyBusinessName(b.business, b.business_name)}
              </option>
            ))}
          </select>
          {targetBusiness !== 'all' && (
            <button
              type="button"
              className={classes.secondaryBtn}
              style={{ padding: '0.5rem 0.9rem', fontSize: '0.85rem' }}
              onClick={() => handleOwnerFilterChange('all')}
            >
              Reset to All
            </button>
          )}
        </div>
      )}

      {statusMessage && (
        <div
          className={`${classes.statusAlert} ${
            statusMessage.type === 'success' ? classes.statusSuccess : classes.statusError
          }`}
        >
          {statusMessage.text}
        </div>
      )}

      <nav className={classes.tabBar} aria-label="Supervisor Control Panel Tabs">
        <button
          type="button"
          className={`${classes.tabBtn} ${activeTab === 'overview' ? classes.tabBtnActive : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          type="button"
          className={`${classes.tabBtn} ${activeTab === 'settings' ? classes.tabBtnActive : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          Location &amp; Policy Settings
        </button>
        <button
          type="button"
          className={`${classes.tabBtn} ${activeTab === 'templates' ? classes.tabBtnActive : ''}`}
          onClick={() => setActiveTab('templates')}
        >
          Message Templates ({metrics?.templates_count ?? templates.length})
        </button>
        <button
          type="button"
          className={`${classes.tabBtn} ${activeTab === 'catalog' ? classes.tabBtnActive : ''}`}
          onClick={() => setActiveTab('catalog')}
        >
          Rental Inventory
        </button>
        <button
          type="button"
          className={`${classes.tabBtn} ${activeTab === 'reservations' ? classes.tabBtnActive : ''}`}
          onClick={() => setActiveTab('reservations')}
        >
          Reservations ({tenantReservations.length})
        </button>
        <button
          type="button"
          className={`${classes.tabBtn} ${activeTab === 'printer' ? classes.tabBtnActive : ''}`}
          onClick={() => setActiveTab('printer')}
        >
          Label Printer Setup
        </button>
        <button
          type="button"
          className={`${classes.tabBtn} ${activeTab === 'audit' ? classes.tabBtnActive : ''}`}
          onClick={() => setActiveTab('audit')}
        >
          Activity Log ({auditLogs.length})
        </button>
      </nav>

      {activeTab === 'overview' && (
        <div className={classes.card}>
          <h3>
            {targetBusiness === 'all'
              ? 'Systemwide Operational Summary (All Locations)'
              : `${activeBusinessFriendlyName} — Operational Summary`}
          </h3>
          {targetBusiness !== 'all' && settingsForm.physical_address && (
            <p style={{ margin: '0.25rem 0 0.75rem', color: '#475569', fontSize: '0.9rem' }}>
              📍 {settingsForm.physical_address} {settingsForm.contact_phone ? `• 📞 ${settingsForm.contact_phone}` : ''}
            </p>
          )}
          <p>Current operational overview{targetBusiness === 'all' ? ' across all business owners:' : ` for ${activeBusinessFriendlyName}:`}</p>
          <div className={classes.metricGrid}>
            <div className={classes.metricBox}>
              <span>Rental Items</span>
              <strong>{metrics?.items_count ?? 0}</strong>
            </div>
            <div className={classes.metricBox}>
              <span>Available Units</span>
              <strong>{metrics?.units_count ?? 0}</strong>
            </div>
            <div className={classes.metricBox}>
              <span>Customers</span>
              <strong>{metrics?.customers_count ?? 0}</strong>
            </div>
            <div className={classes.metricBox}>
              <span>Reservations</span>
              <strong>{metrics?.reservations_count ?? 0}</strong>
            </div>
            <div className={classes.metricBox}>
              <span>Message Templates</span>
              <strong>{metrics?.templates_count ?? templates.length}</strong>
            </div>
            <div className={classes.metricBox}>
              <span>Blackout Windows</span>
              <strong>{metrics?.blackouts_count ?? 0}</strong>
            </div>
            <div className={classes.metricBox}>
              <span>Activity Entries</span>
              <strong>{metrics?.audit_logs_count ?? 0}</strong>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'settings' && (
        <form className={classes.card} onSubmit={handleSaveSettings}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              flexWrap: 'wrap',
              gap: '10px',
              marginBottom: '16px',
            }}
          >
            <div>
              <h3 style={{ margin: 0 }}>Location Profile, Policies &amp; Tax Settings</h3>
              <p style={{ margin: '4px 0 0', color: '#666', fontSize: '0.88rem' }}>
                Configure your public contact information, cancellation rules, hold duration, and tax
                rates.
              </p>
            </div>
            {hasSettings && !isEditingSettings && (
              <button
                type="button"
                className={classes.secondaryBtn}
                style={{ padding: '6px 14px', fontSize: '0.84rem', cursor: 'pointer' }}
                onClick={() => setIsEditingSettings(true)}
              >
                Edit
              </button>
            )}
            {hasSettings && isEditingSettings && (
              <button
                type="button"
                style={{
                  border: '1px solid #c3dfc0',
                  background: 'none',
                  color: '#2d6a2e',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  fontSize: '0.84rem',
                  cursor: 'pointer',
                }}
                onClick={() => {
                  setSettingsForm(savedSettingsForm);
                  setIsEditingSettings(false);
                }}
              >
                Cancel Edit
              </button>
            )}
          </div>

          <div className={classes.formGrid}>
            <div className={classes.fieldGroup}>
              <label htmlFor="cfg-contact-email">Support Email</label>
              <input
                id="cfg-contact-email"
                type="email"
                placeholder="support@example.com"
                disabled={isSettingsFieldDisabled}
                value={settingsForm.contact_email || ''}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, contact_email: e.target.value })
                }
              />
            </div>

            <div className={classes.fieldGroup}>
              <label htmlFor="cfg-contact-phone">Support Phone</label>
              <input
                id="cfg-contact-phone"
                type="text"
                placeholder="(555) 000-0000"
                disabled={isSettingsFieldDisabled}
                value={settingsForm.contact_phone || ''}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, contact_phone: e.target.value })
                }
              />
            </div>

            <div className={classes.fieldGroup}>
              <label htmlFor="cfg-address">Pickup Address</label>
              <input
                id="cfg-address"
                type="text"
                placeholder="123 Main St, Suite 100"
                disabled={isSettingsFieldDisabled}
                value={settingsForm.physical_address || ''}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, physical_address: e.target.value })
                }
              />
            </div>

            <div className={classes.fieldGroup}>
              <label htmlFor="cfg-timezone">Timezone</label>
              <select
                id="cfg-timezone"
                disabled={isSettingsFieldDisabled}
                value={settingsForm.timezone || ''}
                onChange={(e) => setSettingsForm({ ...settingsForm, timezone: e.target.value })}
              >
                <option value="">Select Timezone...</option>
                <option value="America/Los_Angeles">Pacific Time (PT)</option>
                <option value="America/Denver">Mountain Time (MT)</option>
                <option value="America/Chicago">Central Time (CT)</option>
                <option value="America/New_York">Eastern Time (ET)</option>
                <option value="UTC">UTC</option>
              </select>
            </div>

            <div className={classes.fieldGroup}>
              <label htmlFor="cfg-currency">Currency</label>
              <select
                id="cfg-currency"
                disabled={isSettingsFieldDisabled}
                value={settingsForm.currency || ''}
                onChange={(e) => setSettingsForm({ ...settingsForm, currency: e.target.value })}
              >
                <option value="">Select Currency...</option>
                <option value="USD">USD ($)</option>
                <option value="CAD">CAD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
              </select>
            </div>

            <div className={classes.fieldGroup}>
              <label htmlFor="cfg-hold-ttl">Checkout Hold Duration (seconds)</label>
              <input
                id="cfg-hold-ttl"
                type="number"
                min={30}
                placeholder="600"
                disabled={isSettingsFieldDisabled}
                value={settingsForm.hold_ttl_seconds ?? ''}
                onChange={(e) =>
                  setSettingsForm({
                    ...settingsForm,
                    hold_ttl_seconds: e.target.value === '' ? '' : Number(e.target.value),
                  })
                }
              />
            </div>

            <div className={classes.fieldGroup}>
              <label htmlFor="cfg-cutoff-hours">Free Cancellation Window (hours)</label>
              <input
                id="cfg-cutoff-hours"
                type="number"
                min={0}
                placeholder="168"
                disabled={isSettingsFieldDisabled}
                value={settingsForm.free_change_cutoff_hours ?? ''}
                onChange={(e) =>
                  setSettingsForm({
                    ...settingsForm,
                    free_change_cutoff_hours: e.target.value === '' ? '' : Number(e.target.value),
                  })
                }
              />
            </div>

            <div className={classes.fieldGroup}>
              <label htmlFor="cfg-late-fee">Late Cancellation Fee (%)</label>
              <input
                id="cfg-late-fee"
                type="number"
                min={0}
                max={100}
                placeholder="25"
                disabled={isSettingsFieldDisabled}
                value={settingsForm.late_fee_percentage ?? ''}
                onChange={(e) =>
                  setSettingsForm({
                    ...settingsForm,
                    late_fee_percentage: e.target.value === '' ? '' : Number(e.target.value),
                  })
                }
              />
            </div>

            <div className={classes.fieldGroup}>
              <label htmlFor="cfg-tax-rate">Sales Tax Rate (%)</label>
              <input
                id="cfg-tax-rate"
                type="number"
                step="0.01"
                min={0}
                placeholder="8.25"
                disabled={isSettingsFieldDisabled}
                value={settingsForm.tax_rate_percent ?? ''}
                onChange={(e) =>
                  setSettingsForm({
                    ...settingsForm,
                    tax_rate_percent: e.target.value === '' ? '' : Number(e.target.value),
                  })
                }
              />
            </div>

            <div className={classes.fieldGroup}>
              <label htmlFor="cfg-token-ttl">Booking Link Validity (days)</label>
              <input
                id="cfg-token-ttl"
                type="number"
                min={1}
                placeholder="30"
                disabled={isSettingsFieldDisabled}
                value={settingsForm.guest_token_ttl_days ?? ''}
                onChange={(e) =>
                  setSettingsForm({
                    ...settingsForm,
                    guest_token_ttl_days: e.target.value === '' ? '' : Number(e.target.value),
                  })
                }
              />
            </div>

            <div className={classes.fieldGroup}>
              <label htmlFor="cfg-reminder-hours">Reminder Lead Time (hours)</label>
              <input
                id="cfg-reminder-hours"
                type="number"
                min={1}
                placeholder="48"
                disabled={isSettingsFieldDisabled}
                value={settingsForm.reminder_lead_hours ?? ''}
                onChange={(e) =>
                  setSettingsForm({
                    ...settingsForm,
                    reminder_lead_hours: e.target.value === '' ? '' : Number(e.target.value),
                  })
                }
              />
            </div>
          </div>

          <div className={classes.formGrid} style={{ marginTop: '14px' }}>
            <div className={classes.checkboxRow}>
              <input
                id="cfg-add-days"
                type="checkbox"
                disabled={isSettingsFieldDisabled}
                checked={Boolean(settingsForm.allow_customer_add_days)}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, allow_customer_add_days: e.target.checked })
                }
              />
              <label htmlFor="cfg-add-days">Allow Customers to Extend Rentals Online</label>
            </div>

            <div className={classes.checkboxRow}>
              <input
                id="cfg-remove-days"
                type="checkbox"
                disabled={isSettingsFieldDisabled}
                checked={Boolean(settingsForm.allow_customer_remove_days)}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, allow_customer_remove_days: e.target.checked })
                }
              />
              <label htmlFor="cfg-remove-days">Allow Customers to Shorten Rentals Online</label>
            </div>

            <div className={classes.checkboxRow}>
              <input
                id="cfg-full-payment"
                type="checkbox"
                disabled={isSettingsFieldDisabled}
                checked={Boolean(settingsForm.require_full_payment)}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, require_full_payment: e.target.checked })
                }
              />
              <label htmlFor="cfg-full-payment">Require Full Payment at Booking</label>
            </div>

            <div className={classes.checkboxRow}>
              <input
                id="cfg-email-enabled"
                type="checkbox"
                disabled={isSettingsFieldDisabled}
                checked={Boolean(settingsForm.email_enabled)}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, email_enabled: e.target.checked })
                }
              />
              <label htmlFor="cfg-email-enabled">Enable Email Notifications</label>
            </div>

            <div className={classes.checkboxRow}>
              <input
                id="cfg-sms-enabled"
                type="checkbox"
                disabled={isSettingsFieldDisabled}
                checked={Boolean(settingsForm.sms_enabled)}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, sms_enabled: e.target.checked })
                }
              />
              <label htmlFor="cfg-sms-enabled">Enable SMS Notifications</label>
            </div>
          </div>

          {!hasSettings && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                marginTop: '20px',
                paddingTop: '16px',
                borderTop: '1px solid #e2f0df',
              }}
            >
              <button type="submit" className={classes.primaryBtn} disabled={savingSettings}>
                {savingSettings ? 'Adding...' : 'Add Settings'}
              </button>
            </div>
          )}

          {hasSettings && isEditingSettings && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '12px',
                marginTop: '20px',
                paddingTop: '16px',
                borderTop: '1px solid #e2f0df',
              }}
            >
              <div className={classes.fieldGroup} style={{ flex: 1, minWidth: '240px' }}>
                <label htmlFor="cfg-audit-reason">Note for Change Log</label>
                <input
                  id="cfg-audit-reason"
                  type="text"
                  placeholder="Reason for modifying settings..."
                  value={auditReason}
                  onChange={(e) => setAuditReason(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  className={classes.secondaryBtn}
                  onClick={() => {
                    setSettingsForm(savedSettingsForm);
                    setIsEditingSettings(false);
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className={classes.primaryBtn} disabled={savingSettings}>
                  {savingSettings ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </div>
          )}
        </form>
      )}

      {activeTab === 'templates' && (
        <div>
          <div className={classes.gridTwo}>
            <form className={classes.card} onSubmit={handleSaveTemplate}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: '12px',
                  gap: '12px',
                }}
              >
                <div>
                  <h3 style={{ margin: 0 }}>
                    Customer Email &amp; SMS Templates ({metrics?.templates_count ?? templates.length})
                  </h3>
                  <p style={{ margin: '4px 0 0', color: '#5c7c58' }}>
                    Customize the confirmation, modification, cancellation, and reminder messages sent to
                    customers.
                  </p>
                </div>
                {!isEditingTemplate && (
                  <button
                    type="button"
                    className={classes.secondaryBtn}
                    style={{ padding: '6px 14px', fontSize: '0.84rem', cursor: 'pointer', whiteSpace: 'nowrap' }}
                    onClick={() => setIsEditingTemplate(true)}
                  >
                    Edit
                  </button>
                )}
              </div>

              <div className={classes.formGrid}>
                <div className={classes.fieldGroup}>
                  <label htmlFor="tpl-event">Notification Type</label>
                  <select
                    id="tpl-event"
                    value={selectedEvent}
                    onChange={(e) => {
                      setSelectedEvent(e.target.value);
                      setIsEditingTemplate(false);
                    }}
                  >
                    <option value="booking.confirmed">Booking Confirmed</option>
                    <option value="booking.cancelled">Booking Cancelled</option>
                    <option value="booking.rescheduled">Booking Rescheduled</option>
                    <option value="booking.days_added">Rental Extended (Days Added)</option>
                    <option value="booking.days_removed">Rental Shortened (Days Removed)</option>
                    <option value="booking.reminder_48h">Upcoming Rental Reminder</option>
                  </select>
                </div>

                <div className={classes.fieldGroup}>
                  <label htmlFor="tpl-channel">Channel</label>
                  <select
                    id="tpl-channel"
                    value={selectedChannel}
                    onChange={(e) => {
                      setSelectedChannel(e.target.value as 'EMAIL' | 'SMS');
                      setIsEditingTemplate(false);
                    }}
                  >
                    <option value="EMAIL">Email</option>
                    <option value="SMS">SMS</option>
                  </select>
                </div>
              </div>

              {selectedChannel === 'EMAIL' && (
                <div className={classes.fieldGroup} style={{ marginTop: '12px' }}>
                  <label htmlFor="tpl-subject">Email Subject Line</label>
                  <input
                    id="tpl-subject"
                    type="text"
                    placeholder="e.g. Your booking confirmation - {{item_name}}"
                    disabled={!isEditingTemplate}
                    readOnly={!isEditingTemplate}
                    value={templateSubject}
                    onChange={(e) => setTemplateSubject(e.target.value)}
                  />
                </div>
              )}

              <div className={classes.fieldGroup} style={{ marginTop: '12px' }}>
                <label htmlFor="tpl-body">Message Body</label>
                <textarea
                  id="tpl-body"
                  rows={5}
                  placeholder="Enter template message content with variables like {{customer_name}}, {{start_date}}..."
                  disabled={!isEditingTemplate}
                  readOnly={!isEditingTemplate}
                  value={templateBody}
                  onChange={(e) => setTemplateBody(e.target.value)}
                  style={{
                    width: '100%',
                    fontFamily: 'inherit',
                  }}
                />
              </div>

              <div className={classes.badgeRow} style={{ marginTop: '14px' }}>
                <button
                  type="button"
                  className={classes.secondaryBtn}
                  onClick={handlePreviewTemplate}
                >
                  Preview Message
                </button>
                {isEditingTemplate && (
                  <>
                    <button
                      type="button"
                      className={classes.secondaryBtn}
                      onClick={() => {
                        if (activeTemplateRow) {
                          setTemplateSubject(activeTemplateRow.subject || '');
                          setTemplateBody(activeTemplateRow.body_template || '');
                          if (activeTemplateRow.body_template?.trim() || activeTemplateRow.subject?.trim()) {
                            axios
                              .post(
                                `${BASE_URL}/api/admin/${encodeURIComponent(targetBusiness)}/templates/preview`,
                                {
                                  subject: selectedChannel === 'EMAIL' ? activeTemplateRow.subject || null : null,
                                  body_template: activeTemplateRow.body_template || '',
                                },
                                { headers: authHeaders }
                              )
                              .then((res) => {
                                if (res.data && (res.data.rendered_body?.trim() || res.data.rendered_subject?.trim())) {
                                  setTemplatePreview(res.data);
                                } else {
                                  setTemplatePreview(null);
                                }
                              })
                              .catch(() => setTemplatePreview(null));
                          } else {
                            setTemplatePreview(null);
                          }
                        } else {
                          setTemplateSubject('');
                          setTemplateBody('');
                          setTemplatePreview(null);
                        }
                        setIsEditingTemplate(false);
                      }}
                    >
                      Cancel
                    </button>
                    <button type="submit" className={classes.primaryBtn} disabled={savingTemplate}>
                      {savingTemplate ? 'Saving...' : 'Save Template'}
                    </button>
                  </>
                )}
              </div>
            </form>

            <div className={classes.card}>
              <h3>Message Preview</h3>
              {templatePreview &&
              (templatePreview.rendered_body?.trim() || templatePreview.rendered_subject?.trim()) ? (
                <div>
                  {templatePreview.rendered_subject && (
                    <div style={{ marginBottom: '10px' }}>
                      <strong>Subject:</strong> {templatePreview.rendered_subject}
                    </div>
                  )}
                  <pre className={classes.diffPre} style={{ whiteSpace: 'pre-wrap' }}>
                    {templatePreview.rendered_body}
                  </pre>
                </div>
              ) : (
                <p style={{ color: '#5c7c58' }}>
                  There is no email or sms to preview
                </p>
              )}
            </div>
          </div>

          <div className={classes.card} style={{ marginTop: '18px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '10px',
              }}
            >
              <div>
                <h3 style={{ margin: 0 }}>Sent &amp; Queued Notifications</h3>
                <p style={{ margin: '4px 0 0' }}>
                  View recent customer email and SMS notifications or resend failed messages.
                </p>
              </div>
              <div className={classes.badgeRow}>
                <button
                  type="button"
                  className={classes.secondaryBtn}
                  disabled={processingOutbox}
                  onClick={() => handleDispatchReminders()}
                >
                  Send Upcoming Reminders
                </button>
                <button
                  type="button"
                  className={classes.primaryBtn}
                  disabled={processingOutbox}
                  onClick={() => handleProcessOutbox(true)}
                >
                  {processingOutbox ? 'Processing...' : 'Retry Pending / Failed'}
                </button>
              </div>
            </div>

            {outboxItems.length === 0 ? (
              <p style={{ marginTop: '14px' }}>No notifications have been sent yet.</p>
            ) : (
              <table className={classes.auditTable} style={{ marginTop: '14px' }}>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Notification</th>
                    <th>Channel</th>
                    <th>Recipient</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {outboxItems.map((item) => (
                    <tr key={item.outbox_guid}>
                      <td>{new Date(item.time_created).toLocaleString()}</td>
                      <td>{item.template_type}</td>
                      <td>
                        <span className={`${classes.badge} ${classes.badgeCustomer}`}>
                          {item.channel}
                        </span>
                      </td>
                      <td>{item.recipient}</td>
                      <td>
                        <span
                          className={`${classes.badge} ${
                            item.status === 'SENT'
                              ? classes.badgeSupervisor
                              : item.status === 'FAILED'
                              ? classes.badgeMismatch
                              : classes.badgeBusiness
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td>
                        <div className={classes.badgeRow}>
                          <button
                            type="button"
                            className={classes.secondaryBtn}
                            style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                            onClick={() =>
                              setSelectedOutboxItem(
                                selectedOutboxItem?.outbox_guid === item.outbox_guid ? null : item
                              )
                            }
                          >
                            {selectedOutboxItem?.outbox_guid === item.outbox_guid
                              ? 'Hide Message'
                              : 'View Message'}
                          </button>
                          {item.status === 'FAILED' && (
                            <button
                              type="button"
                              className={classes.primaryBtn}
                              style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                              onClick={() => handleProcessOutbox(true, item.outbox_guid)}
                            >
                              Resend
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {selectedOutboxItem && (
              <div style={{ marginTop: '14px' }}>
                <h4>
                  Message Details ({selectedOutboxItem.channel} &bull;{' '}
                  {selectedOutboxItem.recipient})
                </h4>
                {selectedOutboxItem.payload?.subject && (
                  <p style={{ margin: '4px 0' }}>
                    <strong>Subject:</strong> {selectedOutboxItem.payload.subject}
                  </p>
                )}
                <pre className={classes.diffPre} style={{ whiteSpace: 'pre-wrap' }}>
                  {selectedOutboxItem.rendered_body}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'catalog' && (
        <div>
          <div style={{ marginBottom: '18px' }}>
            <h2 style={{ margin: 0, fontSize: '1.35rem', color: '#174b0f' }}>
              Rental Inventory
            </h2>
          </div>

          {/* Main Content Grid: Current Inventory & Blocked Dates */}
          <div className={classes.gridTwo} style={{ alignItems: 'start' }}>
            {/* CURRENT INVENTORY CARD */}
            <div
              className={`${classes.card} ${classes.inventoryCard || ''}`}
              style={{
                maxHeight: '520px',
                display: 'flex',
                flexDirection: 'column',
                boxSizing: 'border-box',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '12px',
                  flexShrink: 0,
                }}
              >
                <h3 style={{ margin: 0 }}>
                  Current Inventory ({catalogItems.length})
                </h3>
                <button
                  type="button"
                  className={classes.primaryBtn}
                  style={{ padding: '6px 12px', fontSize: '0.84rem' }}
                  onClick={() => setShowAddItemModal(true)}
                >
                  + Add Item
                </button>
              </div>

              {catalogItems.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: '#666' }}>
                  <p style={{ margin: 0 }}>No rental items in inventory.</p>
                </div>
              ) : (
                <div
                  className={classes.inventoryList}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    overflowY: 'auto',
                    maxHeight: '440px',
                    minHeight: 0,
                    flex: '1 1 auto',
                    paddingRight: '6px',
                  }}
                >
                  {catalogItems.map((it) => (
                    <div
                      key={it.item_guid}
                      style={{
                        padding: '14px',
                        borderRadius: '10px',
                        border: '1px solid #d5ead0',
                        background: '#f8fcf7',
                      }}
                    >
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                        {Array.isArray(it.images) && it.images.length > 0 && it.images[0] ? (
                          <img
                            src={formatImageUrl(it.images[0])}
                            alt={it.name}
                            style={{
                              width: '54px',
                              height: '54px',
                              objectFit: 'cover',
                              borderRadius: '8px',
                              border: '1px solid #c3dfc0',
                              flexShrink: 0,
                            }}
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).src = getFallbackPhotoForName(it.name);
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width: '54px',
                              height: '54px',
                              borderRadius: '8px',
                              background: 'linear-gradient(135deg, #e8f4e5 0%, #d4e9d0 100%)',
                              border: '1px solid #c3dfc0',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                              padding: '2px',
                              boxSizing: 'border-box',
                              textAlign: 'center',
                            }}
                          >
                            <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>📦</span>
                            <span
                              style={{
                                fontSize: '0.56rem',
                                fontWeight: 700,
                                color: '#174b0f',
                                marginTop: '2px',
                                lineHeight: 1.1,
                                overflow: 'hidden',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                              }}
                            >
                              {it.name}
                            </span>
                          </div>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                            <strong style={{ fontSize: '1.02rem', color: '#174b0f' }}>{it.name}</strong>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontWeight: 600, color: '#246a19' }}>
                                ${((it.daily_rate_cents || 0) / 100).toFixed(2)} / day
                              </span>
                              {!it.is_active && (
                                <span style={{ fontSize: '0.72rem', background: '#fee2e2', color: '#991b1b', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                                  Inactive
                                </span>
                              )}
                              <button
                                type="button"
                                className={classes.secondaryBtn}
                                style={{ padding: '3px 8px', fontSize: '0.78rem', cursor: 'pointer' }}
                                onClick={() => handleOpenEditItem(it)}
                              >
                                ✏️ Edit
                              </button>
                            </div>
                          </div>
                          {it.description && (
                            <p style={{ margin: '4px 0 0', fontSize: '0.84rem', color: '#444' }}>
                              {it.description}
                            </p>
                          )}
                        </div>
                      </div>
                      <div style={{ marginTop: '8px' }}>
                        <small
                          style={{
                            color: '#246a19',
                            fontWeight: 700,
                            display: 'block',
                            marginBottom: '6px',
                          }}
                        >
                          Units ({it.units?.length || 0}):
                        </small>
                        <div className={classes.badgeRow}>
                          {(it.units || []).map((u: any) => (
                            <span
                              key={u.unit_guid}
                              className={classes.pill}
                              style={{
                                opacity: u.is_active ? 1 : 0.55,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                              }}
                            >
                              <span>{u.serial_number}</span> ({u.is_active ? 'Active' : 'Inactive'})
                              {u.is_active && (
                                <button
                                  type="button"
                                  style={{
                                    border: 'none',
                                    background: '#fee2e2',
                                    color: '#991b1b',
                                    borderRadius: '4px',
                                    padding: '1px 5px',
                                    cursor: 'pointer',
                                    fontSize: '0.72rem',
                                  }}
                                  onClick={() => handleDeactivateUnit(it.item_guid, u.unit_guid)}
                                >
                                  Deactivate
                                </button>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className={classes.badgeRow} style={{ marginTop: '10px' }}>
                        <input
                          type="text"
                          placeholder="Add serial(s): SN-201, SN-202"
                          value={unitInputsByItem[it.item_guid] || ''}
                          onChange={(e) =>
                            setUnitInputsByItem((prev) => ({
                              ...prev,
                              [it.item_guid]: e.target.value,
                            }))
                          }
                          style={{
                            padding: '6px 10px',
                            borderRadius: '6px',
                            border: '1px solid #c3dfc0',
                            fontSize: '0.82rem',
                          }}
                        />
                        <button
                          type="button"
                          className={classes.secondaryBtn}
                          style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                          onClick={() => handleAddUnitsToItem(it.item_guid)}
                        >
                          + Add Unit(s)
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* BLOCKED DATES CARD */}
            <div
              className={classes.card}
              style={{
                maxHeight: '520px',
                display: 'flex',
                flexDirection: 'column',
                boxSizing: 'border-box',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '12px',
                  flexShrink: 0,
                }}
              >
                <h3 style={{ margin: 0 }}>
                  Blocked Dates ({blackouts.length})
                </h3>
                <button
                  type="button"
                  className={classes.secondaryBtn}
                  style={{ padding: '6px 12px', fontSize: '0.84rem' }}
                  onClick={() => {
                    if (isAdmin) {
                      setBlackoutBusiness(targetBusiness !== 'all' ? targetBusiness : '');
                    } else {
                      setBlackoutBusiness(profile?.business || (targetBusiness !== 'all' ? targetBusiness : ''));
                    }
                    setBlackoutError(null);
                    setShowBlockDatesModal(true);
                  }}
                >
                  + Block Dates
                </button>
              </div>

              {blackouts.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: '#666' }}>
                  <p style={{ margin: 0 }}>No blocked dates configured.</p>
                </div>
              ) : (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    overflowY: 'auto',
                    maxHeight: '440px',
                    minHeight: 0,
                    flex: '1 1 auto',
                    paddingRight: '6px',
                  }}
                >
                  {blackouts.map((b) => (
                    <div
                      key={b.blackout_guid}
                      style={{
                        padding: '12px',
                        borderRadius: '10px',
                        border: '1px solid #d5ead0',
                        background: '#f8fcf7',
                        fontSize: '0.86rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span
                            className={`${classes.badge} ${
                              b.item_name ? classes.badgeCustomer : classes.badgeBusiness
                            }`}
                            style={{ marginRight: '8px' }}
                          >
                            {b.item_name || 'Entire Location'}
                          </span>
                          <strong>{b.date_range_text}</strong>
                        </div>
                        <button
                          type="button"
                          style={{
                            border: 'none',
                            background: '#fee2e2',
                            color: '#991b1b',
                            borderRadius: '4px',
                            padding: '3px 8px',
                            cursor: 'pointer',
                            fontSize: '0.76rem',
                            fontWeight: 600,
                          }}
                          onClick={() => handleDeleteBlackout(b.blackout_guid)}
                        >
                          Remove
                        </button>
                      </div>
                      <div style={{ color: '#444' }}>
                        <strong>Reason:</strong> {b.reason}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* MODAL: ADD NEW RENTAL ITEM */}
          {showAddItemModal && (
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Add New Rental Item"
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(15, 35, 12, 0.55)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1200,
                padding: '20px',
              }}
              onClick={() => setShowAddItemModal(false)}
            >
              <div
                className={classes.card}
                style={{
                  maxWidth: '580px',
                  width: '100%',
                  maxHeight: '90vh',
                  overflowY: 'auto',
                  background: '#ffffff',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <h3 style={{ margin: 0 }}>Add New Rental Item</h3>
                  <button
                    type="button"
                    style={{
                      border: 'none',
                      background: 'none',
                      fontSize: '1.25rem',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      color: '#666',
                    }}
                    onClick={() => setShowAddItemModal(false)}
                  >
                    &times;
                  </button>
                </div>
                <p style={{ marginTop: 0, color: '#666', fontSize: '0.88rem' }}>
                  Add equipment and unit serial numbers to your location&apos;s rental catalog.
                </p>
                <form onSubmit={handleCreateItem}>
                  <div className={classes.formGrid}>
                    <div className={classes.fieldGroup}>
                      <label htmlFor="modal-item-name">Item Name *</label>
                      <input
                        id="modal-item-name"
                        type="text"
                        required
                        placeholder="e.g. Electric Mountain Bike"
                        value={newItemName}
                        onChange={(e) => setNewItemName(e.target.value)}
                      />
                    </div>
                    <div className={classes.fieldGroup}>
                      <label htmlFor="modal-item-rate">Daily Rate ({settingsForm.currency || 'USD'}) *</label>
                      <input
                        id="modal-item-rate"
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        required
                        value={newItemRateDollars}
                        onChange={(e) => setNewItemRateDollars(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className={classes.fieldGroup} style={{ marginTop: '12px' }}>
                    <label htmlFor="modal-item-unit">Unit *</label>
                    <input
                      id="modal-item-unit"
                      type="text"
                      required
                      placeholder="e.g. Unit 1, SN-101 (or comma-separated: SN-101, SN-102)"
                      value={newItemSerials}
                      onChange={(e) => setNewItemSerials(e.target.value)}
                    />
                    <small style={{ color: '#476943', marginTop: '4px', display: 'block', fontSize: '0.8rem' }}>
                      Enter a unit identifier/serial (e.g. Unit 1, SN-101), multiple units comma-separated, or a quantity.
                    </small>
                  </div>

                  <div className={classes.fieldGroup} style={{ marginTop: '12px' }}>
                    <label htmlFor="modal-item-desc">Description</label>
                    <input
                      id="modal-item-desc"
                      type="text"
                      placeholder="Description shown on customer booking page"
                      value={newItemDesc}
                      onChange={(e) => setNewItemDesc(e.target.value)}
                    />
                  </div>
                  <div style={{ marginTop: '14px' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#174b0f', display: 'block', marginBottom: '4px' }}>
                      Item Image URLs
                    </label>
                    <p style={{ margin: '0 0 8px 0', fontSize: '0.8rem', color: '#555' }}>
                      Enter web image URLs. Click &ldquo;+ Add More Images&rdquo; to attach multiple photos for the customer gallery.
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {newItemImageUrls.map((url, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <input
                            type="url"
                            placeholder="https://example.com/item-photo.jpg"
                            value={url}
                            onChange={(e) => {
                              const updated = [...newItemImageUrls];
                              updated[idx] = e.target.value;
                              setNewItemImageUrls(updated);
                            }}
                            style={{
                              flex: 1,
                              padding: '8px 10px',
                              borderRadius: '6px',
                              border: '1px solid #c3dfc0',
                              fontSize: '0.88rem',
                            }}
                          />
                          {url.trim() && (
                            <img
                              src={formatImageUrl(url.trim())}
                              alt={`Preview ${idx + 1}`}
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).style.display = 'none';
                              }}
                              onLoad={(e) => {
                                (e.currentTarget as HTMLImageElement).style.display = 'block';
                              }}
                              style={{
                                width: '36px',
                                height: '36px',
                                objectFit: 'cover',
                                borderRadius: '4px',
                                border: '1px solid #b5d6ae',
                                display: 'none',
                                flexShrink: 0,
                              }}
                            />
                          )}
                          {newItemImageUrls.length > 1 && (
                            <button
                              type="button"
                              title="Remove this image URL"
                              style={{
                                border: 'none',
                                background: '#fee2e2',
                                color: '#991b1b',
                                borderRadius: '6px',
                                width: '32px',
                                height: '32px',
                                cursor: 'pointer',
                                fontSize: '1rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                              }}
                              onClick={() => {
                                const updated = newItemImageUrls.filter((_, i) => i !== idx);
                                setNewItemImageUrls(updated.length > 0 ? updated : ['']);
                              }}
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      className={classes.secondaryBtn}
                      style={{ marginTop: '8px', padding: '5px 12px', fontSize: '0.82rem' }}
                      onClick={() => setNewItemImageUrls([...newItemImageUrls, ''])}
                    >
                      + Add More Images
                    </button>
                  </div>
                  <div style={{ marginTop: '18px', display: 'flex', gap: '10px' }}>
                    <button type="submit" className={classes.primaryBtn} disabled={creatingItem}>
                      {creatingItem ? 'Adding...' : '+ Add Item'}
                    </button>
                    <button
                      type="button"
                      className={classes.secondaryBtn}
                      onClick={() => {
                        setNewItemImageUrls(['']);
                        setShowAddItemModal(false);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* MODAL: EDIT RENTAL ITEM */}
          {editingItem && (
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Edit Rental Item"
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(15, 35, 12, 0.55)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1200,
                padding: '20px',
              }}
              onClick={handleCloseEditItem}
            >
              <div
                className={classes.card}
                style={{
                  maxWidth: '580px',
                  width: '100%',
                  maxHeight: '90vh',
                  overflowY: 'auto',
                  background: '#ffffff',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <h3 style={{ margin: 0 }}>Edit Rental Item</h3>
                  <button
                    type="button"
                    style={{
                      border: 'none',
                      background: 'none',
                      fontSize: '1.25rem',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      color: '#666',
                    }}
                    onClick={handleCloseEditItem}
                  >
                    &times;
                  </button>
                </div>
                <p style={{ marginTop: 0, color: '#666', fontSize: '0.88rem' }}>
                  Update details, pricing, availability, and photo URLs for <strong>{editingItem.name}</strong>.
                </p>
                <form onSubmit={handleSaveEditItem}>
                  <div className={classes.formGrid}>
                    <div className={classes.fieldGroup}>
                      <label htmlFor="edit-modal-item-name">Item Name *</label>
                      <input
                        id="edit-modal-item-name"
                        type="text"
                        required
                        placeholder="e.g. Electric Mountain Bike"
                        value={editItemName}
                        onChange={(e) => setEditItemName(e.target.value)}
                      />
                    </div>
                    <div className={classes.fieldGroup}>
                      <label htmlFor="edit-modal-item-rate">Daily Rate ({settingsForm.currency || 'USD'}) *</label>
                      <input
                        id="edit-modal-item-rate"
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        required
                        value={editItemRateDollars}
                        onChange={(e) => setEditItemRateDollars(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className={classes.fieldGroup} style={{ marginTop: '12px' }}>
                    <label htmlFor="edit-modal-item-desc">Description</label>
                    <input
                      id="edit-modal-item-desc"
                      type="text"
                      placeholder="Description shown on customer booking page"
                      value={editItemDesc}
                      onChange={(e) => setEditItemDesc(e.target.value)}
                    />
                  </div>

                  <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="checkbox"
                      id="edit-modal-is-active"
                      checked={editItemIsActive}
                      onChange={(e) => setEditItemIsActive(e.target.checked)}
                      style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                    />
                    <label htmlFor="edit-modal-is-active" style={{ cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600, color: '#174b0f', margin: 0 }}>
                      Item is Active &amp; Available for Reservations
                    </label>
                  </div>

                  <div style={{ marginTop: '14px' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#174b0f', display: 'block', marginBottom: '4px' }}>
                      Item Image URLs
                    </label>
                    <p style={{ margin: '0 0 8px 0', fontSize: '0.8rem', color: '#555' }}>
                      Enter image URLs. Click &ldquo;+ Add More Images&rdquo; to attach multiple photos for the customer gallery.
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {editItemImageUrls.map((url, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <input
                            type="url"
                            placeholder="https://example.com/item-photo.jpg"
                            value={url}
                            onChange={(e) => {
                              const updated = [...editItemImageUrls];
                              updated[idx] = e.target.value;
                              setEditItemImageUrls(updated);
                            }}
                            style={{
                              flex: 1,
                              padding: '8px 10px',
                              borderRadius: '6px',
                              border: '1px solid #c3dfc0',
                              fontSize: '0.88rem',
                            }}
                          />
                          {url.trim() && (
                            <img
                              src={formatImageUrl(url.trim())}
                              alt={`Preview ${idx + 1}`}
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).style.display = 'none';
                              }}
                              onLoad={(e) => {
                                (e.currentTarget as HTMLImageElement).style.display = 'block';
                              }}
                              style={{
                                width: '36px',
                                height: '36px',
                                objectFit: 'cover',
                                borderRadius: '4px',
                                border: '1px solid #b5d6ae',
                                display: 'none',
                                flexShrink: 0,
                              }}
                            />
                          )}
                          {editItemImageUrls.length > 1 && (
                            <button
                              type="button"
                              title="Remove this image URL"
                              style={{
                                border: 'none',
                                background: '#fee2e2',
                                color: '#991b1b',
                                borderRadius: '6px',
                                width: '32px',
                                height: '32px',
                                cursor: 'pointer',
                                fontSize: '1rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                              }}
                              onClick={() => {
                                const updated = editItemImageUrls.filter((_, i) => i !== idx);
                                setEditItemImageUrls(updated.length > 0 ? updated : ['']);
                              }}
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      className={classes.secondaryBtn}
                      style={{ marginTop: '8px', padding: '5px 12px', fontSize: '0.82rem' }}
                      onClick={() => setEditItemImageUrls([...editItemImageUrls, ''])}
                    >
                      + Add More Images
                    </button>
                  </div>

                  <div style={{ marginTop: '18px', display: 'flex', gap: '10px' }}>
                    <button type="submit" className={classes.primaryBtn} disabled={savingEditItem}>
                      {savingEditItem ? 'Saving Changes...' : 'Save Changes'}
                    </button>
                    <button
                      type="button"
                      className={classes.secondaryBtn}
                      onClick={handleCloseEditItem}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* MODAL: BLOCK DATES FOR MAINTENANCE OR HOLIDAYS */}
          {showBlockDatesModal && (
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Block Dates for Maintenance or Holidays"
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(15, 35, 12, 0.55)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1200,
                padding: '20px',
              }}
              onClick={() => {
                setShowBlockDatesModal(false);
                setBlackoutError(null);
              }}
            >
              <div
                className={classes.card}
                style={{
                  maxWidth: '580px',
                  width: '100%',
                  maxHeight: '90vh',
                  overflowY: 'auto',
                  background: '#ffffff',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <h3 style={{ margin: 0 }}>Block Dates for Maintenance or Holidays</h3>
                  <button
                    type="button"
                    style={{
                      border: 'none',
                      background: 'none',
                      fontSize: '1.25rem',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      color: '#666',
                    }}
                    onClick={() => {
                      setShowBlockDatesModal(false);
                      setBlackoutError(null);
                    }}
                  >
                    &times;
                  </button>
                </div>
                <p style={{ marginTop: 0, color: '#666', fontSize: '0.88rem' }}>
                  Prevent online bookings for a specific item or the entire location during selected dates.
                </p>

                {blackoutError && (
                  <div
                    style={{
                      marginBottom: '14px',
                      padding: '10px 14px',
                      background: '#fee2e2',
                      border: '1px solid #fca5a5',
                      color: '#991b1b',
                      borderRadius: '8px',
                      fontSize: '0.88rem',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <span>⚠️</span>
                    <span>{blackoutError}</span>
                  </div>
                )}

                <form onSubmit={handleCreateBlackout}>
                  <div className={classes.formGrid}>
                    <div className={classes.fieldGroup}>
                      <label htmlFor="modal-blk-business">Business *</label>
                      {isAdmin ? (
                        <select
                          id="modal-blk-business"
                          value={blackoutBusiness}
                          onChange={(e) => {
                            setBlackoutBusiness(e.target.value);
                            setBlackoutItemGuid('');
                            setBlackoutError(null);
                          }}
                          required
                        >
                          <option value="">Select Business...</option>
                          {filterBusinessOptions.map((b) => (
                            <option key={b.business} value={b.business}>
                              {formatUserFriendlyBusinessName(b.business, b.business_name)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          id="modal-blk-business"
                          type="text"
                          value={activeBusinessFriendlyName}
                          disabled
                          readOnly
                        />
                      )}
                    </div>

                    <div className={classes.fieldGroup}>
                      <label htmlFor="modal-blk-item">Applies To</label>
                      <select
                        id="modal-blk-item"
                        value={blackoutItemGuid}
                        onChange={(e) => {
                          setBlackoutItemGuid(e.target.value);
                          setBlackoutError(null);
                        }}
                      >
                        <option value="">Select Target: Entire Location (Default)</option>
                        {catalogItems
                          .filter(
                            (it) =>
                              !blackoutBusiness ||
                              !it.business ||
                              it.business.toLowerCase() === blackoutBusiness.toLowerCase()
                          )
                          .map((it) => (
                            <option key={it.item_guid} value={it.item_guid}>
                              {it.name}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div className={classes.fieldGroup}>
                      <label htmlFor="modal-blk-reason">Reason *</label>
                      <input
                        id="modal-blk-reason"
                        type="text"
                        required
                        placeholder="e.g. Scheduled maintenance, holiday closure"
                        value={blackoutReason}
                        onChange={(e) => {
                          setBlackoutReason(e.target.value);
                          setBlackoutError(null);
                        }}
                      />
                    </div>
                    <div className={classes.fieldGroup}>
                      <label htmlFor="modal-blk-start">Start Date *</label>
                      <input
                        id="modal-blk-start"
                        type="date"
                        required
                        value={blackoutStartDate}
                        onChange={(e) => {
                          setBlackoutStartDate(e.target.value);
                          setBlackoutError(null);
                        }}
                      />
                    </div>
                    <div className={classes.fieldGroup}>
                      <label htmlFor="modal-blk-end">End Date *</label>
                      <input
                        id="modal-blk-end"
                        type="date"
                        required
                        value={blackoutEndDate}
                        onChange={(e) => {
                          setBlackoutEndDate(e.target.value);
                          setBlackoutError(null);
                        }}
                      />
                    </div>
                  </div>
                  <div className={classes.checkboxRow} style={{ marginTop: '10px' }}>
                    <input
                      id="modal-blk-force"
                      type="checkbox"
                      checked={blackoutForceOverride}
                      onChange={(e) => setBlackoutForceOverride(e.target.checked)}
                    />
                    <label htmlFor="modal-blk-force">
                      Allow even if existing reservations overlap these dates
                    </label>
                  </div>
                  <div style={{ marginTop: '18px', display: 'flex', gap: '10px' }}>
                    <button type="submit" className={classes.primaryBtn}>
                      + Block Dates
                    </button>
                    <button
                      type="button"
                      className={classes.secondaryBtn}
                      onClick={() => {
                        setShowBlockDatesModal(false);
                        setBlackoutError(null);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'reservations' && (
        <div className={classes.gridTwo}>
          <div ref={overrideFormRef} className={classes.card} style={{ position: 'relative' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                flexWrap: 'wrap',
                gap: '8px',
              }}
            >
              <div>
                <h3 style={{ margin: 0, color: '#163b11' }}>Modify or Cancel a Reservation</h3>
                <p style={{ margin: '4px 0 0', color: '#4b6345', fontSize: '0.88rem' }}>
                  Update reservation dates, process cancellations, or adjust fee waivers on behalf of a
                  customer.
                </p>
              </div>
              {overrideResGuid && (
                <button
                  type="button"
                  className={classes.secondaryBtn}
                  style={{ fontSize: '0.8rem', padding: '5px 10px' }}
                  onClick={handleClearOverrideSelection}
                >
                  ✕ Deselect
                </button>
              )}
            </div>

            <form onSubmit={handleSupervisorOverride} style={{ marginTop: '16px' }}>
              <div className={classes.fieldGroup}>
                <label htmlFor="override-res-select">
                  Select Reservation <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  id="override-res-select"
                  value={overrideResGuid}
                  onChange={(e) => handleSelectReservationForOverride(e.target.value)}
                >
                  <option value="">-- Choose a reservation to modify or cancel --</option>
                  {tenantReservations.length === 0 && (
                    <option value="" disabled>
                      No reservations found
                    </option>
                  )}
                  {tenantReservations.map((r) => {
                    const custName =
                      [r.customer_first_name, r.customer_last_name].filter(Boolean).join(' ') ||
                      r.customer_name ||
                      'Guest';
                    return (
                      <option key={r.reservation_guid} value={r.reservation_guid}>
                        {r.item_name || 'Rental Item'} ({r.status}) — {custName} (
                        {r.start_date || 'N/A'} to {r.end_date || 'N/A'})
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Selected Reservation Details Card */}
              {selectedOverrideRes && (
                <div
                  style={{
                    marginTop: '14px',
                    padding: '14px 16px',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #f4faf2 0%, #edf7eb 100%)',
                    border: '1px solid #cce5c6',
                    boxShadow: '0 2px 6px rgba(23, 75, 15, 0.05)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '8px',
                      borderBottom: '1px solid #d8ebd3',
                      paddingBottom: '10px',
                      marginBottom: '10px',
                    }}
                  >
                    <div>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          color: '#577850',
                          fontWeight: 700,
                        }}
                      >
                        Active Selection
                      </span>
                      <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#14380f' }}>
                        {selectedOverrideRes.item_name || 'Rental Item'}
                        {selectedOverrideRes.serial_number && (
                          <span
                            style={{
                              marginLeft: '8px',
                              fontSize: '0.85rem',
                              fontWeight: 600,
                              color: '#3f6739',
                            }}
                          >
                            ({selectedOverrideRes.serial_number})
                          </span>
                        )}
                      </div>
                    </div>
                    <span
                      className={`${classes.pill} ${
                        selectedOverrideRes.status === 'CONFIRMED'
                          ? classes.pillHighlight
                          : selectedOverrideRes.status === 'CANCELLED'
                          ? classes.pillDanger
                          : selectedOverrideRes.status === 'HOLD'
                          ? classes.pillWarn
                          : classes.pillInfo
                      }`}
                    >
                      {selectedOverrideRes.status}
                    </span>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                      gap: '12px',
                      fontSize: '0.84rem',
                      color: '#284e22',
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          color: '#52754c',
                          textTransform: 'uppercase',
                        }}
                      >
                        Customer
                      </div>
                      <div style={{ fontWeight: 700, color: '#163b11' }}>
                        {[
                          selectedOverrideRes.customer_first_name,
                          selectedOverrideRes.customer_last_name,
                        ]
                          .filter(Boolean)
                          .join(' ') ||
                          selectedOverrideRes.customer_name ||
                          'Guest'}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#4a6d44' }}>
                        {selectedOverrideRes.customer_email || 'No email on file'}
                      </div>
                      {selectedOverrideRes.customer_phone && (
                        <div style={{ fontSize: '0.8rem', color: '#4a6d44' }}>
                          {selectedOverrideRes.customer_phone}
                        </div>
                      )}
                    </div>

                    <div>
                      <div
                        style={{
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          color: '#52754c',
                          textTransform: 'uppercase',
                        }}
                      >
                        Current Rental Dates
                      </div>
                      <div style={{ fontWeight: 700, color: '#163b11' }}>
                        {selectedOverrideRes.start_date || 'N/A'} →{' '}
                        {selectedOverrideRes.end_date || 'N/A'}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#4a6d44' }}>
                        Duration: {selectedOverrideRes.days || 1} day(s)
                      </div>
                    </div>

                    <div>
                      <div
                        style={{
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          color: '#52754c',
                          textTransform: 'uppercase',
                        }}
                      >
                        Billing / Total
                      </div>
                      <div style={{ fontWeight: 700, color: '#163b11', fontSize: '0.98rem' }}>
                        $
                        {(
                          ((selectedOverrideRes.total_cents ??
                            selectedOverrideRes.total_paid_cents) ||
                            0) /
                          100
                        ).toFixed(2)}
                      </div>
                      <div style={{ fontSize: '0.76rem', color: '#52754c' }}>
                        ID: {selectedOverrideRes.reservation_guid.slice(0, 8)}...
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Selection & Fee Handling */}
              <div className={classes.formGrid} style={{ marginTop: '14px' }}>
                <div className={classes.fieldGroup}>
                  <label htmlFor="override-action-select">
                    Action <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <select
                    id="override-action-select"
                    value={overrideAction}
                    onChange={(e) => handleActionChange(e.target.value as any)}
                    disabled={!overrideResGuid}
                  >
                    <option value="">Select Action...</option>
                    <option value="CANCEL">❌ Cancel Reservation</option>
                    <option value="RESCHEDULE">🔄 Reschedule Dates</option>
                    <option value="ADD_DAYS">➕ Extend Rental (Add Days)</option>
                    <option value="REMOVE_DAYS">➖ Shorten Rental (Remove Days)</option>
                  </select>
                </div>

                <div className={classes.fieldGroup}>
                  <label htmlFor="override-waive-fee">Fee Handling</label>
                  <select
                    id="override-waive-fee"
                    value={overrideWaiveFee ? 'true' : 'false'}
                    onChange={(e) => setOverrideWaiveFee(e.target.value === 'true')}
                    disabled={!overrideResGuid}
                  >
                    <option value="true">Waive Late Fee ($0.00)</option>
                    <option value="false">
                      Apply Standard Late Fee ({settingsForm.late_fee_percentage || 25}%)
                    </option>
                  </select>
                </div>
              </div>

              {/* Action-Specific Context Notice */}
              {overrideAction === 'CANCEL' && (
                <div
                  style={{
                    marginTop: '14px',
                    padding: '12px 14px',
                    borderRadius: '8px',
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    color: '#991b1b',
                    fontSize: '0.86rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <span style={{ fontSize: '1.2rem' }}>⚠️</span>
                  <div>
                    <strong>Cancellation Notice:</strong> Cancelling will release the reserved unit
                    and mark this booking as CANCELLED.{' '}
                    {overrideWaiveFee
                      ? 'The late fee is WAIVED ($0.00).'
                      : `A ${settingsForm.late_fee_percentage || 25}% standard late fee will be applied.`}
                  </div>
                </div>
              )}

              {/* Date Pickers for Rescheduling or Modifying Days */}
              {overrideAction && overrideAction !== 'CANCEL' && (
                <>
                  <div className={classes.formGrid} style={{ marginTop: '14px' }}>
                    <div className={classes.fieldGroup}>
                      <label htmlFor="override-start-date">
                        New Start Date <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <input
                        id="override-start-date"
                        type="date"
                        style={{
                          cursor: 'pointer',
                          ...(overrideDateError || !durationValidation.valid
                            ? { borderColor: '#ef4444' }
                            : {}),
                        }}
                        onClick={(e) => {
                          try {
                            e.currentTarget.showPicker();
                          } catch {}
                        }}
                        value={overrideStartDate}
                        onChange={(e) => {
                          const val = e.target.value;
                          setOverrideStartDate(val);
                          setOverrideDateError(null);
                          if (val && overrideAction === 'RESCHEDULE') {
                            // Automatically maintain exact same duration when rescheduling
                            setOverrideEndDate(addDaysToIsoDate(val, originalDurationDays || 1));
                          } else if (val && overrideAction === 'ADD_DAYS') {
                            const minEnd = addDaysToIsoDate(val, (originalDurationDays || 1) + 1);
                            if (!overrideEndDate || overrideEndDate < minEnd) {
                              setOverrideEndDate(minEnd);
                            }
                          } else if (val && overrideAction === 'REMOVE_DAYS') {
                            const maxEnd = addDaysToIsoDate(
                              val,
                              Math.max(1, (originalDurationDays || 1) - 1)
                            );
                            if (!overrideEndDate || overrideEndDate > maxEnd) {
                              setOverrideEndDate(maxEnd);
                            }
                          }
                        }}
                        required
                      />
                    </div>

                    <div className={classes.fieldGroup}>
                      <label htmlFor="override-end-date">
                        New End Date <span style={{ color: '#ef4444' }}>*</span>
                        {overrideAction === 'ADD_DAYS' && minExtendedEndDate && (
                          <span
                            style={{
                              fontSize: '0.78rem',
                              color: '#15803d',
                              fontWeight: 600,
                              marginLeft: '6px',
                            }}
                          >
                            (Min: {minExtendedEndDate})
                          </span>
                        )}
                        {overrideAction === 'REMOVE_DAYS' && maxShortenedEndDate && (
                          <span
                            style={{
                              fontSize: '0.78rem',
                              color: '#b91c1c',
                              fontWeight: 600,
                              marginLeft: '6px',
                            }}
                          >
                            (Max: {maxShortenedEndDate})
                          </span>
                        )}
                      </label>
                      <input
                        ref={overrideEndDateInputRef}
                        id="override-end-date"
                        type="date"
                        min={
                          overrideAction === 'ADD_DAYS'
                            ? minExtendedEndDate
                            : overrideStartDate || undefined
                        }
                        max={overrideAction === 'REMOVE_DAYS' ? maxShortenedEndDate : undefined}
                        style={{
                          cursor: 'pointer',
                          ...(overrideDateError || !durationValidation.valid
                            ? { borderColor: '#ef4444' }
                            : {}),
                        }}
                        onClick={(e) => {
                          try {
                            e.currentTarget.showPicker();
                          } catch {}
                        }}
                        value={overrideEndDate}
                        onChange={(e) => {
                          const val = e.target.value;
                          setOverrideEndDate(val);
                          setOverrideDateError(null);
                        }}
                        required
                      />
                    </div>
                  </div>

                  {/* Duration comparison banner */}
                  <div
                    style={{
                      marginTop: '10px',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      background: durationValidation.valid ? '#f0fdf4' : '#fef2f2',
                      border: `1px solid ${durationValidation.valid ? '#bbf7d0' : '#fecaca'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '8px',
                      fontSize: '0.84rem',
                    }}
                  >
                    <div
                      style={{
                        color: durationValidation.valid ? '#166534' : '#991b1b',
                        fontWeight: 600,
                      }}
                    >
                      <span>Duration: </span>
                      <strong>{originalDurationDays} day(s)</strong>
                      <span> → </span>
                      <strong>{currentSelectionDays} day(s)</strong>
                      {durationValidation.delta > 0 && (
                        <span style={{ marginLeft: '6px', color: '#15803d', fontWeight: 700 }}>
                          (+{durationValidation.delta} day{durationValidation.delta > 1 ? 's' : ''})
                        </span>
                      )}
                      {durationValidation.delta < 0 && (
                        <span style={{ marginLeft: '6px', color: '#b91c1c', fontWeight: 700 }}>
                          ({durationValidation.delta} day
                          {Math.abs(durationValidation.delta) > 1 ? 's' : ''})
                        </span>
                      )}
                      {durationValidation.delta === 0 && (
                        <span style={{ marginLeft: '6px', color: '#4b5563' }}>(same duration)</span>
                      )}
                    </div>
                    {overrideAction === 'ADD_DAYS' && (
                      <span style={{ fontSize: '0.78rem', color: '#15803d', fontWeight: 700 }}>
                        ➕ Extending rental (adding days)
                      </span>
                    )}
                    {overrideAction === 'REMOVE_DAYS' && (
                      <span style={{ fontSize: '0.78rem', color: '#b91c1c', fontWeight: 700 }}>
                        ➖ Shortening rental (reducing days)
                      </span>
                    )}
                    {overrideAction === 'RESCHEDULE' && (
                      <span style={{ fontSize: '0.78rem', color: '#0369a1', fontWeight: 700 }}>
                        🔄 Rescheduling (same duration)
                      </span>
                    )}
                  </div>

                  {(!durationValidation.valid || overrideDateError) && (
                    <p
                      style={{
                        margin: '8px 0 0',
                        color: '#dc2626',
                        fontSize: '0.83rem',
                        fontWeight: 600,
                        background: '#fef2f2',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        border: '1px solid #fecaca',
                      }}
                    >
                      ⚠️ {overrideDateError || durationValidation.error}
                    </p>
                  )}
                </>
              )}

              <div className={classes.fieldGroup} style={{ marginTop: '14px' }}>
                <label htmlFor="override-reason">
                  Reason for Override <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  id="override-reason"
                  type="text"
                  placeholder="e.g. Customer requested date change, weather reschedule, courtesy fee waiver..."
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  disabled={!overrideResGuid}
                  required
                />
              </div>

              <div
                style={{
                  marginTop: '16px',
                  display: 'flex',
                  gap: '10px',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <button
                  type="submit"
                  className={overrideAction === 'CANCEL' ? classes.dangerBtn : classes.primaryBtn}
                  disabled={
                    !overrideResGuid ||
                    !overrideAction ||
                    savingOverride ||
                    (overrideAction !== 'CANCEL' && !durationValidation.valid)
                  }
                >
                  {savingOverride
                    ? 'Processing...'
                    : overrideAction === 'CANCEL'
                    ? `Cancel Reservation (${overrideWaiveFee ? 'Fee Waived' : 'Fee Applies'})`
                    : overrideAction === 'RESCHEDULE'
                    ? 'Confirm Reschedule'
                    : overrideAction === 'ADD_DAYS'
                    ? 'Extend Rental'
                    : overrideAction === 'REMOVE_DAYS'
                    ? 'Shorten Rental'
                    : 'Apply Change'}
                </button>

                {overrideResGuid && (
                  <button
                    type="button"
                    className={classes.secondaryBtn}
                    onClick={handleClearOverrideSelection}
                    disabled={savingOverride}
                  >
                    Clear
                  </button>
                )}
              </div>
            </form>
          </div>

          <div className={classes.card}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px',
                flexWrap: 'wrap',
                gap: '6px',
              }}
            >
              <h3 style={{ margin: 0, color: '#163b11' }}>
                All Reservations ({tenantReservations.length})
              </h3>
              {tenantReservations.length > 0 && (
                <span style={{ fontSize: '0.8rem', color: '#4b6345', fontWeight: 600 }}>
                  Select any booking to modify or cancel
                </span>
              )}
            </div>

            {tenantReservations.length === 0 ? (
              <p>No reservations found for this location.</p>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  maxHeight: '580px',
                  overflowY: 'auto',
                  paddingRight: '4px',
                }}
              >
                {tenantReservations.map((res) => {
                  const isSelected = overrideResGuid === res.reservation_guid;
                  const custName =
                    [res.customer_first_name, res.customer_last_name].filter(Boolean).join(' ') ||
                    res.customer_name ||
                    'Guest';

                  return (
                    <div
                      key={res.reservation_guid}
                      style={{
                        padding: '12px 14px',
                        borderRadius: '10px',
                        border: isSelected ? '2px solid #2e7d32' : '1px solid #d5ead0',
                        background: isSelected ? '#f2f9f0' : '#f8fcf7',
                        boxShadow: isSelected ? '0 0 0 2px rgba(46, 125, 50, 0.15)' : 'none',
                        transition: 'all 0.18s ease-in-out',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '8px',
                          flexWrap: 'wrap',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <strong style={{ color: '#163b11', fontSize: '0.94rem' }}>
                            {res.item_name || 'Rental Item'}
                          </strong>
                          {res.serial_number && (
                            <span
                              style={{
                                fontSize: '0.8rem',
                                color: '#4a6d44',
                                fontWeight: 600,
                              }}
                            >
                              ({res.serial_number})
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {isSelected && (
                            <span
                              style={{
                                fontSize: '0.72rem',
                                fontWeight: 800,
                                background: '#2e7d32',
                                color: '#ffffff',
                                padding: '2px 8px',
                                borderRadius: '999px',
                              }}
                            >
                              EDITING
                            </span>
                          )}
                          <span
                            className={`${classes.pill} ${
                              res.status === 'CONFIRMED'
                                ? classes.pillHighlight
                                : res.status === 'CANCELLED'
                                ? classes.pillDanger
                                : res.status === 'HOLD'
                                ? classes.pillWarn
                                : classes.pillInfo
                            }`}
                          >
                            {res.status}
                          </span>
                        </div>
                      </div>

                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                          gap: '6px 12px',
                          fontSize: '0.82rem',
                          color: '#345530',
                          marginTop: '8px',
                          paddingTop: '8px',
                          borderTop: '1px solid #e4f0e1',
                        }}
                      >
                        <div>
                          <strong>Customer:</strong> {custName}
                          {res.customer_phone && ` • ${res.customer_phone}`}
                        </div>
                        <div>
                          <strong>Dates:</strong> {res.start_date || 'N/A'} to{' '}
                          {res.end_date || 'N/A'} ({res.days || 1} day(s))
                        </div>
                        <div>
                          <strong>Total:</strong> $
                          {(((res.total_cents ?? res.total_paid_cents) || 0) / 100).toFixed(2)}
                        </div>
                      </div>

                      <div
                        style={{
                          marginTop: '10px',
                          display: 'flex',
                          justifyContent: 'flex-end',
                          gap: '8px',
                        }}
                      >
                        <button
                          type="button"
                          className={classes.secondaryBtn}
                          style={{
                            fontSize: '0.8rem',
                            padding: '4px 12px',
                            fontWeight: isSelected ? 800 : 700,
                            borderColor: isSelected ? '#2e7d32' : undefined,
                            background: isSelected ? '#e4f4e0' : undefined,
                          }}
                          onClick={() => {
                            handleSelectReservationForOverride(res.reservation_guid);
                            overrideFormRef.current?.scrollIntoView({
                              behavior: 'smooth',
                              block: 'start',
                            });
                          }}
                        >
                          {isSelected ? '✓ Currently Editing' : 'Modify / Cancel'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <form className={classes.card} onSubmit={handleCreateManualReservation}>
            <h3>Create Walk-In or Phone Reservation</h3>
            <p>Book a reservation directly on behalf of a customer.</p>
            <div className={classes.formGrid}>
              <div className={classes.fieldGroup}>
                <label htmlFor="man-item">
                  Rental Item <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  id="man-item"
                  value={manualItemGuid}
                  style={manualReservationErrors.item_guid ? { borderColor: '#ef4444' } : undefined}
                  onChange={(e) => {
                    setManualItemGuid(e.target.value);
                    if (manualReservationErrors.item_guid) {
                      setManualReservationErrors((prev) => ({ ...prev, item_guid: '' }));
                    }
                  }}
                >
                  <option value="">Select Rental Item...</option>
                  {catalogItems.map((it) => (
                    <option key={it.item_guid} value={it.item_guid}>
                      {it.name} (${((it.daily_rate_cents || 0) / 100).toFixed(2)}/day)
                    </option>
                  ))}
                </select>
                {manualReservationErrors.item_guid && (
                  <p style={{ margin: '4px 0 0', color: '#dc2626', fontSize: '0.82rem', fontWeight: 600 }}>
                    {manualReservationErrors.item_guid}
                  </p>
                )}
              </div>
              <div className={classes.fieldGroup}>
                <label htmlFor="man-pay-opt">
                  Payment Method <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  id="man-pay-opt"
                  value={manualPaymentOption}
                  style={manualReservationErrors.payment_option ? { borderColor: '#ef4444' } : undefined}
                  onChange={(e) => {
                    setManualPaymentOption(e.target.value as 'OFFLINE_CASH' | 'PAYMENT_LINK' | '');
                    if (manualReservationErrors.payment_option) {
                      setManualReservationErrors((prev) => ({ ...prev, payment_option: '' }));
                    }
                  }}
                >
                  <option value="">Select Payment Method...</option>
                  <option value="OFFLINE_CASH">In-Person / Cash</option>
                  <option value="PAYMENT_LINK">Send Payment Link</option>
                </select>
                {manualReservationErrors.payment_option && (
                  <p style={{ margin: '4px 0 0', color: '#dc2626', fontSize: '0.82rem', fontWeight: 600 }}>
                    {manualReservationErrors.payment_option}
                  </p>
                )}
              </div>
              <div className={classes.fieldGroup}>
                <label htmlFor="man-start">
                  Start Date <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  id="man-start"
                  type="date"
                  style={{
                    cursor: 'pointer',
                    ...(manualReservationErrors.start_date ? { borderColor: '#ef4444' } : {}),
                  }}
                  onClick={(e) => {
                    try {
                      e.currentTarget.showPicker();
                    } catch {}
                  }}
                  value={manualStartDate}
                  onChange={(e) => {
                    const val = e.target.value;
                    setManualStartDate(val);
                    setManualReservationErrors((prev) => {
                      const next = { ...prev, start_date: '' };
                      if (val && manualEndDate && val > manualEndDate) {
                        next.end_date = 'Return date cannot be earlier than pick-up date';
                      } else if (
                        val &&
                        manualEndDate &&
                        prev.end_date === 'Return date cannot be earlier than pick-up date'
                      ) {
                        next.end_date = '';
                      }
                      return next;
                    });
                    if (val) {
                      setTimeout(() => {
                        try {
                          manualEndDateInputRef.current?.showPicker();
                          manualEndDateInputRef.current?.focus();
                        } catch {}
                      }, 150);
                    }
                  }}
                />
                {manualReservationErrors.start_date && (
                  <p style={{ margin: '4px 0 0', color: '#dc2626', fontSize: '0.82rem', fontWeight: 600 }}>
                    {manualReservationErrors.start_date}
                  </p>
                )}
              </div>
              <div className={classes.fieldGroup}>
                <label htmlFor="man-end">
                  End Date <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  ref={manualEndDateInputRef}
                  id="man-end"
                  type="date"
                  min={manualStartDate || undefined}
                  style={{
                    cursor: 'pointer',
                    ...(manualReservationErrors.end_date ? { borderColor: '#ef4444' } : {}),
                  }}
                  onClick={(e) => {
                    try {
                      e.currentTarget.showPicker();
                    } catch {}
                  }}
                  value={manualEndDate}
                  onChange={(e) => {
                    const val = e.target.value;
                    setManualEndDate(val);
                    setManualReservationErrors((prev) => {
                      const next = { ...prev, end_date: '' };
                      if (manualStartDate && val && manualStartDate > val) {
                        next.end_date = 'Return date cannot be earlier than pick-up date';
                      }
                      return next;
                    });
                  }}
                />
                {manualReservationErrors.end_date && (
                  <p style={{ margin: '4px 0 0', color: '#dc2626', fontSize: '0.82rem', fontWeight: 600 }}>
                    {manualReservationErrors.end_date}
                  </p>
                )}
              </div>
              <div className={classes.fieldGroup}>
                <label htmlFor="man-first-name">
                  Customer First Name <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  id="man-first-name"
                  type="text"
                  placeholder="First Name"
                  value={manualCustomer.first_name}
                  style={manualReservationErrors.first_name ? { borderColor: '#ef4444' } : undefined}
                  onChange={(e) => {
                    setManualCustomer({ ...manualCustomer, first_name: e.target.value });
                    if (manualReservationErrors.first_name) {
                      setManualReservationErrors((prev) => ({ ...prev, first_name: '' }));
                    }
                  }}
                />
                {manualReservationErrors.first_name && (
                  <p style={{ margin: '4px 0 0', color: '#dc2626', fontSize: '0.82rem', fontWeight: 600 }}>
                    {manualReservationErrors.first_name}
                  </p>
                )}
              </div>
              <div className={classes.fieldGroup}>
                <label htmlFor="man-last-name">
                  Customer Last Name <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  id="man-last-name"
                  type="text"
                  placeholder="Last Name"
                  value={manualCustomer.last_name}
                  style={manualReservationErrors.last_name ? { borderColor: '#ef4444' } : undefined}
                  onChange={(e) => {
                    setManualCustomer({ ...manualCustomer, last_name: e.target.value });
                    if (manualReservationErrors.last_name) {
                      setManualReservationErrors((prev) => ({ ...prev, last_name: '' }));
                    }
                  }}
                />
                {manualReservationErrors.last_name && (
                  <p style={{ margin: '4px 0 0', color: '#dc2626', fontSize: '0.82rem', fontWeight: 600 }}>
                    {manualReservationErrors.last_name}
                  </p>
                )}
              </div>
              <div className={classes.fieldGroup}>
                <label htmlFor="man-email">
                  Customer Email{' '}
                  <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>
                    (Either email or phone <span style={{ color: '#ef4444' }}>*</span>)
                  </span>
                </label>
                <input
                  id="man-email"
                  type="email"
                  placeholder="customer@example.com"
                  value={manualCustomer.email}
                  style={manualReservationErrors.email ? { borderColor: '#ef4444' } : undefined}
                  onChange={(e) => {
                    setManualCustomer({ ...manualCustomer, email: e.target.value });
                    if (manualReservationErrors.email || manualReservationErrors.phone_number) {
                      setManualReservationErrors((prev) => ({
                        ...prev,
                        email: '',
                        ...(prev.phone_number === 'Either email or phone number is required.' ? { phone_number: '' } : {}),
                      }));
                    }
                  }}
                />
                {manualReservationErrors.email && (
                  <p style={{ margin: '4px 0 0', color: '#dc2626', fontSize: '0.82rem', fontWeight: 600 }}>
                    {manualReservationErrors.email}
                  </p>
                )}
              </div>
              <div className={classes.fieldGroup}>
                <label htmlFor="man-phone">
                  Customer Phone{' '}
                  <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>
                    (Either email or phone <span style={{ color: '#ef4444' }}>*</span>)
                  </span>
                </label>
                <input
                  id="man-phone"
                  type="text"
                  placeholder="(555) 000-0000"
                  value={manualCustomer.phone_number}
                  style={manualReservationErrors.phone_number ? { borderColor: '#ef4444' } : undefined}
                  onChange={(e) => {
                    setManualCustomer({ ...manualCustomer, phone_number: e.target.value });
                    if (manualReservationErrors.email || manualReservationErrors.phone_number) {
                      setManualReservationErrors((prev) => ({
                        ...prev,
                        phone_number: '',
                        ...(prev.email === 'Either email or phone number is required.' ? { email: '' } : {}),
                      }));
                    }
                  }}
                />
                {manualReservationErrors.phone_number && (
                  <p style={{ margin: '4px 0 0', color: '#dc2626', fontSize: '0.82rem', fontWeight: 600 }}>
                    {manualReservationErrors.phone_number}
                  </p>
                )}
              </div>
            </div>
            <div style={{ marginTop: '12px' }}>
              <button type="submit" className={classes.primaryBtn} disabled={!manualItemGuid}>
                + Create Reservation
              </button>
            </div>
          </form>

          <div className={classes.card}>
            <h3>Refunds &amp; Payment Follow-Ups ({refundQueue.length})</h3>
            {refundQueue.length === 0 ? (
              <p>No pending refunds or payment follow-ups.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {refundQueue.map((p) => (
                  <div
                    key={p.payment_guid}
                    style={{
                      padding: '10px',
                      borderRadius: '8px',
                      border: '1px solid #d5ead0',
                      background: '#f8fcf7',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '8px',
                    }}
                  >
                    <div style={{ fontSize: '0.84rem' }}>
                      <strong>{p.type}</strong> — ${((p.amount_cents || 0) / 100).toFixed(2)} •
                      Status: <strong>{p.status}</strong>
                    </div>
                    <div className={classes.badgeRow}>
                      <button
                        type="button"
                        className={classes.secondaryBtn}
                        onClick={() => handleResolveRefundQueue(p.payment_guid, 'RETRY')}
                      >
                        Retry
                      </button>
                      <button
                        type="button"
                        className={classes.secondaryBtn}
                        onClick={() => handleResolveRefundQueue(p.payment_guid, 'MANUAL')}
                      >
                        Mark Resolved
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'printer' && <Configuration />}

      {activeTab === 'audit' && (
        <div className={classes.card}>
          <h3>Activity Log</h3>
          <p>Review administrative updates made to settings, inventory, and reservations.</p>

          <div className={classes.formGrid} style={{ marginBottom: '16px' }}>
            <div className={classes.fieldGroup}>
              <label htmlFor="audit-filter-action">Activity Type</label>
              <select
                id="audit-filter-action"
                value={auditFilterAction}
                onChange={(e) => setAuditFilterAction(e.target.value)}
              >
                <option value="">All Activities</option>
                <option value="PASSWORD_RESET">Password Reset</option>
                <option value="POLICY_UPDATE">Settings Updated</option>
                <option value="FEE_WAIVED">Fee Waived</option>
                <option value="OVERRIDE_CANCEL">Cancellation Override</option>
                <option value="TEMPLATE_UPDATE">Template Updated</option>
                <option value="ITEM_CREATED">Item Added</option>
                <option value="UNIT_ADDED">Unit Added</option>
                <option value="UNIT_DEACTIVATED">Unit Deactivated</option>
                <option value="BLACKOUT_CREATED">Dates Blocked</option>
                <option value="MANUAL_RESERVATION">Manual Reservation</option>
              </select>
            </div>
            <div className={classes.fieldGroup}>
              <label htmlFor="audit-filter-actor">{isAdmin ? 'User / Customer' : 'Staff Member'}</label>
              <input
                id="audit-filter-actor"
                type="text"
                placeholder="Search by staff member"
                value={auditFilterActor}
                onChange={(e) => setAuditFilterActor(e.target.value)}
              />
            </div>
            <div className={classes.fieldGroup}>
              <label htmlFor="audit-filter-start">From Date</label>
              <input
                id="audit-filter-start"
                type="date"
                value={auditFilterStartDate}
                onChange={(e) => setAuditFilterStartDate(e.target.value)}
              />
            </div>
            <div className={classes.fieldGroup}>
              <label htmlFor="audit-filter-end">To Date</label>
              <input
                id="audit-filter-end"
                type="date"
                value={auditFilterEndDate}
                onChange={(e) => setAuditFilterEndDate(e.target.value)}
              />
            </div>
          </div>

          {auditLogs.length === 0 ? (
            <p>No activity entries matched your filters.</p>
          ) : (
            <table className={classes.auditTable}>
              <thead>
                <tr>
                  <th>Date &amp; Time</th>
                  <th>Action</th>
                  <th>{isAdmin ? 'User / Customer' : 'Staff Member'}</th>
                  <th>Reason / Note</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log) => (
                  <tr
                    key={log.log_guid}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelectedLog(log)}
                  >
                    <td>{new Date(log.time_created).toLocaleString()}</td>
                    <td>{log.action}</td>
                    <td>{log.actor_guid}</td>
                    <td>{log.reason || '—'}</td>
                    <td>
                      <button
                        type="button"
                        className={classes.secondaryBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedLog(
                            selectedLog?.log_guid === log.log_guid ? null : log
                          );
                        }}
                      >
                        {selectedLog?.log_guid === log.log_guid ? 'Close' : 'View Details'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {selectedLog && (
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Activity Details"
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(15, 35, 12, 0.55)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1200,
                padding: '20px',
              }}
              onClick={() => setSelectedLog(null)}
            >
              <div
                className={classes.card}
                style={{
                  maxWidth: '960px',
                  width: '100%',
                  maxHeight: '85vh',
                  overflowY: 'auto',
                  background: '#ffffff',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '12px',
                  }}
                >
                  <div>
                    <h3 style={{ margin: 0 }}>Activity Details — {selectedLog.action}</h3>
                    <small style={{ color: '#476943' }}>
                      {new Date(selectedLog.time_created).toLocaleString()} •{' '}
                      {selectedLog.reason || 'Update'}
                    </small>
                  </div>
                  <button
                    type="button"
                    className={classes.secondaryBtn}
                    onClick={() => setSelectedLog(null)}
                  >
                    ✕ Close
                  </button>
                </div>
                <div className={classes.gridTwo} style={{ marginTop: '12px', marginBottom: 0 }}>
                  <div>
                    <strong>Previous Values</strong>
                    <pre className={classes.diffPre}>
                      {JSON.stringify(selectedLog.before_state, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <strong>Updated Values</strong>
                    <pre className={classes.diffPre}>
                      {JSON.stringify(selectedLog.after_state, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SupervisorControlPanel;
