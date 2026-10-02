/**
 * The slip as a document: plain text (shown in the app, shared, and the body of the email) and a PDF
 * filed in Google Drive:
 *
 *   <folder of the Sheet>/Salary_Slips/FY 2026-27/09/3-Asha-2026-09.pdf
 *
 * Both are made here on the server from the saved slip, so there is one version of each and the app
 * only shows them. Files stay private to the account that owns the Sheet.
 */

const SLIP_ROOT_ = "Salary_Slips";
const SHORT_MONTHS_ = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/* ---------- money, words, dates ---------- */

// "1234567" → "12,34,567"
function groupIndian_(digits) {
    if (digits.length <= 3) return digits;
    const parts = [digits.slice(-3)];
    let rest = digits.slice(0, -3);
    while (rest.length > 2) {
        parts.unshift(rest.slice(-2));
        rest = rest.slice(0, -2);
    }
    if (rest) parts.unshift(rest);
    return parts.join(",");
}

// ₹1,23,456 — paise only when there are any
function money_(n, symbol) {
    const v = r2_(Math.abs(num_(n)));
    const whole = Math.floor(v);
    const paise = Math.round((v - whole) * 100);
    return (num_(n) < 0 ? "-" : "") + (symbol === undefined ? setting_("currency_symbol") : symbol) + groupIndian_(String(whole)) + (paise ? "." + pad_(paise, 2) : "");
}

const ONES_ = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS_ = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function below100_(n) {
    if (n < 20) return ONES_[n];
    return TENS_[Math.floor(n / 10)] + (n % 10 ? "-" + ONES_[n % 10] : "");
}

function below1000_(n) {
    const h = Math.floor(n / 100);
    return [h ? ONES_[h] + " Hundred" : "", below100_(n % 100)].filter(Boolean).join(" ");
}

/** A whole number in words, the Indian way: 1,23,45,678 → One Crore Twenty-Three Lakh Forty-Five Thousand Six Hundred Seventy-Eight. */
function inWords_(n) {
    n = Math.floor(Math.abs(num_(n)));
    if (n === 0) return "Zero";
    const crore = Math.floor(n / 10000000);
    const lakh = Math.floor((n % 10000000) / 100000);
    const thousand = Math.floor((n % 100000) / 1000);
    return [
        crore ? inWords_(crore) + " Crore" : "",
        lakh ? below100_(lakh) + " Lakh" : "",
        thousand ? below100_(thousand) + " Thousand" : "",
        below1000_(n % 1000),
    ].filter(Boolean).join(" ");
}

// "Rupees Fourteen Thousand Fifty only"
function amountInWords_(n, symbol) {
    const v = r2_(Math.abs(num_(n)));
    const whole = Math.floor(v);
    const paise = Math.round((v - whole) * 100);
    const rupees = (symbol === undefined ? setting_("currency_symbol") : symbol) === "₹";
    return (rupees ? "Rupees " : "") + inWords_(whole) + (paise ? (rupees ? " and " + below100_(paise) + " Paise" : " and " + pad_(paise, 2) + "/100") : "") + " only";
}

// "2024-01-12" (or a full timestamp) → "12 Jan 2024"
function niceDate_(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ""));
    return m ? Number(m[3]) + " " + SHORT_MONTHS_[Number(m[2]) - 1] + " " + m[1] : "";
}

function daysLabel_(n) {
    return n === 0.5 ? "half day" : n + (n === 1 ? " day" : " days");
}

/** What the days off came to: "3 (1 paid holiday, 2 unpaid)", "1 (paid holiday)", "0 (holiday not taken, paid extra)". */
function daysOffNote_(s) {
    const off = s.days_off;
    const paid = s.paid_holidays;
    const unused = Math.max(0, r2_(paid - off));
    if (!paid) return off + (off ? " (unpaid)" : "");
    if (s.unpaid_days > 0) return off + " (" + paid + " paid holiday" + (paid === 1 ? "" : "s") + ", " + s.unpaid_days + " unpaid)";
    if (unused > 0) return off + " (" + (off ? daysLabel_(unused) + " of holiday" : "holiday") + " not taken, paid extra)";
    return off + " (paid holiday" + (paid === 1 ? "" : "s") + ")";
}

function lineLabel_(i) {
    return i.auto && i.qty ? i.label + " (" + daysLabel_(i.qty) + ")" : i.label || i.category;
}

/* ---------- plain text ---------- */

const TEXT_WIDTH_ = 36;

