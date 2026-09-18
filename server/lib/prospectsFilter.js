// Standalone prospect filter — mirrors the web Prospects view's filter semantics
// (lib/filters.ts) so "export current view" matches the screen. AND-combined.
// Reused by the export route and the Phase 5 report.

const APPLYING_STAGES = [
  'Application in progress',
  'Application submitted',
  'Lease signed',
];

const UNIT_NONE = '__none__';

function tilePredicate(tile) {
  switch (tile) {
    case 'responded':
      return (r) => r.responded === 'yes';
    case 'tour':
      return (r) => r.toured === 'yes' || r.toured === 'scheduled';
    case 'follow':
      return (r) => r.status === 'follow' || r.status === 'cold';
    case 'applying':
      return (r) => APPLYING_STAGES.includes(r.stage);
    default:
      return null; // "total" or unknown -> no constraint
  }
}

/**
 * Filter records by query params: search, status, unitpref (or "__none__"),
 * toured, stage, tile. Any absent param is ignored. All present ones AND together.
 */
function filterProspects(records, q = {}) {
  const search = (q.search || '').trim().toLowerCase();
  const tilePred = q.tile ? tilePredicate(q.tile) : null;
  return records.filter((r) => {
    if (q.status && r.status !== q.status) return false;
    if (q.toured && r.toured !== q.toured) return false;
    if (q.stage && r.stage !== q.stage) return false;
    if (q.unitpref) {
      if (q.unitpref === UNIT_NONE ? r.unitpref !== '' : r.unitpref !== q.unitpref)
        return false;
    }
    if (tilePred && !tilePred(r)) return false;
    if (search) {
      const hay = `${r.fname} ${r.lname} ${r.email}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });
}

module.exports = { filterProspects, tilePredicate, APPLYING_STAGES, UNIT_NONE };
