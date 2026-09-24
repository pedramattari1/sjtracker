// Standalone CSV builder — reused by the export route (Phase 4) and the emailed
// city report (Phase 5). RFC 4180: fields containing " , CR or LF are wrapped in
// double quotes with internal quotes doubled. CRLF line endings + a UTF-8 BOM so
// Excel opens accented text (San José) cleanly.
//
// Phase 8: a titled/dated summary block (headline stats, unit-preference counts,
// leasing-stage counts) is prepended above the full prospect table.

const { buildSummary } = require('./summary');

// Human-readable header -> record key. Order is the column order.
const COLUMNS = [
  ['First name', 'fname'],
  ['Last name', 'lname'],
  ['Email', 'email'],
  ['Phone', 'phone'],
  ['Date contacted', 'referred'],
  ['Responded', 'responded'],
  ['Status', 'status'],
  ['Unit preference', 'unitpref'],
  ['Toured', 'toured'],
  ['Leasing stage', 'stage'],
  ['Notes', 'notes'],
];

function escapeField(value) {
  const s = value === undefined || value === null ? '' : String(value);
  if (/[",\r\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function row(cells) {
  return cells.map(escapeField).join(',');
}

/** Build a CSV string: summary block on top, blank line, then the prospect table. */
function buildCsv(records, opts = {}) {
  const date = opts.date || new Date().toISOString().slice(0, 10);
  const s = buildSummary(records);

  const lines = [
    row([`L.I.V.E. SJ — Prospect Summary (${date})`]),
    '',
    row(['Metric', 'Count']),
    ...s.headline.map((h) => row([h.label, h.value])),
    '',
    row(['Unit preference', 'Count']),
    ...s.units.map((u) => row([u.label, u.value])),
    '',
    row(['Leasing stage', 'Count']),
    ...s.stages.map((st) => row([st.label, st.value])),
    '',
    // full prospect table
    row(COLUMNS.map((c) => c[0])),
    ...records.map((r) => row(COLUMNS.map((c) => r[c[1]]))),
  ];

  return '﻿' + lines.join('\r\n') + '\r\n';
}

module.exports = { buildCsv, escapeField, COLUMNS };
