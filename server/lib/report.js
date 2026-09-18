// City report — builds the Resend email payload (CSV attachment) from prospect
// records. Reuses the Phase 4 CSV builder and filter; no CSV logic here.

const { buildCsv } = require('./csv');
const { filterProspects } = require('./prospectsFilter');

function reportFilename(date) {
  return `sj-prospects-${date}.csv`;
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
  return {
    from,
    to: recipients,
    subject: `L.I.V.E. SJ — Prospect Report (${day})`,
    text:
      `Attached is the current L.I.V.E. SJ prospect list ` +
      `(${filtered.length} prospects) as of ${day}.`,
    attachments: [
      {
        filename: reportFilename(day),
        content: Buffer.from(csv, 'utf8').toString('base64'),
      },
    ],
    _count: filtered.length,
  };
}

module.exports = { buildReportPayload, reportFilename };
