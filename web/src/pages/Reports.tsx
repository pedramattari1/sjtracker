const recipientsEnv = import.meta.env.VITE_CITY_REPORT_RECIPIENTS ?? "";
const recipients = recipientsEnv
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export function Reports() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Reports</h1>
        <p className="mt-1 text-sm text-neutral-500">
          A CSV of all prospects is emailed to the city recipient list on a
          schedule. Export the current view any time from the Prospects page.
        </p>
      </div>

      <section className="rounded-xl border border-neutral-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold">Scheduled city report</h2>
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-500">Cadence</dt>
            <dd className="text-right font-medium">
              Weekly · Mondays ~8:00 AM PT
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-500">Delivery</dt>
            <dd className="text-right font-medium">Email with CSV attachment</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-neutral-500">Recipients</dt>
            <dd>
              {recipients.length > 0 ? (
                <ul className="mt-1 space-y-1">
                  {recipients.map((r) => (
                    <li
                      key={r}
                      className="rounded-md bg-neutral-50 px-2 py-1 font-mono text-xs"
                    >
                      {r}
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-xs text-neutral-400">
                  Configured on the server (CITY_REPORT_RECIPIENTS). Set
                  VITE_CITY_REPORT_RECIPIENTS to display them here.
                </span>
              )}
            </dd>
          </div>
        </dl>
      </section>

      <p className="text-xs text-neutral-400">
        Schedule runs via GitHub Actions (UTC cron; drifts 1h with daylight
        saving). Recipients and cadence are managed in configuration for now.
      </p>
    </div>
  );
}
