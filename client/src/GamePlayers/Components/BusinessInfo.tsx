import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import classes from '../Styles/Admin.module.css';
import { useUserProfile } from '../../shared/Context/UserProfileContext';
import { BusinessInfo as BusinessInfoType, fetchBusinessInfo, saveBusinessInfo } from '../../shared/Utils/businessInfo';

const FIELDS: { key: keyof BusinessInfoType; label: string; placeholder?: string; type?: string; textarea?: boolean }[] = [
  { key: 'business_name', label: 'Business Name', placeholder: 'Acme Rentals' },
  { key: 'contact_email', label: 'Contact Email', type: 'email', placeholder: 'support@example.com' },
  { key: 'contact_phone', label: 'Contact Phone', type: 'tel', placeholder: '(555) 000-0000' },
  { key: 'physical_address', label: 'Street Address', placeholder: '123 Main St, Suite 100' },
  { key: 'city', label: 'City', placeholder: 'Los Angeles' },
  { key: 'state', label: 'State / Province', placeholder: 'CA' },
  { key: 'postal_code', label: 'ZIP / Postal Code', placeholder: '90001' },
  { key: 'country', label: 'Country', placeholder: 'USA' },
  { key: 'timezone', label: 'Timezone', placeholder: 'America/Los_Angeles' },
  { key: 'currency', label: 'Currency', placeholder: 'USD' },
  { key: 'summary', label: 'Short Description', textarea: true, placeholder: 'Brief summary of the business operations...' },
];

const getInputStyle = (disabled: boolean): React.CSSProperties => ({
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid #cbd5e1',
  fontSize: '0.95rem',
  boxSizing: 'border-box',
  backgroundColor: disabled ? '#f8fafc' : '#ffffff',
  color: disabled ? '#475569' : '#0f172a',
  cursor: disabled ? 'not-allowed' : 'text',
  opacity: disabled ? 0.88 : 1,
});

