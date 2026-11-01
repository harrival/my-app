import React, { useCallback, useEffect, useState } from 'react';
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
  const displayBusinessName = tenantConfig?.business_name || activeBusiness;
  // Signed-in customers only ever see their own reservations
  const customerGuid = isCustomer ? profile?.customer_guid || profile?.user_guid || null : null;

  const [reservations, setReservations] = useState<any[]>([]);
  const [manageTokenInput, setManageTokenInput] = useState('');
  const [selectedResGuid, setSelectedResGuid] = useState('');
  const [lifecycleAction, setLifecycleAction] = useState<LifecycleAction>('RESCHEDULE');
  const [modStartDate, setModStartDate] = useState('');
  const [modEndDate, setModEndDate] = useState('');
  const [policyQuote, setPolicyQuote] = useState<any | null>(null);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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
    if (!selectedResGuid) return;
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
    if (!selectedResGuid) return;
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
          <span style={{ fontWeight: 700, color: '#174b0f', fontSize: '0.95rem' }}>{displayBusinessName}</span>
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
              onChange={(e) => {
                setSelectedResGuid(e.target.value);
                setPolicyQuote(null);
              }}
            >
              <option value="">
                {reservations.length ? '-- Select Reservation --' : '-- No reservations found --'}
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
              onChange={(e) => {
                setLifecycleAction(e.target.value as LifecycleAction);
                setPolicyQuote(null);
              }}
            >
              <option value="RESCHEDULE">Reschedule Dates</option>
              <option value="ADD_DAYS">Extend Rental (Add Days)</option>
              <option value="REMOVE_DAYS">Shorten Rental (Remove Days)</option>
              <option value="CANCEL">Cancel Reservation</option>
            </select>
          </div>
        </div>

        {lifecycleAction !== 'CANCEL' && (
          <div className={classes.formGrid} style={{ marginTop: '10px' }}>
            <div className={classes.fieldGroup}>
              <label htmlFor="mod-start-date">New Pick-Up Date</label>
              <input id="mod-start-date" type="date" value={modStartDate} onChange={(e) => setModStartDate(e.target.value)} />
            </div>
            <div className={classes.fieldGroup}>
              <label htmlFor="mod-end-date">New Return Date</label>
              <input id="mod-end-date" type="date" value={modEndDate} onChange={(e) => setModEndDate(e.target.value)} />
            </div>
          </div>
        )}

        <div className={classes.badgeRow} style={{ marginTop: '14px' }}>
          <button type="button" className={classes.secondaryBtn} disabled={!selectedResGuid} onClick={handlePreview}>
            Preview Price &amp; Refund Summary
          </button>
          <button type="button" className={classes.primaryBtn} disabled={!selectedResGuid} onClick={handleConfirm}>
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

