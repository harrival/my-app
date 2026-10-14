import React, { useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { FaPrint, FaSyncAlt, FaCheckCircle, FaExclamationTriangle, FaCog, FaUndo } from 'react-icons/fa';
import classes from '../Styles/Configuration.module.scss';
import {
  useSettings,
  PAPER_MIN_IN,
  PAPER_MAX_IN,
  DEFAULT_SETTINGS,
} from '../../shared/Context/SettingsContext';
import { useUserProfile } from '../../shared/Context/UserProfileContext';
import { computeLabelLayout } from '../../shared/Utils/labelLayout';

/* ------------------------------------------------------------------ */
/* Sections — add future configuration areas to this list.            */
/* ------------------------------------------------------------------ */
type SectionId = 'printer';
const SECTIONS: { id: SectionId; label: string; icon: React.ReactNode; description: string }[] = [
  { id: 'printer', label: 'Printer', icon: <FaPrint />, description: 'Label paper size for player QR tickets' },
];

const PAPER_PRESETS: { label: string; w: number; h: number }[] = [
  { label: '4 × 6', w: 4, h: 6 },
  { label: '4 × 3', w: 4, h: 3 },
  { label: '3 × 2', w: 3, h: 2 },
  { label: '2.25 × 1.25', w: 2.25, h: 1.25 },
  { label: '2 × 1', w: 2, h: 1 },
];

/* ------------------------------------------------------------------ */
/* Live, to-scale preview using the same layout math as printing.     */
/* ------------------------------------------------------------------ */
const LabelPreview: React.FC<{ widthIn: number; heightIn: number; business?: string }> = ({ widthIn, heightIn, business }) => {
  const L = computeLabelLayout(widthIn, heightIn);
  const pxPerIn = Math.min(340 / widthIn, 260 / heightIn);
  const px = (inches: number) => inches * pxPerIn;
  const ptPx = (pt: number) => (pt / 72) * pxPerIn;

  const badgeStyle: React.CSSProperties = {
    position: 'absolute',
    left: px(L.insetIn),
    top: px(L.insetIn),
    width: px(widthIn - 2 * L.insetIn),
    height: px(heightIn - 2 * L.insetIn),
    padding: px(L.padIn),
    gap: px(L.gapIn),
    ...(L.orientation === 'row'
      ? {
          gridTemplateColumns: `${px(L.qrIn)}px 1fr`,
          gridTemplateRows: 'auto 1fr auto',
          gridTemplateAreas: '"qr title" "qr name" "qr type"',
          alignItems: 'center',
        }
      : {
          gridTemplateColumns: '1fr',
          gridTemplateRows: 'auto auto auto auto',
          gridTemplateAreas: '"title" "qr" "name" "type"',
          alignContent: 'space-evenly',
        }),
  };

  return (
    <div className={classes.previewStage}>
      <div className={classes.paper} style={{ width: px(widthIn), height: px(heightIn) }}>
        <div className={classes.previewBadge} style={badgeStyle}>
          <div style={{ gridArea: 'title', fontSize: ptPx(L.titlePt) }} className={classes.pvTitle}>Triple Great Game</div>
          <div style={{ gridArea: 'qr' }}>
            <QRCodeSVG value={`${business || 'demo'}-player`} size={Math.round(px(L.qrIn))} level="H" includeMargin />
          </div>
          <div style={{ gridArea: 'name', fontSize: ptPx(L.namePt) }} className={classes.pvName}>PLAYER42</div>
          <div style={{ gridArea: 'type', fontSize: ptPx(L.typePt) }} className={classes.pvType}>CAT PUZZLE</div>
        </div>
      </div>
      <span className={classes.dimLabel}>{widthIn}" × {heightIn}"</span>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Printer section                                                    */
/* ------------------------------------------------------------------ */
const PrinterSection: React.FC = () => {
  const { settings, saveSettings, lastModified } = useSettings();
  const { profile } = useUserProfile();
  const saved = settings.printer;

  const [width, setWidth] = useState<string>(String(saved.paperWidthIn));
  const [height, setHeight] = useState<string>(String(saved.paperHeightIn));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Re-sync when saved settings change (initial load or another admin saved).
  useEffect(() => {
    setWidth(String(saved.paperWidthIn));
    setHeight(String(saved.paperHeightIn));
  }, [saved.paperWidthIn, saved.paperHeightIn]);

  const w = parseFloat(width);
  const h = parseFloat(height);
  const inRange = (n: number) => Number.isFinite(n) && n >= PAPER_MIN_IN && n <= PAPER_MAX_IN;
  const widthError = !inRange(w) ? `${PAPER_MIN_IN}–${PAPER_MAX_IN} in` : null;
  const heightError = !inRange(h) ? `${PAPER_MIN_IN}–${PAPER_MAX_IN} in` : null;
  const isValid = !widthError && !heightError;
  const isDirty = isValid && (w !== saved.paperWidthIn || h !== saved.paperHeightIn);

  const previewW = isValid ? w : saved.paperWidthIn;
  const previewH = isValid ? h : saved.paperHeightIn;

  const activePreset = useMemo(
    () => PAPER_PRESETS.find(p => p.w === w && p.h === h)?.label,
    [w, h]
  );

  const applySize = (nw: number, nh: number) => {
    setWidth(String(nw));
    setHeight(String(nh));
    setStatus(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    setSaving(true);
    setStatus(null);
    try {
      await saveSettings({ printer: { paperWidthIn: w, paperHeightIn: h } });
      setStatus({ type: 'success', text: 'Paper size saved. All devices will print with the new size.' });
    } catch (err: any) {
      setStatus({ type: 'error', text: err?.response?.data?.error || 'Could not save settings. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className={classes.card} onSubmit={handleSave} noValidate>
      <header className={classes.cardHeader}>
        <div>
          <h3>Label paper size</h3>
          <p>Set this to the exact size of the labels loaded in your printer. Applies to every device in <strong>{profile?.business}</strong>.</p>
        </div>
      </header>

      <div className={classes.cardBody}>
        <div className={classes.controls}>
          <span className={classes.fieldGroupLabel}>Quick presets (inches)</span>
          <div className={classes.presets}>
            {PAPER_PRESETS.map(p => (
              <button
                key={p.label}
                id={`preset-${p.label.replace(/[^0-9.]+/g, 'x')}`}
                type="button"
                className={`${classes.chip} ${activePreset === p.label ? classes.chipActive : ''}`}
                onClick={() => applySize(p.w, p.h)}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className={classes.sizeRow}>
            <label className={classes.field} htmlFor="paper-width">
              <span>Width</span>
              <div className={`${classes.inputWrap} ${widthError ? classes.invalid : ''}`}>
                <input
                  id="paper-width"
                  type="number"
                  inputMode="decimal"
                  step="0.05"
                  min={PAPER_MIN_IN}
                  max={PAPER_MAX_IN}
                  value={width}
                  onChange={e => { setWidth(e.target.value); setStatus(null); }}
                />
                <em>in</em>
              </div>
              {widthError && <small>{widthError}</small>}
            </label>

            <button
              id="swap-orientation"
              type="button"
              className={classes.swapBtn}
              onClick={() => applySize(h || saved.paperHeightIn, w || saved.paperWidthIn)}
              title="Swap width and height"
              aria-label="Swap width and height"
            >
              <FaSyncAlt />
            </button>

            <label className={classes.field} htmlFor="paper-height">
              <span>Height</span>
              <div className={`${classes.inputWrap} ${heightError ? classes.invalid : ''}`}>
                <input
                  id="paper-height"
                  type="number"
                  inputMode="decimal"
                  step="0.05"
                  min={PAPER_MIN_IN}
                  max={PAPER_MAX_IN}
                  value={height}
                  onChange={e => { setHeight(e.target.value); setStatus(null); }}
                />
                <em>in</em>
              </div>
              {heightError && <small>{heightError}</small>}
            </label>
          </div>

          <p className={classes.hint}>
            Width is the side that goes across the printer; height is the length of each label as it feeds out.
            In Chrome's print dialog, choose the same paper size, set margins to <strong>None</strong> and scale to <strong>Default</strong>.
          </p>
        </div>

        <LabelPreview widthIn={previewW} heightIn={previewH} business={profile?.business} />
      </div>

      {status && (
        <div className={`${classes.status} ${status.type === 'success' ? classes.statusOk : classes.statusErr}`} role="status">
          {status.type === 'success' ? <FaCheckCircle /> : <FaExclamationTriangle />}
          {status.text}
        </div>
      )}

      <footer className={classes.cardFooter}>
        <span className={classes.meta}>
          {lastModified ? `Last saved ${new Date(lastModified).toLocaleString()}` : `Using default ${DEFAULT_SETTINGS.printer.paperWidthIn}" × ${DEFAULT_SETTINGS.printer.paperHeightIn}"`}
        </span>
        <div className={classes.footerActions}>
          <button
            id="reset-paper-size"
            type="button"
            className={classes.ghostBtn}
            disabled={!isDirty && isValid}
            onClick={() => applySize(saved.paperWidthIn, saved.paperHeightIn)}
          >
            <FaUndo /> Revert
          </button>
          <button id="save-paper-size" type="submit" className={classes.primaryBtn} disabled={!isDirty || saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </footer>
    </form>
  );
};

/* ------------------------------------------------------------------ */
/* Page                                                               */
/* ------------------------------------------------------------------ */
const Configuration: React.FC = () => {
  const [active, setActive] = useState<SectionId>('printer');

  return (
    <main className={classes.page}>
      <div className={classes.pageHeader}>
        <span className={classes.pageIcon}><FaCog /></span>
        <div>
          <h2>Configuration</h2>
          <p>Business-wide settings. Only Admins and Supervisors can see this page.</p>
        </div>
      </div>

      <div className={classes.layout}>
        <nav className={classes.sideNav} aria-label="Configuration sections">
          {SECTIONS.map(s => (
            <button
              key={s.id}
              id={`config-section-${s.id}`}
              type="button"
              className={`${classes.navItem} ${active === s.id ? classes.navItemActive : ''}`}
              onClick={() => setActive(s.id)}
            >
              <span className={classes.navIcon}>{s.icon}</span>
              <span>
                <strong>{s.label}</strong>
                <small>{s.description}</small>
              </span>
            </button>
          ))}
        </nav>

        <section className={classes.content}>
          {active === 'printer' && <PrinterSection />}
        </section>
      </div>
    </main>
  );
};

export default Configuration;
