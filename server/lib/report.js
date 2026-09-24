// City report — builds the Resend email payload (CSV attachment + HTML summary)
// from prospect records. Reuses the shared CSV builder and summary aggregates.

const { buildCsv } = require('./csv');
const { buildSummary } = require('./summary');
const { filterProspects } = require('./prospectsFilter');

function reportFilename(date) {
  return `sj-prospects-${date}.csv`;
}

function countTable(title, rows) {
  const body = rows
    .map(
      (r) =>
        `<tr><td style="padding:2px 12px 2px 0;color:#444">${r.label}</td>` +
        `<td style="padding:2px 0;font-weight:600;text-align:right">${r.value}</td></tr>`,
    )
    .join('');
  return (
    `<p style="margin:16px 0 4px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#666">${title}</p>` +
    `<table style="border-collapse:collapse;font-size:14px">${body}</table>`
  );
}

/** Render the summary as email-safe HTML. */
function summaryHtml(summary, day, count) {
  return (
    `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a18">` +
    `<h2 style="font-size:16px;margin:0 0 2px">L.I.V.E. SJ — Prospect Report</h2>` +
    `<p style="margin:0 0 12px;color:#666;font-size:13px">${day} · ${count} prospects</p>` +
    countTable('Headline', summary.headline) +
    countTable('Unit preference', summary.units) +
    countTable('Leasing stage', summary.stages) +
    `<p style="margin:16px 0 0;color:#666;font-size:13px">Full prospect list attached as CSV.</p>` +
    `</div>`
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
  const csv = buildCsv(filtered, { date: day });
  const summary = buildSummary(filtered);
  return {
    from,
    to: recipients,
    subject: `L.I.V.E. SJ — Prospect Report (${day})`,
    text:
      `Attached is the current L.I.V.E. SJ prospect list ` +
      `(${filtered.length} prospects) as of ${day}.`,
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
