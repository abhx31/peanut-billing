// Shown straight away while a tab's data loads, so a click responds at once
// instead of the screen sitting still until the server has finished. The
// sidebar, header and store bar (from the layout) stay in place around it.
export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="rounded-xl bg-card ring-1 ring-foreground/10 p-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="h-5 w-48 rounded bg-muted" />
          <div className="h-8 w-40 rounded-lg bg-muted" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 rounded-lg bg-muted" />
          ))}
        </div>
      </div>
      <div className="rounded-xl bg-card ring-1 ring-foreground/10 p-4 space-y-3">
        <div className="h-5 w-40 rounded bg-muted" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-9 rounded bg-muted/70" />
        ))}
      </div>
    </div>
  );
}
