// Shape returned by GET /api/prospects. Field names match the LIVE JSONB keys
// (introspected 2026-09-18) — do not rename without re-checking real data.
export interface Prospect {
  _id: string;
  order?: number;
  fname: string;
  lname: string;
  email: string;
  phone: string;
  referred: string; // date contacted (YYYY-MM-DD or "")
  responded: string; // "yes" | "no"
  status: string; // new | warm | follow | cold | none
  unitpref: string;
  toured: string; // no | scheduled | yes
  stage: string; // leasing stage label
  notes: string;
}

/** The writable fields (everything except the server-managed id/order). */
export type ProspectInput = Omit<Prospect, "_id" | "order">;
