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

/** City-report recipient. */
export interface Recipient {
  id: string;
  email: string;
  name: string;
}

// ---- Nurture / two-way messaging (Phase 1) ----

/** A connected Gmail account (no token ever exposed to the client). */
export interface EmailAccount {
  id: string;
  clerk_user_id: string | null;
  email: string;
  provider: string;
  display_name: string | null;
  last_history_id: string | null;
  status: string;
  created_at: string;
}

/** A conversation row as returned by GET /api/conversations (joined fields). */
export interface Conversation {
  id: string;
  prospect_id: string | null;
  email_account_id: string | null;
  gmail_thread_id: string | null;
  subject: string | null;
  status: string;
  tag: string | null;
  unread: boolean;
  snoozed_until: string | null;
  last_message_at: string | null;
  created_at: string;
  account_email: string | null;
  prospect_fname: string | null;
  prospect_email: string | null;
}

/** A stored email in a conversation. */
export interface Message {
  id: string;
  conversation_id: string;
  direction: "outbound" | "inbound";
  gmail_message_id: string | null;
  rfc822_message_id: string | null;
  from_email: string | null;
  to_email: string | null;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  snippet: string | null;
  is_bounce: boolean;
  sent_at: string | null;
  received_at: string | null;
  created_at: string;
}