// label on the left, amount on the right; a label too long for the line just pushes the amount along
function textRow_(label, amount) {
    const gap = TEXT_WIDTH_ - label.length - amount.length;
    return label + (gap >= 2 ? new Array(gap + 1).join(" ") : "  ") + amount;
}

function slipText_(s, items) {
    const biz = settingsMap_();
    const sym = biz.currency_symbol;
    const m = (n) => money_(n, sym);
    const earnings = items.filter((i) => i.kind === "earning");
    const deductions = items.filter((i) => i.kind === "deduction");
    const lines = [];
    if (s.status !== "final") lines.push("*** DRAFT - not final ***", "");
    lines.push(String(biz.business_name || "").toUpperCase());
    lines.push("Salary Slip - " + monthLabel_(s.month));
    lines.push("");
    lines.push("Employee : " + s.employee_name + " (Emp No. " + s.emp_no + ")");
    lines.push("Role     : " + s.designation);
    if (s.location) lines.push("Location : " + s.location);
    if (s.doj) lines.push("Joined   : " + niceDate_(s.doj));
    lines.push("Days off : " + daysOffNote_(s));
    lines.push("");
    lines.push("EARNINGS");
    lines.push(textRow_("Base salary", m(s.base_salary)));
    earnings.forEach((i) => lines.push(textRow_(lineLabel_(i), m(i.amount))));
    lines.push(textRow_("Total earnings", m(r2_(s.base_salary + s.earnings_total))));
    lines.push("");
    lines.push("DEDUCTIONS");
    if (deductions.length) {
        deductions.forEach((i) => lines.push(textRow_(lineLabel_(i), m(i.amount))));
        lines.push(textRow_("Total deductions", m(s.deductions_total)));
    } else lines.push("None");
    lines.push("");
    lines.push(textRow_("NET SALARY", m(s.net_salary)));
    if (s.net_salary >= 0) lines.push(amountInWords_(s.net_salary, sym));
    if (s.notes) lines.push("", "Note: " + s.notes);
    lines.push("");
    lines.push("Generated on " + niceDate_(s.finalized_at || todayStr_()) + ".");
    if (biz.slip_footer) lines.push(biz.slip_footer);
    return lines.join("\n");
}

/* ---------- Drive folders (found by name every run, never remembered by id) ---------- */

function subFolder_(parent, name) {
    const it = parent.getFoldersByName(name);
    while (it.hasNext()) {
        const f = it.next();
        if (!f.isTrashed()) return f;
    }
    return parent.createFolder(name);
}

// the folder that holds the Sheet (My Drive itself if it isn't in a folder)
function sheetFolder_() {
    const parents = DriveApp.getFileById(ss_().getId()).getParents();
    return parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
}

// "FY 2026-27" — April to March
function fyFolderName_(dateStr) {
    const y = parseInt(String(dateStr).slice(0, 4), 10);
    const start = parseInt(String(dateStr).slice(5, 7), 10) >= 4 ? y : y - 1;
    return "FY " + start + "-" + pad_((start + 1) % 100, 2);
}

// Salary_Slips/FY 2026-27/09 — every level is made by the first slip that needs it
function slipFolder_(month) {
    return subFolder_(subFolder_(subFolder_(sheetFolder_(), SLIP_ROOT_), fyFolderName_(month)), month.slice(5, 7));
}

/**
 * "3-Asha-2026-09.pdf": employee number, first name, salary month.
 * The number is what makes it unique; the name is only there so a person can read the folder.
 */
function slipFileName_(s) {
    const first = (str_(s.employee_name).split(/\s+/)[0] || "").replace(/[^A-Za-z0-9]/g, "") || "Employee";
    return s.emp_no + "-" + first + "-" + s.month + ".pdf";
}

function pdfFileId_(url) {
    const m = /\/d\/([A-Za-z0-9_-]+)/.exec(String(url || "")) || /[?&]id=([A-Za-z0-9_-]+)/.exec(String(url || ""));
    return m ? m[1] : "";
}

function trashPdf_(url) {
    try {
        DriveApp.getFileById(pdfFileId_(url)).setTrashed(true);
    } catch (e) {
        console.warn("trashPdf_", e);
    }
}

/**
 * File the slip's PDF and remember its link. An earlier file for the same slip — its own, or one left
 * under the same name — goes to Drive's bin first, so a month's folder never holds two versions.
 */
