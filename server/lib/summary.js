// Canonical report aggregates. The CSV builder and the email body both consume
// this so their numbers never diverge. The web dashboard mirrors this exact logic
// (web/src/lib/summary.ts); a test locks the two together tile-for-tile.

const APPLYING_STAGES = [
  'Application in progress',
  'Application submitted',
  'Lease signed',
];

const STAGE_ORDER = [
  'Initial outreach',
  'Scheduling call / tour',
  'Tour scheduled',
  'Tour completed',
  'Application in progress',
  'Application submitted',
  'Lease signed',
  'Not proceeding',
];

const UNIT_ORDER = ['Studio', '1 Bedroom', '2 Bedroom', '1BR or 2BR', 'TBD'];

function buildSummary(records) {
  const headline = [
    { key: 'total', label: 'Total prospects', value: records.length },
    { key: 'responded', label: 'Responded', value: records.filter((r) => r.responded === 'yes').length },
    { key: 'tour', label: 'Tour sched. / done', value: records.filter((r) => r.toured === 'yes' || r.toured === 'scheduled').length },
    { key: 'follow', label: 'Need follow-up', value: records.filter((r) => r.status === 'follow' || r.status === 'cold').length },
    { key: 'applying', label: 'Applying / leased', value: records.filter((r) => APPLYING_STAGES.includes(r.stage)).length },
  ];

  const units = UNIT_ORDER.map((u) => ({
    label: u,
    value: records.filter((r) => r.unitpref === u).length,
  }));
  units.push({ label: 'Not indicated', value: records.filter((r) => !r.unitpref).length });

  const stages = STAGE_ORDER.map((s) => ({
    label: s,
    value: records.filter((r) => r.stage === s).length,
  }));

  return { headline, units, stages };
}

module.exports = { buildSummary, APPLYING_STAGES, STAGE_ORDER, UNIT_ORDER };
