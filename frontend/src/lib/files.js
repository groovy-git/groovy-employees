// CSV export helpers.

export function toCSV(rows, cols) {
  const escCell = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.map((c) => escCell(c.label)).join(","), ...rows.map((r) => cols.map((c) => escCell(typeof c.get === "function" ? c.get(r) : r[c.key])).join(","))].join("\n");
}

export function downloadText(filename, text, mime = "text/csv") {
  const blob = new Blob(["﻿" + text], { type: mime + ";charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}