function saveSlipPdf_(s) {
    const items = itemsOf_(s.id);
    const name = slipFileName_(s);
    const folder = slipFolder_(s.month);
    if (s.pdf_url) trashPdf_(s.pdf_url);
    const old = folder.getFilesByName(name);
    while (old.hasNext()) old.next().setTrashed(true);
    const pdf = Utilities.newBlob(slipPdfHtml_(s, items), "text/html", name.replace(/\.pdf$/, ".html")).getAs("application/pdf").setName(name);
    s.pdf_url = folder.createFile(pdf).getUrl();
    setCell_("Salary_Slips", s, "pdf_url");
    return s.pdf_url;
}

/* ---------- PDF (tables + inline styles: Google's PDF converter ignores flex/grid and backgrounds) ---------- */

function slipPdfHtml_(s, items) {
    const e = escHtml_;
    const biz = settingsMap_();
    const sym = biz.currency_symbol;
    const m = (n) => e(money_(n, sym));
    const earnings = items.filter((i) => i.kind === "earning");
    const deductions = items.filter((i) => i.kind === "deduction");
    const row = (label, amount, bold) =>
        "<tr><td" + (bold ? ' class="b"' : "") + ">" + e(label) + '</td><td class="n' + (bold ? " b" : "") + '">' + amount + "</td></tr>";
    const table = (title, rows, totalLabel, total) =>
        '<table class="items"><thead><tr><th>' + title + '</th><th style="text-align:right">Amount</th></tr></thead><tbody>' +
        (rows.length ? rows.join("") : '<tr><td class="muted">None</td><td></td></tr>') +
        row(totalLabel, m(total), true) + "</tbody></table>";
    const cell = (label, value) =>
        '<td style="width:25%;padding:5px 7px;border:1px solid #e7ded2;font-size:10.5px"><div class="lbl">' + e(label) + "</div>" + value + "</td>";

    return (
        '<html><head><meta charset="utf-8"><style>' +
        "body{font-family:Helvetica,Arial,sans-serif;font-size:11px;color:#2b2520;margin:0}" +
        "table{border-collapse:collapse;width:100%}td,th{vertical-align:top}" +
        ".muted{color:#8a7f75}.small{font-size:10px}.b{font-weight:bold}.n{text-align:right;white-space:nowrap}" +
        ".lbl{font-size:8.5px;letter-spacing:.6px;text-transform:uppercase;color:#8a7f75}" +
        ".items td,.items th{border:1px solid #e7ded2;padding:5px 7px;font-size:10.5px}" +
        ".items th{color:#654321;border-bottom:2px solid #654321;font-size:8.5px;font-weight:bold;letter-spacing:.4px;text-transform:uppercase;text-align:left}" +
        "</style></head><body>" +
        // letterhead
        "<table><tr>" +
        '<td style="width:52px;padding-right:10px"><img src="' + PDF_LOGO_ + '" width="52" height="52" alt=""></td>' +
        "<td>" +
        '<div style="font-size:20px;font-weight:bold;color:#654321">' + e(biz.business_name) + "</div>" +
        (biz.tagline ? '<div style="font-style:italic;color:#8a7f75">' + e(biz.tagline) + "</div>" : "") +
        (biz.address ? '<div class="small" style="margin-top:3px">' + e(biz.address) + "</div>" : "") +
        '<div class="small">' + e([biz.phone, biz.email].filter(Boolean).join(" · ")) + "</div>" +
        "</td></tr></table>" +
        '<div style="border-bottom:3px solid #f5bf03;margin:10px 0 12px"></div>' +
        // the document's name: brown bold text between two rules, the strongest the converter can render
        '<table style="margin-bottom:12px"><tr><td style="border-top:2px solid #654321;border-bottom:2px solid #654321;color:#654321;font-size:13px;font-weight:bold;letter-spacing:3px;padding:7px;text-align:center">' +
        "SALARY SLIP · " + e(monthLabel_(s.month).toUpperCase()) + "</td></tr></table>" +
        (s.status !== "final" ? '<div style="color:#c62828;font-weight:bold;font-size:14px;text-align:center;margin:-6px 0 12px">DRAFT</div>' : "") +
        "<table><tr>" +
        cell("Employee", "<b>" + e(s.employee_name) + "</b><br>Emp No. " + e(s.emp_no)) +
        cell("Role", e(s.designation) + (s.location ? "<br>" + e(s.location) : "")) +
        cell("Date of joining", e(niceDate_(s.doj))) +
        cell("Days off", e(daysOffNote_(s))) +
        "</tr></table>" +
        '<table style="margin-top:14px"><tr>' +
        '<td style="width:50%;padding-right:7px">' +
        table("Earnings", [row("Base salary", m(s.base_salary))].concat(earnings.map((i) => row(lineLabel_(i), m(i.amount)))), "Total earnings", r2_(s.base_salary + s.earnings_total)) +
        "</td>" +
        '<td style="width:50%;padding-left:7px">' +
        table("Deductions", deductions.map((i) => row(lineLabel_(i), m(i.amount))), "Total deductions", s.deductions_total) +
        "</td></tr></table>" +
        '<table style="margin-top:14px"><tr>' +
        '<td style="border-top:2px solid #654321;border-bottom:2px solid #654321;padding:8px 7px;font-size:13px;font-weight:bold;color:#654321">NET SALARY</td>' +
        '<td class="n" style="border-top:2px solid #654321;border-bottom:2px solid #654321;padding:8px 7px;font-size:15px;font-weight:bold">' + m(s.net_salary) + "</td>" +
        "</tr></table>" +
        (s.net_salary >= 0 ? '<div style="margin-top:6px;font-style:italic">' + e(amountInWords_(s.net_salary, sym)) + "</div>" : "") +
        (s.notes ? '<div style="margin-top:12px"><span class="lbl">Note</span><br>' + e(s.notes) + "</div>" : "") +
        '<div class="small muted" style="margin-top:22px">Generated on ' + e(niceDate_(s.finalized_at || todayStr_())) + "." +
        (biz.slip_footer ? " " + e(biz.slip_footer) : "") + "</div>" +
        "</body></html>"
    );
}

