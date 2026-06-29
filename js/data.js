/* ============================================================
   data.js — teams, fixtures, layout geometry, relationship maps
   ============================================================ */

const TEAMS = {
  GER: ["Germany", "de"], PAR: ["Paraguay", "py"], FRA: ["France", "fr"], SWE: ["Sweden", "se"],
  RSA: ["South Africa", "za"], CAN: ["Canada", "ca"], NED: ["Netherlands", "nl"], MAR: ["Morocco", "ma"],
  POR: ["Portugal", "pt"], CRO: ["Croatia", "hr"], ESP: ["Spain", "es"], AUT: ["Austria", "at"],
  USA: ["United States", "us"], BIH: ["Bosnia & H.", "ba"], BEL: ["Belgium", "be"], SEN: ["Senegal", "sn"],
  BRA: ["Brazil", "br"], JPN: ["Japan", "jp"], CIV: ["Côte d'Ivoire", "ci"], NOR: ["Norway", "no"],
  MEX: ["Mexico", "mx"], ECU: ["Ecuador", "ec"], ENG: ["England", "gb-eng"], COD: ["DR Congo", "cd"],
  ARG: ["Argentina", "ar"], CPV: ["Cape Verde", "cv"], AUS: ["Australia", "au"], EGY: ["Egypt", "eg"],
  SUI: ["Switzerland", "ch"], ALG: ["Algeria", "dz"], COL: ["Colombia", "co"], GHA: ["Ghana", "gh"]
};

const mk = (id, round, side, idx, s0, s1, date, time) => ({ id, round, side, idx, slots: [s0, s1], date, time });

const MATCHES = [
  // Left Round of 32
  mk('M74', 0, 'L', 0, 'GER', 'PAR', '06/30/2026', '02:30'),
  mk('M77', 0, 'L', 1, 'FRA', 'SWE', '07/01/2026', '03:00'),
  mk('M73', 0, 'L', 2, 'RSA', 'CAN', '06/29/2026', '01:00'),
  mk('M75', 0, 'L', 3, 'NED', 'MAR', '06/30/2026', '07:00'),
  mk('M83', 0, 'L', 4, 'POR', 'CRO', '07/03/2026', '05:00'),
  mk('M84', 0, 'L', 5, 'ESP', 'AUT', '07/03/2026', '01:00'),
  mk('M81', 0, 'L', 6, 'USA', 'BIH', '07/02/2026', '06:00'),
  mk('M82', 0, 'L', 7, 'BEL', 'SEN', '07/02/2026', '02:00'),
  // Left Round of 16
  mk('M89', 1, 'L', 0, 'W74', 'W77', '07/05/2026', '03:00'),
  mk('M90', 1, 'L', 1, 'W73', 'W75', '07/04/2026', '23:00'),
  mk('M93', 1, 'L', 2, 'W83', 'W84', '07/07/2026', '01:00'),
  mk('M94', 1, 'L', 3, 'W81', 'W82', '07/07/2026', '06:00'),
  // Left Quarter-final
  mk('M97', 2, 'L', 0, 'W89', 'W90', '07/10/2026', '02:00'),
  mk('M98', 2, 'L', 1, 'W93', 'W94', '07/11/2026', '01:00'),
  // Left Semi-final
  mk('M101', 3, 'L', 0, 'W97', 'W98', '07/15/2026', '01:00'),
  // Right Round of 32
  mk('M76', 0, 'R', 0, 'BRA', 'JPN', '06/29/2026', '23:00'),
  mk('M78', 0, 'R', 1, 'CIV', 'NOR', '06/30/2026', '23:00'),
  mk('M79', 0, 'R', 2, 'MEX', 'ECU', '07/01/2026', '07:00'),
  mk('M80', 0, 'R', 3, 'ENG', 'COD', '07/01/2026', '22:00'),
  mk('M86', 0, 'R', 4, 'ARG', 'CPV', '07/04/2026', '04:00'),
  mk('M88', 0, 'R', 5, 'AUS', 'EGY', '07/04/2026', '00:00'),
  mk('M85', 0, 'R', 6, 'SUI', 'ALG', '07/03/2026', '09:00'),
  mk('M87', 0, 'R', 7, 'COL', 'GHA', '07/04/2026', '07:30'),
  // Right Round of 16
  mk('M91', 1, 'R', 0, 'W76', 'W78', '07/06/2026', '02:00'),
  mk('M92', 1, 'R', 1, 'W79', 'W80', '07/06/2026', '06:00'),
  mk('M95', 1, 'R', 2, 'W86', 'W88', '07/07/2026', '22:00'),
  mk('M96', 1, 'R', 3, 'W85', 'W87', '07/08/2026', '02:00'),
  // Right Quarter-final
  mk('M99', 2, 'R', 0, 'W91', 'W92', '07/12/2026', '03:00'),
  mk('M100', 2, 'R', 1, 'W95', 'W96', '07/12/2026', '07:00'),
  // Right Semi-final
  mk('M102', 3, 'R', 0, 'W99', 'W100', '07/16/2026', '01:00'),
  // Final
  mk('M104', 4, 'C', 0, 'W101', 'W102', '07/20/2026', '01:00'),
  // Play-off for third place
  mk('M103', 5, 'C', 0, 'RU101', 'RU102', '07/19/2026', '03:00')
];

