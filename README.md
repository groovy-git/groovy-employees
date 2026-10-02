# Groovy Employees

Employee records and monthly salary slips for Groovy Business Group. It is the small companion to Groovy Kiosk and is built the same way.

**How it fits together**

```
Admin's phone or laptop (installed app)  ──►  Google Apps Script (backend)  ──►  Google Sheet (all your data)
   hosted free on GitHub Pages                   checks the login, does the maths        one tab per table
```

- **All data lives in your Google Sheet.** GitHub only hosts the app's screens, not the data.
- **Only admins log in.** Employees are records, not users. Each one gets their slip by email, and you can also share it by WhatsApp or print it.
- **What it keeps about an employee:** number, name, role, location, date of birth, date of joining, mobile, email, address, and how they are paid (a monthly base salary, or a rate per event day).
- **What it never keeps:** bank account details, PAN, Aadhaar or any other ID number. There is nowhere to type them.

## How a salary is worked out

```
Net salary = Base salary + Earnings − Deductions
```

- **One day's salary** is the base ÷ 30, every month alike.
- **One paid holiday a month.** On each slip you enter the days off the person took:
    - 1 day off: nothing is added or deducted.
    - More than 1: the days beyond the first are unpaid leave and are deducted. 3 days off on ₹15,000 is 2 unpaid days, ₹1,000.
    - 0 days off: the holiday not taken is paid as an extra day, ₹500 on ₹15,000.
    - Half days work too (1.5 days off is half a day unpaid).
- **Earnings** you add: overtime, commission, allowance, bonus. **Deductions** you add: advance, penalty.
- **Event days.** Anyone can be paid for days worked at events: enter the days on the slip and the app adds `Event pay (5 days × ₹800)`. The rate starts as the one on their profile and can be changed on the slip.
- The app fills in the unpaid-leave and holiday amounts for you. You can type over either one.
- The 30 and the 1 are settings (**More → Settings → Salary rules**). Changing them affects slips prepared afterwards; existing slips keep the rules they were made with.

### People paid per event day

Some salespeople work only at events and have no monthly salary. On their profile choose **Paid: Per event day** and give the rate for a day.

- Their slip has no base salary and no days off, so the holiday rule doesn't apply. It is the event days × the rate, plus any other earnings and deductions you add.
- They get a slip only for a month they worked. **Prepare drafts** skips them and Home doesn't count them as waiting; in Payroll they show **No slip** until you tap their name to start one.
- A slip with nothing to pay can't be finalized. Enter the event days, or delete the draft.
- If you change how someone is paid, a draft that is already open keeps the way it was made. Delete it and start it again.

---

## Before you start

- **Use the Google account that owns the Groovy Kiosk folder** (the shop account). Setup looks for that folder to put Groovy Employees beside it, and slip emails are sent from this account.
- **A GitHub account.** It's free.
- **Cost:** nothing. Google Sheets, Apps Script and GitHub Pages (with a public repository) are all free.

## 1. Create the database and backend (Google)

