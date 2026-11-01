import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { BASE_URL } from '../../shared/Utils/apiConfig';
import { useUserProfile } from '../../shared/Context/UserProfileContext';
import { useTenant } from './TenantContext';
import Configuration from '../../GamePlayers/Components/Configuration';
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

const formatBusinessTitle = (slug: string) =>
  slug
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

const SupervisorControlPanel: React.FC = () => {
  const { business: paramBusiness } = useParams<{ business: string }>();
  const navigate = useNavigate();
  const { profile } = useUserProfile();
  const { isElevatedRole, refreshTenantConfig } = useTenant();

  const targetBusiness = paramBusiness || profile?.business || 'alpha_rentals';
  const assignedBusiness = profile?.business || '';
  const isCrossTenantMismatch =
    Boolean(assignedBusiness) &&
    assignedBusiness.trim().toLowerCase() !== targetBusiness.trim().toLowerCase();

  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [metrics, setMetrics] = useState<TenantMetrics | null>(null);
  const [settingsForm, setSettingsForm] = useState<Record<string, any>>({
    business_name: '',
    contact_email: '',
    contact_phone: '',
    physical_address: '',
    timezone: 'America/Los_Angeles',
    currency: 'USD',
    hold_ttl_seconds: 600,
    free_change_cutoff_hours: 168,
    late_fee_percentage: 25,
    guest_token_ttl_days: 30,
    allow_customer_add_days: true,
    allow_customer_remove_days: true,
    tax_rate_percent: 8.25,
    require_full_payment: true,
    sms_enabled: true,
    email_enabled: true,
    reminder_lead_hours: 48,
  });
  const [auditReason, setAuditReason] = useState<string>('Updated business settings');
  const [savingSettings, setSavingSettings] = useState<boolean>(false);
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

  // Catalog state
  const [catalogItems, setCatalogItems] = useState<any[]>([]);
  const [newItemName, setNewItemName] = useState('');
  const [newItemDesc, setNewItemDesc] = useState('');
  const [newItemRateDollars, setNewItemRateDollars] = useState('45.00');
  const [newItemImages, setNewItemImages] = useState('');
  const [newItemSerials, setNewItemSerials] = useState('SN-101, SN-102, SN-103');
  const [creatingItem, setCreatingItem] = useState(false);
  const [unitInputsByItem, setUnitInputsByItem] = useState<Record<string, string>>({});

  // Blackout dates state
  const [blackouts, setBlackouts] = useState<any[]>([]);
  const [blackoutItemGuid, setBlackoutItemGuid] = useState<string>('');
  const [blackoutStartDate, setBlackoutStartDate] = useState<string>('2026-12-10');
  const [blackoutEndDate, setBlackoutEndDate] = useState<string>('2026-12-14');
  const [blackoutReason, setBlackoutReason] = useState<string>('Scheduled maintenance');
  const [blackoutForceOverride, setBlackoutForceOverride] = useState<boolean>(false);

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
  const [manualStartDate, setManualStartDate] = useState<string>('2026-11-25');
  const [manualEndDate, setManualEndDate] = useState<string>('2026-11-28');
  const [manualPaymentOption, setManualPaymentOption] = useState<'OFFLINE_CASH' | 'PAYMENT_LINK'>(
    'OFFLINE_CASH'
  );
  const [manualCustomer, setManualCustomer] = useState({
    first_name: 'Walk-In',
    last_name: 'Customer',
    email: 'customer@example.com',
    phone_number: '555-010-9999',
  });
  const [overrideResGuid, setOverrideResGuid] = useState<string>('');
  const [overrideAction, setOverrideAction] = useState<
    'CANCEL' | 'RESCHEDULE' | 'ADD_DAYS' | 'REMOVE_DAYS'
  >('CANCEL');
  const [overrideWaiveFee, setOverrideWaiveFee] = useState<boolean>(true);
  const [overrideStartDate, setOverrideStartDate] = useState<string>('2026-11-20');
  const [overrideEndDate, setOverrideEndDate] = useState<string>('2026-11-24');
  const [overrideReason, setOverrideReason] = useState<string>('Approved by supervisor');

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
      const [overviewRes, settingsRes, itemsRes, logsRes, resListRes, blkRes, refRes, outboxRes] =
        await Promise.all([
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

      setMetrics(overviewRes.data?.metrics || null);
      if (settingsRes.data?.settings) {
        setSettingsForm((prev) => ({ ...prev, ...settingsRes.data.settings }));
      }
      if (Array.isArray(settingsRes.data?.templates)) {
        setTemplates(settingsRes.data.templates);
      }
      const cItems = Array.isArray(itemsRes.data) ? itemsRes.data : [];
      setCatalogItems(cItems);
      if (cItems.length > 0 && !manualItemGuid) {
        setManualItemGuid(cItems[0].item_guid);
      }
      setAuditLogs(Array.isArray(logsRes.data) ? logsRes.data : []);
      const rList = Array.isArray(resListRes.data) ? resListRes.data : [];
      setTenantReservations(rList);
      if (rList.length > 0 && !overrideResGuid) {
        setOverrideResGuid(rList[0].reservation_guid);
      }
      setBlackouts(Array.isArray(blkRes.data) ? blkRes.data : []);
      setRefundQueue(Array.isArray(refRes.data) ? refRes.data : []);
      setOutboxItems(Array.isArray(outboxRes.data?.outbox) ? outboxRes.data.outbox : []);
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

  const activeTemplateRow = templates.find(
    (t) => t.event_type === selectedEvent && t.channel === selectedChannel
  );

  useEffect(() => {
    if (activeTemplateRow) {
      setTemplateSubject(activeTemplateRow.subject || '');
      setTemplateBody(activeTemplateRow.body_template || '');
      setTemplatePreview(null);
    }
  }, [activeTemplateRow?.template_guid, selectedEvent, selectedChannel]);

  const handlePreviewTemplate = async () => {
    try {
      const res = await axios.post(
        `${BASE_URL}/api/admin/${encodeURIComponent(targetBusiness)}/templates/preview`,
        {
          subject: selectedChannel === 'EMAIL' ? templateSubject : null,
          body_template: templateBody,
        },
        { headers: authHeaders }
      );
      setTemplatePreview(res.data);
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
    setSavingSettings(true);
    setStatusMessage(null);
    try {
      const payload = {
        business_name: settingsForm.business_name,
        contact_email: settingsForm.contact_email,
        contact_phone: settingsForm.contact_phone,
        physical_address: settingsForm.physical_address,
        timezone: settingsForm.timezone,
        currency: settingsForm.currency,
        hold_ttl_seconds: Number(settingsForm.hold_ttl_seconds),
        free_change_cutoff_hours: Number(settingsForm.free_change_cutoff_hours),
        late_fee_percentage: Number(settingsForm.late_fee_percentage),
        guest_token_ttl_days: Number(settingsForm.guest_token_ttl_days),
        allow_customer_add_days: Boolean(settingsForm.allow_customer_add_days),
        allow_customer_remove_days: Boolean(settingsForm.allow_customer_remove_days),
        tax_rate_percent: Number(settingsForm.tax_rate_percent),
        require_full_payment: Boolean(settingsForm.require_full_payment),
        sms_enabled: Boolean(settingsForm.sms_enabled),
        email_enabled: Boolean(settingsForm.email_enabled),
        reminder_lead_hours: Number(settingsForm.reminder_lead_hours),
      };

      await axios.put(
        `${BASE_URL}/api/admin/${encodeURIComponent(targetBusiness)}/settings`,
        {
          settings: payload,
          reason: auditReason,
        },
        { headers: authHeaders }
      );

      await refreshTenantConfig(targetBusiness);
      await loadSupervisorData();
      setStatusMessage({
        type: 'success',
        text: 'Settings saved successfully.',
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
    if (!newItemName.trim()) return;
    setCreatingItem(true);
    setStatusMessage(null);
    try {
      const rateCents = Math.round(parseFloat(newItemRateDollars || '0') * 100);
      const serials = newItemSerials
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const images = newItemImages
        .split(',')
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

      setNewItemName('');
      setNewItemDesc('');
      setNewItemImages('');
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

  const handleAddUnitsToItem = async (itemGuid: string) => {
    const raw = unitInputsByItem[itemGuid] || '';
    const serials = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (serials.length === 0) return;
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
    setStatusMessage(null);
    try {
      await axios.post(
        `${BASE_URL}/api/admin/${encodeURIComponent(targetBusiness)}/blackouts`,
        {
          item_guid: blackoutItemGuid || null,
          start_date: blackoutStartDate,
          end_date: blackoutEndDate,
          reason: blackoutReason,
          force_override: blackoutForceOverride,
        },
        { headers: authHeaders }
      );
      await loadSupervisorData();
      setStatusMessage({
        type: 'success',
        text: `Blocked dates from ${blackoutStartDate} to ${blackoutEndDate}.`,
      });
    } catch (err: any) {
      const msg =
        err?.response?.data?.error?.message ||
        err?.response?.data?.error ||
        'Could not create blackout dates';
      setStatusMessage({ type: 'error', text: String(msg) });
    }
  };

  const handleCreateManualReservation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualItemGuid) return;
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
    if (!overrideResGuid) return;
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
          reason: overrideReason,
        },
        { headers: authHeaders }
      );
      await loadSupervisorData();
      setStatusMessage({
        type: 'success',
        text: 'Reservation updated.',
      });
    } catch (err: any) {
      const msg =
        err?.response?.data?.error?.message ||
        err?.response?.data?.error ||
        'Could not update reservation';
      setStatusMessage({ type: 'error', text: String(msg) });
    }
  };

  const displayBusinessName =
    settingsForm.business_name || formatBusinessTitle(targetBusiness);

  if (!profile) {
    return (
      <div className={classes.portalWrapper}>
        <div className={classes.card}>
          <h3>Sign In Required</h3>
          <p>Please sign in to access the Supervisor Control Panel.</p>
          <Link to="/Auth" className={classes.primaryBtn}>
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  if (!isElevatedRole) {
    return (
      <div className={classes.portalWrapper}>
        <div className={classes.card}>
          <h3>Access Restricted</h3>
          <p>
            This area is reserved for authorized staff members. You can browse and manage your
            rentals on the customer booking page.
          </p>
          <Link to={`/book/${encodeURIComponent(targetBusiness)}`} className={classes.primaryBtn}>
            Go to Booking Page
          </Link>
        </div>
      </div>
    );
  }

  if (isCrossTenantMismatch) {
    return (
      <div className={classes.portalWrapper}>
        <div className={classes.card}>
          <h3>Location Access Restricted</h3>
          <p>
            Your account is assigned to <strong>{formatBusinessTitle(assignedBusiness)}</strong> and
            does not have administrative access to <strong>{displayBusinessName}</strong>.
          </p>
          <div className={classes.badgeRow} style={{ marginTop: '14px' }}>
            <button
              type="button"
              className={classes.primaryBtn}
              onClick={() => navigate(`/admin/${encodeURIComponent(assignedBusiness)}`)}
            >
              Go to {formatBusinessTitle(assignedBusiness)} Panel
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
          <h1>Supervisor Control Panel — {displayBusinessName}</h1>
          <p>
            Manage location settings, rental policies, pricing, inventory, and reservations.
          </p>
        </div>

        <div className={classes.badgeRow}>
          <Link
            to={`/book/${encodeURIComponent(targetBusiness)}`}
            className={classes.secondaryBtn}
          >
            View Customer Booking Page
          </Link>
          <Link
            to={`/${encodeURIComponent(targetBusiness)}/BusinessManager`}
            className={classes.secondaryBtn}
          >
            Staff &amp; Events Manager
          </Link>
        </div>
      </section>

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
          Message Templates ({templates.length})
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
          <h3>Location Summary — {displayBusinessName}</h3>
          <p>Current operational overview for this location:</p>
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
          <h3>Location Profile, Policies &amp; Tax Settings</h3>
          <p>
            Configure your public contact information, cancellation rules, hold duration, and tax
            rates.
          </p>

          <div className={classes.formGrid}>
            <div className={classes.fieldGroup}>
              <label htmlFor="cfg-business-name">Public Business Name</label>
              <input
                id="cfg-business-name"
                type="text"
                value={settingsForm.business_name || ''}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, business_name: e.target.value })
                }
              />
            </div>

            <div className={classes.fieldGroup}>
              <label htmlFor="cfg-contact-email">Support Email</label>
              <input
                id="cfg-contact-email"
                type="email"
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
                value={settingsForm.timezone || 'America/Los_Angeles'}
                onChange={(e) => setSettingsForm({ ...settingsForm, timezone: e.target.value })}
              >
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
                value={settingsForm.currency || 'USD'}
                onChange={(e) => setSettingsForm({ ...settingsForm, currency: e.target.value })}
              >
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
                min={60}
                value={settingsForm.hold_ttl_seconds ?? 600}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, hold_ttl_seconds: Number(e.target.value) })
                }
              />
            </div>

            <div className={classes.fieldGroup}>
              <label htmlFor="cfg-cutoff-hours">Free Cancellation Window (hours)</label>
              <input
                id="cfg-cutoff-hours"
                type="number"
                min={0}
                value={settingsForm.free_change_cutoff_hours ?? 168}
                onChange={(e) =>
                  setSettingsForm({
                    ...settingsForm,
                    free_change_cutoff_hours: Number(e.target.value),
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
                value={settingsForm.late_fee_percentage ?? 25}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, late_fee_percentage: Number(e.target.value) })
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
                value={settingsForm.tax_rate_percent ?? 8.25}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, tax_rate_percent: Number(e.target.value) })
                }
              />
            </div>

            <div className={classes.fieldGroup}>
              <label htmlFor="cfg-token-ttl">Booking Link Validity (days)</label>
              <input
                id="cfg-token-ttl"
                type="number"
                min={1}
                value={settingsForm.guest_token_ttl_days ?? 30}
                onChange={(e) =>
                  setSettingsForm({
                    ...settingsForm,
                    guest_token_ttl_days: Number(e.target.value),
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
                value={settingsForm.reminder_lead_hours ?? 48}
                onChange={(e) =>
                  setSettingsForm({
                    ...settingsForm,
                    reminder_lead_hours: Number(e.target.value),
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
                checked={Boolean(settingsForm.sms_enabled)}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, sms_enabled: e.target.checked })
                }
              />
              <label htmlFor="cfg-sms-enabled">Enable SMS Notifications</label>
            </div>
          </div>

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
                value={auditReason}
                onChange={(e) => setAuditReason(e.target.value)}
              />
            </div>
            <button type="submit" className={classes.primaryBtn} disabled={savingSettings}>
              {savingSettings ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      )}

      {activeTab === 'templates' && (
        <div>
          <div className={classes.gridTwo}>
            <form className={classes.card} onSubmit={handleSaveTemplate}>
              <h3>Customer Email &amp; SMS Templates</h3>
              <p>
                Customize the confirmation, modification, cancellation, and reminder messages sent to
                customers.
              </p>

              <div className={classes.formGrid}>
                <div className={classes.fieldGroup}>
                  <label htmlFor="tpl-event">Notification Type</label>
                  <select
                    id="tpl-event"
                    value={selectedEvent}
                    onChange={(e) => setSelectedEvent(e.target.value)}
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
                    onChange={(e) => setSelectedChannel(e.target.value as 'EMAIL' | 'SMS')}
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
                  value={templateBody}
                  onChange={(e) => setTemplateBody(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid #c3dfc0',
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
                <button type="submit" className={classes.primaryBtn} disabled={savingTemplate}>
                  {savingTemplate ? 'Saving...' : 'Save Template'}
                </button>
              </div>
            </form>

            <div className={classes.card}>
              <h3>Message Preview</h3>
              {templatePreview ? (
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
                  Click &ldquo;Preview Message&rdquo; to see how this template will look to
                  customers.
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
        <div className={classes.gridTwo}>
          <form className={classes.card} onSubmit={handleCreateItem}>
            <h3>Add New Rental Item</h3>
            <p>Add equipment and unit serial numbers to your location&apos;s rental inventory.</p>
            <div className={classes.formGrid}>
              <div className={classes.fieldGroup}>
                <label htmlFor="item-name">Item Name</label>
                <input
                  id="item-name"
                  type="text"
                  required
                  placeholder="e.g. Electric Mountain Bike"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                />
              </div>
              <div className={classes.fieldGroup}>
                <label htmlFor="item-rate">Daily Rate ({settingsForm.currency || 'USD'})</label>
                <input
                  id="item-rate"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={newItemRateDollars}
                  onChange={(e) => setNewItemRateDollars(e.target.value)}
                />
              </div>
            </div>
            <div className={classes.fieldGroup} style={{ marginTop: '12px' }}>
              <label htmlFor="item-desc">Description</label>
              <input
                id="item-desc"
                type="text"
                placeholder="Description shown on the customer booking page"
                value={newItemDesc}
                onChange={(e) => setNewItemDesc(e.target.value)}
              />
            </div>
            <div className={classes.fieldGroup} style={{ marginTop: '12px' }}>
              <label htmlFor="item-images">Image URLs (comma-separated)</label>
              <input
                id="item-images"
                type="text"
                placeholder="https://example.com/item1.jpg"
                value={newItemImages}
                onChange={(e) => setNewItemImages(e.target.value)}
              />
            </div>
            <div className={classes.fieldGroup} style={{ marginTop: '12px' }}>
              <label htmlFor="item-serials">Unit Serial Numbers (comma-separated)</label>
              <input
                id="item-serials"
                type="text"
                placeholder="SN-101, SN-102, SN-103"
                value={newItemSerials}
                onChange={(e) => setNewItemSerials(e.target.value)}
              />
            </div>
            <div style={{ marginTop: '16px' }}>
              <button type="submit" className={classes.primaryBtn} disabled={creatingItem}>
                {creatingItem ? 'Adding...' : '+ Add Item'}
              </button>
            </div>
          </form>

          <div className={classes.card}>
            <h3>Current Inventory ({catalogItems.length})</h3>
            {catalogItems.length === 0 ? (
              <p>No rental items have been added yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {catalogItems.map((it) => (
                  <div
                    key={it.item_guid}
                    style={{
                      padding: '12px',
                      borderRadius: '10px',
                      border: '1px solid #d5ead0',
                      background: '#f8fcf7',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <strong>{it.name}</strong>
                      <span>${((it.daily_rate_cents || 0) / 100).toFixed(2)} / day</span>
                    </div>
                    {it.description && (
                      <p style={{ margin: '4px 0', fontSize: '0.84rem' }}>{it.description}</p>
                    )}
                    <div style={{ marginTop: '6px' }}>
                      <small
                        style={{
                          color: '#246a19',
                          fontWeight: 700,
                          display: 'block',
                          marginBottom: '4px',
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
                    <div className={classes.badgeRow} style={{ marginTop: '8px' }}>
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
                          padding: '5px 8px',
                          borderRadius: '6px',
                          border: '1px solid #c3dfc0',
                          fontSize: '0.8rem',
                        }}
                      />
                      <button
                        type="button"
                        className={classes.secondaryBtn}
                        style={{ padding: '5px 10px', fontSize: '0.78rem' }}
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

          <form className={classes.card} onSubmit={handleCreateBlackout}>
            <h3>Block Dates for Maintenance or Holidays</h3>
            <p>Prevent online bookings for a specific item or the entire location during selected dates.</p>
            <div className={classes.formGrid}>
              <div className={classes.fieldGroup}>
                <label htmlFor="blk-item">Applies To</label>
                <select
                  id="blk-item"
                  value={blackoutItemGuid}
                  onChange={(e) => setBlackoutItemGuid(e.target.value)}
                >
                  <option value="">Entire Location</option>
                  {catalogItems.map((it) => (
                    <option key={it.item_guid} value={it.item_guid}>
                      {it.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className={classes.fieldGroup}>
                <label htmlFor="blk-reason">Reason</label>
                <input
                  id="blk-reason"
                  type="text"
                  required
                  value={blackoutReason}
                  onChange={(e) => setBlackoutReason(e.target.value)}
                />
              </div>
              <div className={classes.fieldGroup}>
                <label htmlFor="blk-start">Start Date</label>
                <input
                  id="blk-start"
                  type="date"
                  required
                  value={blackoutStartDate}
                  onChange={(e) => setBlackoutStartDate(e.target.value)}
                />
              </div>
              <div className={classes.fieldGroup}>
                <label htmlFor="blk-end">End Date</label>
                <input
                  id="blk-end"
                  type="date"
                  required
                  value={blackoutEndDate}
                  onChange={(e) => setBlackoutEndDate(e.target.value)}
                />
              </div>
            </div>
            <div className={classes.checkboxRow} style={{ marginTop: '10px' }}>
              <input
                id="blk-force"
                type="checkbox"
                checked={blackoutForceOverride}
                onChange={(e) => setBlackoutForceOverride(e.target.checked)}
              />
              <label htmlFor="blk-force">
                Allow even if existing reservations overlap these dates
              </label>
            </div>
            <div style={{ marginTop: '12px' }}>
              <button type="submit" className={classes.primaryBtn}>
                + Block Dates
              </button>
            </div>
          </form>

          <div className={classes.card}>
            <h3>Blocked Dates ({blackouts.length})</h3>
            {blackouts.length === 0 ? (
              <p>No blocked dates configured.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {blackouts.map((b) => (
                  <div
                    key={b.blackout_guid}
                    style={{
                      padding: '10px',
                      borderRadius: '8px',
                      border: '1px solid #d5ead0',
                      background: '#f8fcf7',
                      fontSize: '0.84rem',
                    }}
                  >
                    <strong>{b.item_name || 'Entire Location'}</strong> — {b.date_range_text}
                    <div>Reason: {b.reason}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'reservations' && (
        <div className={classes.gridTwo}>
          <div className={classes.card}>
            <h3>Modify or Cancel a Reservation</h3>
            <p>
              Update reservation dates, process cancellations, or waive late fees on behalf of a
              customer.
            </p>
            <form onSubmit={handleSupervisorOverride}>
              <div className={classes.formGroup}>
                <label htmlFor="override-res-select">Select Reservation</label>
                <select
                  id="override-res-select"
                  value={overrideResGuid}
                  onChange={(e) => setOverrideResGuid(e.target.value)}
                >
                  {tenantReservations.length === 0 && (
                    <option value="">No reservations found</option>
                  )}
                  {tenantReservations.map((r) => (
                    <option key={r.reservation_guid} value={r.reservation_guid}>
                      {r.item_name || 'Item'} ({r.status}) — {r.start_date} to {r.end_date}
                    </option>
                  ))}
                </select>
              </div>
              <div className={classes.formRow}>
                <div className={classes.formGroup}>
                  <label htmlFor="override-action-select">Action</label>
                  <select
                    id="override-action-select"
                    value={overrideAction}
                    onChange={(e) => setOverrideAction(e.target.value as any)}
                  >
                    <option value="CANCEL">Cancel Reservation</option>
                    <option value="RESCHEDULE">Reschedule</option>
                    <option value="ADD_DAYS">Extend Rental (Add Days)</option>
                    <option value="REMOVE_DAYS">Shorten Rental (Remove Days)</option>
                  </select>
                </div>
                <div className={classes.formGroup}>
                  <label htmlFor="override-waive-fee">Fee Handling</label>
                  <select
                    id="override-waive-fee"
                    value={overrideWaiveFee ? 'true' : 'false'}
                    onChange={(e) => setOverrideWaiveFee(e.target.value === 'true')}
                  >
                    <option value="true">Waive Late Fee ($0.00)</option>
                    <option value="false">
                      Apply Standard Late Fee ({settingsForm.late_fee_percentage}%)
                    </option>
                  </select>
                </div>
              </div>
              {overrideAction !== 'CANCEL' && (
                <div className={classes.formRow}>
                  <div className={classes.formGroup}>
                    <label htmlFor="override-start-date">New Pick-Up Date</label>
                    <input
                      id="override-start-date"
                      type="date"
                      value={overrideStartDate}
                      onChange={(e) => setOverrideStartDate(e.target.value)}
                      required
                    />
                  </div>
                  <div className={classes.formGroup}>
                    <label htmlFor="override-end-date">New Return Date</label>
                    <input
                      id="override-end-date"
                      type="date"
                      value={overrideEndDate}
                      onChange={(e) => setOverrideEndDate(e.target.value)}
                      required
                    />
                  </div>
                </div>
              )}
              <div className={classes.formGroup}>
                <label htmlFor="override-reason">Reason</label>
                <input
                  id="override-reason"
                  type="text"
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  required
                />
              </div>
              <button
                type="submit"
                className={classes.primaryBtn}
                disabled={!overrideResGuid}
              >
                Apply Change
              </button>
            </form>
          </div>

          <div className={classes.card}>
            <h3>All Reservations ({tenantReservations.length})</h3>
            {tenantReservations.length === 0 ? (
              <p>No reservations found for this location.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {tenantReservations.map((res) => (
                  <div
                    key={res.reservation_guid}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid #d5ead0',
                      background: '#f8fcf7',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <strong>
                        {res.item_name || 'Rental Item'} ({res.serial_number || 'Unit'})
                      </strong>
                      <span className={classes.tenantPill}>{res.status}</span>
                    </div>
                    <div style={{ fontSize: '0.84rem', color: '#3b5735', marginTop: '4px' }}>
                      <div>
                        <strong>Dates:</strong> {res.start_date} to {res.end_date} (
                        {res.days || 1} day(s))
                      </div>
                      <div>
                        <strong>Total:</strong> $
                        {(((res.total_cents ?? res.total_paid_cents) || 0) / 100).toFixed(2)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <form className={classes.card} onSubmit={handleCreateManualReservation}>
            <h3>Create Walk-In or Phone Reservation</h3>
            <p>Book a reservation directly on behalf of a customer.</p>
            <div className={classes.formGrid}>
              <div className={classes.fieldGroup}>
                <label htmlFor="man-item">Rental Item</label>
                <select
                  id="man-item"
                  value={manualItemGuid}
                  onChange={(e) => setManualItemGuid(e.target.value)}
                >
                  {catalogItems.map((it) => (
                    <option key={it.item_guid} value={it.item_guid}>
                      {it.name} (${((it.daily_rate_cents || 0) / 100).toFixed(2)}/day)
                    </option>
                  ))}
                </select>
              </div>
              <div className={classes.fieldGroup}>
                <label htmlFor="man-pay-opt">Payment Method</label>
                <select
                  id="man-pay-opt"
                  value={manualPaymentOption}
                  onChange={(e) =>
                    setManualPaymentOption(e.target.value as 'OFFLINE_CASH' | 'PAYMENT_LINK')
                  }
                >
                  <option value="OFFLINE_CASH">In-Person / Cash</option>
                  <option value="PAYMENT_LINK">Send Payment Link</option>
                </select>
              </div>
              <div className={classes.fieldGroup}>
                <label htmlFor="man-start">Pick-Up Date</label>
                <input
                  id="man-start"
                  type="date"
                  required
                  value={manualStartDate}
                  onChange={(e) => setManualStartDate(e.target.value)}
                />
              </div>
              <div className={classes.fieldGroup}>
                <label htmlFor="man-end">Return Date</label>
                <input
                  id="man-end"
                  type="date"
                  required
                  value={manualEndDate}
                  onChange={(e) => setManualEndDate(e.target.value)}
                />
              </div>
              <div className={classes.fieldGroup}>
                <label htmlFor="man-email">Customer Email</label>
                <input
                  id="man-email"
                  type="email"
                  required
                  value={manualCustomer.email}
                  onChange={(e) =>
                    setManualCustomer({ ...manualCustomer, email: e.target.value })
                  }
                />
              </div>
              <div className={classes.fieldGroup}>
                <label htmlFor="man-phone">Customer Phone</label>
                <input
                  id="man-phone"
                  type="text"
                  required
                  value={manualCustomer.phone_number}
                  onChange={(e) =>
                    setManualCustomer({ ...manualCustomer, phone_number: e.target.value })
                  }
                />
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
              <label htmlFor="audit-filter-actor">Staff Member</label>
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
                  <th>Staff Member</th>
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