/* ---------- email ---------- */

/**
 * Send a final slip to the employee's own address: the text in the body, the PDF attached.
 * Returns the address it went to. Throws an app error the screen can show when there is no address
 * or Google's daily limit is used up.
 */
function emailSlip_(s, ctx) {
    const emp = findBy_("Employees", "id", s.employee_id);
    const to = str_(emp && emp.email).toLowerCase();
    if (!to) fail_(s.employee_name + " has no email address. Add one on their profile.", "NO_EMAIL");
    const cc = splitEmails_(setting_("slip_email_cc")).filter((a) => a !== to);
    if (MailApp.getRemainingDailyQuota() < 1 + cc.length) fail_("Google's daily email limit has been reached. Try again tomorrow.", "QUOTA");

    // the attachment is the filed PDF; made now if it is missing or was removed from Drive
    let file = null;
    try {
        if (s.pdf_url) file = DriveApp.getFileById(pdfFileId_(s.pdf_url));
        if (file && file.isTrashed()) file = null;
    } catch (e) {
        file = null;
    }
    if (!file) file = DriveApp.getFileById(pdfFileId_(saveSlipPdf_(s)));

    const biz = setting_("business_name");
    const month = monthLabel_(s.month);
    const text = slipText_(s, itemsOf_(s.id));
    const first = str_(s.employee_name).split(/\s+/)[0];
    const mail = {
        to,
        name: biz,
        subject: "Salary slip for " + month + " — " + biz,
        body: "Hi " + first + ",\n\nHere is your salary slip for " + month + ". A PDF copy is attached.\n\n" + text + "\n\n— " + biz,
        htmlBody:
            '<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;background:#FAF7F2">' +
            '<div style="background:#fff;border-radius:12px;padding:24px;border-top:5px solid #F5BF03">' +
            '<h2 style="margin:0 0 8px;color:#654321;font-family:Georgia,serif">' + escHtml_(biz) + "</h2>" +
            '<p style="color:#403B37">Hi ' + escHtml_(first) + ", here is your salary slip for <b>" + escHtml_(month) + "</b>. A PDF copy is attached.</p>" +
            '<pre style="font-family:Consolas,Menlo,monospace;font-size:13px;line-height:1.45;background:#FAF7F2;border-radius:8px;padding:14px;color:#1A1A1A;white-space:pre-wrap">' +
            escHtml_(text) + "</pre>" +
            "</div></div>",
        attachments: [file.getBlob()],
    };
    if (cc.length) mail.cc = cc.join(",");
    MailApp.sendEmail(mail);

    s.emailed_at = nowStr_();
    s.emailed_to = to;
    setCell_("Salary_Slips", s, "emailed_at");
    setCell_("Salary_Slips", s, "emailed_to");
    log_(ctx, "EMAIL", "Salary_Slips", s.id, s.employee_name + " — " + month + " → " + to);
    return to;
}
