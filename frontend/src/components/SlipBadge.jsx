// Where a slip has got to: Not started → Draft → Final → Emailed.
// Someone paid per event day is only due a slip in a month they worked, so "No slip" is not a to-do.
export default function SlipBadge({ slip, eventPaid }) {
  if (!slip) return eventPaid ? <span className="badge" style={{ background: "transparent", color: "var(--muted)", border: "1px solid var(--line)" }}>No slip</span> : <span className="badge">Not started</span>;
  if (slip.status !== "final") return <span className="badge gold">Draft</span>;
  return slip.emailed_at ? <span className="badge ok">Emailed</span> : <span className="badge dark">Final</span>;
}
