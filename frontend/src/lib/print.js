// Printing and sharing the plain-text salary slip. The text itself comes from the server
// (backend/slipdoc.gs → slipText_), so what is printed is exactly what was emailed.

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** The slip as a page to print: the text as it is, in a fixed-width face so the amounts line up. */
export function slipPrintHtml(text, title) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    @page { size: A4; margin: 18mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Consolas, Menlo, "Courier New", monospace; font-size: 13px; line-height: 1.5; color: #000; }
    pre { font: inherit; white-space: pre-wrap; }
  </style></head><body><pre>${esc(text)}</pre></body></html>`;
}

// An iPhone/iPad *browser tab* (every browser there is Apple's WebKit, Chrome too) ignores printing a
// hidden frame and prints the app screen instead, so there the slip opens as a page of its own and prints
// itself. The installed app, Android and computers keep the hidden frame, which prints the slip there.
const isInstalledApp = () => window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;
const isIPhoneOrIPad = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

export function printHtml(html) {
  if (isIPhoneOrIPad() && !isInstalledApp() && printInNewTab(html)) return;
  printInFrame(html);
}

// on the screen only, never on paper: a way back to the app once the print sheet is closed
const BACK_BAR = `<style>
    #ge-bar { position: sticky; top: 0; z-index: 9; display: flex; gap: 8px; align-items: center; padding: 8px; margin: 0 0 10px; background: #654321; font: 14px/1.2 Helvetica, Arial, sans-serif; }
    #ge-bar button { padding: 9px 12px; border: 0; border-radius: 8px; background: #f5bf03; color: #2b2520; font: bold 14px Helvetica, Arial, sans-serif; }
    #ge-bar #ge-print { background: #fff; }
    #ge-bar span { color: #fff; }
    @media print { #ge-bar { display: none !important; } }
  </style><div id="ge-bar"><button id="ge-back" type="button">← Back to app</button><button id="ge-print" type="button">Print again</button><span id="ge-hint"></span></div>`;

// opened right inside the tap, so the browser doesn't block it; false if it was blocked anyway
function printInNewTab(html) {
  const w = window.open("", "_blank");
  if (!w) return false;
  const doc = w.document;
  doc.open();
  doc.write(html.replace(/<body[^>]*>/, (b) => b + BACK_BAR));
  doc.close();
  const back = doc.getElementById("ge-back");
  const again = doc.getElementById("ge-print");
  if (back) back.addEventListener("click", () => {
    w.close();
    // a browser that won't close the tab: say where the app is
    setTimeout(() => {
      const hint = !w.closed && doc.getElementById("ge-hint");
      if (hint) hint.textContent = "Switch to the Groovy Employees tab";
    }, 400);
  });
  if (again) again.addEventListener("click", () => w.print());
  setTimeout(() => {
    w.focus();
    w.print();
  }, 350);
  return true;
}

function printInFrame(html) {
  const f = document.createElement("iframe");
  f.setAttribute("aria-hidden", "true");
  f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(f);
  const doc = f.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();
  setTimeout(() => {
    f.contentWindow.focus();
    f.contentWindow.print();
    setTimeout(() => f.remove(), 60000);
  }, 350);
}

/* ---------- WhatsApp / copy ---------- */

// WhatsApp shows text between ``` marks in a fixed-width face, which keeps the amounts in a column
export const whatsappText = (text) => "```" + text + "```";

export function whatsappLink(phone, text) {
  const p = String(phone || "").replace(/\D/g, "").replace(/^0+/, "");
  const to = p.length === 10 ? "91" + p : p;
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // older browsers, or a page that isn't allowed the clipboard: the long way round
    const t = document.createElement("textarea");
    t.value = text;
    t.style.cssText = "position:fixed;left:-9999px;top:0;";
    document.body.appendChild(t);
    t.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    t.remove();
    return ok;
  }
}
