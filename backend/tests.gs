/** Self-tests for the pure salary logic. Run "Run self-tests" from the Groovy Employees menu. */

function runTests() {
    const results = [];
    const eq = (name, got, want) => {
        const ok = JSON.stringify(got) === JSON.stringify(want);
        results.push((ok ? "PASS " : "FAIL ") + name + (ok ? "" : " — got " + JSON.stringify(got) + ", want " + JSON.stringify(want)));
    };
    const throws = (name, fn) => {
        try {
            fn();
            results.push("FAIL " + name + " — expected an error");
        } catch (e) {
            results.push("PASS " + name);
        }
    };
    const line = (c, category) => c.items.filter((i) => i.category === category)[0] || null;

    // ₹15,000 a month, ÷ 30 = ₹500 a day, one paid holiday
    let c = computeSlip_(15000, 30, 1, 1, [], {});
    eq("holiday taken: no lines", c.items.length, 0);
    eq("holiday taken: net is the base", c.net_salary, 15000);

    c = computeSlip_(15000, 30, 1, 3, [], {});
    eq("3 days off: 2 unpaid", c.unpaid_days, 2);
    eq("3 days off: leave deducted", line(c, "Unpaid leave").amount, 1000);
    eq("3 days off: net", c.net_salary, 14000);

    c = computeSlip_(15000, 30, 1, 0, [], {});
    eq("no day off: holiday paid extra", line(c, "Holiday not taken").amount, 500);
    eq("no day off: no leave line", line(c, "Unpaid leave"), null);
    eq("no day off: net", c.net_salary, 15500);

    c = computeSlip_(15000, 30, 1, 1.5, [], {});
    eq("half day beyond the holiday", [c.unpaid_days, line(c, "Unpaid leave").amount], [0.5, 250]);
    c = computeSlip_(15000, 30, 1, 0.5, [], {});
    eq("half the holiday not taken", [c.unused_days, line(c, "Holiday not taken").amount], [0.5, 250]);

    // one day's salary is rounded to the rupee only on the line, not before multiplying
    c = computeSlip_(16000, 30, 1, 3, [], {});
    eq("leave rounds to the rupee", line(c, "Unpaid leave").amount, 1067);

    // the slip in the plan: base + overtime + commission − leave − advance
    c = computeSlip_(15000, 30, 1, 3, [
        { kind: "earning", category: "Overtime", label: "Overtime (6 hrs)", qty: 0, amount: 1200 },
        { kind: "earning", category: "Commission", label: "Commission", qty: 0, amount: 850 },
        { kind: "deduction", category: "Advance", label: "Advance", qty: 0, amount: 2000 },
    ], {});
    eq("earnings total", c.earnings_total, 2050);
    eq("deductions total", c.deductions_total, 3000);
    eq("net = base + earnings − deductions", c.net_salary, 14050);
    eq("leave line comes first among deductions", c.items.filter((i) => i.kind === "deduction")[0].category, "Unpaid leave");

    // an amount typed over the worked-out one
    c = computeSlip_(15000, 30, 1, 3, [], { leave_amount: 800 });
    eq("leave amount typed over", [line(c, "Unpaid leave").amount, c.net_salary], [800, 14200]);
    c = computeSlip_(15000, 30, 1, 3, [], { leave_amount: "" });
    eq("blank override means worked out", line(c, "Unpaid leave").amount, 1000);
    c = computeSlip_(15000, 30, 0, 2, [], {});
    eq("no paid holiday: every day off unpaid", [c.unpaid_days, c.net_salary], [2, 14000]);

    throws("negative days off rejected", () => computeSlip_(15000, 30, 1, -1, [], {}));
    throws("quarter days rejected", () => computeSlip_(15000, 30, 1, 1.25, [], {}));
    throws("negative override rejected", () => computeSlip_(15000, 30, 1, 3, [], { leave_amount: -5 }));
    throws("line without an amount rejected", () => cleanItems_([{ kind: "earning", category: "Bonus", label: "Bonus", amount: 0 }]));
    eq("days-off lines are never taken from the app", cleanItems_([{ kind: "deduction", category: "Unpaid leave", label: "x", amount: 50 }]).length, 0);

    // money and words
    eq("money", money_(1234567, "₹"), "₹12,34,567");
    eq("money with paise", money_(1250.5, "₹"), "₹1,250.50");
    eq("money small", money_(850, "₹"), "₹850");
    eq("words", amountInWords_(14050, "₹"), "Rupees Fourteen Thousand Fifty only");
    eq("words hundreds", amountInWords_(13896, "₹"), "Rupees Thirteen Thousand Eight Hundred Ninety-Six only");
    eq("words lakh", amountInWords_(112400, "₹"), "Rupees One Lakh Twelve Thousand Four Hundred only");
    eq("words crore", inWords_(12345678), "One Crore Twenty-Three Lakh Forty-Five Thousand Six Hundred Seventy-Eight");
    eq("words paise", amountInWords_(500.5, "₹"), "Rupees Five Hundred and Fifty Paise only");
    eq("words zero", amountInWords_(0, "₹"), "Rupees Zero only");

    // months, folders, file names
    eq("month label", monthLabel_("2026-09"), "September 2026");
    eq("last month", lastMonth_("2026-10-01"), "2026-09");
    eq("last month across the year", lastMonth_("2027-01-15"), "2026-12");
    eq("fy folder september", fyFolderName_("2026-09"), "FY 2026-27");
    eq("fy folder march", fyFolderName_("2027-03"), "FY 2026-27");
    eq("fy folder april", fyFolderName_("2027-04"), "FY 2027-28");
    eq("slip file name", slipFileName_({ emp_no: 3, employee_name: "Asha Khan", month: "2026-09" }), "3-Asha-2026-09.pdf");
    eq("slip file name is cleaned", slipFileName_({ emp_no: 12, employee_name: "D'Souza, Maria", month: "2026-12" }), "12-DSouza-2026-12.pdf");

    // who is on a month's payroll
    eq("joined that month", eligibleFor_({ doj: "2026-09-20", status: "active" }, "2026-09"), true);
    eq("not yet joined", eligibleFor_({ doj: "2026-10-01", status: "active" }, "2026-09"), false);
    eq("left that month", eligibleFor_({ doj: "2024-01-01", status: "left", dol: "2026-09-10" }, "2026-09"), true);
    eq("left before", eligibleFor_({ doj: "2024-01-01", status: "left", dol: "2026-08-31" }, "2026-09"), false);

    // dates
    eq("valid date", [validDate_("2024-02-29"), validDate_("2026-02-29"), validDate_("2026-13-01"), validDate_("12/01/2026")], [true, false, false, false]);
    eq("next birthday this year", nextOccurrence_("1996-10-11", "2026-10-02"), "2026-10-11");
    eq("next birthday next year", nextOccurrence_("1996-01-05", "2026-10-02"), "2027-01-05");
    eq("29 Feb in a common year", nextOccurrence_("1996-02-29", "2027-01-10"), "2027-02-28");
    eq("days between", daysBetween_("2026-10-02", "2026-10-11"), 9);
    eq("IST date", fmtDate_(new Date("2026-09-17T19:00:00Z")), "2026-09-18"); // 00:30 IST next day

    const failed = results.filter((r) => r.indexOf("FAIL") === 0).length;
    const msg = (failed ? failed + " FAILED" : "All " + results.length + " tests passed") + "\n\n" + results.join("\n");
    console.log(msg);
    alert_(msg);
    return msg;
}
