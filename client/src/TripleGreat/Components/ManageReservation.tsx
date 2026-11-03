import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { BASE_URL } from '../../shared/Utils/apiConfig';
import { useUserProfile } from '../../shared/Context/UserProfileContext';
import { useTenant } from './TenantContext';
import classes from '../ComponentStyles/TripleGreat.module.scss';

type LifecycleAction = 'CANCEL' | 'RESCHEDULE' | 'ADD_DAYS' | 'REMOVE_DAYS';

const ENDPOINTS: Record<LifecycleAction, string> = {
  CANCEL: 'cancel',
  RESCHEDULE: 'reschedule',
  ADD_DAYS: 'add-days',
  REMOVE_DAYS: 'remove-days',
};

const SUCCESS_TEXT: Record<LifecycleAction, string> = {
  CANCEL: 'Reservation cancelled.',
  RESCHEDULE: 'Reservation rescheduled.',
  ADD_DAYS: 'Reservation extended.',
  REMOVE_DAYS: 'Reservation dates shortened.',
};

const errText = (err: any, fallback: string) =>
  err?.response?.data?.error?.message || err?.response?.data?.error || fallback;

const ManageReservation: React.FC = () => {
  const { business: paramBusiness } = useParams<{ business: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, isCustomer } = useUserProfile();
  const { tenantConfig, refreshTenantConfig } = useTenant();

  const activeBusiness = paramBusiness || '';
  const displayAddress = tenantConfig?.physical_address || 'Rental Location';
  // Signed-in customers only ever see their own reservations
  const customerGuid = isCustomer ? profile?.customer_guid || profile?.user_guid || null : null;

  const [reservations, setReservations] = useState<any[]>([]);
  const [manageTokenInput, setManageTokenInput] = useState('');
  const [selectedResGuid, setSelectedResGuid] = useState('');
  const [lifecycleAction, setLifecycleAction] = useState<LifecycleAction | ''>('');
  const [modStartDate, setModStartDate] = useState('');
  const [modEndDate, setModEndDate] = useState('');
  const [modDateError, setModDateError] = useState<string | null>(null);
  const [policyQuote, setPolicyQuote] = useState<any | null>(null);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const selectedRes = useMemo(
    () => reservations.find((r) => r.reservation_guid === selectedResGuid) || null,
    [reservations, selectedResGuid]
  );

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

  const originalDurationDays = useMemo(() => {
    if (!selectedRes) return 0;
    if (selectedRes.days && Number(selectedRes.days) > 0) {
      return Number(selectedRes.days);
    }
    if (selectedRes.start_date && selectedRes.end_date) {
      return calculateDays(selectedRes.start_date, selectedRes.end_date);
    }
    return 0;
  }, [selectedRes]);

  const currentSelectionDays = useMemo(() => {
    if (!modStartDate || !modEndDate) return 0;
    return calculateDays(modStartDate, modEndDate);
  }, [modStartDate, modEndDate]);

  const durationValidation = useMemo(() => {
    if (!selectedRes || !lifecycleAction || lifecycleAction === 'CANCEL') {
      return { valid: true, error: null as string | null, delta: 0 };
    }
    if (!modStartDate || !modEndDate) {
      return { valid: false, error: 'Start and end dates are required.', delta: 0 };
    }
    if (modStartDate > modEndDate) {
      return { valid: false, error: 'New end date cannot be earlier than start date.', delta: 0 };
    }

    const origDays = originalDurationDays || 1;
    const newDays = currentSelectionDays;
    const delta = newDays - origDays;

    if (lifecycleAction === 'ADD_DAYS') {
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
          error: `Extend Rental requires adding days. Current duration is ${origDays} day(s). Please choose an extended return date to add at least 1 day.`,
          delta: 0,
        };
      }
      return { valid: true, error: null, delta };
    }

    if (lifecycleAction === 'REMOVE_DAYS') {
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
          error: `Shorten Rental requires reducing days. Current duration is ${origDays} day(s). Please choose an earlier return date to shorten the rental by at least 1 day.`,
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

    if (lifecycleAction === 'RESCHEDULE') {
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
  }, [selectedRes, lifecycleAction, modStartDate, modEndDate, originalDurationDays, currentSelectionDays]);

  const minExtendedEndDate = useMemo(() => {
    if (lifecycleAction !== 'ADD_DAYS' || !selectedRes) return undefined;
    const start = modStartDate || selectedRes.start_date;
    const days = originalDurationDays || 1;
    return addDaysToIsoDate(start, days + 1);
  }, [lifecycleAction, selectedRes, modStartDate, originalDurationDays]);

  const maxShortenedEndDate = useMemo(() => {
    if (lifecycleAction !== 'REMOVE_DAYS' || !selectedRes) return undefined;
    const start = modStartDate || selectedRes.start_date;
    const days = originalDurationDays || 1;
    return addDaysToIsoDate(start, Math.max(1, days - 1));
  }, [lifecycleAction, selectedRes, modStartDate, originalDurationDays]);

  const handleActionChange = (action: LifecycleAction | '') => {
    setLifecycleAction(action);
    setPolicyQuote(null);
    setModDateError(null);
    if (!selectedRes) return;

    const origStart = selectedRes.start_date || '';
    const origDays = originalDurationDays || 1;
    const baseStart = modStartDate || origStart;

    if (action === 'ADD_DAYS') {
      setModStartDate(baseStart);
      setModEndDate(addDaysToIsoDate(baseStart, origDays + 1));
    } else if (action === 'REMOVE_DAYS') {
      setModStartDate(baseStart);
      if (origDays > 1) {
        setModEndDate(addDaysToIsoDate(baseStart, origDays - 1));
      } else {
        setModEndDate(selectedRes.end_date || baseStart);
      }
    } else if (action === 'RESCHEDULE') {
      setModStartDate(baseStart);
      setModEndDate(addDaysToIsoDate(baseStart, origDays));
    }
  };

  const handleSelectReservation = (resGuid: string) => {
    setSelectedResGuid(resGuid);
    setPolicyQuote(null);
    setModDateError(null);
    const found = reservations.find((r) => r.reservation_guid === resGuid);
    if (found) {
      const origDays =
        found.days && Number(found.days) > 0
          ? Number(found.days)
          : calculateDays(found.start_date, found.end_date) || 1;
      const start = found.start_date || '';
      setModStartDate(start);
      if (lifecycleAction === 'ADD_DAYS') {
        setModEndDate(addDaysToIsoDate(start, origDays + 1));
      } else if (lifecycleAction === 'REMOVE_DAYS') {
        setModEndDate(origDays > 1 ? addDaysToIsoDate(start, origDays - 1) : (found.end_date || start));
      } else if (lifecycleAction === 'RESCHEDULE') {
        setModEndDate(addDaysToIsoDate(start, origDays));
      } else {
        setModEndDate(found.end_date || start);
      }
    } else {
      setModStartDate('');
      setModEndDate('');
    }
  };

  const formatMoney = (cents: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: tenantConfig?.currency || 'USD' }).format(
      (cents || 0) / 100
    );

  const loadMyReservations = useCallback(async () => {
    if (!activeBusiness || !customerGuid) {
      setReservations([]);
      return;
    }
    try {
      const res = await axios.get<any[]>(`${BASE_URL}/api/${encodeURIComponent(activeBusiness)}/reservations`, {
        params: { customer_guid: customerGuid },
      });
      const list = (Array.isArray(res.data) ? res.data : []).filter((r) => r.customer_guid === customerGuid);
      setReservations(list);
    } catch (err) {
      console.error('Error loading reservations:', err);
    }
  }, [activeBusiness, customerGuid]);

  // Add a token-resolved reservation to the dropdown without exposing anyone else's
  const resolveToken = useCallback(
    async (token: string) => {
      if (!activeBusiness || !token.trim()) return;
      setStatus(null);
      try {
        const res = await axios.get(
          `${BASE_URL}/api/${encodeURIComponent(activeBusiness)}/manage/${encodeURIComponent(token.trim())}`
        );
        const found = res.data?.reservation;
        if (found?.reservation_guid) {
          setReservations((prev) =>
            prev.some((r) => r.reservation_guid === found.reservation_guid) ? prev : [found, ...prev]
          );
          setSelectedResGuid(found.reservation_guid);
        }
        setStatus({ type: 'success', text: 'Your reservation has been found.' });
      } catch (err: any) {
        setStatus({ type: 'error', text: errText(err, 'Invalid or expired booking reference code.') });
      }
    },
    [activeBusiness]
  );

  useEffect(() => {
    if (activeBusiness) refreshTenantConfig(activeBusiness);
    loadMyReservations();
  }, [activeBusiness, refreshTenantConfig, loadMyReservations]);

  useEffect(() => {
    const urlToken = new URLSearchParams(location.search).get('manage_token');
    if (urlToken) {
      setManageTokenInput(urlToken);
      resolveToken(urlToken);
    }
  }, [location.search, resolveToken]);

  const handlePreview = async () => {
    if (!selectedResGuid) {
      setStatus({ type: 'error', text: 'Please select a reservation.' });
      return;
    }
    if (!lifecycleAction) {
      setStatus({ type: 'error', text: 'Please select an action to perform.' });
      return;
    }
    if (lifecycleAction !== 'CANCEL' && !durationValidation.valid) {
      setStatus({
        type: 'error',
        text: durationValidation.error || 'Invalid date selection for the chosen action.',
      });
      return;
    }
    setStatus(null);
    try {
      const res = await axios.get(
        `${BASE_URL}/api/${encodeURIComponent(activeBusiness)}/reservations/${encodeURIComponent(selectedResGuid)}/quote`,
        { params: { action: lifecycleAction, new_start_date: modStartDate, new_end_date: modEndDate } }
      );
      setPolicyQuote(res.data);
    } catch (err: any) {
      setStatus({ type: 'error', text: errText(err, 'Unable to calculate quote for this change.') });
    }
  };

  const handleConfirm = async () => {
    if (!selectedResGuid) {
      setStatus({ type: 'error', text: 'Please select a reservation.' });
      return;
    }
    if (!lifecycleAction) {
      setStatus({ type: 'error', text: 'Please select an action to perform.' });
      return;
    }
    if (lifecycleAction !== 'CANCEL' && !durationValidation.valid) {
      setStatus({
        type: 'error',
        text: durationValidation.error || 'Invalid date selection for the chosen action.',
      });
      return;
    }
    setStatus(null);
    try {
      const res = await axios.post(
        `${BASE_URL}/api/${encodeURIComponent(activeBusiness)}/reservations/${encodeURIComponent(
          selectedResGuid
        )}/${ENDPOINTS[lifecycleAction]}`,
        { new_start_date: modStartDate, new_end_date: modEndDate }
      );
      setPolicyQuote(res.data?.quote || null);
      await loadMyReservations();
      setStatus({ type: 'success', text: SUCCESS_TEXT[lifecycleAction] });
    } catch (err: any) {
      setStatus({ type: 'error', text: errText(err, 'Could not update reservation.') });
    }
  };

  return (
    <div className={classes.portalWrapper}>
      <div className={classes.switcherBar}>
        <div className={classes.badgeRow}>
          <button
            type="button"
            className={classes.secondaryBtn}
            onClick={() => navigate(`/book/${encodeURIComponent(activeBusiness)}`)}
          >
            ← Book a Reservation
          </button>
          <span style={{ fontWeight: 700, color: '#174b0f', fontSize: '0.95rem' }}>📍 {displayAddress}</span>
        </div>
      </div>

      {status && (
        <div
          className={`${classes.statusAlert} ${status.type === 'success' ? classes.statusSuccess : classes.statusError}`}
          style={{ marginTop: '20px' }}
        >
          {status.text}
        </div>
      )}

      <div className={classes.card} style={{ marginTop: '20px' }}>
        <h3>Manage an Existing Reservation</h3>
        <p>
          Look up your reservation using your booking reference code
          {customerGuid ? ', or choose one of your reservations below' : ''} to reschedule, extend, shorten, or cancel.
        </p>

        <div className={classes.badgeRow} style={{ marginBottom: '14px' }}>
          <input
            type="text"
            value={manageTokenInput}
            onChange={(e) => setManageTokenInput(e.target.value)}
            placeholder="Enter booking reference code..."
            style={{ flex: '1 1 220px', padding: '8px 12px', borderRadius: '8px', border: '1px solid #bdd9b7' }}
          />
          <button
            type="button"
            className={classes.secondaryBtn}
            disabled={!manageTokenInput.trim()}
            onClick={() => resolveToken(manageTokenInput)}
          >
            Find Booking
          </button>
        </div>

        <div className={classes.formGrid}>
          <div className={classes.fieldGroup}>
            <label htmlFor="pol-res-select">Your Reservation</label>
            <select
              id="pol-res-select"
              value={selectedResGuid}
              onChange={(e) => handleSelectReservation(e.target.value)}
            >
              <option value="">
                {reservations.length ? 'Select Reservation...' : 'No reservations found'}
              </option>
              {reservations.map((r) => (
                <option key={r.reservation_guid} value={r.reservation_guid}>
                  {r.item_name || 'Rental'} ({r.start_date} to {r.end_date}) — {r.status} ({formatMoney(r.total_cents)})
                </option>
              ))}
            </select>
          </div>

          <div className={classes.fieldGroup}>
            <label htmlFor="pol-action-select">What would you like to do?</label>
            <select
              id="pol-action-select"
              value={lifecycleAction}
              onChange={(e) => handleActionChange(e.target.value as LifecycleAction)}
              disabled={!selectedResGuid}
            >
              <option value="">Select Action...</option>
              <option value="RESCHEDULE">🔄 Reschedule Dates</option>
              <option value="ADD_DAYS">➕ Extend Rental (Add Days)</option>
              <option value="REMOVE_DAYS">➖ Shorten Rental (Remove Days)</option>
              <option value="CANCEL">❌ Cancel Reservation</option>
            </select>
          </div>
        </div>

        {lifecycleAction && lifecycleAction !== 'CANCEL' && (
          <>
            <div className={classes.formGrid} style={{ marginTop: '10px' }}>
              <div className={classes.fieldGroup}>
                <label htmlFor="mod-start-date">
                  New Start Date <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  id="mod-start-date"
                  type="date"
                  style={{
                    cursor: 'pointer',
                    ...(modDateError || !durationValidation.valid ? { borderColor: '#ef4444' } : {}),
                  }}
                  onClick={(e) => {
                    try {
                      e.currentTarget.showPicker();
                    } catch {}
                  }}
                  value={modStartDate}
                  onChange={(e) => {
                    const val = e.target.value;
                    setModStartDate(val);
                    setModDateError(null);
                    if (val && lifecycleAction === 'RESCHEDULE') {
                      setModEndDate(addDaysToIsoDate(val, originalDurationDays || 1));
                    } else if (val && lifecycleAction === 'ADD_DAYS') {
                      const minEnd = addDaysToIsoDate(val, (originalDurationDays || 1) + 1);
                      if (!modEndDate || modEndDate < minEnd) {
                        setModEndDate(minEnd);
                      }
                    } else if (val && lifecycleAction === 'REMOVE_DAYS') {
                      const maxEnd = addDaysToIsoDate(
                        val,
                        Math.max(1, (originalDurationDays || 1) - 1)
                      );
                      if (!modEndDate || modEndDate > maxEnd) {
                        setModEndDate(maxEnd);
                      }
                    }
                  }}
                  required
                />
              </div>

              <div className={classes.fieldGroup}>
                <label htmlFor="mod-end-date">
                  New End Date <span style={{ color: '#ef4444' }}>*</span>
                  {lifecycleAction === 'ADD_DAYS' && minExtendedEndDate && (
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
                  {lifecycleAction === 'REMOVE_DAYS' && maxShortenedEndDate && (
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
                  id="mod-end-date"
                  type="date"
                  min={
                    lifecycleAction === 'ADD_DAYS'
                      ? minExtendedEndDate
                      : modStartDate || undefined
                  }
                  max={lifecycleAction === 'REMOVE_DAYS' ? maxShortenedEndDate : undefined}
                  style={{
                    cursor: 'pointer',
                    ...(modDateError || !durationValidation.valid ? { borderColor: '#ef4444' } : {}),
                  }}
                  onClick={(e) => {
                    try {
                      e.currentTarget.showPicker();
                    } catch {}
                  }}
                  value={modEndDate}
                  onChange={(e) => {
                    const val = e.target.value;
                    setModEndDate(val);
                    setModDateError(null);
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
              {lifecycleAction === 'ADD_DAYS' && (
                <span style={{ fontSize: '0.78rem', color: '#15803d', fontWeight: 700 }}>
                  ➕ Extending rental (adding days)
                </span>
              )}
              {lifecycleAction === 'REMOVE_DAYS' && (
                <span style={{ fontSize: '0.78rem', color: '#b91c1c', fontWeight: 700 }}>
                  ➖ Shortening rental (reducing days)
                </span>
              )}
              {lifecycleAction === 'RESCHEDULE' && (
                <span style={{ fontSize: '0.78rem', color: '#0369a1', fontWeight: 700 }}>
                  🔄 Rescheduling (same duration)
                </span>
              )}
            </div>

            {(!durationValidation.valid || modDateError) && (
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
                ⚠️ {modDateError || durationValidation.error}
              </p>
            )}
          </>
        )}

        <div className={classes.badgeRow} style={{ marginTop: '14px' }}>
          <button
            type="button"
            className={classes.secondaryBtn}
            disabled={
              !selectedResGuid ||
              !lifecycleAction ||
              (lifecycleAction !== 'CANCEL' && !durationValidation.valid)
            }
            onClick={handlePreview}
          >
            Preview Price &amp; Refund Summary
          </button>
          <button
            type="button"
            className={classes.primaryBtn}
            disabled={
              !selectedResGuid ||
              !lifecycleAction ||
              (lifecycleAction !== 'CANCEL' && !durationValidation.valid)
            }
            onClick={handleConfirm}
          >
            Confirm Change
          </button>
        </div>

        {policyQuote && (
          <div
            style={{
              marginTop: '14px',
              padding: '12px 14px',
              borderRadius: '10px',
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              fontSize: '0.88rem',
            }}
          >
            <strong style={{ display: 'block', marginBottom: '6px', color: '#1e293b' }}>Change Summary</strong>
            {policyQuote.reason && <div style={{ marginBottom: '6px', color: '#475569' }}>{policyQuote.reason}</div>}
            <div className={classes.metricGrid}>
              {typeof policyQuote.extra_charge_cents === 'number' && policyQuote.extra_charge_cents > 0 && (
                <div className={classes.metricBox}>
                  <span>Additional Charge</span>
                  <strong>{formatMoney(policyQuote.extra_charge_cents)}</strong>
                </div>
              )}
              {typeof policyQuote.fee_cents === 'number' && (
                <div className={classes.metricBox}>
                  <span>Change / Cancellation Fee</span>
                  <strong>{formatMoney(policyQuote.fee_cents)}</strong>
                </div>
              )}
              {typeof policyQuote.refund_cents === 'number' && (
                <div className={classes.metricBox}>
                  <span>Estimated Refund</span>
                  <strong>{formatMoney(policyQuote.refund_cents)}</strong>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ManageReservation;

