"use strict";
const K = Accounting.KEY,
  frame = document.querySelector("iframe"),
  output = document.getElementById("results");
const seed = () => ({
  accounts: [
    {
      id: "salary",
      name: "راتب اختبار",
      bank: "بنك ألف",
      role: "bank",
      opening: 50000,
      last4: "1111",
    },
    {
      id: "bills",
      name: "فواتير اختبار",
      bank: "بنك باء",
      role: "bank",
      opening: 0,
    },
    {
      id: "reserve",
      name: "التزامات اختبار",
      bank: "بنك باء",
      role: "reserve",
      opening: 0,
    },
    {
      id: "invest",
      name: "استثمار اختبار",
      bank: "دراهم",
      role: "investment",
      opening: 10000,
    },
    {
      id: "emergency-reserve-v1",
      name: "طوارئ اختبار",
      bank: "تتبع",
      role: "cash",
      opening: 0,
    },
  ],
  debts: [
    {
      id: "card",
      kind: "credit",
      name: "فيزا تجريبية ١",
      opening: 8000,
      cardLast4: "2222",
    },
    {
      id: "card2",
      kind: "credit",
      name: "فيزا تجريبية ٢",
      opening: 1500,
      cardLast4: "3333",
    },
    {
      id: "loan",
      kind: "loan",
      name: "قرض اختبار",
      opening: 200000,
      monthlyPayment: 1000,
      lastMonth: "2030-02",
    },
  ],
  budget: [
    {
      id: "bill",
      name: "فاتورة اختبار",
      amount: 1000,
      month: "2026-12",
      type: "expense",
      bankAccountId: "bills",
    },
    {
      id: "visa",
      name: "فيزا",
      amount: 5000,
      month: "2026-12",
      type: "debt",
      bankAccountId: "salary",
    },
    {
      id: "saving",
      name: "الالتزامات",
      amount: 500,
      month: "2026-12",
      type: "saving",
      bankAccountId: "bills",
    },
    {
      id: "zero",
      name: "بند صفري",
      amount: 0,
      month: "2026-12",
      type: "expense",
      bankAccountId: "bills",
    },
    {
      id: "one",
      name: "بند رمزي",
      amount: 1,
      month: "2026-12",
      type: "expense",
      bankAccountId: "bills",
    },
  ],
  moves: [],
  projects: [],
  commitments: [
    {
      id: "school",
      name: "مدرسة اختبار",
      firstMonth: "2027-09",
      amount: 7500,
      count: 3,
      interval: 6,
      useObligations: true,
    },
  ],
  legacy: { budgetMonths: { "2026-12": { salary: 10000 } } },
  settings: { salaryAccountId: "salary" },
});
const wait = () => new Promise((r) => setTimeout(r, 40));
let results = [],
  errors = [];
const doc = () => frame.contentDocument,
  win = () => frame.contentWindow;