const byId = {};
MATCHES.forEach(m => byId[m.id] = m);
const matchAt = (side, round, idx) => MATCHES.find(m => m.side === side && m.round === round && m.idx === idx);

/* downstream: where each match's WINNER goes */
const downstream = {};
MATCHES.forEach(m => {
  m.slots.forEach((ph, i) => {
    if (/^W\d+$/.test(ph)) downstream['M' + ph.slice(1)] = { mid: m.id, sidx: i };
  });
});
/* loserstream: where each semi's LOSER goes (third-place match) */
const loserstream = {};
MATCHES.forEach(m => {
  m.slots.forEach((ph, i) => {
    if (/^RU\d+$/.test(ph)) loserstream['M' + ph.slice(2)] = { mid: m.id, sidx: i };
  });
});

/* ---------------- layout geometry ---------------- */
const CARD_W = 100;
const SLOT_H = 90, Y0 = 104;
const yR32 = i => Y0 + i * SLOT_H;
const yR16 = j => (yR32(2 * j) + yR32(2 * j + 1)) / 2;
const yQF = j => (yR16(2 * j) + yR16(2 * j + 1)) / 2;
const ySF = () => (yQF(0) + yQF(1)) / 2;

const XL = [103, 231, 359, 487];
const XR = [977, 849, 721, 593];
function cardX(m) { return m.side === 'C' ? 540 : (m.side === 'L' ? XL[m.round] : XR[m.round]); }
function cardY(m) {
  if (m.round === 0) return yR32(m.idx);
  if (m.round === 1) return yR16(m.idx);
  if (m.round === 2) return yQF(m.idx);
  if (m.round === 3) return ySF();
  if (m.round === 4) return ySF() - 100;
  return ySF() + 150; // 3rd place
}
const headX = (side, round) => side === 'L' ? XL[round] : XR[round];

/* ---------------- trophy SVG ---------------- */
const TROPHY_SVG = `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="trGold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffe9a8"/><stop offset="0.5" stop-color="#ffc94d"/><stop offset="1" stop-color="#e09112"/>
    </linearGradient>
    <linearGradient id="trShine" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0.9"/><stop offset="0.4" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <path d="M20 8 h24 v10 a12 12 0 0 1 -12 12 a12 12 0 0 1 -12 -12 z" fill="url(#trGold)"/>
  <path d="M20 10 c-8 0 -12 4 -12 9 c0 6 5 9 11 9" fill="none" stroke="url(#trGold)" stroke-width="3.4" stroke-linecap="round"/>
  <path d="M44 10 c8 0 12 4 12 9 c0 6 -5 9 -11 9" fill="none" stroke="url(#trGold)" stroke-width="3.4" stroke-linecap="round"/>
  <rect x="29" y="29" width="6" height="9" fill="url(#trGold)"/>
  <path d="M22 38 h20 l-3 6 h-14 z" fill="url(#trGold)"/>
  <rect x="24" y="44" width="16" height="4" rx="1.4" fill="#c97f0f"/>
  <rect x="21" y="48" width="22" height="5" rx="2" fill="url(#trGold)"/>
  <path d="M24 9 q4 9 8 9 q-2 -6 -2 -9 z" fill="url(#trShine)"/>
</svg>`;