1. Signed in as the shop account, open [sheets.new](https://sheets.new) and name the sheet **Groovy Employees Data**. It doesn't matter where in Drive it is created; Setup moves it.
2. Go to **Extensions → Apps Script**. This opens a script project linked to the sheet.
3. Add the backend code. There are two ways:
    - **Copy and paste (simplest).** For each `.gs` file in `backend/`:
        - Click **＋ → Script**.
        - Give it the same name without `.gs`.
        - Paste in the file's contents.
        - Delete the default `Code.gs`.
        - Then go to **Project Settings ⚙ → Show "appsscript.json"**, open `appsscript.json` and replace its contents with `backend/appsscript.json`.
    - **Using clasp** (a command-line uploader; handy for later updates):
        1. Turn on the **Google Apps Script API** at [script.google.com/home/usersettings](https://script.google.com/home/usersettings), signed in as the shop account.
        2. Install clasp and log in once per computer, choosing the **shop Google account** in the browser:
            ```bash
            npm install -g @google/clasp
            clasp login
            ```
        3. In `backend/`, copy `.clasp.json.example` to `.clasp.json` and replace `PASTE_YOUR_SCRIPT_ID_HERE` with the **Script ID** from Apps Script → ⚙ **Project Settings → IDs**. This file stays on your computer and is never uploaded to GitHub.
        4. From `backend/`, run `clasp push`. If it asks to overwrite the manifest, answer **y**.
4. Go back to the sheet and reload the page. A **Groovy Employees** menu appears.
5. Click **Groovy Employees → 1. Setup / repair sheets**.
    - Google asks for permission. Choose **Advanced → Go to project → Allow**.
    - Setup creates the tabs, and the **Groovy Employees** folder beside **Groovy Kiosk** in Drive, and moves this sheet into it.
    - It shows an **admin email and password**. The email is the Google account you're signed in with. Write these down, and change the password after your first login (**More → My account**).
    - It also tells you **who else can open the folder**. Read that line: see "Keep the folder private" below.
6. Optional: click **Groovy Employees → Run self-tests**. You should see "All 69 tests passed".
7. Deploy the backend as a web app:
    - In Apps Script, click **Deploy → New deployment**.
    - Type: **Web app**.
    - Execute as: **Me**.
    - Who has access: **Anyone**.
    - Click **Deploy** and copy the **Web app URL** (it ends in `/exec`). You can see it again any time with **Groovy Employees → Show web app URL**.

> "Anyone" only means the URL can be reached. Nothing can be read or changed without an admin login.

## 2. Publish the app (GitHub Pages, free)

1. Create a **public** repository on GitHub called `groovy-employees` and push **the contents of this folder** to it, so that `.github/`, `backend/` and `frontend/` sit at the top of the repository.

    ```bash
    git init -b main
    git add .
    git commit -m "Groovy Employees"
    git remote add origin https://github.com/<your-github-username>/groovy-employees.git
    git push -u origin main
    ```

    - The repository is public, so anyone can read the code. That's safe: it holds no passwords, names or salaries, which all stay in your Google Sheet.
    - `backend/.clasp.json` is excluded by `.gitignore`. Keep it that way.

2. In the repository, go to **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Go to **Settings → Secrets and variables → Actions → Variables → New repository variable**:
    - Name: `VITE_API_URL`
    - Value: the web app URL from step 1.7
4. Go to **Actions → Deploy app to GitHub Pages → Run workflow**. It takes about 1 minute.
    - The first run, started by your push, fails because the variable wasn't set yet. That's expected; the run you start here is the one that counts.
5. The app is live at `https://<your-github-username>.github.io/groovy-employees/`.

## 3. Install on your phone

- **Android (Chrome):** open the app URL, then **⋮ → Add to Home screen / Install app**.
- **iPhone (Safari):** open the app URL, then **Share → Add to Home Screen**.

It works the same in a laptop browser.

## 4. First day checklist

1. Log in, then open **More → Settings**:
    - **Company**: the name, address, phone and email that head every slip.
    - **Roles**: the list an employee's role is chosen from, one per line. Add your own here. Taking a role off the list doesn't change anyone who already has it.
    - **Salary rules**: check **30** days in a salary month and **1** paid holiday.
    - **Slip & email**: the line at the foot of the slip, and an address to copy on every slip email if you want one (your accountant, say).
2. **More → Admins**: add anyone else who should manage payroll. Everyone listed there sees every salary.
3. **Employees → Add employee** for each person:
    - **Emp No.** is the number that person has as `id` in the Groovy Kiosk sheet. You type it; the app only checks that no two employees share one. For someone who isn't in Kiosk, use any unused number.
    - **Role** is chosen from the list in Settings → Roles.
    - **Paid** is either a monthly salary (enter the base) or per event day (enter the rate for a day; there is no base). Someone on a monthly salary can also have an event day rate, for when they work an event on top.
    - **Email** is where their slip is sent. Without one the slip is still made and filed, just not emailed.
    - **Added / Deducted every month**: fixed lines such as a travel allowance. They are filled into each new slip.

## Every month

Usually on the 1st, for the month just ended. **Home** shows that month and what is left to do.

1. **Payroll**. It opens on last month. Tap **Prepare drafts** to make a draft slip for everyone on a monthly salary. For someone paid per event day who worked that month, tap their name to start their slip.
2. Tap each name:
    - Set **Days off taken**. The line under it says what that comes to.
    - Set **Event days worked** if they worked at events that month.
    - **Add earning** / **Add deduction** for anything extra that month.
    - **Preview the slip** if you want to read it first.
    - Tap **Finalize**. The slip is locked, its PDF is filed in Drive, and it is emailed if the box is ticked.
3. Anything not emailed yet: **Email slips** at the bottom of Payroll sends them all.
4. The **download** button at the top of Payroll gives the month as a CSV file.

**A mistake on a final slip:** open it, tap **Reopen to correct**, fix it, and finalize again. The old PDF goes to Drive's bin and the new one takes its place. Email it again afterwards.

**Someone has left:** open them in Employees, **Edit → Mark as left**, and give the last working day. They stay on the payroll up to that month, and their slips are kept.

## The salary slip

The same slip is shown in the app, sent as the email, copied for WhatsApp and printed:

```
GROOVY BUSINESS GROUP
Salary Slip - September 2026

Employee : Asha Khan (Emp No. 3)
Role     : Salesperson Kiosk
Joined   : 12 Jan 2024
Days off : 3 (1 paid holiday, 2 unpaid)

EARNINGS
Base salary                    ₹15,000
Overtime (6 hrs)                ₹1,200
Commission                        ₹850
Total earnings                 ₹17,050

DEDUCTIONS
Unpaid leave (2 days)           ₹1,000
Advance                         ₹2,000
Total deductions                ₹3,000

NET SALARY                     ₹14,050
Rupees Fourteen Thousand Fifty only

Generated on 1 Oct 2026.
This is a computer-generated slip and needs no signature.
```

## Files in Google Drive

```
<folder that holds Groovy Kiosk>/
  Groovy Kiosk/                    ← untouched
  Groovy Employees/                ← made by Setup
    Groovy Employees Data          ← the Sheet
    Salary_Slips/
      FY 2026-27/                  ← April to March
        09/                        ← the salary month
          3-Asha-2026-09.pdf       ← employee number, first name, month
    Back_up/
      2026-09/                     ← a copy of the Sheet, made on the 1st of each month
```

- A slip's PDF is made when the slip is finalized. The folders are created as they are needed.
- **Setup places the folder like this:**
    - If the Sheet is already in a folder called Groovy Employees, nothing moves.
    - If there is exactly one Groovy Kiosk folder, Groovy Employees is made beside it.
    - If there is none, or more than one, it is made in My Drive and the Setup message says so. Drag it where you want it; the app finds everything by name under whatever folder holds the Sheet.

### Keep the folder private

Groovy Employees sits beside Groovy Kiosk, so it takes on whatever sharing the folder above them has. If that folder is shared with managers or staff, they can open every salary slip. Setup tells you who can open the folder each time it runs; it never changes the sharing itself. To fix it, right-click the folder in Drive → **Share**, and remove everyone who shouldn't see salaries (or move the folder somewhere that isn't shared).

## Emails

- Slips go to the address on the employee's profile, with the PDF attached.
- They are sent from the Google account that owns the Sheet. A personal Gmail account can send about 100 emails a day.
- "Forgot password" codes for admins use the same account.

## 5. Updating later

- **Backend** (`.gs` files):
    1. Paste in the new code, or from `backend/` run `clasp push`.
    2. Make the live app use it: **Deploy → Manage deployments → ✏️ Edit**, set **Version: New version**, and click **Deploy**. Always use **Edit** so the URL stays the same.
    3. Open the Sheet and run **Groovy Employees → 1. Setup / repair sheets**. It adds any new tabs or columns; until you do, the app shows "The app was updated — run Setup".
- **App** (`frontend/`): push to `main`. GitHub rebuilds it, and the app picks up the update the next time it is opened.
- **If the web app URL ever changes:** update the `VITE_API_URL` variable, then **Actions → Deploy app to GitHub Pages → Run workflow**.

## Good practice

- **Updating never clears your data.** Setup only adds missing tabs, columns and settings.
- **Don't type into the Google Sheet by hand.** Looking at it, or totalling a column in a separate tab, is fine.
- **Keep your own notes in a separate tab**, not in extra columns at the end of the app's tabs.
- **Backups:** besides the monthly copy, **Groovy Employees → Back up now** makes one at any time, and Google Sheets keeps its own version history.
- **Try it first on a test copy:** **Groovy Employees → 2. Load demo data** fills an empty sheet with six made-up employees and two months of slips.
- **Going live after testing:** **Groovy Employees → 3. Reset all data…**, then type `RESET`.
    - It deletes every employee, every salary slip and the activity log, and logs everyone out. The slip PDFs in `Salary_Slips` go to Drive's bin, where they can be recovered for 30 days.
    - It keeps the admin logins and passwords, and everything in Settings (company, roles, salary rules).
    - A copy of the Sheet as it was is saved in `Back_up` first. If that copy can't be made, nothing is deleted.
    - This can't be undone from the app. To go back, use the copy in `Back_up`.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| "Couldn't reach the server" | Check the internet. Check that `VITE_API_URL` is the `/exec` URL and that the deployment's access is **Anyone**. |
| App shows old screens | Close the app fully and reopen it. The update installs automatically. |
| "Sheet … missing" or "The app was updated — run Setup" | Run **Groovy Employees → 1. Setup / repair sheets**. It is safe to repeat. |
| Forgot your password | **Forgot password?** on the login screen emails a 6-digit code. If the email can't be received, use **Groovy Employees → Reset an admin password…** in the Sheet. |
| "… has no email address" | Add the email on the employee's profile, then tap **Email** on the slip. |
| "Google's daily email limit has been reached" | Try again tomorrow, or share the slip by WhatsApp or print. |
| "The PDF could not be saved to Drive" | Open the slip and tap **Save PDF**. The slip itself is final either way. |
| "Deductions are more than the salary" | Lower a deduction, or carry part of an advance to next month. |
| "Server busy, please try again" | Two saves arrived at the same moment. Tap again. |
| The first action after a quiet period takes a few seconds | Normal. Google is starting the script up. |

---

## For developers

```
backend/   Apps Script (.gs): api.gs (doPost + action table), auth, employees, slips (the maths), slipdoc (text, PDF, email), setup
  dev/     mock-gas.js (in-memory Apps Script, Sheets and Drive), e2e.js (370 checks), server.js (local API)
frontend/  Vite + React PWA: src/pages (screens), src/components, src/lib (api, slip figures, printing)
```

Run everything locally, without Google, on demo data:

```bash
cd frontend && npm install
npm run dev:mock             # terminal 1: API on :8787 with demo data (admin@demo.local / admin123)
npm run dev                  # terminal 2: app on http://localhost:5174
node ../backend/dev/e2e.js   # backend end-to-end tests
```

Emails aren't sent locally; the latest one is shown at `http://localhost:8787/mail`.

Rules the backend enforces:

- A slip's totals are always worked out on the server from the base, the days off and the lines. Totals sent by the app are ignored.
- One slip per employee per month. None for a month that hasn't started, before joining, or after leaving.
- Someone paid per event day has no base on their slip whatever the app sends, and none of the lines the app writes itself (unpaid leave, holiday not taken, event pay) can be sent in as an ordinary line.
- A final slip is read-only until it is reopened, and carries the employee's name, number and role as they were when it was finalized.
- Each request carries a `req_id`, so a retry on a weak network can never make a second slip or send a second email.
- All dates use IST.

Two things that differ from Groovy Kiosk on purpose:

- **Browser storage uses the `ge_` prefix** (Kiosk uses `gp_`). Both apps are served from the same GitHub Pages address, where storage is shared, and logging out of one must not log you out of the other.
- **The dev server runs on port 5174** so both apps can run side by side.

**Replacing the logo:** the app and the slip PDF use the Groovy logo from Kiosk. For the app, save the new logo as `frontend/public/logo-source.png` and run `npm run icons` in `frontend/` (and replace `frontend/public/logo.svg`). For the PDF, replace the image in `backend/logo.gs`.