const BusinessInfo: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const { profile, refreshProfile } = useUserProfile();
  const { business: paramBusiness } = useParams<{ business: string }>();
  const navigate = useNavigate();
  const currentBusiness = profile?.business || paramBusiness || '';

  const [form, setForm] = useState<Partial<BusinessInfoType>>({});
  const [savedForm, setSavedForm] = useState<Partial<BusinessInfoType>>({});
  const [hasInfo, setHasInfo] = useState<boolean>(false);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchBusinessInfo(currentBusiness, profile?.user_guid, true)
      .then(info => {
        if (!active) return;
        const serverHasInfo = Boolean(
          info?.has_info !== undefined
            ? info.has_info
            : (info && (
                info.physical_address ||
                info.contact_email ||
                info.contact_phone ||
                info.city ||
                info.state ||
                info.postal_code ||
                info.country ||
                info.summary ||
                (info.business_name && info.business_name.trim().toLowerCase() !== (currentBusiness || '').trim().toLowerCase())
              ))
        );
        setHasInfo(serverHasInfo);
        setIsEditing(false);
        if (serverHasInfo && info) {
          setForm(info);
          setSavedForm(info);
        } else {
          const emptyForm: Partial<BusinessInfoType> = {
            business_name: info?.business_name || '',
            contact_email: '',
            contact_phone: '',
            physical_address: '',
            city: '',
            state: '',
            postal_code: '',
            country: '',
            timezone: info?.timezone || 'America/Los_Angeles',
            currency: info?.currency || 'USD',
            summary: '',
          };
          setForm(emptyForm);
          setSavedForm(emptyForm);
        }
      })
      .catch(() => active && setStatus({ ok: false, text: 'Could not load business information.' }))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [currentBusiness, profile?.user_guid]);

  const isFieldDisabled = hasInfo && !isEditing;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setStatus(null);
  };

  const handleCancel = () => {
    setForm(savedForm);
    setIsEditing(false);
    setStatus(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentBusiness) return;
    setSaving(true);
    setStatus(null);
    try {
      const saved = await saveBusinessInfo(currentBusiness, form, profile?.user_guid);
      setForm(saved);
      setSavedForm(saved);
      setHasInfo(true);
      setIsEditing(false);
      setStatus({ ok: true, text: hasInfo ? 'Business information saved.' : 'Business information added.' });
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>Business Information</h1>
          <p style={{ margin: '4px 0 0', color: '#666', fontSize: '0.88rem' }}>
            Configure your public contact information, physical location, and company details.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {hasInfo && !isEditing && (
            <button
              type="button"
              className={classes.adminButton}
              style={{
                width: 'auto',
                padding: '7px 16px',
                fontSize: '0.88rem',
                cursor: 'pointer',
                backgroundColor: '#f8fafc',
                borderColor: '#94a3b8',
                boxShadow: 'none',
              }}
              onClick={() => {
                setIsEditing(true);
                setStatus(null);
              }}
            >
              Edit
            </button>
          )}
          {hasInfo && isEditing && (
            <button
              type="button"
              style={{
                border: '1px solid #c3dfc0',
                background: 'none',
                color: '#2d6a2e',
                borderRadius: '6px',
                padding: '7px 14px',
                fontSize: '0.88rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              onClick={handleCancel}
            >
              Cancel Edit
            </button>
          )}
          {onBack && (
            <button
              type="button"
              className={classes.adminButton}
              style={{ width: 'auto', padding: '7px 16px', fontSize: '0.88rem', boxShadow: 'none' }}
              onClick={onBack}
            >
              ← Back
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <p style={{ marginTop: 24, color: '#666' }}>Loading…</p>
      ) : (
        <form onSubmit={handleSubmit} style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, textAlign: 'left' }}>
          {FIELDS.map(f => (
            <label key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 6, gridColumn: f.textarea ? '1 / -1' : undefined, fontWeight: 600 }}>
              {f.label}
              {f.textarea ? (
                <textarea
                  name={f.key}
                  rows={3}
                  style={getInputStyle(isFieldDisabled)}
                  placeholder={f.placeholder}
                  disabled={isFieldDisabled}
                  value={(form[f.key] as string) || ''}
                  onChange={handleChange}
                />
              ) : (
                <input
                  name={f.key}
                  type={f.type || 'text'}
                  style={getInputStyle(isFieldDisabled)}
                  placeholder={f.placeholder}
                  disabled={isFieldDisabled}
                  value={(form[f.key] as string) || ''}
                  onChange={handleChange}
                />
              )}
            </label>
          ))}

          {status && (
            <div style={{ gridColumn: '1 / -1', padding: 12, borderRadius: 8, background: status.ok ? '#dcfce7' : '#fee2e2', color: status.ok ? '#166534' : '#991b1b' }}>
              {status.text}
            </div>
          )}

          {!hasInfo && (
            <div
              style={{
                gridColumn: '1 / -1',
                display: 'flex',
                justifyContent: 'flex-end',
                marginTop: 16,
                paddingTop: 16,
                borderTop: '1px solid #e2f0df',
              }}
            >
              <button
                type="submit"
                className={classes.adminButton}
                style={{
                  width: 'auto',
                  padding: '10px 24px',
                  backgroundColor: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 8,
                  fontWeight: 600,
                  fontSize: '0.95rem',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  boxShadow: 'none',
                }}
                disabled={saving}
              >
                {saving ? 'Adding…' : 'Add Business Information'}
              </button>
            </div>
          )}

          {hasInfo && isEditing && (
            <div
              style={{
                gridColumn: '1 / -1',
                display: 'flex',
                justifyContent: 'flex-end',
                alignItems: 'center',
                gap: 12,
                marginTop: 16,
                paddingTop: 16,
                borderTop: '1px solid #e2f0df',
              }}
            >
              <button
                type="button"
                className={classes.adminButton}
                style={{
                  width: 'auto',
                  padding: '10px 20px',
                  cursor: 'pointer',
                  backgroundColor: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: 8,
                  fontWeight: 600,
                  fontSize: '0.95rem',
                  color: '#475569',
                  boxShadow: 'none',
                }}
                onClick={handleCancel}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={classes.adminButton}
                style={{
                  width: 'auto',
                  padding: '10px 24px',
                  backgroundColor: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 8,
                  fontWeight: 600,
                  fontSize: '0.95rem',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  boxShadow: 'none',
                }}
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Save Business Information'}
              </button>
            </div>
          )}
        </form>
      )}
    </div>
  );
};

export default BusinessInfo;
