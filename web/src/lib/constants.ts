// Enum option lists — match the current app's modal exactly. value = stored JSONB
// value; label = what the user sees.

export const STATUS_OPTIONS = [
  { value: "new", label: "New — awaiting contact" },
  { value: "warm", label: "Warm — in conversation" },
  { value: "follow", label: "Follow-up needed" },
  { value: "cold", label: "Unresponsive" },
  { value: "none", label: "Not proceeding" },
];

export const RESPONDED_OPTIONS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No — awaiting reply" },
];

export const TOURED_OPTIONS = [
  { value: "no", label: "No" },
  { value: "scheduled", label: "Scheduled" },
  { value: "yes", label: "Yes — completed" },
];

export const UNIT_OPTIONS = [
  { value: "", label: "Not indicated" },
  { value: "Studio", label: "Studio" },
  { value: "1 Bedroom", label: "1 Bedroom" },
  { value: "2 Bedroom", label: "2 Bedroom" },
  { value: "1BR or 2BR", label: "1BR or 2BR" },
  { value: "TBD", label: "TBD" },
];

export const STAGE_OPTIONS = [
  { value: "Initial outreach", label: "Initial outreach" },
  { value: "Scheduling call / tour", label: "Scheduling call / tour" },
  { value: "Tour scheduled", label: "Tour scheduled" },
  { value: "Tour completed", label: "Tour completed" },
  { value: "Application in progress", label: "Application in progress" },
  { value: "Application submitted", label: "Application submitted" },
  { value: "Lease signed", label: "Lease signed" },
  { value: "Not proceeding", label: "Not proceeding" },
];

// Short labels for the inline status <select> and badges.
export const STATUS_SHORT: Record<string, string> = {
  new: "New",
  warm: "Warm",
  follow: "Follow-up",
  cold: "Unresponsive",
  none: "Not proceeding",
};
