// Where a slip has got to: Not started → Draft → Final → Emailed
export default function SlipBadge({ slip }) {
  if (!slip) return <span className="badge">Not started</span>;
  if (slip.status !== "final") return <span className="badge gold">Draft</span>;
  return slip.emailed_at ? <span className="badge ok">Emailed</span> : <span className="badge dark">Final</span>;
}
