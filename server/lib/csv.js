// Standalone CSV builder — reused by the export route (Phase 4) and the emailed
// city report (Phase 5). RFC 4180: fields containing " , CR or LF are wrapped in
// double quotes with internal quotes doubled. CRLF line endings + a UTF-8 BOM so
// Excel opens accented text (San José) cleanly.

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

/** Build a CSV string from an array of prospect records. */
function buildCsv(records) {
  const header = COLUMNS.map((c) => escapeField(c[0])).join(',');
  const lines = records.map((r) =>
    COLUMNS.map((c) => escapeField(r[c[1]])).join(','),
  );
  return '﻿' + [header, ...lines].join('\r\n') + '\r\n';
}

module.exports = { buildCsv, escapeField, COLUMNS };