function assert(v, msg) {
  if (!v) throw Error(msg);
}
function change(selector, value) {
  const el = doc().querySelector(selector);
  assert(el, "Missing " + selector);
  el.value = value;
  el.dispatchEvent(new (win().Event)("change", { bubbles: true }));
}
async function click(selector) {
  const el = doc().querySelector(selector);
  assert(el, "Missing " + selector);
  el.click();
  await wait();
}
function fill(selector, value) {
  const el = doc().querySelector(selector);
  assert(el, "Missing " + selector);
  el.value = value;
}
function state() {
  return win().FinanceApp.get();
}
function navigate(page, sub) {
  change("#pageNav", page);
  if (sub) change("#subNav", sub);
}
function setupDialogs() {
  win().confirm = () => true;
  win().alert = (m) => errors.push("alert: " + m);
  win().addEventListener("error", (e) => errors.push(e.message));
}
async function load(path) {
  await new Promise((r) => {
    frame.onload = r;
    frame.src = path;
  });
  await wait();
  setupDialogs();
}
async function check(name, fn) {
  try {
    await fn();
    results.push({ name, status: "PASS" });
  } catch (e) {
    results.push({ name, status: "FAIL", actual: e.message });
  }
  output.textContent = JSON.stringify({ results, errors }, null, 2);
}
async function payment(amount, card) {
  await click('[data-action="payBudgetV3"][data-id="visa"]');
  fill('.v3-modal [name="amount"]', String(amount));
  if (card) fill('.v3-modal [name="debtId"]', card);
  doc().querySelector('.v3-modal [name="confirmed"]').checked = true;
  await click('.v3-modal [type="submit"]');
}
document.getElementById("run").onclick = async () => {
  document.getElementById("run").disabled = true;
  results = [];
  errors = [];
  const before = localStorage.getItem(K);
  try {
    localStorage.setItem(K, JSON.stringify(seed()));
    await load("../index.html?page=budget&month=2026-12");
    await check("mobile RTL layout 390px", async () => {
      frame.style.width = "390px";
      assert(doc().documentElement.dir === "rtl", "RTL missing");
      assert(
        doc().documentElement.scrollWidth <=
          doc().documentElement.clientWidth + 2,
        "horizontal overflow",
      );
    });
    await check("all main and subsidiary pages render (mobile)", async () => {
      const pages = [...doc().querySelector("#pageNav").options].map(
        (x) => x.value,
      );
      for (const p of pages) {
        navigate(p);
        const subs = [...doc().querySelector("#subNav").options].map(
          (x) => x.value,
        );
        for (const s of subs) {
          change("#subNav", s);
          assert(
            doc().querySelector("#content").textContent.trim().length > 0,
            p + "/" + s + " blank",
          );
          assert(
            !/undefined|NaN/.test(doc().querySelector("#content").textContent),
            p + "/" + s + " invalid",
          );
          assert(
            doc().documentElement.scrollWidth <=
              doc().documentElement.clientWidth + 3,
            p + "/" + s + " overflow",
          );
        }
      }
    });
    await check("cancel payment changes no balances", async () => {
      navigate("budget");
      change("#monthNav", "2026-12");
      const raw = JSON.stringify(state());
      await click('[data-action="payBudgetV3"][data-id="bill"]');
      await click("[data-v3-close]");
      assert(JSON.stringify(state()) === raw, "cancel mutated state");
    });
    await check(
      "Visa 5000, other card unchanged, no double submit",
      async () => {
        await payment(5000, "card");
        assert(
          Accounting.debtBalance(state(), "card") === 3000,
          "wrong card 1",
        );
        assert(
          Accounting.debtBalance(state(), "card2") === 1500,
          "wrong card 2",
        );
        assert(
          state().moves.filter(Accounting.active).length === 1,
          "duplicate payment",
        );
      },
    );
    await check("Visa reversal and re-confirm", async () => {
      await click('[data-action="payBudgetV3"][data-id="visa"]');
      await click("[data-v3-undo]");
      assert(
        Accounting.debtBalance(state(), "card") === 8000,
        "reversal failed",
      );
      await click("[data-v3-close]");
      await payment(5000, "card");
      assert(Accounting.debtBalance(state(), "card") === 3000, "repost failed");
    });
    await check("partial payment second card", async () => {
      await payment(300, "card2");
      assert(
        Accounting.debtBalance(state(), "card2") === 1200,
        "partial failed",
      );
    });
    await check("actual funding conserves total cash", async () => {
      navigate("accounts", "funding");
      change("#monthNav", "2026-12");
      change("#fundBank", "بنك باء");
      change("#fundAccount", "bills");
      const total = (d) =>
          Accounting.sum(
            d.accounts.filter((a) => a.role !== "investment"),
            (a) => Accounting.balance(d, a),
          ),
        before = total(state());
      await click('[data-action="toggleAccountFunding"]');
      fill('[name="mode_bills"]', "new");
      fill('[name="from_bills"]', "salary");
      fill('[name="amount_bills"]', "1501");
      doc().querySelector('.v3-modal [name="confirmed"]').checked = true;
      await click('.v3-modal [type="submit"]');
      assert(total(state()) === before, "cash changed");
      assert(Accounting.balance(state(), "bills") === 1501, "fund not posted");
    });
    await check(
      "expense from funded account does not debit salary twice",
      async () => {
        navigate("budget");
        change("#monthNav", "2026-12");
        const old = Accounting.balance(state(), "salary");
        await click('[data-action="payBudgetV3"][data-id="bill"]');
        fill('.v3-modal [name="amount"]', "600");
        doc().querySelector('.v3-modal [name="confirmed"]').checked = true;
        await click('.v3-modal [type="submit"]');
        assert(
          Accounting.balance(state(), "salary") === old,
          "salary debited twice",
        );
        assert(
          Accounting.balance(state(), "bills") === 901,
          "wrong source debit",
        );
      },
    );
    await check("saving is internal transfer", async () => {
      const before = Accounting.balance(state(), "reserve");
      await click('[data-action="payBudgetV3"][data-id="saving"]');
      fill('.v3-modal [name="to"]', "reserve");
      doc().querySelector('.v3-modal [name="confirmed"]').checked = true;
      await click('.v3-modal [type="submit"]');
      assert(
        Accounting.balance(state(), "reserve") === before + 500,
        "saving did not transfer",
      );
    });
    await check("one riyal item posts exactly one riyal", async () => {
      await click('[data-action="payBudgetV3"][data-id="one"]');
      doc().querySelector('.v3-modal [name="confirmed"]').checked = true;
      await click('.v3-modal [type="submit"]');
      assert(
        Accounting.paymentStatus(
          state(),
          state().budget.find((b) => b.id === "one"),
        ).paid === 1,
        "one riyal missing",
      );
    });
    await check(
      "reload retains ledger and does not create salary",
      async () => {
        const before = state().moves.length;
        await load("../index.html");
        assert(state().moves.length === before, "reopen added moves");
      },
    );
    await check("all pages render desktop 1280px", async () => {
      frame.style.width = "1280px";
      for (const p of [...doc().querySelector("#pageNav").options].map(
        (x) => x.value,
      )) {
        navigate(p);
        for (const s of [...doc().querySelector("#subNav").options].map(
          (x) => x.value,
        )) {
          change("#subNav", s);
          assert(
            doc().querySelector("#content").textContent.length > 0,
            p + "/" + s + " blank",
          );
        }
      }
    });
    await check(
      "edit budget after partial payment preserves actual ledger",
      async () => {
        navigate("budget");
        change("#monthNav", "2026-12");
        const before = state().moves.length;
        await click('[data-action="editBudget"][data-id="bill"]');
        fill('#editorForm [name="amount"]', "800");
        await click('#editorForm [type="submit"]');
        assert(state().moves.length === before, "edit created payment");
        assert(
          Accounting.paymentStatus(
            state(),
            state().budget.find((x) => x.id === "bill"),
          ).rest === 200,
          "difference missing",
        );
      },
    );
    await check("bank group cancellation has no effects", async () => {
      navigate("accounts", "funding");
      change("#monthNav", "2026-12");
      change("#fundBank", "بنك باء");
      const before = JSON.stringify(state());
      await click('[data-action="toggleBankFunding"]');
      await click("[data-v3-close]");
      assert(JSON.stringify(state()) === before, "cancel batch changed data");
    });
    await check(
      "salary confirmation and SMS reconcile without duplicate",
      async () => {
        navigate("salary", "countdown");
        await click('[data-action="recordSalary"]');
        fill('.v3-modal [name="month"]', "2026-12");
        fill('.v3-modal [name="date"]', "2026-11-26");
        fill('.v3-modal [name="amount"]', "10000");
        doc().querySelector('.v3-modal [name="confirmed"]').checked = true;
        await click('.v3-modal [type="submit"]');
        const before = state().moves.length;
        navigate("moves", "paste");
        fill("#smsRaw", "إيداع راتب مبلغ: SAR 10000 حساب 1111 في: 2026-11-26");
        await click('[data-action="analyzeSms"]');
        await click('[data-action="linkSmsExisting"]');
        assert(state().moves.length === before, "salary duplicated");
        assert(
          state().moves.some((x) => x.evidence === "bank-message-linked"),
          "bank evidence not linked",
        );
      },
    );
    await check("repeat salary SMS is ignored", async () => {
      const before = state().moves.length;
      fill("#smsRaw", "إيداع راتب مبلغ: SAR 10000 حساب 1111 في: 2026-11-26");
      await click('[data-action="analyzeSms"]');
      assert(state().moves.length === before, "duplicate SMS");
    });
    await check(
      "new account, project and commitment via retained editors",
      async () => {
        navigate("accounts");
        await click('[data-action="newAccount"]');
        fill('#editorForm [name="name"]', "حساب إضافي اختباري");
        fill('#editorForm [name="currentBalance"]', "0");
        await click('#editorForm [type="submit"]');
        assert(state().accounts.length === 6, "account missing");
        navigate("projects");
        await click('[data-action="newProject"]');
        fill('#editorForm [name="name"]', "مشروع اختباري");
        await click('#editorForm [type="submit"]');
        assert(state().projects.length === 1, "project missing");
        navigate("obligations", "catalog");
        await click('[data-action="newCommitment"]');
        fill('#editorForm [name="name"]', "موعد اختباري");
        fill('#editorForm [name="amount"]', "100");
        await click('#editorForm [type="submit"]');
        assert(state().commitments.length === 2, "commitment missing");
      },
    );
    await check("card fee is liability only", async () => {
      navigate("moves", "ledger");
      await click('[data-action="newMove"]');
      change('#editorForm [name="kind"]', "fee");
      fill('#editorForm [name="amount"]', "50");
      fill('#editorForm [name="debtId"]', "card");
      const before = Accounting.balance(state(), "salary"),
        card = Accounting.debtBalance(state(), "card");
      await click('#editorForm [type="submit"]');
      assert(
        Accounting.balance(state(), "salary") === before,
        "fee debited bank",
      );
      assert(
        Accounting.debtBalance(state(), "card") === card + 50,
        "fee not in liability",
      );
    });
    await check(
      "changing an unpaid item role and funding a cash group",
      async () => {
        navigate("budget");
        change("#monthNav", "2026-12");
        await click('[data-action="editBudget"][data-id="zero"]');
        fill('#editorForm [name="type"]', "saving");
        fill('#editorForm [name="financialCategory"]', "reserve");
        fill('#editorForm [name="bankAccountId"]', "emergency-reserve-v1");
        fill('#editorForm [name="amount"]', "25");
        await click('#editorForm [type="submit"]');
        assert(
          state().budget.find((x) => x.id === "zero").financialCategory ===
            "reserve",
          "category stale",
        );
        assert(
          win().FinanceCore.month(state(), "2026-12").saving === 525,
          "saving category not reflected",
        );
        navigate("accounts", "funding");
        change("#monthNav", "2026-12");
        change("#fundBank", "النقد في اليد");
        await click('[data-action="toggleBankFunding"]');
        assert(
          doc().querySelector('[name="mode_emergency-reserve-v1"]'),
          "cash group omitted",
        );
        await click("[data-v3-close]");
      },
    );
    await check(
      "planning rules are editable through ordinary form fields",
      async () => {
        navigate("forecast", "allocations");
        await click('[data-action="planningSettings"]');
        assert(
          doc().querySelector('[name="r_category_0"]'),
          "rule editor missing",
        );
        assert(!doc().querySelector('textarea[name="rules"]'), "JSON required");
        fill('[name="r_amount_0"]', "2100");
        await click('.v3-modal [type="submit"]');
        assert(
          state().scheduleRules[0].amount === 2100,
          "rule change not saved",
        );
      },
    );
    await check(
      "combined loan dialog pays both installments from salary once",
      async () => {
        let d = state();
        d.debts.push({
          id: "batch-loan2",
          kind: "loan",
          name: "قرض ثان للاختبار",
          opening: 50000,
          monthlyPayment: 700,
          lastMonth: "2036-08",
        });
        d.budget.push({
          id: "batch-budget",
          name: "قروض",
          type: "debt",
          financialCategory: "loan",
          month: "2026-12",
          amount: 1700,
          bankAccountId: "bills",
        });
        await win().FinanceApp.save();
        navigate("budget");
        change("#monthNav", "2026-12");
        const before = Accounting.balance(state(), "salary");
        await click('[data-action="payBudgetV3"][data-id="batch-budget"]');
        assert(
          !doc().querySelector('.v3-modal [name="debtId"]'),
          "single debt selector still shown",
        );
        assert(
          doc().querySelector('.v3-modal [name="from"]').value === "salary",
          "wrong default source",
        );
        assert(
          doc().querySelector('.v3-modal [name="loan_amount_0"]').value ===
            "1000",
          "first installment incorrect",
        );
        assert(
          doc().querySelector('.v3-modal [name="loan_amount_1"]').value ===
            "700",
          "second installment incorrect",
        );
        doc().querySelector('.v3-modal [name="confirmed"]').checked = true;
        await click('.v3-modal [type="submit"]');
        assert(
          Accounting.balance(state(), "salary") === before - 1700,
          "wrong combined debit",
        );
        assert(
          state().moves.filter(
            (x) => Accounting.active(x) && x.budgetItemId === "batch-budget",
          ).length === 2,
          "missing split ledger",
        );
        assert(
          Accounting.debtBalance(state(), "loan") === 200000,
          "unknown principal changed",
        );
        await click('[data-action="payBudgetV3"][data-id="batch-budget"]');
        assert(
          doc().querySelector('[name="loan_amount_0"]').value === "0" &&
            doc().querySelector('[name="loan_amount_1"]').value === "0",
          "settled installments offered again",
        );
        await click("[data-loan-undo]");
        assert(
          doc().querySelector('[name="loan_amount_0"]').value === "1000" &&
            doc().querySelector('[name="loan_amount_1"]').value === "0",
          "undo affected other loan",
        );
        doc().querySelector('.v3-modal [name="confirmed"]').checked = true;
        await click('.v3-modal [type="submit"]');
        assert(
          Accounting.balance(state(), "salary") === before - 1700,
          "reconfirmation repeated other loan",
        );
      },
    );
    await check(
      "competing browser contexts serialize and reject stale revision",
      async () => {
        const other = document.createElement("iframe");
        other.hidden = true;
        document.body.append(other);
        await new Promise((r) => {
          other.onload = r;
          other.src = "../index.html";
        });
        await wait();
        const a = win().FinanceApp,
          b = other.contentWindow.FinanceApp;
        const expected = [];
        other.contentWindow.alert = (m) => expected.push(m);
        const previousAlert = win().alert;
        win().alert = (m) => expected.push(m);
        let unlock, entered;
        const ready = new Promise((r) => (entered = r));
        const lock = navigator.locks.request(K + ":write", async () => {
          entered();
          await new Promise((r) => (unlock = r));
        });
        await ready;
        a.get().concurrencyProbe = "a";
        b.get().concurrencyProbe = "b";
        const pa = a.save(),
          pb = b.save();
        unlock();
        await lock;
        const outcomes = await Promise.all([pa, pb]);
        assert(
          outcomes.filter(Boolean).length === 1,
          "both stale writes accepted or both failed",
        );
        assert(expected.length === 1, "conflict was not clearly reported");
        win().alert = previousAlert;
        other.remove();
      },
    );
    await check("standalone forecast scenarios", async () => {
      await load("../financial-forecast.html");
      assert(doc().querySelector("tbody tr"), "no forecast rows");
      change("#unifiedScenario", "stress");
      assert(doc().querySelector("#unifiedResults tbody tr"), "stress failed");
      change("#unifiedScenario", "projects");
      assert(
        doc().querySelector("#unifiedResults tbody tr"),
        "projects failed",
      );
    });
    await check("standalone surplus", async () => {
      await load("../surplus.html");
      assert(
        doc().querySelector("#summary").textContent.includes("الدخل"),
        "surplus blank",
      );
      doc().querySelector("#checked").checked = true;
      change("#checked", true);
      await click("#save");
      assert(
        JSON.parse(localStorage.getItem(K)).surplusPlans["2026-12"],
        "plan not saved",
      );
    });
    await check(
      "corrupt local data displays recovery without overwriting",
      async () => {
        const good = localStorage.getItem(K);
        localStorage.setItem(K, "{invalid");
        await load("../index.html");
        assert(doc().querySelector("#bootError"), "recovery missing");
        assert(
          localStorage.getItem(K) === "{invalid",
          "corrupt data overwritten",
        );
        localStorage.setItem(K, good);
      },
    );
    await check("no JS errors or failed-save alerts", () =>
      assert(errors.length === 0, errors.join("; ")),
    );
  } finally {
    if (before === null) localStorage.removeItem(K);
    else localStorage.setItem(K, before);
    document.getElementById("run").disabled = false;
    output.textContent = JSON.stringify(
      {
        complete: true,
        passed: results.filter((x) => x.status === "PASS").length,
        failed: results.filter((x) => x.status === "FAIL").length,
        results,
        errors,
      },
      null,
      2,
    );
  }
};
