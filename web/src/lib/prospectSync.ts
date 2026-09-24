import type { ProspectInput } from "@/lib/types";

// Toured defaults implied by a leasing stage.
const STAGE_TO_TOURED: Record<string, string> = {
  "Tour completed": "yes",
  "Tour scheduled": "scheduled",
};

/**
 * When the stage changes, default Toured to match — unless the user set Toured
 * manually in the same edit (`touredManuallySet`). Returns a new object; never
 * mutates the input. Stages with no implied tour state leave Toured untouched.
 */
export function syncTouredForStage(
  rec: ProspectInput,
  touredManuallySet: boolean,
): ProspectInput {
  if (touredManuallySet) return rec;
  const implied = STAGE_TO_TOURED[rec.stage];
  if (!implied || rec.toured === implied) return rec;
  return { ...rec, toured: implied };
}
