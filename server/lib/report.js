// City report — builds the Resend email payload: a polished HTML summary rendered
// INLINE in the email body, plus a clean CSV attachment (data only). Reuses the
// shared CSV builder and summary aggregates.

const { buildCsv } = require('./csv');
const { buildSummary } = require('./summary');
const { filterProspects } = require('./prospectsFilter');

function reportFilename(date) {
  return `sj-prospects-${date}.csv`;
}

// Email-safe palette (inline styles only; table-based layout for broad client support).
const C = {
  ink: '#1a1a18', muted: '#6b6a65', line: '#e5e3dc',
  accent: '#185fa5', accentBg: '#eaf1fb', zero: '#b7b5ad',
};

function statCard(value, label, primary) {
  return (
    `<td style="padding:5px"><div style="border:1px solid ${C.line};border-radius:10px;` +
    `padding:14px 8px;text-align:center;background:${primary ? C.accentBg : '#ffffff'}">` +
    `<div style="font-size:24px;font-weight:700;line-height:1;color:${primary ? C.accent : C.ink}">${value}</div>` +
    `<div style="font-size:10px;color:${C.muted};margin-top:6px;text-transform:uppercase;letter-spacing:.04em">${label}</div>` +
    `</div></td>`
  );
}

function kvRow(label, value) {
  const col = value === 0 ? C.zero : C.ink;
  return (
    `<tr><td style="padding:7px 0;border-bottom:1px solid ${C.line};font-size:14px;color:${col}">${label}</td>` +
    `<td style="padding:7px 0;border-bottom:1px solid ${C.line};font-size:14px;font-weight:700;text-align:right;color:${col}">${value}</td></tr>`
  );
}

function barRow(label, value, max) {
  const col = value === 0 ? C.zero : C.ink;
  const w = Math.round((value / max) * 100);
  return (
    `<tr><td style="padding:7px 0;font-size:13px;color:${col};width:52%">${label}</td>` +
    `<td style="padding:7px 10px;width:38%"><div style="background:${C.line};border-radius:4px;height:8px">` +
    `<div style="background:${C.accent};height:8px;border-radius:4px;width:${w}%"></div></div></td>` +
    `<td style="padding:7px 0;font-size:13px;font-weight:700;text-align:right;color:${col}">${value}</td></tr>`
  );
}

/** Render the summary as email-safe HTML shown inline in the body. */
function summaryHtml(summary, day, count) {
  const stageMax = Math.max(1, ...summary.stages.map((s) => s.value));
  const cards = summary.headline.map((h, i) => statCard(h.value, h.label, i === 0)).join('');
  const sectionLabel = (t) =>
    `<div style="font-size:12px;font-weight:700;color:${C.muted};text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px">${t}</div>`;

  return (
    `<div style="margin:0;background:#f1efe9;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid ${C.line};border-radius:14px;overflow:hidden">` +
    `<tr><td style="background:${C.accent};padding:22px 26px">` +
    `<div style="color:#ffffff;font-size:18px;font-weight:700">L.I.V.E. SJ — Weekly Prospect Report</div>` +
    `<div style="color:#cfe0f5;font-size:12px;margin-top:4px">City of San José subsidy program · The Fay at 10 E. Reed St.</div>` +
    `</td></tr>` +
    `<tr><td style="padding:18px 21px 4px">` +
    `<div style="font-size:12px;color:${C.muted};text-transform:uppercase;letter-spacing:.05em;padding:0 5px 6px">Week of ${day} · ${count} prospects</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${cards}</tr></table>` +
    `</td></tr>` +
    `<tr><td style="padding:14px 26px 4px">${sectionLabel('Unit preference')}` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${summary.units.map((u) => kvRow(u.label, u.value)).join('')}</table></td></tr>` +
    `<tr><td style="padding:16px 26px 8px">${sectionLabel('Leasing stage')}` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${summary.stages.map((s) => barRow(s.label, s.value, stageMax)).join('')}</table></td></tr>` +
    `<tr><td style="padding:14px 26px 24px;border-top:1px solid ${C.line}">` +
    `<div style="font-size:13px;color:${C.muted}">📎 Full prospect list attached as a CSV spreadsheet.</div></td></tr>` +
    `</table>` +
    `<div style="color:#a8a69e;font-size:11px;margin-top:14px">Generated automatically · L.I.V.E. SJ Prospect Tracker</div>` +
    `</td></tr></table></div>`
  );
}

/**
 * Build the Resend email object. Pure — no network, no env reads. The caller
 * supplies `from`, `recipients` (array), the `records`, and an optional filter
 * `query`. `_count` is metadata for the caller (strip before sending).
 */
function buildReportPayload({ records, from, recipients, query, date }) {
  const day = date || new Date().toISOString().slice(0, 10);
  const filtered = filterProspects(records, query || {});
  const csv = buildCsv(filtered);
  const summary = buildSummary(filtered);
  return {
    from,
    to: recipients,
    subject: `L.I.V.E. SJ — Prospect Report (${day})`,
    text:
      `L.I.V.E. SJ weekly prospect report for ${day} — ${filtered.length} prospects. ` +
      `View the summary in an HTML-capable email client; full list attached as CSV.`,
    html: summaryHtml(summary, day, filtered.length),
    attachments: [
      {
        filename: reportFilename(day),
        content: Buffer.from(csv, 'utf8').toString('base64'),
      },
    ],
    _count: filtered.length,
  };
}

module.exports = { buildReportPayload, reportFilename, summaryHtml };
