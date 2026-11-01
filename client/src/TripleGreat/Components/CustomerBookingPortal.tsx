import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import axios from 'axios';
import { BASE_URL } from '../../shared/Utils/apiConfig';
import { useUserProfile } from '../../shared/Context/UserProfileContext';
import { useTenant } from './TenantContext';
import classes from '../ComponentStyles/TripleGreat.module.scss';

export interface CatalogItem {
  item_guid: string;
  business: string;
  name: string;
  description: string;
  daily_rate_cents: number;
  images: string[];
  is_active: boolean;
  active_units_count?: number;
}

const formatBusinessTitle = (slug: string) =>
  slug
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

const CustomerBookingPortal: React.FC = () => {
  const { business: paramBusiness } = useParams<{ business: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, customerPrefill } = useUserProfile();
  const {
    tenantBusiness,
    tenantConfig,
    loadingConfig,
    isSupervisorForActiveTenant,
    refreshTenantConfig,
  } = useTenant();

  const activeBusiness = paramBusiness || tenantBusiness || profile?.business || 'alpha_rentals';
  const displayBusinessName =
    tenantConfig?.business_name || formatBusinessTitle(activeBusiness);

  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loadingItems, setLoadingItems] = useState<boolean>(false);

  // Customer contact details (auto-filled when signed in)
  const [customerForm, setCustomerForm] = useState({
    first_name: customerPrefill?.first_name || profile?.first_name || '',
    last_name: customerPrefill?.last_name || profile?.last_name || '',
    email: customerPrefill?.email || profile?.email || '',
    phone_number: customerPrefill?.phone_number || profile?.phone_number || '',
    sms_opt_in: true,
  });

  const [lastConfirmedCheckout, setLastConfirmedCheckout] = useState<any | null>(null);
  // Reservation & Booking state
  const [selectedItemGuid, setSelectedItemGuid] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('2026-11-15');
  const [endDate, setEndDate] = useState<string>('2026-11-19');
  const [availabilityResult, setAvailabilityResult] = useState<any | null>(null);
  const [activeHold, setActiveHold] = useState<any | null>(null);
  const [holdSecondsLeft, setHoldSecondsLeft] = useState<number>(0);
  const [engineStatus, setEngineStatus] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    if (customerPrefill || profile) {
      setCustomerForm((prev) => ({
        ...prev,
        first_name: prev.first_name || customerPrefill?.first_name || profile?.first_name || '',
        last_name: prev.last_name || customerPrefill?.last_name || profile?.last_name || '',
        email: prev.email || customerPrefill?.email || profile?.email || '',
        phone_number:
          prev.phone_number || customerPrefill?.phone_number || profile?.phone_number || '',
      }));
    }
  }, [customerPrefill, profile]);

  const loadTenantItems = useCallback(
    async (biz: string) => {
      if (!biz) return;
      setLoadingItems(true);
      try {
        const res = await axios.get<CatalogItem[]>(
          `${BASE_URL}/api/${encodeURIComponent(biz)}/items`
        );
        const list = Array.isArray(res.data) ? res.data : [];
        setItems(list);
        if (list.length > 0 && !selectedItemGuid) {
          setSelectedItemGuid(list[0].item_guid);
        }
      } catch (err) {
        console.error('Error loading catalog items:', err);
        setItems([]);
      } finally {
        setLoadingItems(false);
      }
    },
    [selectedItemGuid]
  );

  useEffect(() => {
    refreshTenantConfig(activeBusiness);
    loadTenantItems(activeBusiness);
  }, [activeBusiness, refreshTenantConfig, loadTenantItems]);

  // Old ?manage_token=... links now open the dedicated Manage Reservation page
  useEffect(() => {
    const urlToken = new URLSearchParams(location.search).get('manage_token');
    if (urlToken) {
      navigate(
        `/book/${encodeURIComponent(activeBusiness)}/manage?manage_token=${encodeURIComponent(urlToken)}`,
        { replace: true }
      );
    }
  }, [location.search, activeBusiness, navigate]);

  // Countdown timer for active checkout hold
  useEffect(() => {
    if (!activeHold?.hold_expires_at) {
      setHoldSecondsLeft(0);
      return;
    }
    const updateRemaining = () => {
      const diff = Math.max(
        0,
        Math.round((new Date(activeHold.hold_expires_at).getTime() - Date.now()) / 1000)
      );
      setHoldSecondsLeft(diff);
      if (diff <= 0) {
        setActiveHold(null);
        loadTenantItems(activeBusiness);
      }
    };
    updateRemaining();
    const timer = setInterval(updateRemaining, 1000);
    return () => clearInterval(timer);
  }, [activeHold, activeBusiness, loadTenantItems]);

  const formatMoney = (cents: number, currency = tenantConfig?.currency || 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format((cents || 0) / 100);
  };

  // Changing item or dates requires re-checking before contact details are shown
  useEffect(() => {
    if (!activeHold) setAvailabilityResult(null);
  }, [selectedItemGuid, startDate, endDate, activeHold]);

  const handleCheckAvailability = async () => {
    if (!selectedItemGuid) return;
    setEngineStatus(null);
    try {
      const res = await axios.get(
        `${BASE_URL}/api/${encodeURIComponent(activeBusiness)}/items/${encodeURIComponent(
          selectedItemGuid
        )}/availability`,
        { params: { start_date: startDate, end_date: endDate } }
      );
      setAvailabilityResult(res.data);
    } catch (err: any) {
      setEngineStatus({
        type: 'error',
        text:
          err?.response?.data?.error?.message ||
          err?.response?.data?.error ||
          'Unable to check availability for the selected dates.',
      });
    }
  };

  const handleCreateHold = async () => {
    if (!selectedItemGuid) return;
    setEngineStatus(null);
    try {
      const res = await axios.post(
        `${BASE_URL}/api/${encodeURIComponent(activeBusiness)}/reservations/hold`,
        {
          item_guid: selectedItemGuid,
          start_date: startDate,
          end_date: endDate,
          customer: customerForm,
        }
      );
      setActiveHold(res.data);
      await handleCheckAvailability();
      setEngineStatus({
        type: 'success',
        text: 'Item reserved on temporary hold while you complete your booking.',
      });
    } catch (err: any) {
      setEngineStatus({
        type: 'error',
        text:
          err?.response?.data?.error?.message ||
          err?.response?.data?.error ||
          'Could not place a hold on the selected item.',
      });
    }
  };

  const handleReleaseHold = async () => {
    if (!activeHold?.reservation?.reservation_guid) return;
    setEngineStatus(null);
    try {
      await axios.delete(
        `${BASE_URL}/api/${encodeURIComponent(activeBusiness)}/reservations/${encodeURIComponent(
          activeHold.reservation.reservation_guid
        )}/hold`
      );
      setActiveHold(null);
      await handleCheckAvailability();
      setEngineStatus({
        type: 'success',
        text: 'Your temporary hold has been released.',
      });
    } catch (err: any) {
      setEngineStatus({
        type: 'error',
        text:
          err?.response?.data?.error?.message ||
          err?.response?.data?.error ||
          'Could not release hold.',
      });
    }
  };

  const handleConfirmCheckout = async () => {
    setEngineStatus(null);
    if (
      !customerForm.first_name.trim() ||
      !customerForm.last_name.trim() ||
      !customerForm.email.trim() ||
      !customerForm.phone_number.trim()
    ) {
      setEngineStatus({
        type: 'error',
        text: 'Please provide your first name, last name, email address, and phone number to complete your booking.',
      });
      return;
    }

    try {
      const res = await axios.post(
        `${BASE_URL}/api/${encodeURIComponent(activeBusiness)}/checkout/process`,
        {
          reservation_guid: activeHold?.reservation?.reservation_guid,
          item_guid: selectedItemGuid,
          start_date: startDate,
          end_date: endDate,
          customer: customerForm,
        }
      );
      setActiveHold(null);
      setLastConfirmedCheckout(res.data);
      await handleCheckAvailability();
      setEngineStatus({
        type: 'success',
        text: 'Your reservation is confirmed! Save your booking reference code below to manage or modify your reservation anytime.',
      });
    } catch (err: any) {
      setEngineStatus({
        type: 'error',
        text:
          err?.response?.data?.error?.message ||
          err?.response?.data?.error ||
          'Unable to complete your reservation. Please verify your details and try again.',
      });
    }
  };

  const activeSessionData = lastConfirmedCheckout;

  return (
    <div className={classes.portalWrapper}>
      {/* Top Navigation Bar */}
      <div className={classes.switcherBar}>
        <div className={classes.badgeRow}>
          <button
            type="button"
            className={classes.secondaryBtn}
            onClick={() => navigate('/?reservations=1')}
          >
            ← Change Location
          </button>
          <span style={{ fontWeight: 700, color: '#174b0f', fontSize: '0.95rem' }}>
            {displayBusinessName}
          </span>
        </div>

        <div className={classes.badgeRow}>
          {isSupervisorForActiveTenant && (
            <Link to={`/admin/${encodeURIComponent(activeBusiness)}`} className={classes.primaryBtn}>
              Supervisor Control Panel
            </Link>
          )}
        </div>
      </div>

      {/* Location Header Banner */}
      <section className={classes.tenantBanner}>
        <div className={classes.bannerTitleGroup}>
          <h1>
            {loadingConfig ? 'Loading Location...' : displayBusinessName}
          </h1>
          <p>
            📍 {tenantConfig?.physical_address || '100 Enterprise Way, Suite 100'}
            {tenantConfig?.contact_email ? ` • ✉️ ${tenantConfig.contact_email}` : ''}
            {tenantConfig?.contact_phone ? ` • 📞 ${tenantConfig.contact_phone}` : ''}
          </p>
        </div>

        <div className={classes.badgeRow}>
          <span className={classes.pill}>
            Free Cancellation: Up to {tenantConfig?.policies?.free_change_cutoff_hours ?? 168} hrs before start
          </span>
          <span className={classes.pill}>
            Sales Tax: {tenantConfig?.pricing?.tax_rate_percent ?? 8.25}%
          </span>
        </div>
      </section>

      {/* Available Rental Equipment Catalog */}
      <div className={classes.card}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div>
            <h3>Available Rentals</h3>
            <p>Select an item below to check date availability and complete your reservation.</p>
          </div>
          {isSupervisorForActiveTenant && (
            <Link
              to={`/admin/${encodeURIComponent(activeBusiness)}`}
              className={classes.secondaryBtn}
            >
              + Manage Inventory
            </Link>
          )}
        </div>

        {loadingItems ? (
          <p style={{ padding: '16px 0' }}>Loading available rentals...</p>
        ) : items.length === 0 ? (
          <div
            style={{
              background: '#f4fbf2',
              border: '1px dashed #b5d6ae',
              borderRadius: '12px',
              padding: '24px',
              textAlign: 'center',
              marginTop: '12px',
            }}
          >
            <strong style={{ display: 'block', marginBottom: '6px', color: '#174b0f' }}>
              No rental items are currently listed at this location
            </strong>
            <p style={{ margin: 0 }}>
              Please check back soon or choose another location.
            </p>
          </div>
        ) : (
          <div className={classes.gridThree} style={{ marginTop: '16px', marginBottom: 0 }}>
            {items.map((item) => {
              const isSelected = selectedItemGuid === item.item_guid;
              return (
                <div
                  key={item.item_guid}
                  className={classes.card}
                  style={{
                    background: isSelected ? '#eef9ec' : '#f9fdf8',
                    border: isSelected ? '2px solid #174b0f' : undefined,
                    cursor: 'pointer',
                  }}
                  onClick={() => setSelectedItemGuid(item.item_guid)}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: '8px',
                    }}
                  >
                    <h3 style={{ margin: 0 }}>{item.name}</h3>
                    <span className={`${classes.pill} ${classes.pillHighlight}`}>
                      {formatMoney(item.daily_rate_cents)} / day
                    </span>
                  </div>
                  <p style={{ marginTop: '8px' }}>
                    {item.description || 'Quality rental equipment available for daily booking.'}
                  </p>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginTop: '12px',
                    }}
                  >
                    <small style={{ fontWeight: 700, color: '#246a19' }}>
                      {item.active_units_count ?? 0} Available
                    </small>
                    <button
                      type="button"
                      className={isSelected ? classes.primaryBtn : classes.secondaryBtn}
                      style={{ padding: '5px 12px', fontSize: '0.8rem' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedItemGuid(item.item_guid);
                      }}
                    >
                      {isSelected ? 'Selected' : 'Select'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Status Alert */}
      {engineStatus && (
        <div
          className={`${classes.statusAlert} ${
            engineStatus.type === 'success' ? classes.statusSuccess : classes.statusError
          }`}
          style={{ marginTop: '20px' }}
        >
          {engineStatus.text}
        </div>
      )}

      {/* Booking Confirmation Banner */}
      {activeSessionData && (
        <div
          className={classes.card}
          style={{
            marginTop: '20px',
            background: '#f3fbf1',
            border: '1px solid #b7ddb0',
          }}
        >
          <h3 style={{ margin: '0 0 8px 0', color: '#174b0f' }}>
            Reservation Confirmed
          </h3>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '10px',
              fontSize: '0.9rem',
            }}
          >
            <div>
              <strong>Booking Reference Code:</strong>{' '}
              <code>{activeSessionData.manage_token}</code>
            </div>
            <div>
              <strong>Customer Email:</strong>{' '}
              <span>{activeSessionData.customer?.email || customerForm.email || '—'}</span>
            </div>
            <div>
              <strong>Direct Management Link:</strong>{' '}
              <Link
                to={`/book/${encodeURIComponent(activeBusiness)}/manage?manage_token=${encodeURIComponent(
                  activeSessionData.manage_token || ''
                )}`}
              >
                Open My Reservation
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Book a Reservation */}
      <div style={{ marginTop: '20px' }}>
        <div className={classes.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <h3 style={{ margin: 0 }}>Book a Reservation</h3>
            <Link to={`/book/${encodeURIComponent(activeBusiness)}/manage`} className={classes.secondaryBtn}>
              Manage an Existing Reservation →
            </Link>
          </div>
          <p>Choose your item and rental dates. Once they're available, you'll enter your contact details.</p>

          <div className={classes.formGrid}>
            <div className={classes.fieldGroup}>
              <label htmlFor="res-item-select">Rental Item</label>
              <select
                id="res-item-select"
                value={selectedItemGuid}
                onChange={(e) => setSelectedItemGuid(e.target.value)}
              >
                <option value="">-- Select an Item --</option>
                {items.map((it) => (
                  <option key={it.item_guid} value={it.item_guid}>
                    {it.name} ({formatMoney(it.daily_rate_cents)}/day)
                  </option>
                ))}
              </select>
            </div>

            <div className={classes.fieldGroup}>
              <label htmlFor="res-start-date">Pick-Up Date</label>
              <input
                id="res-start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div className={classes.fieldGroup}>
              <label htmlFor="res-end-date">Return Date</label>
              <input
                id="res-end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className={classes.badgeRow} style={{ marginTop: '12px' }}>
            <button
              type="button"
              className={classes.secondaryBtn}
              disabled={!selectedItemGuid}
              onClick={handleCheckAvailability}
            >
              Check Availability &amp; Price
            </button>
          </div>

          {availabilityResult && (
            <div className={classes.metricGrid} style={{ marginTop: '14px' }}>
              <div className={classes.metricBox}>
                <span>Availability</span>
                <strong>{availabilityResult.is_available ? 'Available' : 'Unavailable'}</strong>
              </div>
              <div className={classes.metricBox}>
                <span>Rental Duration</span>
                <strong>{availabilityResult.pricing?.days || 0} Days</strong>
              </div>
              <div className={classes.metricBox}>
                <span>Subtotal</span>
                <strong>{formatMoney(availabilityResult.pricing?.subtotal_cents || 0)}</strong>
              </div>
              <div className={classes.metricBox}>
                <span>Total (incl. Tax)</span>
                <strong>{formatMoney(availabilityResult.pricing?.total_cents || 0)}</strong>
              </div>
            </div>
          )}

          {(activeHold || availabilityResult?.is_available) && (
          <>
          <hr style={{ margin: '18px 0', borderColor: '#e2e8f0' }} />

          <h4 style={{ margin: '0 0 10px 0', color: '#174b0f' }}>Your Contact Information</h4>
          <div className={classes.formGrid}>
            <div className={classes.fieldGroup}>
              <label htmlFor="cust-first-name">First Name *</label>
              <input
                id="cust-first-name"
                type="text"
                required
                value={customerForm.first_name}
                onChange={(e) => setCustomerForm({ ...customerForm, first_name: e.target.value })}
              />
            </div>
            <div className={classes.fieldGroup}>
              <label htmlFor="cust-last-name">Last Name *</label>
              <input
                id="cust-last-name"
                type="text"
                required
                value={customerForm.last_name}
                onChange={(e) => setCustomerForm({ ...customerForm, last_name: e.target.value })}
              />
            </div>
            <div className={classes.fieldGroup}>
              <label htmlFor="cust-email">Email Address *</label>
              <input
                id="cust-email"
                type="email"
                required
                value={customerForm.email}
                onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })}
              />
            </div>
            <div className={classes.fieldGroup}>
              <label htmlFor="cust-phone">Phone Number *</label>
              <input
                id="cust-phone"
                type="tel"
                required
                value={customerForm.phone_number}
                onChange={(e) => setCustomerForm({ ...customerForm, phone_number: e.target.value })}
              />
            </div>
          </div>

          <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              id="cust-sms-opt-in"
              type="checkbox"
              checked={customerForm.sms_opt_in}
              onChange={(e) => setCustomerForm({ ...customerForm, sms_opt_in: e.target.checked })}
            />
            <label htmlFor="cust-sms-opt-in" style={{ fontSize: '0.86rem', fontWeight: 500 }}>
              Send me SMS booking confirmations and reminders
            </label>
          </div>

          {activeHold && (
            <div
              className={`${classes.statusAlert} ${classes.statusSuccess}`}
              style={{
                marginTop: '14px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '10px',
              }}
            >
              <div>
                <strong>
                  Item Held — {Math.floor(holdSecondsLeft / 60)}:
                  {String(holdSecondsLeft % 60).padStart(2, '0')} remaining
                </strong>
                <div style={{ fontSize: '0.84rem' }}>
                  Total Due: {formatMoney(activeHold.pricing?.total_cents || 0)}
                </div>
              </div>
              <button type="button" className={classes.secondaryBtn} onClick={handleReleaseHold}>
                Release Hold
              </button>
            </div>
          )}

          <div className={classes.badgeRow} style={{ marginTop: '16px' }}>
            {!activeHold && (
              <button
                type="button"
                className={classes.secondaryBtn}
                disabled={!selectedItemGuid}
                onClick={handleCreateHold}
              >
                Hold Item
              </button>
            )}
            <button
              type="button"
              className={classes.primaryBtn}
              disabled={!selectedItemGuid}
              onClick={handleConfirmCheckout}
            >
              Complete Reservation
            </button>
          </div>
          </>
          )}
        </div>
      </div>

      {/* Clean Rental Policy Summary */}
      <div className={classes.gridThree} style={{ marginTop: '20px', marginBottom: 0 }}>
        <div className={classes.card}>
          <h3>Cancellation Policy</h3>
          <p>
            Cancel at least{' '}
            <strong>{tenantConfig?.policies?.free_change_cutoff_hours ?? 168} hours</strong> before
            your pick-up date for a <strong>100% refund</strong>. Cancellations within the cutoff
            window incur a{' '}
            <strong>{tenantConfig?.policies?.late_fee_percentage ?? 25}%</strong> late cancellation
            fee.
          </p>
        </div>

        <div className={classes.card}>
          <h3>Date Changes &amp; Extensions</h3>
          <p>
            Need extra time? Extending your rental carries <strong>no change fee</strong> — you only
            pay for the additional rental days plus applicable tax, subject to availability.
          </p>
        </div>

        <div className={classes.card}>
          <h3>Pricing &amp; Taxes</h3>
          <p>
            All rentals are billed in <strong>{tenantConfig?.currency || 'USD'}</strong> with a{' '}
            <strong>{tenantConfig?.pricing?.tax_rate_percent ?? 8.25}%</strong> sales tax calculated
            at checkout.
          </p>
        </div>
      </div>
    </div>
  );
};

export default CustomerBookingPortal;
