// Standalone CSV builder — reused by the export route (Phase 4) and the emailed
// city report. A clean, single data table: fields containing " , CR or LF are
// RFC-4180 quoted; CRLF line endings + a UTF-8 BOM so Excel opens accented text
// (San José) cleanly and sorting/filtering work from the header row.
//
// Note: the at-a-glance summary lives in the EMAIL BODY (server/lib/report.js),
// not here — a summary jammed above the table breaks spreadsheet sort/filter.

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

/** Build a clean CSV: header row, then one row per prospect. */
function buildCsv(records) {
  const lines = [
    row(COLUMNS.map((c) => c[0])),
    ...records.map((r) => row(COLUMNS.map((c) => r[c[1]]))),
  ];
  return '﻿' + lines.join('\r\n') + '\r\n';
}

module.exports = { buildCsv, escapeField, COLUMNS };
