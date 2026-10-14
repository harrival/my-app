/**
 * Label layout math shared by the print stylesheet (PlayerQrModal) and the
 * live preview on the Configuration page, so what you see is what prints.
 * All lengths are in inches, font sizes in points.
 */
export interface LabelLayout {
  widthIn: number;
  heightIn: number;
  orientation: 'row' | 'column';
  insetIn: number;
  padIn: number;
  gapIn: number;
  qrIn: number;
  titlePt: number;
  namePt: number;
  typePt: number;
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const r3 = (n: number) => Math.round(n * 1000) / 1000;

export const computeLabelLayout = (widthIn: number, heightIn: number): LabelLayout => {
  const w = widthIn;
  const h = heightIn;
  // 3in is the reference size the original design was tuned for.
  const scale = clamp(Math.min(w, h) / 3, 0.35, 2.5);
  const insetIn = 0.08 * Math.min(1, scale);
  const padIn = 0.1 * Math.min(1, scale);
  const gapIn = 0.1 * scale;
  const innerW = w - 2 * (insetIn + padIn);
  const innerH = h - 2 * (insetIn + padIn);

  const titlePt = 11 * scale;
  const namePt = 18 * scale;
  const typePt = 10 * scale;

  // Wide labels: QR on the left, text on the right. Tall/square: stacked.
  const orientation: LabelLayout['orientation'] = w >= h * 1.15 ? 'row' : 'column';

  let qrIn: number;
  if (orientation === 'row') {
    qrIn = Math.min(innerH, innerW * 0.6);
  } else {
    // Approximate height of title + username + type rows (pt -> in = /72).
    const textBlockIn = ((titlePt + namePt + typePt) * 1.35) / 72 + 3 * gapIn;
    qrIn = Math.min(innerW, innerH - textBlockIn);
  }
  qrIn = Math.max(0.4, qrIn);

  return {
    widthIn: w,
    heightIn: h,
    orientation,
    insetIn: r3(insetIn),
    padIn: r3(padIn),
    gapIn: r3(gapIn),
    qrIn: r3(qrIn),
    titlePt: r3(titlePt),
    namePt: r3(namePt),
    typePt: r3(typePt),
  };
};

/** Builds the @media print stylesheet for a given label size. */
export const buildLabelPrintCss = (widthIn: number, heightIn: number): string => {
  const L = computeLabelLayout(widthIn, heightIn);
  const boxW = r3(L.widthIn - 2 * L.insetIn);
  const boxH = r3(L.heightIn - 2 * L.insetIn);
  const grid = L.orientation === 'row'
    ? `grid-template-columns: ${L.qrIn}in 1fr !important;
       grid-template-rows: auto 1fr auto !important;
       grid-template-areas: "qr title" "qr name" "qr type" !important;
       align-items: center !important;`
    : `grid-template-columns: 1fr !important;
       grid-template-rows: auto auto auto auto !important;
       grid-template-areas: "title" "qr" "name" "type" !important;
       align-content: space-evenly !important;`;

  return `
@media print {
  @page { size: ${L.widthIn}in ${L.heightIn}in; margin: 0; }
  html, body { width: ${L.widthIn}in !important; height: ${L.heightIn}in !important; }

  .printable-player-badge {
    position: fixed !important;
    left: ${L.insetIn}in !important;
    top: ${L.insetIn}in !important;
    width: ${boxW}in !important;
    height: ${boxH}in !important;
    max-width: none !important;
    box-sizing: border-box !important;
    margin: 0 !important;
    padding: ${L.padIn}in !important;
    border: 2px dashed #000 !important;
    border-radius: 10px !important;
    background: #fff !important;
    box-shadow: none !important;
    display: grid !important;
    ${grid}
    gap: ${L.gapIn}in !important;
    justify-items: center !important;
    text-align: center !important;
    overflow: hidden !important;
    break-inside: avoid !important;
    page-break-inside: avoid !important;
    z-index: 999999 !important;
  }
  .printable-player-badge .badge-title {
    grid-area: title !important;
    font-size: ${L.titlePt}pt !important;
    font-weight: 900 !important;
    letter-spacing: 1px !important;
    text-transform: uppercase !important;
    color: #000 !important;
    margin: 0 !important;
    line-height: 1.15 !important;
  }
  .printable-player-badge .badge-qr {
    grid-area: qr !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    margin: 0 !important;
    padding: 0 !important;
    background: transparent !important;
  }
  .printable-player-badge .badge-qr svg {
    display: block !important;
    margin: 0 !important;
    width: ${L.qrIn}in !important;
    height: ${L.qrIn}in !important;
    max-width: none !important;
    max-height: none !important;
  }
  .printable-player-badge .badge-username {
    grid-area: name !important;
    font-size: ${L.namePt}pt !important;
    font-weight: 900 !important;
    line-height: 1.15 !important;
    color: #000 !important;
    margin: 0 !important;
    word-break: break-all !important;
    max-width: 100% !important;
  }
  .printable-player-badge .badge-type {
    grid-area: type !important;
    font-size: ${L.typePt}pt !important;
    font-weight: 900 !important;
    text-transform: uppercase !important;
    color: #000 !important;
    letter-spacing: 0.5px !important;
    background: transparent !important;
    border: 2px solid #000 !important;
    border-radius: 6px !important;
    padding: 2px 8px !important;
    line-height: 1.2 !important;
    margin: 0 !important;
  }
}`;
};
