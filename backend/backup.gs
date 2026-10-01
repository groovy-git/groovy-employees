/**
 * Backups: a copy of this Sheet into the Back_up folder that sits beside it in Drive.
 *
 *   Back_up/2026-09/              ← made on 1 October, holds the sheet as September ended
 *   Back_up/2026-10-14 09-15/     ← made by hand from the menu
 *
 * The slip PDFs are not copied: each one is already a finished file in Salary_Slips, and nothing
 * overwrites it except reopening and re-finalizing that very slip.
 *
 * Nothing is ever deleted here.
 */

const BACKUP_ROOT_ = "Back_up";
const BACKUP_FN_ = "monthlyBackup";

function backupRoot_() {
    return subFolder_(sheetFolder_(), BACKUP_ROOT_);
}

/** True for anything under a Back_up folder — a backup's copy, never the one the app works in. */
function insideBackup_(folder) {
    let parents = folder.getParents();
    while (parents.hasNext()) {
        const p = parents.next();
        if (p.getName() === BACKUP_ROOT_) return true;
        parents = p.getParents();
    }
    return false;
}

/** Copy the Sheet into Back_up/<name>. Running it again for the same folder copies nothing twice. */
function backupInto_(name) {
    const folder = subFolder_(backupRoot_(), name);
    const copyName = ss_().getName() + " " + name;
    if (folder.getFilesByName(copyName).hasNext()) return { folder: name, copied: false };
    DriveApp.getFileById(ss_().getId()).makeCopy(copyName, folder);
    return { folder: name, copied: true };
}

/** Trigger: the 1st of the month at 6am — the month that just ended. */
function monthlyBackup() {
    resetReqCache_();
    const r = backupInto_(lastMonth_(todayStr_()));
    if (r.copied) log_({ user: { id: 0, name: "Timer" } }, "BACKUP", "Sheet", r.folder, "Monthly backup into Back_up/" + r.folder);
    return r;
}

/** Menu: back up now. */
function backupNow() {
    resetReqCache_();
    try {
        const r = backupInto_(Utilities.formatDate(new Date(), APP.TZ, "yyyy-MM-dd HH-mm"));
        log_({ user: { id: 0, name: "Sheet owner" } }, "BACKUP", "Sheet", r.folder, "Backup into Back_up/" + r.folder);
        alert_("A copy of this sheet is now in Back_up/" + r.folder + ".\n\nThe salary slip PDFs stay where they are, in Salary_Slips.");
    } catch (e) {
        alert_("The backup could not be made:\n\n" + (e.message || e) + "\n\nNothing was lost — your data is untouched.");
    }
}

function ensureBackupTrigger_() {
    const have = ScriptApp.getProjectTriggers().filter((t) => t.getHandlerFunction() === BACKUP_FN_);
    if (have.length) return false;
    ScriptApp.newTrigger(BACKUP_FN_).timeBased().onMonthDay(1).atHour(6).inTimezone(APP.TZ).create();
    return true;
}
