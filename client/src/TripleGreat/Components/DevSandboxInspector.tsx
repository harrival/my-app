import React, { useEffect, useState, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import axios from 'axios';
import { BASE_URL } from '../../shared/Utils/apiConfig';
import classes from '../ComponentStyles/TripleGreat.module.scss';

const DevSandboxInspector: React.FC = () => {
  const location = useLocation();
  const [providerData, setProviderData] = useState<any | null>(null);
  const [clockState, setClockState] = useState<{
    now_iso: string;
    offset_hours: number;
    offset_ms: number;
  } | null>(null);
  const [customOffsetInput, setCustomOffsetInput] = useState<string>('168');
  const [outboxList, setOutboxList] = useState<any[]>([]);
  const [filterBusiness, setFilterBusiness] = useState<string>('');
  const [filterChannel, setFilterChannel] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [jobResult, setJobResult] = useState<any | null>(null);
  const [guardrailSimResult, setGuardrailSimResult] = useState<any | null>(null);
  const [apiSpecData, setApiSpecData] = useState<any | null>(null);
  const [checklistReport, setChecklistReport] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const loadDevSandbox = useCallback(async () => {
    setLoading(true);
    try {
      const [provRes, clockRes, outboxRes, specRes, checkRes] = await Promise.all([
        axios.get(`${BASE_URL}/dev/providers`),
        axios.get(`${BASE_URL}/dev/clock`),
        axios.get(`${BASE_URL}/dev/outbox`, {
          params: {
            format: 'json',
            business: filterBusiness.trim() || undefined,
            channel: filterChannel || undefined,
            status: filterStatus || undefined,
          },
        }),
        axios.get(`${BASE_URL}/dev/api-spec`),
        axios.get(`${BASE_URL}/dev/verification-checklist`, {
          params: { business: filterBusiness.trim() || 'alpha_rentals' },
        }),
      ]);
      setProviderData(provRes.data || null);
      setClockState(clockRes.data || null);
      setOutboxList(Array.isArray(outboxRes.data?.outbox) ? outboxRes.data.outbox : []);
      setApiSpecData(specRes.data || null);
      setChecklistReport(checkRes.data || null);
    } catch (err: any) {
      const msg =
        err?.response?.data?.error?.message ||
        err?.message ||
        'Could not load DEV-401 sandbox data';
      setStatusBanner({ type: 'error', text: String(msg) });
    } finally {
      setLoading(false);
    }
  }, [filterBusiness, filterChannel, filterStatus]);

  useEffect(() => {
    loadDevSandbox();
  }, [loadDevSandbox]);

  const handleAdvanceClock = async (payload: {
    offsetHours?: number;
    deltaHours?: number;
    reset?: boolean;
  }) => {
    setStatusBanner(null);
    try {
      const res = await axios.post(`${BASE_URL}/dev/clock`, payload);
      setClockState(res.data);
      await loadDevSandbox();
      setStatusBanner({
        type: 'success',
        text: `Time Travel Engine (/dev/clock): Simulated clock is now ${res.data.now_iso} (offset: ${res.data.offset_hours}h). Swept ${res.data.swept_expired_holds_count ?? 0} expired hold(s).`,
      });
    } catch (err: any) {
      setStatusBanner({
        type: 'error',
        text: String(err?.response?.data?.error?.message || 'Failed to update /dev/clock'),
      });
    }
  };

  const handleToggleFailNext = async (nextState: boolean) => {
    setStatusBanner(null);
    try {
      const res = await axios.post(`${BASE_URL}/dev/payments/fail-next`, {
        fail_next: nextState,
        reason: nextState
          ? 'Armed via DEV-401 Sandbox (/dev/payments/fail-next)'
          : 'Disarmed via DEV-401 Sandbox',
      });
      await loadDevSandbox();
      setStatusBanner({
        type: 'success',
        text: res.data?.fail_next
          ? 'Armed /dev/payments/fail-next: Next mock payment or refund will automatically DECLINE.'
          : 'Disarmed /dev/payments/fail-next: Mock payments will succeed normally.',
      });
    } catch (err: any) {
      setStatusBanner({
        type: 'error',
        text: String(err?.response?.data?.error?.message || 'Failed to toggle /dev/payments/fail-next'),
      });
    }
  };

  const handleRunJob = async (jobName: 'sweeper' | 'reminder' | 'outbox' | 'refund') => {
    setStatusBanner(null);
    try {
      const res = await axios.post(`${BASE_URL}/dev/jobs/${jobName}/run`, {
        business: filterBusiness.trim() || undefined,
      });
      setJobResult(res.data);
      await loadDevSandbox();
      setStatusBanner({
        type: 'success',
        text: `Executed background job '/dev/jobs/${jobName}/run' at simulated time ${res.data?.evaluated_at}.`,
      });
    } catch (err: any) {
      setStatusBanner({
        type: 'error',
        text: String(err?.response?.data?.error?.message || `Failed to run job ${jobName}`),
      });
    }
  };

  const handleTestProductionGuardrail = async () => {
    try {
      const res = await axios.get(`${BASE_URL}/dev/providers`, {
        params: {
          nodeEnv: 'production',
          paymentProvider: 'mock',
          enableDevRoutes: 'true',
        },
      });
      setGuardrailSimResult(res.data?.production_guardrail || null);
      setStatusBanner({
        type: 'success',
        text: 'Verified Section 9.1 Production Guardrail: NODE_ENV=production + mock provider refuses startup.',
      });
    } catch (err: any) {
      setStatusBanner({
        type: 'error',
        text: String(err?.response?.data?.error?.message || 'Guardrail check failed'),
      });
    }
  };

  return (
    <div className={classes.portalWrapper}>
      <div className={classes.tenantBanner}>
        <div className={classes.brandBlock}>
          <h1>Story DEV-401 — Developer Experience, Mock Providers &amp; Time Travel</h1>
          <p>
            Active Route: <code>{location.pathname}</code> &bull; Local Notification Outbox
            Inspector (<code>/dev/outbox</code>), Time Travel Engine (<code>/dev/clock</code>),
            Mock Payment Controls (<code>/dev/payments/fail-next</code>), and Worker Runner (
            <code>/dev/jobs/:name/run</code>).
          </p>
          <div className={classes.badgeRow}>
            <span className={`${classes.badge} ${classes.badgeSupervisor}`}>
              Payment: {providerData?.factory?.payment_provider?.name || 'MockPaymentProvider'}
            </span>
            <span className={`${classes.badge} ${classes.badgeBusiness}`}>
              Email: {providerData?.factory?.email_provider?.name || 'Mailpit / Console'}
            </span>
            <span className={`${classes.badge} ${classes.badgeCustomer}`}>
              SMS: {providerData?.factory?.sms_provider?.name || 'Console / Memory SMS'}
            </span>
            <span className={`${classes.badge} ${classes.badgeSupervisor}`}>
              Clock: {providerData?.factory?.clock_provider?.name || 'OffsetClock'} (
              {clockState?.offset_hours ?? 0}h)
            </span>
          </div>
        </div>
        <div className={classes.switcherControls}>
          <Link to="/book/alpha_rentals" className={classes.secondaryBtn}>
            Booking Portal (alpha_rentals)
          </Link>
          <Link to="/admin/alpha_rentals" className={classes.secondaryBtn}>
            Supervisor Panel (alpha_rentals)
          </Link>
          <a
            href={`${BASE_URL}/dev/outbox`}
            target="_blank"
            rel="noreferrer"
            className={classes.primaryBtn}
          >
            Open Raw Backend HTML (/dev/outbox)
          </a>
        </div>
      </div>

      {statusBanner && (
        <div
          className={`${classes.statusAlert} ${
            statusBanner.type === 'success' ? classes.statusSuccess : classes.statusError
          }`}
        >
          {statusBanner.text}
        </div>
      )}

      <div className={classes.gridTwo}>
        {/* Time Travel Engine (/dev/clock) */}
        <div className={classes.card}>
          <h3>Time Travel Engine (<code>GET / POST /dev/clock</code>)</h3>
          <p>
            Fast-forward system time by <em>N</em> hours to test 7-day cancellation cutoffs (
            <code>168h</code>), 48-hour automated reminders (<code>48h</code>), and checkout hold
            expirations in seconds:
          </p>
          <div className={classes.metricGrid}>
            <div className={classes.metricBox}>
              <span>Simulated UTC Time</span>
              <strong style={{ fontSize: '0.86rem' }}>
                {clockState?.now_iso ? new Date(clockState.now_iso).toLocaleString() : '—'}
              </strong>
            </div>
            <div className={classes.metricBox}>
              <span>Offset Hours</span>
              <strong>{clockState?.offset_hours ?? 0}h</strong>
            </div>
            <div className={classes.metricBox}>
              <span>Clock Implementation</span>
              <strong>{providerData?.factory?.clock_provider?.name || 'OffsetClock'}</strong>
            </div>
          </div>

          <div className={classes.badgeRow} style={{ marginTop: '14px' }}>
            <button
              type="button"
              className={classes.secondaryBtn}
              onClick={() => handleAdvanceClock({ deltaHours: 1 })}
            >
              +1 Hour (Expire Holds)
            </button>
            <button
              type="button"
              className={classes.secondaryBtn}
              onClick={() => handleAdvanceClock({ deltaHours: 24 })}
            >
              +24 Hours (+1 Day)
            </button>
            <button
              type="button"
              className={classes.secondaryBtn}
              onClick={() => handleAdvanceClock({ deltaHours: 48 })}
            >
              +48 Hours (48h Reminder Window)
            </button>
            <button
              type="button"
              className={classes.primaryBtn}
              onClick={() => handleAdvanceClock({ deltaHours: 168 })}
            >
              +168 Hours (Fast-Forward 7 Days)
            </button>
            <button
              type="button"
              className={classes.secondaryBtn}
              onClick={() => handleAdvanceClock({ reset: true })}
            >
              Reset Clock (0h)
            </button>
          </div>

          <div className={classes.badgeRow} style={{ marginTop: '12px' }}>
            <input
              type="number"
              value={customOffsetInput}
              onChange={(e) => setCustomOffsetInput(e.target.value)}
              style={{
                width: '120px',
                padding: '7px 10px',
                borderRadius: '8px',
                border: '1px solid #bdd9b7',
              }}
            />
            <button
              type="button"
              className={classes.secondaryBtn}
              onClick={() =>
                handleAdvanceClock({ offsetHours: Number(customOffsetInput || 0) })
              }
            >
              Set Exact Offset (Hours)
            </button>
          </div>
        </div>

        {/* Provider Matrix, Fail-Next Payment & Background Jobs */}
        <div className={classes.card}>
          <h3>
            Mock Providers, Fail-Next Toggle &amp; Job Runner (<code>/dev/jobs/:name/run</code>)
          </h3>
          <p>
            Force the next mock payment or refund to decline (
            <code>POST /dev/payments/fail-next</code>) or manually trigger background workers:
          </p>

          <div className={classes.badgeRow} style={{ marginTop: '10px' }}>
            <button
              type="button"
              className={
                providerData?.fail_next_payment?.fail_next
                  ? classes.dangerBtn
                  : classes.secondaryBtn
              }
              onClick={() =>
                handleToggleFailNext(!providerData?.fail_next_payment?.fail_next)
              }
            >
              {providerData?.fail_next_payment?.fail_next
                ? '🔴 Fail-Next Armed (Next Charge/Refund Declines — Click to Disarm)'
                : '🟢 Arm /dev/payments/fail-next (Force Next Payment/Refund Decline)'}
            </button>
            <button
              type="button"
              className={classes.secondaryBtn}
              onClick={handleTestProductionGuardrail}
            >
              Verify Production Guardrail (NODE_ENV=production)
            </button>
          </div>

          <div className={classes.badgeRow} style={{ marginTop: '14px' }}>
            <button
              type="button"
              className={classes.primaryBtn}
              onClick={() => handleRunJob('sweeper')}
            >
              Run Hold Sweeper (/dev/jobs/sweeper/run)
            </button>
            <button
              type="button"
              className={classes.primaryBtn}
              onClick={() => handleRunJob('reminder')}
            >
              Run 48h Reminder Worker (/dev/jobs/reminder/run)
            </button>
            <button
              type="button"
              className={classes.secondaryBtn}
              onClick={() => handleRunJob('outbox')}
            >
              Run Outbox Worker (/dev/jobs/outbox/run)
            </button>
            <button
              type="button"
              className={classes.secondaryBtn}
              onClick={() => handleRunJob('refund')}
            >
              Run Refund Worker (/dev/jobs/refund/run)
            </button>
          </div>

          {guardrailSimResult && (
            <div
              className={`${classes.statusAlert} ${classes.statusSuccess}`}
              style={{ marginTop: '12px', fontSize: '0.82rem' }}
            >
              <strong>🛡️ Production Guardrail Proof:</strong> When{' '}
              <code>NODE_ENV=production</code> with{' '}
              <code>{guardrailSimResult.mock_providers_active?.join(', ')}</code>,{' '}
              <code>would_refuse_startup_in_production = {String(guardrailSimResult.would_refuse_startup_in_production)}</code>.
            </div>
          )}

          {jobResult && (
            <pre
              className={classes.diffPre}
              style={{ marginTop: '12px', maxHeight: '140px', overflow: 'auto' }}
            >
              {JSON.stringify(jobResult, null, 2)}
            </pre>
          )}
        </div>
      </div>

      {/* Outbox Inspector (/dev/outbox) */}
      <div className={classes.card} style={{ marginTop: '20px' }}>
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
            <h3 style={{ margin: 0 }}>
              Outbox Inspector (<code>GET /dev/outbox</code>) — {outboxList.length} Message(s)
            </h3>
            <p style={{ margin: '4px 0 0' }}>
              Inspect all dispatched Email and SMS notifications across tenants and click tokenized
              guest self-service management links directly in your browser without a real mailbox or
              phone.
            </p>
          </div>
          <div className={classes.badgeRow}>
            <input
              type="text"
              placeholder="Filter business (e.g. alpha_rentals)"
              value={filterBusiness}
              onChange={(e) => setFilterBusiness(e.target.value)}
              style={{
                padding: '7px 10px',
                borderRadius: '8px',
                border: '1px solid #bdd9b7',
              }}
            />
            <select
              value={filterChannel}
              onChange={(e) => setFilterChannel(e.target.value)}
              style={{
                padding: '7px 10px',
                borderRadius: '8px',
                border: '1px solid #bdd9b7',
              }}
            >
              <option value="">All Channels</option>
              <option value="EMAIL">EMAIL</option>
              <option value="SMS">SMS</option>
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              style={{
                padding: '7px 10px',
                borderRadius: '8px',
                border: '1px solid #bdd9b7',
              }}
            >
              <option value="">All Statuses</option>
              <option value="SENT">SENT</option>
              <option value="PENDING">PENDING</option>
              <option value="FAILED">FAILED</option>
            </select>
            <button
              type="button"
              className={classes.secondaryBtn}
              disabled={loading}
              onClick={loadDevSandbox}
            >
              {loading ? 'Refreshing...' : 'Refresh Outbox'}
            </button>
          </div>
        </div>

        {outboxList.length === 0 ? (
          <p style={{ marginTop: '14px' }}>
            No notifications found in <code>notification_outbox</code> matching current filters.
          </p>
        ) : (
          <table className={classes.auditTable} style={{ marginTop: '14px' }}>
            <thead>
              <tr>
                <th>Outbox GUID / Time</th>
                <th>Business Tenant</th>
                <th>Channel</th>
                <th>Event</th>
                <th>Recipient</th>
                <th>Status</th>
                <th>Rendered Message &amp; Tokenized Guest Self-Service Link</th>
              </tr>
            </thead>
            <tbody>
              {outboxList.map((item) => {
                const manageUrl = item.payload?.variables?.manage_url || null;
                return (
                  <tr key={item.outbox_guid}>
                    <td>
                      <code>{item.outbox_guid}</code>
                      <br />
                      <small>{new Date(item.time_created).toLocaleString()}</small>
                    </td>
                    <td>
                      <strong>{item.business}</strong>
                    </td>
                    <td>
                      <span className={`${classes.badge} ${classes.badgeCustomer}`}>
                        {item.channel}
                      </span>
                    </td>
                    <td>
                      <code>{item.template_type}</code>
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
                      </span>{' '}
                      <small>(attempts: {item.attempts})</small>
                    </td>
                    <td>
                      {item.payload?.subject && (
                        <div style={{ marginBottom: '4px' }}>
                          <strong>Subject:</strong> {item.payload.subject}
                        </div>
                      )}
                      <pre
                        className={classes.diffPre}
                        style={{ whiteSpace: 'pre-wrap', margin: '4px 0' }}
                      >
                        {item.rendered_body}
                      </pre>
                      {manageUrl && (
                        <div style={{ marginTop: '6px' }}>
                          <Link to={manageUrl} className={classes.primaryBtn} style={{ display: 'inline-block', padding: '5px 10px', fontSize: '0.78rem', textDecoration: 'none' }}>
                            🔗 Open Tokenized Guest Management Link ({manageUrl})
                          </Link>
                        </div>
                      )}
                      {item.error_message && (
                        <div style={{ color: '#991b1b', fontWeight: 700, marginTop: '4px' }}>
                          Error: {item.error_message}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Section 11: API Specification Summary & Live Route Registry */}
      {apiSpecData && (
        <div className={classes.card} style={{ marginTop: '20px' }}>
          <h3>
            Section 11: API Specification Summary — Live Express Router Registry (
            {apiSpecData.registered_express_routes_count} Mounted Routes)
          </h3>
          <p>
            All endpoints from Section 11.1 (Public Booking Portal API), Section 11.2 (Supervisor
            Administration API), and Section 11.3 (Development &amp; QA Tooling API):
          </p>

          {[
            {
              title: '11.1 Public Booking Portal API',
              rows: apiSpecData.specification?.['11.1_public_booking_portal_api'] || [],
            },
            {
              title: '11.2 Supervisor Administration API (requireSupervisor)',
              rows: apiSpecData.specification?.['11.2_supervisor_administration_api'] || [],
            },
            {
              title: "11.3 Development & QA Tooling API (NODE_ENV !== 'production')",
              rows: apiSpecData.specification?.['11.3_development_and_qa_tooling_api'] || [],
            },
          ].map((group) => (
            <div key={group.title} style={{ marginTop: '16px' }}>
              <h4 style={{ margin: '0 0 8px', color: '#174b0f' }}>{group.title}</h4>
              <table className={classes.auditTable}>
                <thead>
                  <tr>
                    <th>Method</th>
                    <th>Path</th>
                    <th>Auth</th>
                    <th>Purpose</th>
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((r: any) => (
                    <tr key={`${r.method}-${r.path}`}>
                      <td>
                        <span className={`${classes.badge} ${classes.badgeSupervisor}`}>
                          {r.method}
                        </span>
                      </td>
                      <td>
                        <code>{r.path}</code>
                      </td>
                      <td>{r.auth}</td>
                      <td>{r.purpose}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {/* Section 12: Verification Checklist & Guardrails */}
      {checklistReport && (
        <div className={classes.card} style={{ marginTop: '20px' }}>
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
              <h3 style={{ margin: 0 }}>
                Section 12: Verification Checklist &amp; Guardrails ({checklistReport.passed_count} /{' '}
                {checklistReport.total_count} Passed)
              </h3>
              <p style={{ margin: '4px 0 0' }}>
                Automated live verification of all 8 architectural guardrails from{' '}
                <code>userstory.md</code>:
              </p>
            </div>
            <button
              type="button"
              className={classes.primaryBtn}
              disabled={loading}
              onClick={loadDevSandbox}
            >
              Re-Run All 8 Guardrail Checks
            </button>
          </div>

          <table className={classes.auditTable} style={{ marginTop: '14px' }}>
            <thead>
              <tr>
                <th>#</th>
                <th>Guardrail</th>
                <th>Status</th>
                <th>Requirement &amp; Live Proof</th>
              </tr>
            </thead>
            <tbody>
              {checklistReport.checklist?.map((item: any) => (
                <tr key={item.id}>
                  <td>{item.id}</td>
                  <td>
                    <strong>{item.title}</strong>
                  </td>
                  <td>
                    <span
                      className={`${classes.badge} ${
                        item.passed ? classes.badgeSupervisor : classes.badgeMismatch
                      }`}
                    >
                      {item.passed ? '✅ PASSED' : '❌ FAILED'}
                    </span>
                  </td>
                  <td>
                    <div>{item.requirement}</div>
                    <pre
                      className={classes.diffPre}
                      style={{ marginTop: '6px', fontSize: '0.76rem', whiteSpace: 'pre-wrap' }}
                    >
                      {JSON.stringify(item.proof, null, 2)}
                    </pre>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default DevSandboxInspector;

