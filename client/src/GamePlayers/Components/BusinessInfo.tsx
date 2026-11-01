import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import classes from '../Styles/Admin.module.css';
import { useUserProfile } from '../../shared/Context/UserProfileContext';
import { BusinessInfo as BusinessInfoType, fetchBusinessInfo, saveBusinessInfo } from '../../shared/Utils/businessInfo';

const FIELDS: { key: keyof BusinessInfoType; label: string; type?: string; textarea?: boolean }[] = [
  { key: 'business_name', label: 'Business Name' },
  { key: 'contact_email', label: 'Contact Email', type: 'email' },
  { key: 'contact_phone', label: 'Contact Phone', type: 'tel' },
  { key: 'physical_address', label: 'Street Address' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State / Province' },
  { key: 'postal_code', label: 'ZIP / Postal Code' },
  { key: 'country', label: 'Country' },
  { key: 'timezone', label: 'Timezone' },
  { key: 'currency', label: 'Currency' },
  { key: 'summary', label: 'Short Description', textarea: true },
];

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.95rem', boxSizing: 'border-box',
};

const BusinessInfo: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const { profile, refreshProfile } = useUserProfile();
  const { business: paramBusiness } = useParams<{ business: string }>();
  const navigate = useNavigate();
  const currentBusiness = profile?.business || paramBusiness || '';

  const [form, setForm] = useState<Partial<BusinessInfoType>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchBusinessInfo(currentBusiness, profile?.user_guid, true)
      .then(info => { if (active && info) setForm(info); })
      .catch(() => active && setStatus({ ok: false, text: 'Could not load business information.' }))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [currentBusiness, profile?.user_guid]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setStatus(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentBusiness) return;
    setSaving(true);
    try {
      const saved = await saveBusinessInfo(currentBusiness, form, profile?.user_guid);
      setForm(saved);
      setStatus({ ok: true, text: 'Business information saved.' });
      await refreshProfile();
      if (saved.business && saved.business !== currentBusiness) {
        navigate(`/${encodeURIComponent(saved.business)}/BusinessInfo`, { replace: true });
      }
    } catch (err: any) {
      setStatus({ ok: false, text: err?.response?.data?.error?.message || 'Could not save. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={classes.adminPanel}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ margin: 0 }}>Business Information</h1>
        {onBack && (
          <button type="button" className={classes.adminButton} style={{ width: 'auto', padding: '8px 16px' }} onClick={onBack}>
            ← Back
          </button>
        )}
      </div>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <form onSubmit={handleSubmit} style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, textAlign: 'left' }}>
          {FIELDS.map(f => (
            <label key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 6, gridColumn: f.textarea ? '1 / -1' : undefined, fontWeight: 600 }}>
              {f.label}
              {f.textarea ? (
                <textarea name={f.key} rows={3} style={inputStyle} value={(form[f.key] as string) || ''} onChange={handleChange} />
              ) : (
                <input name={f.key} type={f.type || 'text'} style={inputStyle} value={(form[f.key] as string) || ''} onChange={handleChange} />
              )}
            </label>
          ))}

          {status && (
            <div style={{ gridColumn: '1 / -1', padding: 12, borderRadius: 8, background: status.ok ? '#dcfce7' : '#fee2e2', color: status.ok ? '#166534' : '#991b1b' }}>
              {status.text}
            </div>
          )}

          <div style={{ gridColumn: '1 / -1' }}>
            <button type="submit" className={classes.adminButton} style={{ width: 'auto', padding: '10px 24px' }} disabled={saving}>
              {saving ? 'Saving…' : 'Save Business Information'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default BusinessInfo;

