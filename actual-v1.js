"use strict";
(async function () {
  const KEY = "bms_actual_20261114_v1";
  const $ = (id) => document.getElementById(id);
  const now = () => window.Accounting.today();
  const month = () => now().slice(0, 7);
  const uid = () =>
    Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const money = (v) =>
    new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 2 }).format(
      Number(v) || 0,
    ) + " ر.س";
  const num = (v) => Math.max(0, Number(v) || 0);
  const esc = (x) =>
    String(x == null ? "" : x).replace(
      /[&<>"']/g,
      (t) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[t],
    );
  const def = () => ({
    version: 2,
    created: now(),
    accounts: [],
    moves: [],
    budget: [],
    commitments: [],
    debts: [],
    projects: [],
    journal: [],
    seenHashes: {},
    learnedRules: [],
    legacy: { budgetMonths: {}, incomeRecords: [], debtLogs: [] },
  });
  let store;
  try {
    if (!navigator.locks)
      throw Error("افتح الموقع عبر HTTPS في متصفح حديث يدعم الحفظ الآمن");
    store = await navigator.locks.request(KEY + ":write", () =>
      window.Accounting.storage(localStorage),
    );
  } catch (error) {
    const host = $("content");
    host.innerHTML =
      '<section class="panel"><h2>تعذر فتح البيانات بأمان</h2><p id="bootError"></p><p>لم تُستبدل بياناتك ولم يبدأ سجل فارغ. نزّل الملف الحالي أولًا، ثم استعد نسخة سليمة.</p><button class="button" id="downloadRaw">تنزيل البيانات الحالية للفحص</button><button class="button" id="recoverGood">استعادة آخر نسخة سليمة محلية</button><label class="button">استعادة ملف JSON<input type="file" id="recoverFile" accept=".json"></label></section>';
    $("bootError").textContent = error.message;
    const restore = (raw) => {
      const doc = JSON.parse(raw),
        d = window.Accounting.migrate(doc.data || doc);
      localStorage.setItem(
        KEY + "_corrupt_" + Date.now(),
        localStorage.getItem(KEY) || "",
      );
      localStorage.setItem(KEY, JSON.stringify(d));
      location.reload();
    };
    $("downloadRaw").onclick = () => {
      const a = document.createElement("a"),
        url = URL.createObjectURL(
          new Blob([localStorage.getItem(KEY) || ""], {
            type: "application/json",
          }),
        );
      a.href = url;
      a.download = "finance_recovery.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    $("recoverGood").onclick = () => {
      try {
        const raw =
          localStorage.getItem(KEY + "_last_good") ||
          localStorage.getItem(KEY + "_before_schema3");
        if (!raw)
          throw Error("لا توجد نسخة محلية سليمة؛ اختر ملف النسخة الاحتياطية");
        if (
          confirm(
            "استعادة النسخة المحلية السابقة؟ ستبقى البيانات الحالية محفوظة للفحص.",
          )
        )
          restore(raw);
      } catch (e) {
        alert(e.message);
      }
    };
    $("recoverFile").onchange = async (e) => {
      try {
        const f = e.target.files?.[0];
        if (f && confirm("استعادة هذا الملف؟")) restore(await f.text());
      } catch (e) {
        alert("تعذر استعادة الملف: " + e.message);
      }
    };
    return;
  }
  let data = store.get();
  let page = "home",
    sub = "summary",
    period = data.trackingStartMonth || month(),
    modalType = "",
    editingId = "",
    chartKind = "expenses",
    smsDraft = null,
    smsStatus = "",
    bankPick = "",
    accountPick = "";
  const nav = {
    home: [
      ["summary", "ملخص اليوم"],
      ["recent", "آخر الحركات"],
    ],
    accounts: [
      ["balances", "الأرصدة بحسب البنك"],
      ["funding", "تأكيد تحويلات الحسابات"],
      ["review", "تدقيق حركات الحساب"],
      ["transfers", "التحويلات"],
    ],
    budget: [
      ["month", "ميزانية الشهر"],
      ["categories", "المصروفات الفعلية"],
      ["history", "الأشهر السابقة"],
    ],
    moves: [
      ["paste", "إدخال الرسائل"],
      ["ledger", "سجل الحركات"],
      ["review", "مراجعة وتصحيح العمليات"],
      ["income", "الإيرادات"],
      ["spend", "المصروفات"],
    ],
    obligations: [
      ["reserve", "حساب الادخار"],
      ["due", "الاستحقاقات"],
      ["forecast", "تنبؤ تغطية الاستحقاقات"],
      ["catalog", "إدارة المواعيد"],
      ["paid", "المدفوع فعليًا"],
    ],
    debts: [
      ["balances", "أرصدة الديون"],
      ["payments", "السداد المثبت"],
      ["history", "سجلات الفيزا المستوردة"],
    ],
    investments: [
      ["darahim", "محفظة دراهم"],
      ["profits", "الأرباح الفعلية"],
      ["legacy", "أرباح دراهم في الميزانيات"],
    ],
    projects: [
      ["list", "المشاريع"],
      ["forecasts", "الأرباح المتوقعة"],
      ["activity", "حركات المشاريع"],
    ],
    salary: [
      ["countdown", "عداد نزول الراتب"],
      ["calculator", "حاسبة الراتب المسجلة"],
      ["monthly", "الرواتب في الميزانيات"],
    ],
    forecast: [
      ["charts", "الرسوم البيانية"],
      ["allocations", "التوزيع الشهري"],
      ["draws", "سحوبات دراهم"],
      ["method", "طريقة الحساب"],
    ],
    charts: [
      ["expenses", "المصروف حسب البند"],
      ["spending", "المصروف الكامل"],
      ["accounts", "أرصدة الحسابات"],
      ["projects", "المشاريع"],
      ["obligations", "الالتزامات"],
      ["debts", "الديون"],
      ["darahim", "دراهم"],
      ["monthly", "حركة ١٢ شهرًا"],
    ],
    data: [
      ["backup", "النسخ والاستيراد"],
      ["inspect", "ملخص بيانات الاستيراد"],
      ["about", "طريقة الحساب"],
    ],
  };
  const titles = {
    home: "لوحة الواقع",
    accounts: "الحسابات",
    budget: "الميزانية",
    moves: "الحركات",
    obligations: "الالتزامات",
    debts: "الديون",
    investments: "دراهم",
    projects: "المشاريع",
    salary: "الراتب",
    forecast: "التوقعات والتقاعد",
    charts: "الرسوم البيانية",
    data: "البيانات",
  };
  const acc = (id) => data.accounts.find((x) => x.id === id);
  const debt = (id) => data.debts.find((x) => x.id === id);
  const project = (id) => data.projects.find((x) => x.id === id);
  const accountMovementTotal = (a) =>
    data.moves.reduce(
      (v, m) =>
        v +
        (m.posted === false
          ? 0
          : (m.to === a.id ? num(m.amount) : 0) -
            (m.from === a.id && !m.bankAlreadyPosted ? num(m.amount) : 0)),
      0,
    );
  const accountBalance = (a) => window.Accounting.balance(data, a);
  const debtMovement = (m) =>
    window.Accounting.sar(window.Accounting.debtDelta(m));
  const debtsBalance = (d) => window.Accounting.debtBalance(data, d);
  const reserves = () => data.accounts.filter((x) => x.role === "reserve");
  const banks = () =>
    data.accounts.filter((x) => ["bank", "reserve", "cash"].includes(x.role));
  const movements = (m = period) =>
    data.moves.filter(
      (x) => window.Accounting.active(x) && x.date.slice(0, 7) === m,
    );
  const total = (a, selector) =>
    a
      .filter((x) => !("posted" in x) || window.Accounting.active(x))
      .reduce((sum, x) => sum + (selector ? selector(x) : num(x.amount)), 0);
  const incomeM = (m = period) =>
    total(
      movements(m).filter((x) => x.kind === "income" || x.kind === "profit"),
    );
  const expenseM = (m = period) =>
    total(
      movements(m).filter((x) => x.kind === "expense" || x.kind === "charge"),
    ) -
    total(movements(m).filter((x) => x.kind === "refund")) +
    total(
      movements(m).filter((x) => x.kind === "repayment"),
      (x) =>
        x.principalKnown === false
          ? 0
          : Math.max(0, num(x.amount) - num(x.principal)),
    );
  const paidM = (m = period) =>
    total(movements(m).filter((x) => x.kind === "repayment"));
  const netCash = () => total(banks(), accountBalance);
  const reserveCash = () => total(reserves(), accountBalance);
  const invCash = () =>
    total(
      data.accounts.filter((x) => x.role === "investment"),
      accountBalance,
    );
  const sumDebt = () => total(data.debts, debtsBalance);
  const monthKey = (d) =>
    d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  const changeMonth = (m, v) => {
    const [y, x] = m.split("-").map(Number);
    if (v === "prev") return monthKey(new Date(y, x - 2, 1));
    if (v === "next") return monthKey(new Date(y, x, 1));
    return m;
  };
  let saving = false;
  async function keep() {
    if (saving) {
      alert("انتظر اكتمال الحفظ");
      return false;
    }
    saving = true;
    const candidate = window.Accounting.clone(data);
    try {
      data = await store.commitLocked(candidate);
      render();
      return true;
    } catch (e) {
      try {
        data = store.reload();
      } catch (_) {
        data = store.get();
      }
      render();
      alert("لم تُحفظ العملية: " + e.message);
      return false;
    } finally {
      saving = false;
    }
  }
  for (const type of ["click", "change", "submit"])
    document.addEventListener(
      type,
      (e) => {
        if (saving) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
      },
      true,
    );
  window.FinanceApp = {
    get: () => data,
    busy: () => saving,
    bankGroup,
    save: keep,
    freshStart: async (m) => {
      if (saving) throw Error("انتظر اكتمال الحفظ");
      saving=true;
      try {data=await store.freshStartLocked(m);period=m;page="accounts";sub="balances";render();return true;}
      finally {saving=false;}
    },
    restoreFreshStart: async () => {
      const raw=localStorage.getItem(KEY+"_before_fresh_start");
      if (!raw) throw Error("لا يوجد أرشيف بداية جديدة");
      data=await store.replaceLocked(JSON.parse(raw));render();
    },
    saveState: async (next) => { data = next; return keep(); },
    replace: async (d) => {
      data = await store.replaceLocked(d);
      render();
    },
    render: () => render(),
    period: () => period,
    navigate: (p, s, m) => {
      page = p;
      sub = s;
      if (m) period = m;
      render();
    },
  };
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) {
      try {
        data = store.reload();
        render();
      } catch (err) {
        alert("تعذر قراءة البيانات: " + err.message);
      }
    }
  });
  function box(title, value, hint, accent) {
    return (
      '<div class="metric ' +
      (accent || "") +
      '"><div class="metric-label">' +
      esc(title) +
      "</div><strong>" +
      money(value) +
      "</strong><small>" +
      esc(hint || "") +
      "</small></div>"
    );
  }
  function countBox(title, value, hint, accent) {
    return (
      '<div class="metric ' +
      (accent || "") +
      '"><div class="metric-label">' +
      esc(title) +
      "</div><strong>" +
      Number(value).toLocaleString("ar-SA") +
      "</strong><small>" +
      esc(hint || "") +
      "</small></div>"
    );
  }
  function panel(title, body, action) {
    return (
      '<section class="panel"><div class="panel-top"><h2>' +
      esc(title) +
      "</h2>" +
      (action || "") +
      "</div>" +
      body +
      "</section>"
    );
  }
  function blank(txt) {
    return (
      '<div class="empty">' + esc(txt || "لا توجد حركات مسجلة بعد") + "</div>"
    );
  }
  function pill(txt, type) {
    return '<span class="pill ' + (type || "") + '">' + esc(txt) + "</span>";
  }
  function button(txt, action, id, cls) {
    return (
      '<button type="button" class="button ' +
      (cls || "outline") +
      '" data-action="' +
      esc(action) +
      '" ' +
      (id ? 'data-id="' + esc(id) + '"' : "") +
      ">" +
      esc(txt) +
      "</button>"
    );
  }
  function shortDate(d) {
    return esc(d || "غير محدد");
  }
  function stats(items) {
    return '<div class="metrics">' + items.join("") + "</div>";
  }
  function options(items, selected, empty) {
    return (
      (empty ? '<option value="">' + esc(empty) + "</option>" : "") +
      items
        .map(
          (x) =>
            '<option value="' +
            esc(x[0]) +
            '" ' +
            (String(x[0]) === String(selected) ? "selected" : "") +
            ">" +
            esc(x[1]) +
            "</option>",
        )
        .join("")
    );
  }
  function getAccounts() {
    return data.accounts.map((a) => [
      a.id,
      a.name + " — " + money(accountBalance(a)),
    ]);
  }
  function projectOptions() {
    return data.projects.map((p) => [p.id, p.name]);
  }
  function allDebts() {
    return data.debts.map((d) => [
      d.id,
      d.name + " • " + money(debtsBalance(d)),
    ]);
  }
  function actions(type, id) {
    return (
      '<span class="row-actions">' +
      button("تعديل", "edit" + type, id, "mini") +
      button("حذف", "delete" + type, id, "mini danger") +
      "</span>"
    );
  }
  function entryList(arr, empty) {
    if (!arr.length) return blank(empty);
    return (
      '<div class="compact-list">' +
      arr
        .map(
          (x) =>
            '<div class="list-row"><div><b>' +
            esc(x.title) +
            "</b><small>" +
            esc(x.subtitle || "") +
            '</small></div><div class="right">' +
            (x.tag ? pill(x.tag, x.tagType) : "") +
            '<b class="' +
            (x.negative ? "negative" : "") +
            '">' +
            esc(x.value || "") +
            "</b>" +
            (x.actions || "") +
            "</div></div>",
        )
        .join("") +
      "</div>"
    );
  }
  function contentHome() {
    const latest = data.moves
      .filter(window.Accounting.active)
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 6);
    const metrics = stats([
      box("النقد في الحسابات", netCash(), "يشمل حساب الالتزامات", "blue"),
      box(
        "المخصص للالتزامات",
        reserveCash(),
        "ضمن النقد أعلاه، لا يُضاف مرة ثانية",
        "violet",
      ),
      box(
        "مصروف الشهر الفعلي",
        expenseM(),
        "مشتريات ومصاريف مثبتة فقط",
        "coral",
      ),
      box(
        "مجموع الديون المثبتة",
        sumDebt(),
        "بحسب آخر أرصدة مدخلة وحركاتها",
        "amber",
      ),
    ]);
    if (sub === "recent")
      return panel(
        "آخر الحركات المسجلة",
        entryList(
          latest.map((m) => ({
            title: moveName(m),
            subtitle:
              m.date + " • " + esc(m.category || "") + " • " + moveAccounts(m),
            value: money(m.amount),
            negative: m.kind === "expense" || m.kind === "charge",
          })),
          "لم تُسجّل حركات فعلية بعد",
        ),
        button("تسجيل حركة", "newMove", null, "primary"),
      );
    const start =
      !data.accounts.length && !data.moves.length
        ? panel(
            "البدء في المركز الجديد",
            '<p class="body-note">الموقع جديد وخالٍ من المدخلات القديمة. يمكنك استيراد ملف «المستقبل المالي» للمواعيد والأقساط، أو إحضار الأرصدة السابقة من نفس الجهاز. لا يتحول الموعد إلى مصروف إلا إذا سجلت عملية دفع.</p><div class="buttons">' +
              button("فتح الاستيراد", "goData", null, "primary") +
              button("إضافة أول حساب", "newAccount", null, "outline") +
              "</div>",
          )
        : "";
    return (
      (window.SalaryCountdown?.widget(data.salaryCountdown, {
        compact: true,
      }) || "") +
      metrics +
      start +
      panel(
        "ماذا يعرض هذا المركز؟",
        '<div class="intro-grid"><div><span class="round-icon">✓</span><b>حقيقي ومسجل</b><p>الأرصدة والحركات والأرباح التي أدخلتها بالفعل. لا نمو افتراضي ولا حساب لعجز مستقبلي.</p></div><div><span class="round-icon">≠</span><b>ادخار ليس مصروفًا</b><p>التحويل إلى حساب الالتزامات يبقى ضمن ثروتك، ويُحسب المصروف فقط عندما تسدد فاتورة حقيقية.</p></div><div><span class="round-icon">◷</span><b>موعد غير مدفوع</b><p>رسوم الدراسة والسيارة مواعيد مخططة، وليست دفعات حقيقية إلى أن تُسجّل عملية السداد.</p></div></div>',
      ) +
      panel(
        "ملخص هذا الشهر",
        entryList([
          { title: "دخل مثبت", value: money(incomeM()) },
          { title: "مصاريف ومشتريات مثبتة", value: money(expenseM()) },
          { title: "سداد ديون مثبت", value: money(paidM()) },
          {
            title: "تحويل إلى حساب الادخار",
            value: money(
              total(
                movements().filter(
                  (m) => m.kind === "transfer" && acc(m.to)?.role === "reserve",
                ),
              ),
            ),
          },
        ]),
      )
    );
  }
  function smsBankOptions(selected) {
    return options(
      data.accounts
        .filter((a) => ["bank", "reserve", "cash"].includes(a.role))
        .map((a) => [
          a.id,
          (a.bank || "نقد") +
            " — " +
            a.name +
            " (••••" +
            (a.last4 || "—") +
            ")",
        ]),
      selected,
      "اختر الحساب",
    );
  }
  function smsDebtOptions(selected) {
    return options(
      data.debts
        .filter((x) => x.kind === "credit" || x.kind === "loan")
        .map((x) => [x.id, x.name + " • " + money(debtsBalance(x))]),
      selected,
      "اختر الفيزا أو الدين",
    );
  }
  function isSameSms(raw, parsed) {
    const key = window.FinanceImport.hash(window.FinanceImport.normalize(raw));
    return (
      data.seenHashes?.[key] ||
      data.seenHashes?.[parsed.hash] ||
      data.moves.some(
        (m) =>
          m.raw &&
          window.FinanceImport.normalize(m.raw) ===
            window.FinanceImport.normalize(raw),
      )
    );
  }
  function matchingMoneyMovement(kind, sum, date, debtId, from, to) {
    return data.moves.find(
      (m) =>
        window.Accounting.active(m) &&
        Math.abs(num(m.amount) - sum) < 0.005 &&
        Math.abs(new Date(m.date) - new Date(date)) <= 86400000 &&
        m.kind === kind &&
        (["repayment", "charge", "cash_advance", "refund", "fee"].includes(kind)
          ? m.debtId === debtId && !!debtId
          : kind === "transfer"
            ? m.from === from && m.to === to
            : kind === "income" || kind === "profit"
              ? m.to === to && !!to
              : m.from === from && !!from),
    );
  }
  function smsCanAutoPost(d) {
    if (
      !d ||
      !d.confidence ||
      !(num(d.amount) > 0) ||
      !d.date ||
      !d.kind ||
      isSameSms(d.raw, d)
    )
      return false;
    const k = d.kind,
      did = debt(d.debtId),
      from = acc(d.from),
      to = acc(d.to);
    if (matchingMoneyMovement(k, num(d.amount), d.date, d.debtId, d.from, d.to))
      return false;
    if (["charge", "refund"].includes(k))
      return (
        did?.kind === "credit" &&
        (k !== "refund" || debtsBalance(did) + 0.005 >= d.amount)
      );
    if (k === "cash_advance") return did?.kind === "credit" && !!to;
    if (k === "expense")
      return (
        !!from &&
        /^(bank|reserve|cash)$/.test(from.role) &&
        !/فيزا|visa|credit.card|بطاقة.*ائتمان/i.test(d.raw)
      );
    if (k === "income" || k === "profit")
      return !!to && ["bank", "reserve", "cash"].includes(to.role);
    if (k === "transfer") return !!from && !!to && from.id !== to.id;
    // Visa repayment is automatic only when the exact bank debit account is identified in the message.
    if (k === "repayment")
      return (
        did?.kind === "credit" &&
        !!from &&
        ["bank", "reserve", "cash"].includes(from.role) &&
        d.accountDigits?.includes(from.last4) &&
        debtsBalance(did) + 0.005 >= d.amount
      );
    return false;
  }
  function contentSMS() {
    const d = smsDraft;
    const undo =
      data.lastSmsMoveId && data.moves.some((m) => m.id === data.lastSmsMoveId)
        ? button("تراجع عن آخر تسجيل", "undoLastSms", null, "outline")
        : "";
    const hint =
      '<p class="sms-easy-help">ألصق رسالة البنك أو الفيزا فقط. العمليات الواضحة تُسجّل تلقائيًا، ونطلب توضيحًا عند الحاجة.</p>';
    const input =
      '<label class="sms-simple-field"><span>نص الرسالة</span><textarea id="smsRaw" rows="' +
      (d ? 3 : 5) +
      '" spellcheck="false" placeholder="اضغط مطولًا ثم لصق">' +
      esc(d?.raw || "") +
      "</textarea></label>";
    if (!d)
      return panel(
        "إدخال الرسائل",
        hint +
          input +
          (smsStatus
            ? '<div class="sms-result">' + esc(smsStatus) + "</div>"
            : "") +
          '<div class="buttons">' +
          button("قراءة الرسالة", "analyzeSms", null, "primary") +
          undo +
          "</div>",
      );
    const k = d.kind,
      from = acc(d.from),
      to = acc(d.to),
      card = debt(d.debtId);
    const cardOperation = [
      "charge",
      "cash_advance",
      "refund",
      "repayment",
    ].includes(k);
    const candidate = matchingMoneyMovement(
      k,
      num(d.amount),
      d.date,
      d.debtId,
      d.from,
      d.to,
    );
    const labels = {
      charge: "شراء بالفيزا",
      cash_advance: "سحب نقدي من الفيزا",
      refund: "استرداد الفيزا",
      repayment: "سداد فيزا أو قرض",
      expense: "مصروف بنكي",
      income: "دخل وارد",
      profit: "ربح استثماري",
      fee: "رسوم فيزا",
      transfer: "تحويل بين حسابين",
    };
    const kinds = [
      ["", "اختر النوع"],
      ["charge", "شراء بالفيزا"],
      ["cash_advance", "سحب نقدي من الفيزا"],
      ["refund", "استرداد للفيزا"],
      ["repayment", "سداد بطاقة من البنك"],
      ["expense", "مصروف بنكي"],
      ["income", "دخل وارد"],
      ["transfer", "تحويل بين حسابين"],
      ["profit", "ربح دراهم"],
    ];
    const primary = [],
      advanced = [];
    const put = (html, need) => {
      (need ? primary : advanced).push(html);
    };
    const kindRow =
      '<label class="form-field"><span>نوع العملية</span><select name="smsKind" id="smsKind">' +
      options(kinds, k === "unclassified" ? "" : k) +
      "</select></label>";
    const amtRow =
      '<label class="form-field"><span>المبلغ</span><input name="smsAmount" type="number" min="0.01" step="0.01" value="' +
      esc(d.amount || "") +
      '"></label>';
    const dateRow =
      '<label class="form-field"><span>التاريخ</span><input name="smsDate" type="date" value="' +
      esc(d.date) +
      '"></label>';
    const catRow =
      '<label class="form-field"><span>التصنيف</span><input name="smsCategory" value="' +
      esc(d.category || "") +
      '"></label>';
    const debtRow =
      '<label class="form-field" data-sms-row="debt"><span>بطاقة الفيزا</span><select name="smsDebt">' +
      smsDebtOptions(d.debtId) +
      "</select></label>";
    const fromRow =
      '<label class="form-field" data-sms-row="from"><span>من أي حساب خرج المال؟</span><select name="smsFrom">' +
      smsBankOptions(d.from) +
      "</select></label>";
    const toRow =
      '<label class="form-field" data-sms-row="to"><span>إلى أي حساب وصل؟ (اختياري للنقد)</span><select name="smsTo">' +
      smsBankOptions(d.to) +
      "</select></label>";
    const principalRow =
      '<label class="form-field" data-sms-row="principal"><span>أصل الدين المسدد</span><input name="smsPrincipal" type="number" min="0" step="0.01" value="' +
      esc(debt(d.debtId)?.kind === "credit" ? d.amount : 0) +
      '"></label>';
    const paidRow =
      '<label class="form-field" data-sms-row="paidElsewhere"><span>هل سُجل الخصم من البنك من قبل؟</span><select name="smsPaidElsewhere"><option value="no">لا، هذا خصم جديد</option><option value="yes">نعم، لا تخصمه ثانية</option></select></label>';
    put(kindRow, k === "unclassified");
    put(amtRow, !(num(d.amount) > 0));
    put(dateRow, !d.date);
    put(catRow, false);
    put(debtRow, cardOperation && !card);
    put(fromRow, ["expense", "repayment", "transfer"].includes(k) && !from);
    put(
      toRow,
      ["income", "profit", "transfer", "cash_advance"].includes(k) && !to,
    );
    put(principalRow, k === "repayment" && debt(d.debtId)?.kind === "loan");
    put(paidRow, k === "repayment" && !from);
    put(
      '<label class="form-field"><span>حركة الخصم البنكي السابقة (إذا سُجل الخصم)</span><select name="smsCashEvidence">' +
        options(
          data.moves
            .filter((m) => window.Accounting.active(m) && m.kind === "expense")
            .map((m) => [m.id, m.date + " " + money(m.amount)]),
          "",
          "لا يوجد",
        ) +
        "</select></label>",
      false,
    );
    // An unclassified SMS must show all relevant selectors as soon as a type is chosen.
    const unclassified = k === "unclassified";
    const fields =
      '<div class="sms-short-fields">' + primary.join("") + "</div>";
    const advancedFields =
      '<div class="sms-short-fields">' + advanced.join("") + "</div>";
    const summary =
      '<div class="sms-preview"><strong>' +
      esc(labels[k] || "عملية غير واضحة") +
      " • " +
      money(d.amount || 0) +
      "</strong><small>" +
      esc(card?.name || from?.name || to?.name || "اختر الحساب أو الفيزا") +
      " • " +
      esc(d.date || "تاريخ غير معروف") +
      "</small></div>";
    const caution = candidate
      ? '<p class="ledger-warning">هناك حركة بنفس المبلغ والتاريخ يمكن أن تكون مسجلة سابقًا؛ لن نكررها قبل مراجعتها.</p>'
      : '<p class="sms-review-hint">' + esc(d.reason) + "</p>";
    return panel(
      "توضيح سريع للرسالة",
      hint +
        input +
        summary +
        caution +
        fields +
        '<details id="smsReviewDetails" ' +
        (unclassified ? "open" : "") +
        "><summary>تعديل معلومات أخرى (اختياري)</summary>" +
        advancedFields +
        "</details>" +
        '<div class="buttons">' +
        (candidate
          ? button(
              "ربط الرسالة بالحركة الموجودة",
              "linkSmsExisting",
              null,
              "primary",
            )
          : button("تسجيل العملية", "saveSms", null, "primary")) +
        button("إلغاء", "clearSms", null, "outline") +
        undo +
        "</div>",
    );
  }
  function updateSmsVisibility() {
    const k = $("smsKind")?.value || smsDraft?.kind,
      host = $("content");
    if (!host || !$("smsKind")) return;
    const paidElsewhere =
      host.querySelector?.('[name="smsPaidElsewhere"]')?.value === "yes";
    const show = {
      from:
        ["expense", "transfer", "repayment"].includes(k) &&
        !(k === "repayment" && paidElsewhere),
      to: ["income", "profit", "transfer", "cash_advance"].includes(k),
      debt: ["charge", "cash_advance", "refund", "repayment"].includes(k),
      principal: k === "repayment",
      paidElsewhere: k === "repayment",
    };
    host.querySelectorAll?.("[data-sms-row]").forEach((row) => {
      row.hidden = !show[row.dataset.smsRow];
    });
  }
  function acceptSms(parsed, fields = {}, automatic = false) {
    const kind = fields.kind ?? parsed.kind,
      sum = Number(fields.amount ?? parsed.amount),
      date = fields.date || parsed.date;
    const from = fields.from ?? parsed.from ?? "",
      to = fields.to ?? parsed.to ?? "",
      debtId = fields.debtId ?? parsed.debtId ?? "";
    const paidElsewhere = fields.paidElsewhere === true,
      principal =
        kind === "repayment"
          ? Number(
              fields.principal ?? (debt(debtId)?.kind === "credit" ? sum : 0),
            )
          : 0;
    const cat = fields.category || parsed.category || "غير مصنف";
    if (
      !kind ||
      kind === "unclassified" ||
      kind === "rejected" ||
      !Number.isFinite(sum) ||
      sum <= 0 ||
      !/^20\d{2}-\d{2}-\d{2}$/.test(date)
    )
      throw Error("نوع العملية أو المبلغ أو التاريخ غير واضح");
    if (isSameSms(parsed.raw, parsed))
      throw Error("الرسالة محفوظة سابقًا، ولم يتغير أي رصيد");
    const candidate = matchingMoneyMovement(kind, sum, date, debtId, from, to);
    if (candidate) {
      if (
        !confirm(
          "وجدت حركة مسجلة بنفس المبلغ والجهة والتاريخ القريب. ربط الرسالة بها دون إضافة مبلغ؟",
        )
      )
        return false;
      const hash = window.FinanceImport.hash(
        window.FinanceImport.normalize(parsed.raw),
      );
      candidate.smsHashes = [
        ...new Set([...(candidate.smsHashes || []), hash, parsed.hash]),
      ];
      candidate.evidence = "bank-message-linked";
      candidate.evidenceRaw = parsed.raw;
      data.seenHashes[hash] = 1;
      data.seenHashes[parsed.hash] = 1;
      window.Accounting.audit(data, "link-bank-evidence", {
        moveId: candidate.id,
      });
      smsDraft = null;
      smsStatus = "تم ربط الرسالة دون تكرار الحركة";
      return keep();
    }
    const salaryMessage =
        kind === "income" && /راتب|salary|payroll/i.test(parsed.raw),
      salaryMonth = window.FinanceCore.ym(
        window.FinanceCore.idx(date.slice(0, 7)) + 1,
      );
    if (
      salaryMessage &&
      data.moves.some(
        (m) =>
          window.Accounting.active(m) &&
          m.kind === "income" &&
          m.budgetMonth === salaryMonth &&
          (m.category === "راتب" ||
            ["scheduled-salary", "salary-v3"].includes(m.source)),
      )
    )
      throw Error(
        "راتب شهر الميزانية موجود؛ المبلغ أو التاريخ يحتاج مطابقة مع الحركة المسجلة",
      );
    const bankOut =
      ["expense", "transfer"].includes(kind) ||
      (kind === "repayment" && !paidElsewhere);
    const entry = {
      id: uid(),
      date,
      kind,
      amount: sum,
      from: bankOut ? from : "",
      to: ["income", "profit", "transfer", "cash_advance"].includes(kind)
        ? to
        : "",
      debtId: ["repayment", "charge", "cash_advance", "refund"].includes(kind)
        ? debtId
        : "",
      principal,
      principalKnown:
        kind !== "repayment" ||
        debt(debtId)?.kind === "credit" ||
        fields.principal > 0,
      cashEvidenceId: fields.cashEvidenceId,
      bankAlreadyPosted: kind === "repayment" && paidElsewhere,
      category: cat,
      raw: parsed.raw,
      source: "sms-paste",
      smsImported: true,
      note: automatic ? "صُنفت تلقائيًا من الرسالة" : "صُنفت بعد مراجعة الرسالة",
      ...(salaryMessage
        ? {
            budgetMonth: salaryMonth,
            category: "راتب",
            operationKey: "salary:" + salaryMonth,
          }
        : {}),
      posted: true,
    };
    if (
      (["expense", "transfer"].includes(kind) && !acc(from)) ||
      (["income", "profit", "transfer"].includes(kind) && !acc(to)) ||
      (kind === "cash_advance" && to && !acc(to)) ||
      (kind === "transfer" && from === to)
    )
      throw Error("تأكد من الحساب البنكي الصادر والمستقبل");
    if (
      ["charge", "cash_advance", "refund"].includes(kind) &&
      debt(debtId)?.kind !== "credit"
    )
      throw Error("اختر بطاقة الفيزا الصحيحة");
    if (
      kind === "repayment" &&
      (!debt(debtId) ||
        !Number.isFinite(principal) ||
        principal < 0 ||
        principal > sum ||
        (!paidElsewhere && !acc(from)))
    )
      throw Error("حدد الفيزا والحساب المسدد أو أكد أن الخصم البنكي سُجل سابقًا");
    if (
      ["refund", "repayment"].includes(kind) &&
      (kind === "refund" ? sum : principal) >
        debtsBalance(debt(debtId)) + 0.005 &&
      !confirm(
        "الاسترداد أو سداد الأصل يتجاوز الرصيد المسجل للبطاقة. هل تؤكد صحة الكشف؟",
      )
    )
      return false;
    if (
      kind === "cash_advance" &&
      !to &&
      !confirm(
        "لم تحدد مكان النقد المستلم من الفيزا. هل تريد تسجيل زيادة الدين فقط؟",
      )
    )
      return false;
    if (
      bankOut &&
      accountBalance(acc(from)) + 0.005 < sum &&
      !confirm(
        "رصيد البنك الظاهر أقل من المبلغ. هل تأكدت أن الخصم خرج من الحساب لا من الفيزا؟",
      )
    )
      return false;
    if (
      kind === "repayment" &&
      debt(debtId).kind === "loan" &&
      principal === sum &&
      !confirm("هل قسط القرض كله أصل دين، دون فوائد؟")
    )
      return false;
    if (automatic && !smsCanAutoPost(parsed))
      throw Error("العملية تحتاج مراجعة");
    const oldHash = window.FinanceImport.hash(
      window.FinanceImport.normalize(parsed.raw),
    );
    entry.smsHashes = [oldHash, parsed.hash];
    if (!data.seenHashes) data.seenHashes = {};
    // If the user identified a masked Visa for the first time, retain the last four digits locally for future automatic recognition.
    if (
      ["charge", "cash_advance", "refund", "repayment"].includes(kind) &&
      debt(debtId)?.kind === "credit" &&
      !debt(debtId).cardLast4
    ) {
      const suffixes = (parsed.cardDigits || []).filter((x) =>
        /^[0-9]{4}$/.test(x),
      );
      if (
        suffixes.length === 1 &&
        !data.debts.some((x) => x.id !== debtId && x.cardLast4 === suffixes[0])
      )
        debt(debtId).cardLast4 = suffixes[0];
    }
    data.moves.push(entry);
    data.seenHashes[oldHash] = 1;
    data.seenHashes[parsed.hash] = 1;
    data.lastSmsMoveId = entry.id;
    period = date.slice(0, 7);
    smsDraft = null;
    smsStatus =
      "✓ " +
      moveName(entry) +
      " " +
      money(sum) +
      (entry.debtId ? " • " + (debt(entry.debtId)?.name || "") : "") +
      ". تم الحفظ مرة واحدة. استخدم «التراجع» إذا كانت العملية غير صحيحة.";
    keep();
    return true;
  }
  function processIncomingSms(raw) {
    const str = String(raw || "").trim();
    if (!str) return;
    const d = window.BankSMS?.parse(str, data);
    if (!d) throw Error("تعذر قراءة الرسالة");
    if (d.kind === "rejected") {
      smsDraft = null;
      smsStatus = "الرسالة لعملية مرفوضة؛ لم يتغير أي رصيد.";
      render();
      return;
    }
    if (isSameSms(str, d)) {
      smsDraft = null;
      smsStatus = "هذه الرسالة مسجلة من قبل، ولم تُكرر العملية.";
      render();
      return;
    }
    smsDraft = d;
    smsStatus = "";
    if (smsCanAutoPost(d)) {
      acceptSms(d, {}, true);
      return;
    }
    render();
  }
  function analyzeSMS() {
    const raw = $("smsRaw")?.value?.trim() || "";
    if (!raw) throw Error("ألصق رسالة البنك أولًا");
    processIncomingSms(raw);
  }
  function saveSMS() {
    if (!smsDraft) throw Error("لا توجد رسالة بحاجة إلى مراجعة");
    const v = (name) =>
      $("content").querySelector('[name="' + name + '"]')?.value || "";
    const kind = v("smsKind"),
      a = Number(v("smsAmount")),
      principal = Number(v("smsPrincipal") || a);
    const f = {
      kind,
      amount: a,
      date: v("smsDate"),
      category: v("smsCategory"),
      debtId: v("smsDebt"),
      from: v("smsFrom"),
      to: v("smsTo"),
      principal,
      cashEvidenceId: v("smsCashEvidence"),
      paidElsewhere: v("smsPaidElsewhere") === "yes",
    };
    if (
      smsDraft.kind === "unclassified" &&
      !confirm(
        "نوع الرسالة لم يتضح تلقائيًا؛ هل راجعت نوع العملية والجهات قبل تسجيلها؟",
      )
    )
      return;
    acceptSms(smsDraft, f, false);
  }

  function contentBudgetHistory() {
    const xs = Object.entries(data.legacy?.budgetMonths || {}).sort((a, b) =>
      b[0].localeCompare(a[0]),
    );
    if (!xs.length)
      return panel("الأشهر القديمة", blank("لم يُستورد سجل شهور سابق بعد"));
    return panel(
      "الأشهر المحفوظة من النسخة الشاملة",
      entryList(
        xs.map(([m, v]) => ({
          title: "ميزانية " + m,
          subtitle:
            (v.budgetItems ?? data.budget.filter((x) => x.month === m).length) +
            " بندًا • دخل إضافي مخطط " +
            money((v.incomeLines || []).reduce((z, x) => z + num(x.amount), 0)),
          value: "راتب " + money(v.salary),
        })),
        "",
      ),
    );
  }
  function contentDebtHistory() {
    const xs = data.legacy?.debtLogs || [];
    if (!xs.length)
      return panel(
        "سجلات الديون السابقة",
        blank("لا توجد حركات فيزا أو دراهم مستوردة"),
      );
    return panel(
      "عمليات الديون المحفوظة من النسخة",
      entryList(
        xs.slice(0, 100).map((x) => ({
          title: x.name + " • " + x.kind,
          subtitle: x.date + " • محفوظة ضمن الرصيد المرجعي، لا تخصم مرة أخرى",
          value: money(x.amount),
        })),
        "لا توجد حركات",
      ),
    );
  }
  function contentImportReview() {
    const l = data.legacy || {},
      hist = data.moves.filter((x) => x.importedHistory);
    const summary = stats([
      box(
        "الحسابات",
        data.accounts.length,
        "أرصدة كما في النسخة الشاملة",
        "blue",
      ),
      box(
        "الحركات التاريخية",
        l.bankHistoryCount || hist.length,
        "لا تُخصم ثانية من الرصيد",
        "violet",
      ),
      box(
        "بنود الميزانيات",
        data.budget.length,
        Object.keys(l.budgetMonths || {}).length + " أشهر",
        "coral",
      ),
      box(
        "حركات الفيزا ودراهم",
        l.debtLogs?.length || 0,
        "سجل الدين القديم محفوظ",
        "amber",
      ),
    ]);
    return (
      (window.FinanceUI?.review(data) || "") +
      summary +
      panel(
        "تفاصيل البيانات المنقولة",
        entryList(
          [
            {
              title: "الديون والبطاقات",
              value: String(data.debts.length) + " دين/فيزا",
            },
            {
              title: "الأهداف والالتزامات",
              value: String(data.commitments.length) + " موعد",
            },
            {
              title: "المشاريع",
              value: String(data.projects.length) + " مشروع أو خطة",
            },
            {
              title: "قواعد التعرف على الرسائل",
              value: String(data.learnedRules.length) + " قاعدة",
            },
            {
              title: "قواعد منع الرسائل المكررة",
              value:
                String(Object.keys(data.seenHashes || {}).length) + " بصمة",
            },
            {
              title: "خطة المستقبل الأصلية",
              value: l.future ? "محفوظة" : "لم تُستورد",
            },
            {
              title: "حاسبة الراتب القديمة",
              value: l.salaryCalc ? "محفوظة" : "غير موجودة",
            },
          ],
          "لا توجد بيانات مستوردة",
        ),
      ) +
      '<p class="body-note">الحركات التاريخية محفوظة للعرض والتحليل ضمن الرصيد النهائي المستورد. لا تنشئ عمليات سداد جديدة لفيزا أو دراهم إلا إذا حدثت بعد تاريخ النسخة أو لم تكن موجودة فيها.</p>'
    );
  }

  function bankGroup(a) {
    if (a.role === "cash") return "النقد في اليد";
    const t = String(a.bank || "غير مصنف")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "");
    if (/d360|دي360|د٣٦٠/.test(t)) return "D360";
    if (/أهلي|الاهلي|ncb|snb/.test(t)) return "الأهلي";
    if (/إنماء|انماء|alinma/.test(t)) return "الإنماء";
    if (/stc|استي|إس\.?تي/.test(t)) return "STC";
    if (/دراهم|darahim/.test(t)) return "دراهم";
    return String(a.bank || "غير مصنف").trim() || "غير مصنف";
  }
  function bankConfirmations() {
    if (!data.confirmations) data.confirmations = { accounts: {}, budget: {} };
    if (!data.confirmations.accounts) data.confirmations.accounts = {};
    return (
      data.confirmations.accounts[period] ||
      (data.confirmations.accounts[period] = {})
    );
  }
  function linkedAccount(item) {
    const legacyId = item.legacyAccountId || "";
    const legacyLink = data.legacy?.links?.[legacyId],
      itemLink = data.legacy?.itemLinks?.[item.legacyId || ""]?.bankAccountId;
    const refs = [item.bankAccountId, item.linkedBankId, itemLink, legacyLink];
    for (const ref of refs) {
      if (!ref) continue;
      const found = data.accounts.find(
        (x) => x.id === ref || x.legacyId === ref,
      );
      if (found) return found;
    }
    const oldAccount = (data.legacy?.budgetAccounts || []).find(
      (x) => x.id === legacyId,
    );
    if (oldAccount) {
      const group = bankGroup({
        bank: oldAccount.bank || oldAccount.name || "",
      });
      const candidates = data.accounts.filter((x) => bankGroup(x) === group);
      if (candidates.length === 1) return candidates[0];
    }
    return null;
  }
  function fundedItems(a) {
    return data.budget.filter(
      (x) => x.month === period && window.Accounting.accountFor(data, x)?.id === a.id,
    );
  }
  function fundedAmount(a) {
    return window.Accounting.fundingStatus(data, period, a.id).planned;
  }
  function fundingSig(a) {
    return JSON.stringify(
      fundedItems(a)
        .map((x) => [x.id, Number(x.amount) || 0])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    );
  }
  function isAccountConfirmed(a) {
    const status = window.Accounting.fundingStatus(data, period, a.id);
    return status.planned > 0 && status.rest === 0;
  }

  function bankGroups() {
    const names = [...new Set(data.accounts.map(bankGroup))];
    return names.map((name) => ({
      name,
      children: data.accounts.filter((x) => bankGroup(x) === name),
    }));
  }
  function contentAccountFunding() {
    const groups = bankGroups();
    if (!groups.length)
      return panel(
        "متابعة مخصصات الميزانية",
        blank("استورد الحسابات أو أضفها أولًا"),
      );
    if (!bankPick || !groups.some((g) => g.name === bankPick))
      bankPick = groups[0].name;
    const group = groups.find((g) => g.name === bankPick);
    if (!accountPick || !group.children.some((a) => a.id === accountPick))
      accountPick = group.children[0]?.id || "";
    const account = acc(accountPick);
    const fundingChildren = group.children.filter(
      (a) => fundedItems(a).length > 0,
    );
    const allDone =
      fundingChildren.length > 0 && fundingChildren.every(isAccountConfirmed);
    const groupTotal = group.children.reduce((z, a) => z + fundedAmount(a), 0);
    const confirmedTotal = group.children
      .filter(isAccountConfirmed)
      .reduce((z, a) => z + fundedAmount(a), 0);
    const completed = groups.filter(
      (g) =>
        g.children.some((a) => fundedItems(a).length) &&
        g.children
          .filter((a) => fundedItems(a).length)
          .every(isAccountConfirmed),
    ).length;
    const groupOptions = groups.map((g) => {
      const active = g.children.filter((a) => fundedItems(a).length);
      const complete = active.length > 0 && active.every(isAccountConfirmed);
      return [
        g.name,
        (complete ? "✓ " : "○ ") +
          g.name +
          " — " +
          money(g.children.reduce((z, a) => z + fundedAmount(a), 0)) +
          " (" +
          active.filter(isAccountConfirmed).length +
          "/" +
          active.length +
          ")",
      ];
    });
    const accountOpts = group.children.map((a) => [
      a.id,
      (isAccountConfirmed(a) ? "✓ " : "○ ") +
        a.name +
        " • " +
        money(fundedAmount(a)) +
        " •••• " +
        (a.last4 || "—"),
    ]);
    const previous = data.legacy?.budgetMonths?.[period]?.accountStatus || {};
    const oldGroups = data.legacy?.budgetAccounts || [];
    const matching = oldGroups
      .filter((x) => bankGroup({ bank: x.name || "" }) === bankPick)
      .map((x) => ({ name: x.name, confirmed: previous[x.id] === true }))
      .filter(
        (x) =>
          previous[oldGroups.find((a) => a.name === x.name)?.id] !== undefined,
      );
    const marked = fundingChildren.filter(isAccountConfirmed).length;
    const selector =
      '<div class="funding-selectors"><label class="form-field"><span>أولًا: اختر البنك</span><select id="fundBank">' +
      options(groupOptions, bankPick) +
      "</select></label>" +
      '<label class="form-field"><span>ثانيًا: اختر الحساب الفرعي</span><select id="fundAccount">' +
      options(accountOpts, accountPick) +
      "</select></label></div>";
    const bankBanner =
      '<div class="bank-banner ' +
      (allDone ? "confirmed" : "pending") +
      '"><b>' +
      esc(bankPick) +
      "</b><span>" +
      (allDone
        ? "✓ جميع الحسابات مؤكدة لهذا الشهر"
        : "بانتظار تأكيد " + (fundingChildren.length - marked) + " حساب") +
      "</span><strong>" +
      marked +
      " / " +
      fundingChildren.length +
      " حساب • المطلوب تحويله " +
      money(groupTotal) +
      " • المؤكد " +
      money(confirmedTotal) +
      "</strong></div>";
    const acct =
      '<div class="funding-account ' +
      (account && isAccountConfirmed(account) ? "confirmed" : "pending") +
      '">' +
      (account
        ? "<b>" +
          esc(account.name) +
          "</b><small>" +
          esc(account.bank) +
          " •••• " +
          esc(account.last4 || "—") +
          "</small><strong>" +
          money(accountBalance(account)) +
          "</strong>" +
          '<span class="fund-state">' +
          (fundedItems(account).length === 0
            ? "لا توجد بنود مخصصة لهذا الحساب"
            : isAccountConfirmed(account)
              ? "✓ تم تأكيد تنفيذ البند في الميزانية"
              : "لم يتم تأكيد البند في الميزانية") +
          "</span>" +
          '<div class="hint">المطلوب تحويله لهذا الحساب: <b>' +
          money(fundedAmount(account)) +
          "</b></div>" +
          '<div class="compact-list">' +
          fundedItems(account)
            .map(
              (x) =>
                '<div class="list-row"><div><b>' +
                esc(x.name) +
                "</b><small>" +
                (x.paid ? "✓ تم تنفيذ البند" : "○ لم يؤكد تنفيذ البند") +
                "</small></div><b>" +
                money(x.amount) +
                "</b></div>",
            )
            .join("") +
          "</div>" +
          (fundedItems(account).length
            ? button(
                isAccountConfirmed(account)
                  ? "إلغاء تأكيد هذا الحساب"
                  : "تأكيد تحويل هذا الحساب",
                "toggleAccountFunding",
                account.id,
                isAccountConfirmed(account) ? "outline" : "primary",
              )
            : "") +
          button(
            "تعديل الرصيد الفعلي والحساب",
            "editAccount",
            account.id,
            "primary",
          )
        : "") +
      "</div>";
    const oldText = matching.length
      ? '<p class="hint">من ميزانية V8 القديمة: ' +
        matching
          .map(
            (x) =>
              esc(x.name) +
              " — " +
              (x.confirmed ? "تم تأكيد المجموعة" : "لم تؤكد المجموعة"),
          )
          .join(" • ") +
        "</p>"
      : "";
    const names = groups.map((g) => {
      const active = g.children.filter((a) => fundedItems(a).length),
        complete = active.length > 0 && active.every(isAccountConfirmed);
      return {
        title: g.name,
        subtitle:
          active.length +
          " حسابات مخصصة • " +
          active.filter(isAccountConfirmed).length +
          " مؤكد",
        value: money(g.children.reduce((z, a) => z + fundedAmount(a), 0)),
        tag: complete ? "مكتمل" : active.length ? "قيد التأكيد" : "لا بنود",
        tagType: complete ? "done" : "warn",
      };
    });
    return (
      stats([
        countBox(
          "البنوك المكتملة",
          completed,
          "من " + groups.length + " بنوك",
          "violet",
        ),
        countBox(
          "حسابات مؤكدة",
          data.accounts.filter(isAccountConfirmed).length,
          "من " + data.accounts.length + " حساب",
          "blue",
        ),
      ]) +
      panel(
        "تأكيد تحويلات " + period,
        selector +
          bankBanner +
          acct +
          '<div class="buttons">' +
          button(
            allDone
              ? "إلغاء تأكيد جميع حسابات البنك"
              : "تأكيد جميع حسابات البنك",
            "toggleBankFunding",
            bankPick,
            allDone ? "outline" : "primary",
          ) +
          button("إضافة حساب فرعي", "newAccount", null, "outline") +
          "</div>" +
          oldText +
          '<p class="body-note">التمويل تحويل فعلي بين حسابين، والدفع من الحساب خطوة مستقلة. التأكيدات القديمة بلا حركة تبقى للمراجعة؛ تغيير الخطة لا يعدل التحويل السابق.</p>',
      ) +
      panel("حالة جميع البنوك", entryList(names))
    );
  }

  function contentAccounts() {
    if (sub === "review") return contentAccountAudit();
    if (sub === "funding") return contentAccountFunding();
    if (sub === "transfers") {
      const arr = data.moves
        .filter((x) => window.Accounting.active(x) && x.kind === "transfer")
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 35);
      return panel(
        "التحويلات بين الحسابات",
        entryList(
          arr.map((x) => ({
            title:
              (acc(x.from)?.name || "—") + " ← " + (acc(x.to)?.name || "—"),
            subtitle: x.date + " • لا يعد مصروفًا",
            value: money(x.amount),
            actions: actions("Move", x.id),
          })),
          "لا توجد تحويلات",
        ),
        button("تحويل جديد", "newTransfer", null, "primary") +
          button("مراجعة عمليات الحسابات", "reviewAccount", null, "outline"),
      );
    }
    return (
      stats([
        box(
          "الرصيد النقدي الكلي",
          netCash(),
          "يشمل حساب الالتزامات مرة واحدة",
          "blue",
        ),
        box(
          "حساب الالتزامات",
          reserveCash(),
          "جزء من الإجمالي النقدي",
          "violet",
        ),
        box(
          "دراهم والاستثمارات",
          invCash(),
          "أصول منفصلة عن النقد البنكي",
          "amber",
        ),
      ]) + contentAccountFunding()
    );
  }
  // A month-specific planning overlay protects the imported V8 data from destructive edits.
  function incomePlanForMonth(m) {
    return window.FinanceCore.income(data, m);
  }
  function ensureIncomePlan(m) {
    if (!data.budgetIncomeOverrides) data.budgetIncomeOverrides = {};
    if (!data.budgetIncomeOverrides[m]) {
      const existing = incomePlanForMonth(m);
      data.budgetIncomeOverrides[m] = {
        salary: existing.salary,
        lines: existing.lines.map((x) => ({ ...x })),
      };
    }
    return data.budgetIncomeOverrides[m];
  }
  function budgetIncomeForMonth(m) {
    const v = incomePlanForMonth(m);
    return {
      salary: v.salary,
      extras: v.extras,
      total: v.total,
      source: v.source,
      assumedFromPrevious: v.assumedFromPrevious,
      missing: v.missing,
    };
  }
  function incomeSourcesPanel(m) {
    const v = incomePlanForMonth(m);
    const salaryRow =
      '<div class="list-row"><div><b>الراتب الشهري المخطط</b><small>' +
      (v.assumedFromPrevious
        ? "اعتماد راتب آخر شهر محفوظ — يمكن تعديله لهذا الشهر"
        : "خاص بميزانية " + esc(m)) +
      '</small></div><div class="right"><b>' +
      money(v.salary) +
      "</b>" +
      button("تعديل الراتب", "editSalaryPlan", null, "outline") +
      "</div></div>";
    const lines = v.lines
      .map(
        (x) =>
          '<div class="list-row"><div><b>' +
          esc(x.name) +
          "</b><small>دخل إضافي مخطط في " +
          esc(m) +
          '؛ لا يُضاف تلقائيًا إلى البنك</small></div><div class="right"><b>' +
          money(x.amount) +
          "</b>" +
          button("تعديل", "editIncomePlan", x.id, "outline") +
          button("حذف", "deleteIncomePlan", x.id, "danger") +
          "</div></div>",
      )
      .join("");
    const action = button("إضافة دخل آخر", "newIncomePlan", null, "primary");
    return panel(
      "مصادر الدخل المخطط لشهر " + m,
      '<div class="compact-list">' +
        salaryRow +
        lines +
        "</div>" +
        '<div class="income-plan-summary"><strong>الراتب: ' +
        money(v.salary) +
        "</strong><strong>الإضافي: " +
        money(v.extras) +
        "</strong><strong>الإجمالي: " +
        money(v.total) +
        "</strong></div>" +
        '<p class="body-note">مثال: سجل أرباح دراهم مرة واحدة هنا كمصدر دخل متوقع، ثم وزع المبلغ على بند الزوجة وبند حساب الالتزامات من بنود الميزانية أدناه. حساب الالتزامات ادخار وليس مصروفًا؛ لا تسجل الأرباح مرتين إذا كانت مستوردة مسبقًا.</p>',
      action,
    );
  }
  function contentBudget() {
    if (sub === "history") return contentBudgetHistory();
    const items = data.budget.filter((x) => x.month === period);
    const planned = window.FinanceCore.month(data, period).planned;
    const saved = total(items.filter((x) => x.type === "saving"));
    const monthIncome = budgetIncomeForMonth(period),
      difference = monthIncome.total - planned;
    const deficit = difference < -0.005,
      surplus = difference > 0.005;
    const varianceBox =
      '<section class="budget-variance ' +
      (deficit ? "deficit" : surplus ? "surplus" : "balanced") +
      '">' +
      '<div class="budget-variance-main"><div><span class="budget-variance-caption">نتيجة خطة ' +
      esc(period) +
      "</span>" +
      "<strong>" +
      (deficit
        ? "عجز في الميزانية"
        : surplus
          ? "فائض في الميزانية"
          : "ميزانية متوازنة") +
      "</strong>" +
      "<small>" +
      (deficit
        ? "المطلوب تخفيضه من البنود أو تغطيته بدخل إضافي"
        : surplus
          ? "دخل لم يُخصص بعد لبنود الشهر"
          : "كل الدخل المخطط موزع على البنود") +
      "</small></div>" +
      '<div class="budget-variance-value">' +
      money(Math.abs(difference)) +
      "</div></div>" +
      '<div class="budget-variance-calculation"><span>الدخل المخطط: <b>' +
      money(monthIncome.total) +
      "</b></span>" +
      "<span>البنود المخططة: <b>" +
      money(planned) +
      "</b></span>" +
      "<span>من البنود ادخار وتحويلات: <b>" +
      money(saved) +
      "</b></span></div>" +
      (monthIncome.assumedFromPrevious
        ? '<div class="budget-variance-hint">حُسب الدخل من آخر ميزانية محفوظة (' +
          esc(monthIncome.source) +
          ") لأن دخل هذا الشهر غير مسجل مستقلًا.</div>"
        : "") +
      (monthIncome.missing
        ? '<div class="budget-variance-hint">لم أجد دخلًا مخططًا مؤكدًا للشهر؛ أدخل الراتب أو استورد بيانات الميزانية للحصول على نتيجة دقيقة.</div>'
        : "") +
      '<div class="budget-variance-hint">هذا فرق بين الدخل والمخصصات قبل التنفيذ. تحويل حساب الالتزامات ادخار وليس مصروفًا، لكنه يحجز جزءًا من الدخل ولذلك يدخل في حساب الفائض أو العجز.</div></section>';
    const categories = {};
    data.moves
      .filter(
        (m) =>
          window.Accounting.active(m) &&
          m.date.slice(0, 7) === period &&
          (m.kind === "expense" || m.kind === "charge"),
      )
      .forEach((m) => {
        const k = m.category || "أخرى";
        categories[k] = (categories[k] || 0) + num(m.amount);
      });
    const metrics = stats([
      box("بنود مخططة للشهر", planned, "تتضمن تحويل الادخار إن وجد", "blue"),
      box("منها ادخار مخطط", saved, "ليس مصروفًا فعليًا", "violet"),
      box("المصروف الفعلي", expenseM(), "من الحركات المسجلة", "coral"),
    ]);
    if (sub === "categories")
      return (
        varianceBox +
        metrics +
        panel(
          "المصروفات المنفذة حسب البند",
          bars(
            Object.entries(categories).sort((a, b) => b[1] - a[1]),
            "تم احتساب الصرف من عمليات فعلية فقط",
          ),
        )
      );
    const statuses = items.map((x) => ({
      x,
      s: window.Accounting.paymentStatus(data, x),
    }));
    const rows = statuses
      .map(
        ({ x, s }) =>
          '<div class="budget-line ' +
          (s.complete ? "confirmed" : "pending") +
          '"><div class="budget-item-main"><b>' +
          esc(x.name) +
          "</b><small>" +
          esc(x.category || x.type) +
          "</small><small>حساب التنفيذ: " +
          esc(acc(x.paymentSourceId)?.name || linkedAccount(x)?.name || "غير محدد") +
          "</small><strong>" +
          money(x.amount) +
          "</strong><small>المثبت: " +
          money(s.paid) +
          " • المتبقي: " +
          money(s.rest) +
          '</small></div><div class="budget-item-state">' +
          pill(
            s.complete
              ? "مدفوع مثبت"
              : s.partial
                ? "دفع جزئي"
                : s.legacy
                  ? "متابعة قديمة تحتاج مطابقة"
                  : "غير مدفوع",
            s.complete ? "done" : "warn",
          ) +
          (x.amount > 0 || s.moves.length
            ? button(s.complete ? "مدفوع — عرض التفاصيل" : "تأكيد الدفع", "payBudgetV3", x.id, s.complete ? "outline" : "primary")
            : "<span>لا يستحق سدادًا</span>") +
          actions("Budget", x.id) +
          "</div></div>",
      )
      .join("");
    return (
      varianceBox +
      incomeSourcesPanel(period) +
      metrics +
      panel(
        "بنود ميزانية " + period,
        rows || blank("لا توجد بنود"),
        button("إضافة بند", "newBudget", null, "primary") +
          button("نسخ الشهر السابق", "copyPrevBudget", null, "outline"),
      ) +
      panel(
        "الفائض",
        entryList([{ title: "فائض الخطة", value: money(difference) }]),
        '<a href="surplus.html">إدارة الفائض</a>',
      )
    );
  }
  function moveName(m) {
    return (
      {
        income: "دخل",
        expense: "مصروف",
        transfer: "تحويل بين حسابين",
        repayment: "سداد دين",
        charge: "شراء بالفيزا",
        cash_advance: "سحب نقدي من فيزا",
        refund: "استرداد فيزا",
        profit: "ربح استثماري",
        fee: "رسوم فيزا",
      }[m.kind] ||
      m.legacyType ||
      "حركة"
    );
  }
  function moveAccounts(m) {
    return ["charge", "cash_advance", "refund"].includes(m.kind)
      ? (debt(m.debtId)?.name || "فيزا") +
          (m.to ? " ← " + (acc(m.to)?.name || "") : "")
      : m.kind === "repayment"
        ? (m.bankAlreadyPosted
            ? "خصم بنكي سبق تسجيله"
            : "من " + (acc(m.from)?.name || "حساب")) +
          " ← " +
          (debt(m.debtId)?.name || "دين")
        : (acc(m.from)?.name || "") +
          (m.to ? " ← " + (acc(m.to)?.name || "") : "");
  }
  // Review is intentionally read-only until the user edits or cancels an explicit posted movement.
  function accountDelta(a, m) {
    if (m.posted === false) return 0;
    return (
      (m.to === a.id ? num(m.amount) : 0) -
      (m.from === a.id && !m.bankAlreadyPosted ? num(m.amount) : 0)
    );
  }
  function recentMovements(xs, limit = 100) {
    return xs
      .slice()
      .sort(
        (a, b) =>
          String(b.date).localeCompare(String(a.date)) ||
          String(b.id).localeCompare(String(a.id)),
      )
      .slice(0, limit);
  }
  function movementRows(xs, empty, readOnly = false) {
    return entryList(
      xs.map((m) => ({
        title: moveName(m) + " • " + (m.category || "بدون تصنيف"),
        subtitle:
          m.date +
          " • " +
          moveAccounts(m) +
          (m.raw ? " • من رسالة مُلصقة" : "") +
          (m.importedHistory ? " • حركة مستوردة ضمن الرصيد المرجعي" : ""),
        value: money(m.amount),
        negative: ["expense", "charge"].includes(m.kind),
        tag: m.importedHistory ? "مستوردة" : "",
        actions:
          m.importedHistory || readOnly
            ? ""
            : button("تصحيح العملية", "editMove", m.id, "mini") +
              button("إلغاء الحركة", "deleteMove", m.id, "mini danger"),
      })),
      empty,
    );
  }
  function contentAccountAudit() {
    const choices = data.accounts.filter((x) =>
      ["bank", "reserve", "cash", "investment"].includes(x.role),
    );
    if (!choices.length) return panel("مراجعة الحساب", blank("لا توجد حسابات"));
    const a = choices.find((x) => x.id === accountPick) || choices[0];
    accountPick = a.id;
    const list = recentMovements(
      data.moves.filter(
        (m) => (m.from === a.id || m.to === a.id) && m.posted !== false,
      ),
    );
    const inflow = list.reduce(
      (z, m) => z + (m.to === a.id ? num(m.amount) : 0),
      0,
    );
    const outflow = list.reduce(
      (z, m) =>
        z + (m.from === a.id && !m.bankAlreadyPosted ? num(m.amount) : 0),
      0,
    );
    const balance = accountBalance(a);
    const selectHtml =
      '<label class="form-field"><span>اختر الحساب الذي تريد تدقيق رصيده</span><select id="auditAccount">' +
      options(
        choices.map((x) => [x.id, bankGroup(x) + " — " + x.name]),
        a.id,
      ) +
      "</select></label>";
    const warning =
      balance < -0.005
        ? '<p class="ledger-warning">الرصيد الحالي سالب. يمكنك تعديل الحساب وإدخال رصيده الحقيقي من كشف البنك؛ ستُحفظ التسوية دون حذف الحركات السابقة.</p>'
        : "";
    return panel(
      "مراجعة حركة الحساب — " + a.name,
      selectHtml +
        stats([
          box(
            "الرصيد المرجعي",
            Number(a.opening || 0),
            "كما كان عند الاستيراد أو إضافة الحساب",
            "blue",
          ),
          box("الحركات الواردة", inflow, "حركات فعالة بعد الاستيراد", "violet"),
          box("الخصومات", outflow, "حركات فعالة بعد الاستيراد", "coral"),
          box(
            "تسوية الرصيد",
            Number(a.balanceAdjustment || 0),
            "تصحيح مباشر لقيمة الرصيد الحالية",
            "violet",
          ),
          box(
            "الرصيد الفعلي",
            balance,
            "المرجعي + الحركات + التسوية",
            balance < 0 ? "coral" : "blue",
          ),
        ]) +
        warning +
        '<div class="buttons">' +
        button(
          "تعديل الرصيد الحالي لهذا الحساب",
          "editAccount",
          a.id,
          "primary",
        ) +
        "</div>" +
        movementRows(list, "لا توجد حركات جديدة تؤثر في هذا الحساب", true) +
        '<p class="body-note">لتحديث الرصيد مباشرة افتح «تعديل الحساب» واكتب الرقم الحقيقي من البنك؛ سيظهر الرقم نفسه بعد الحفظ. وتبقى الحركات القديمة محفوظة للمراجعة عند الحاجة.</p>',
    );
  }
  function contentLedgerReview() {
    const actual = data.moves.filter(
      (m) => m.posted !== false && !m.importedHistory,
    );
    const suspects = recentMovements(
      actual.filter(
        (m) =>
          (["expense", "transfer"].includes(m.kind) &&
            /فيزا|visa|بطاقة\s*ائتمان|credit\s*card/i.test(
              (m.category || "") + " " + (m.raw || "") + " " + (m.note || ""),
            )) ||
          (["charge", "cash_advance", "refund", "repayment"].includes(m.kind) &&
            !debt(m.debtId)) ||
          (m.kind === "repayment" && !m.principal) ||
          (["expense", "transfer", "repayment"].includes(m.kind) &&
            m.from &&
            !acc(m.from)),
      ),
      40,
    );
    const negatives = data.accounts.filter(
      (a) =>
        accountBalance(a) < -0.005 &&
        ["bank", "reserve", "cash"].includes(a.role),
    );
    const cancelled = (data.voidedMoves || []).slice(-20).reverse();
    return panel(
      "فحص سلامة الأرصدة والتصنيف",
      stats([
        box(
          "حركات فعلية جديدة",
          actual.length,
          "لا تشمل حركات الاستيراد المرجعية",
          "blue",
        ),
        box(
          "حركات للمراجعة",
          suspects.length,
          "يجب التحقق منها يدويًا قبل التصحيح",
          "amber",
        ),
        box(
          "حسابات ذات رصيد سالب",
          negatives.length,
          "قد يكون نقص بيانات أو تصنيف خاطئ",
          "coral",
        ),
      ]) +
        (negatives.length
          ? '<p class="ledger-warning">حسابات سالبة: ' +
            negatives
              .map((a) => esc(a.name) + " (" + money(accountBalance(a)) + ")")
              .join("، ") +
            "</p>"
          : "") +
        '<p class="body-note">المشتريات بالفيزا تزيد دين البطاقة، وليس خصم البنك. يمكن تصحيح حركة قائمة دون تغيير رصيد افتتاحي. الإجراءات أدناه لا تمس الحركات التاريخية المستوردة.</p>' +
        "<h3>عمليات يُحتمل أنها مصنفة خطأ</h3>" +
        movementRows(suspects, "لم أجد تصنيفًا مشتبهًا به حسب القواعد الآلية") +
        "<h3>جميع الحركات الجديدة — الأحدث أولًا</h3>" +
        movementRows(recentMovements(actual, 100), "لم تسجل حركات جديدة") +
        "<h3>الحركات الملغاة — يمكن استعادتها</h3>" +
        entryList(
          cancelled.map((z) => {
            const m = z.move || {};
            return {
              title: moveName(m) + " • " + (m.category || ""),
              subtitle: m.date + " • أُلغيت في " + (z.at || ""),
              value: money(m.amount),
              actions: button("استعادة الحركة", "restoreMove", m.id, "mini"),
            };
          }),
          "لا توجد عمليات أُلغيت",
        ) +
        '<p class="body-note">تُحفظ نسخة من الحركة الملغاة داخل بيانات هذا الجهاز ونسختك الاحتياطية للتدقيق أو الاستعادة. لا يُرسل أي شيء إلى GitHub.</p>',
    );
  }
  function contentMoves() {
    if (sub === "paste") return contentSMS();
    if (sub === "review") return contentLedgerReview();
    const kinds =
      sub === "income"
        ? ["income", "profit"]
        : sub === "spend"
          ? ["expense", "charge", "refund"]
          : null;
    const arr = data.moves
      .filter(
        (x) =>
          x.date.slice(0, 7) === period && (!kinds || kinds.includes(x.kind)),
      )
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 100);
    return (
      stats([
        box("دخل الشهر", incomeM(), "دخل وأرباح مدخلة", "blue"),
        box("مصروف الشهر", expenseM(), "يشمل مشتريات الفيزا المسجلة", "coral"),
        box("سداد الديون", paidM(), "تدفق نقدي وليس شراء جديدًا", "amber"),
      ]) +
      panel(
        "حركات " + period,
        entryList(
          arr.map((m) => ({
            title: moveName(m) + " • " + (m.category || "بدون تصنيف"),
            subtitle:
              m.date +
              " • " +
              moveAccounts(m) +
              (m.commitmentKey ? " • مرتبط باستحقاق" : ""),
            value: money(m.amount),
            tag: m.importedHistory
              ? "تاريخية ضمن الرصيد"
              : m.posted === false
                ? "ملغاة"
                : m.kind === "transfer"
                  ? "ليس مصروفًا"
                  : "",
            negative: ["expense", "charge"].includes(m.kind),
            actions: m.importedHistory ? "" : actions("Move", m.id),
          })),
          "لا توجد حركات في هذا الشهر",
        ),
        button("إضافة حركة", "newMove", null, "primary") +
          button("مراجعة الأخطاء والتراجع", "reviewLedger", null, "outline"),
      )
    );
  }
  function addMonths(s, n) {
    const a = s.split("-").map(Number);
    return monthKey(new Date(a[0], a[1] - 1 + Number(n), 1));
  }
  function dueItems() {
    const rows = [];
    data.commitments
      .filter((x) => x.active !== false)
      .forEach((c) => {
        const count = Math.min(240, Math.max(1, Number(c.count) || 1)),
          gap = Math.max(1, Number(c.interval) || 1);
        for (let i = 0; i < count; i++) {
          const m = addMonths(c.firstMonth, i * gap),
            k = c.id + "-" + i;
          const paid = total(
            data.moves.filter(
              (x) =>
                window.Accounting.active(x) &&
                x.commitmentKey === k &&
                x.kind === "expense",
            ),
          );
          rows.push({
            key: k,
            id: c.id,
            name: c.name,
            date: m,
            amount: num(c.amount),
            paid,
            rest: Math.max(0, num(c.amount) - paid),
            i,
          });
        }
      });
    return rows.sort((a, b) => a.date.localeCompare(b.date));
  }
  function contentObligations() {
    if (sub === "forecast")
      return window.ObligationForecast
        ? window.ObligationForecast.view(data, {
            dues: dueItems(),
            now: month(),
          })
        : panel("التنبؤ", blank("تعذر تحميل وحدة التنبؤ"));
    const isReserve = reserves().length > 0;
    if (sub === "reserve") {
      const transfers = data.moves.filter(
        (x) => x.kind === "transfer" && acc(x.to)?.role === "reserve",
      );
      const spent = data.moves.filter(
        (x) => x.kind === "expense" && acc(x.from)?.role === "reserve",
      );
      return (
        stats([
          box(
            "رصيد حساب الالتزامات",
            reserveCash(),
            "مال موجود بالفعل، وليس تقديرًا",
            "violet",
          ),
          box(
            "حُوّل إلى الادخار",
            total(transfers),
            "إجمالي التحويلات المسجلة",
            "blue",
          ),
          box("صُرف من الادخار", total(spent), "مصروفات مدفوعة بالفعل", "coral"),
        ]) +
        panel(
          "كيف تعمل الأموال المخصصة؟",
          '<p class="body-note">حوّل مبلغًا من حسابك الجاري إلى حساب من نوع «الالتزامات». لا يسجل التحويل مصروفًا. عند دفع مدرسة أو صيانة أو قسط سيارة اختر حساب الالتزامات مصدرًا للدفع؛ عندها ينخفض رصيد الحساب ويُسجل المصروف مرة واحدة.</p>' +
            (isReserve ? "" : pill("أضف حسابًا بنوع «الالتزامات» أولًا", "warn")),
          button("تحويل إلى الالتزامات", "newTransfer", null, "primary"),
        )
      );
    }
    if (sub === "catalog") {
      return (
        panel(
          "إدارة جميع الالتزامات المخططة",
          entryList(
            data.commitments.map((c) => ({
              title: c.name,
              subtitle:
                "أول موعد " +
                c.firstMonth +
                " • " +
                c.count +
                " دفعة • كل " +
                c.interval +
                " شهر",
              value: money(c.amount) + " للدفعة",
              tag: c.active === false ? "متوقف" : "مفعّل",
              tagType: c.active === false ? "warn" : "",
              actions:
                button(
                  c.active === false ? "تفعيل" : "إيقاف",
                  "toggleCommitment",
                  c.id,
                  "mini",
                ) + actions("Commitment", c.id),
            })),
            "لم تُسجّل مواعيد الالتزامات بعد",
          ),
          button("إضافة موعد", "newCommitment", null, "primary"),
        ) +
        '<p class="body-note">يمكن إيقاف موعد مستقبلي دون حذف سجلات الدفع السابقة. الاستحقاق المخطط لا يُخصم من البنك حتى تسجيل دفع حقيقي.</p>'
      );
    }
    if (sub === "paid") {
      const paid = data.moves
        .filter((x) => x.kind === "expense" && x.commitmentKey)
        .sort((a, b) => b.date.localeCompare(a.date));
      return panel(
        "مدفوعات الالتزامات الفعلية",
        entryList(
          paid.map((m) => ({
            title: m.category || "دفعة التزام",
            subtitle: m.date + " • " + moveAccounts(m),
            value: money(m.amount),
            actions: actions("Move", m.id),
          })),
          "لم يُدفع أي استحقاق مرتبط بعد",
        ),
        button("تسجيل دفع حقيقي", "newExpense", null, "primary"),
      );
    }
    const due = dueItems()
      .filter((x) => x.rest > 0 && x.date >= period)
      .slice(0, 50);
    const near = due.filter((x) => x.date <= addMonths(period, 12)),
      amount = total(near, (x) => x.rest);
    return (
      stats([
        box(
          "رصيد ادخار متاح اليوم",
          reserveCash(),
          "يمكن أن يستعمل للمدارس والسيارة والصيانة",
          "violet",
        ),
        box("استحقاقات ١٢ شهرًا", amount, "مواعيد مخططة، لم تُدفع بعد", "amber"),
      ]) +
      (window.ObligationForecast
        ? window.ObligationForecast.summary(data, {
            dues: dueItems(),
            now: month(),
          })
        : "") +
      panel(
        "الاستحقاقات المسجلة",
        entryList(
          due.slice(0, 25).map((x) => ({
            title: x.name,
            subtitle: "استحقاق " + x.date + " • المدفوع فعليًا " + money(x.paid),
            value: money(x.rest),
            tag:
              x.date < month()
                ? "متأخر"
                : x.date === month()
                  ? "هذا الشهر"
                  : "مخطط",
            tagType: x.date < month() ? "warn" : "",
          })),
          "لا توجد استحقاقات مفتوحة",
        ),
        button("إضافة التزام", "newCommitment", null, "primary"),
      ) +
      '<p class="body-note">المبالغ هنا ليست توقع عجز: إنما قيمة استحقاقات مخططة لم تُسدَّد بعد. رصيد الادخار يختلف عن تكلفة الاستحقاقات، ولا نجمعهما كأنه دخل جديد.</p>'
    );
  }
  function contentDebts() {
    if (sub === "history") return contentDebtHistory();
    const all = data.debts;
    if (sub === "payments") {
      const rows = data.moves
        .filter((x) => window.Accounting.active(x) && x.kind === "repayment")
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date));
      return panel(
        "السداد من حساباتك الفعلية",
        entryList(
          rows.map((x) => ({
            title: debt(x.debtId)?.name || "دين",
            subtitle:
              x.date + " • خُصم من أصل الدين: " + money(x.principal || 0),
            value: money(x.amount),
            actions: actions("Move", x.id),
          })),
          "لم تُسجّل دفعات دين بعد",
        ),
        button("مراجعة عمليات الدين", "reviewLedger", null, "outline"),
      );
    }
    return (
      stats([
        box(
          "إجمالي أرصدة الديون",
          sumDebt(),
          "قيم مُدخلة وليست محاكاة مستقبلية",
          "coral",
        ),
        box("المدفوع المسجل هذا الشهر", paidM(), "حركات سداد فعلية", "blue"),
      ]) +
      panel(
        "ديونك",
        entryList(
          all.map((x) => ({
            title: x.name,
            subtitle:
              (x.kind === "credit"
                ? "بطاقة ائتمانية"
                : x.principalBasis === "unverified"
                  ? "قرض — معنى الرصيد وتوزيع الأصل غير مؤكد"
                  : "قرض أو تمويل") +
              " • الرصيد المرجعي بتاريخ " +
              (x.asOf || "غير محدد"),
            value: money(debtsBalance(x)),
            tag: x.source === "plan" ? "من الملف" : "مسجل",
            actions: actions("Debt", x.id),
          })),
          "أضف الدين أو استورد خطة الالتزامات",
        ),
        button("إضافة دين", "newDebt", null, "primary") +
          button("تدقيق وتصحيح حركات الفيزا", "reviewLedger", null, "outline"),
      ) +
      '<p class="body-note">قيمة القرض من ملف الخطة هي رصيد مرجعي وقت إدخالها؛ قد يتغير في البنك. لا نخصم الأقساط تلقائيًا من الرصيد: سجل الخصم الحقيقي من أصل الدين عند السداد.</p>'
    );
  }
  function contentInvestment() {
    const accounts = data.accounts.filter((x) => x.role === "investment"),
      profits = data.moves.filter(
        (x) => window.Accounting.active(x) && x.kind === "profit",
      );
    if (sub === "legacy") {
      const rows = (data.legacy?.incomeRecords || []).filter((x) =>
        /دراهم|ربح|ارباح/.test(x.name || ""),
      );
      return (
        panel(
          "أرباح دراهم الواردة في الميزانيات السابقة",
          entryList(
            rows.map((x) => ({
              title: x.name,
              subtitle:
                "شهر " +
                x.month +
                " • محفوظ من الميزانية، لا يُضاف مرة أخرى للرصيد البنكي",
              value: money(x.amount),
            })),
            "لا توجد أرباح مسجلة في ميزانيات الأشهر السابقة",
          ),
        ) +
        '<p class="body-note">مبالغ الأرباح القديمة محفوظة كما وردت في الميزانية. لا نعتبرها دخلًا جديدًا عند الاستيراد، ولا نضيفها إلى أرصدة الحسابات الحالية مرة ثانية.</p>'
      );
    }
    if (sub === "profits")
      return panel(
        "الأرباح المستلمة فعلًا",
        entryList(
          profits.map((x) => ({
            title: x.category || "ربح استثماري",
            subtitle: x.date + " • دخل إلى " + (acc(x.to)?.name || "الحساب"),
            value: money(x.amount),
            actions: actions("Move", x.id),
          })),
          "لم تسجل توزيعات أرباح مثبتة",
        ),
        button("تسجيل ربح", "newProfit", null, "primary"),
      );
    return (
      stats([
        box(
          "المحفظة المسجلة",
          total(accounts, accountBalance),
          "قيمة مسجلة في آخر رصيد + الحركات",
          "amber",
        ),
        box(
          "الأرباح المستلمة",
          total(profits),
          "مسجلة كدخل فعلي، وليست نموًا مفترضًا",
          "violet",
        ),
      ]) +
      panel(
        "الحسابات الاستثمارية",
        entryList(
          accounts.map((a) => ({
            title: a.name,
            subtitle: "الأصل المسجل والحركات المرتبطة",
            value: money(accountBalance(a)),
            actions: actions("Account", a.id),
          })),
          "لا يوجد حساب استثماري حقيقي بعد",
        ),
        button("إضافة محفظة", "newInvestmentAccount", null, "primary"),
      ) +
      '<p class="body-note">لم نعد نحسب عائدًا افتراضيًا بنسبة ٦٪ أو تراكمًا لسنوات. الأرباح هنا لا تظهر إلا عندما تسجلها مستلمة أو داخلة إلى المحفظة فعليًا.</p>'
    );
  }
  function autoSalary() {
    /* Expected pay dates never post deposits. */
  }
  function autoSalaryPanel() {
    return panel(
      "إيداع الراتب",
      "<p>الموعد توقع فقط. سجل الإيداع عند حدوثه أو اربطه برسالة البنك. لا تُنشأ رواتب تلقائية.</p>",
      button("إثبات وصول الراتب", "recordSalary", null, "primary"),
    );
  }
  function contentSalary() {
    if (sub === "countdown")
      return (
        autoSalaryPanel() +
        (window.SalaryCountdown?.settings(data.salaryCountdown) || "")
      );
    const s = data.legacy?.salaryCalc || {},
      months = data.legacy?.budgetMonths || {};
    if (sub === "monthly")
      return panel(
        "الرواتب المسجلة في الميزانيات",
        entryList(
          Object.entries(months)
            .sort((a, b) => b[0].localeCompare(a[0]))
            .map(([m, v]) => ({
              title: "راتب شهر " + m,
              subtitle: "من ملف الميزانية الشامل؛ ليس إثبات حركة إيداع بنكي",
              value: money(v.salary),
            })),
          "لم تُستورد بيانات راتب شهرية",
        ),
      );
    const keys = [
      ["base", "الراتب الأساسي"],
      ["housing", "بدل السكن"],
      ["transport", "بدل النقل"],
      ["other", "بدلات أخرى"],
      ["deductions", "الاستقطاعات"],
      ["bankDeductions", "استقطاعات القروض البنكية"],
    ];
    const gross =
      num(s.base) + num(s.housing) + num(s.transport) + num(s.other);
    const net = gross - num(s.deductions) - num(s.bankDeductions);
    return (
      stats([
        box("الإجمالي حسب الحاسبة", gross, "من ملف الحاسبة المستورد", "blue"),
        box("الصافي حسب الحاسبة", net, "لا يغيّر أرصدة الحسابات", "violet"),
      ]) +
      panel(
        "تفاصيل آخر حاسبة راتب محفوظة",
        entryList(
          keys.map(([key, title]) => ({ title, value: money(s[key] || 0) })),
          "لا توجد بيانات حاسبة راتب في الملف",
        ),
      ) +
      '<p class="body-note">تظهر هنا أرقام حاسبة الراتب الموجودة في النسخة الشاملة. موعد الصرف توقع فقط؛ سجّل الإيداع بعد حدوثه.</p>'
    );
  }

  function contentProjects() {
    if (sub === "activity") {
      const arr = data.moves.filter(
        (x) => x.projectId && x.date.slice(0, 7) === period,
      );
      return panel(
        "حركات المشاريع في " + period,
        entryList(
          arr.map((x) => ({
            title: project(x.projectId)?.name || "مشروع",
            subtitle: x.date + " • " + moveName(x),
            value: money(x.amount),
            actions: actions("Move", x.id),
          })),
          "لا توجد حركة مشروع في هذا الشهر",
        ),
        button("إضافة حركة مشروع", "newMove", null, "primary"),
      );
    }
    if (sub === "forecasts") {
      return (
        panel(
          "خطط أرباح المشاريع",
          entryList(
            data.projects.map((p) => ({
              title: p.name,
              subtitle:
                (p.forecastEnabled ? "التنبؤ مفعل" : "التنبؤ غير مفعل") +
                " • " +
                (p.profitStart || "بدون تاريخ") +
                " • " +
                (Number(p.profitInterval) === 0
                  ? "دفعة واحدة"
                  : !p.profitInterval
                    ? "غير محدد"
                    : "كل " + p.profitInterval + " شهر"),
              value:
                "الربح " +
                money(p.expectedNetProfit || 0) +
                " • للالتزامات " +
                money(p.profitToObligations || 0) +
                " • المتبقي " +
                money(
                  Math.max(
                    0,
                    num(p.expectedNetProfit) - num(p.profitToObligations),
                  ),
                ),
              actions: button("ضبط الأرباح", "editProject", p.id, "outline"),
            })),
            "لا توجد مشاريع؛ أضف مشروعًا أولًا",
          ),
          button("إضافة مشروع", "newProject", null, "primary"),
        ) +
        '<p class="body-note">هذه مبالغ متوقعة وليست إيرادات حدثت بالفعل. تحدد ربح كل مشروع بعد المصروفات، ثم المبلغ الذي يذهب منه إلى حساب الالتزامات. إذا كان هذا المبلغ داخل ادخار الميزانية بالفعل، فعّل خيار «محتسب في الميزانية» لتجنب إضافته مرتين.</p>' +
        '<div class="buttons">' +
        button(
          "تنبؤ استحقاقات المدارس والسيارة",
          "showObligationForecast",
          null,
          "primary",
        ) +
        "</div>"
      );
    }
    return (
      panel(
        "المشاريع المسجلة",
        entryList(
          data.projects.map((p) => {
            const tx = data.moves.filter((x) => x.projectId === p.id),
              income = total(tx.filter((x) => x.kind === "income")),
              out = total(tx.filter((x) => x.kind === "expense"));
            return {
              title: p.name,
              subtitle:
                "دخل فعلي " +
                money(income) +
                " • مصروف فعلي " +
                money(out) +
                (p.forecastEnabled
                  ? " • الربح المتوقع " +
                    money(p.expectedNetProfit || 0) +
                    " / للالتزامات " +
                    money(p.profitToObligations || 0) +
                    " / المتبقي " +
                    money(
                      Math.max(
                        0,
                        num(p.expectedNetProfit) - num(p.profitToObligations),
                      ),
                    )
                  : " • لا توجد أرباح متوقعة مفعّلة"),
              value: "الصافي الفعلي " + money(income - out),
              actions: actions("Project", p.id),
            };
          }),
          "لا توجد مشاريع مُسجّلة",
        ),
        button("إضافة مشروع", "newProject", null, "primary") +
          button("إعداد أرباح المشاريع", "projectForecasts", null, "outline"),
      ) +
      '<p class="body-note">الأرباح الفعلية من الحركات المسجلة فقط. الأرباح المتوقعة تظهر منفصلة في «الأرباح المتوقعة»، ولا تضاف إلى البنك إلا إذا أدخلت حركة مالية حقيقية.</p>'
    );
  }
  function bars(entries, hint) {
    if (!entries.length) return blank("لا توجد بيانات فعلية لهذا الرسم بعد");
    const max = Math.max(1, ...entries.map((x) => Math.abs(Number(x[1]) || 0)));
    return (
      '<div class="bar-chart" role="img" aria-label="' +
      esc(hint || "مخطط مستطيلات") +
      '">' +
      entries
        .map((x, i) => {
          const v = Number(x[1]) || 0,
            p = Math.max(
              v === 0 ? 0 : 3,
              Math.min(100, (Math.abs(v) / max) * 100),
            );
          return (
            '<div class="bar-row"><div class="bar-head"><span>' +
            esc(x[0]) +
            "</span><strong>" +
            money(v) +
            '</strong></div><div class="bar-track"><div class="bar-fill tone-' +
            (i % 7) +
            '" style="width:' +
            p +
            '%"></div></div></div>'
          );
        })
        .join("") +
      "</div>" +
      (hint ? '<p class="hint">' + esc(hint) + "</p>" : "")
    );
  }
  function categoryTotals(period) {
    const agg = {};
    movements(period)
      .filter((x) => ["expense", "charge", "refund"].includes(x.kind))
      .forEach((x) => {
        let k = x.category || "غير مصنف";
        agg[k] =
          (agg[k] || 0) +
          (x.kind === "refund" ? -num(x.amount) : num(x.amount));
      });
    return Object.entries(agg).sort((a, b) => b[1] - a[1]);
  }
  function contentChart() {
    let entries = [],
      heading = "",
      note = "هذه الرسوم مبنية على عمليات حقيقية مُدخلة وليست محاكاة مستقبلية.";
    if (sub === "expenses") {
      heading = "مصروف كل بند — " + period;
      entries = categoryTotals(period);
    } else if (sub === "spending") {
      heading = "التدفقات المثبتة — " + period;
      entries = [
        ["الدخل", incomeM()],
        ["المصروف والمشتريات", expenseM()],
        ["سداد القروض والفيزا", paidM()],
        [
          "الادخار المنقول",
          total(
            movements().filter(
              (x) => x.kind === "transfer" && acc(x.to)?.role === "reserve",
            ),
          ),
        ],
      ];
      note = "الادخار المنقول ليس مصروفًا ولا يُجمع مع المصروفات.";
    } else if (sub === "accounts") {
      heading = "أرصدة الحسابات الآن";
      entries = data.accounts
        .map((x) => [x.name, accountBalance(x)])
        .sort((a, b) => b[1] - a[1]);
    } else if (sub === "debts") {
      heading = "رصيد كل دين مسجل";
      entries = data.debts.map((x) => [x.name, debtsBalance(x)]);
    } else if (sub === "obligations") {
      heading = "الادخار والاستحقاقات";
      entries = [
        ["رصيد حساب الالتزامات", reserveCash()],
        [
          "مدفوعات استحقاقات هذا الشهر",
          total(
            movements().filter((x) => x.kind === "expense" && x.commitmentKey),
          ),
        ],
        [
          "استحقاقات شهر " + period + " غير المسددة",
          total(
            dueItems().filter((x) => x.date === period),
            (x) => x.rest,
          ),
        ],
      ];
      note =
        "يُعرض رصيد الادخار الفعلي منفصلًا عن المواعيد غير المدفوعة، دون تنبؤ.";
    } else if (sub === "projects") {
      heading = "المشاريع — حركة مثبتة";
      entries = data.projects
        .map((p) => [
          p.name + " دخل",
          total(
            data.moves.filter(
              (m) => m.projectId === p.id && m.kind === "income",
            ),
          ),
        ])
        .concat(
          data.projects.map((p) => [
            p.name + " مصروف",
            total(
              data.moves.filter(
                (m) => m.projectId === p.id && m.kind === "expense",
              ),
            ),
          ]),
        );
    } else if (sub === "darahim") {
      heading = "دراهم — فعلي فقط";
      entries = [
        ["الرصيد الاستثماري", invCash()],
        [
          "أرباح فعلية مسجلة",
          total(data.moves.filter((x) => x.kind === "profit")),
        ],
        [
          "الإيداعات إلى محفظة",
          total(
            data.moves.filter(
              (x) => x.kind === "transfer" && acc(x.to)?.role === "investment",
            ),
          ),
        ],
      ];
    } else {
      heading = "مصروفات آخر ١٢ شهرًا";
      let m = period;
      for (let i = 0; i < 12; i++) {
        entries.unshift([m, expenseM(m)]);
        m = changeMonth(m, "prev");
      }
    }
    return panel(heading, bars(entries, note));
  }
  function contentData() {
    if (sub === "inspect") return contentImportReview();
    if (sub === "about")
      return panel(
        "كيف نحسب المال؟",
        '<div class="rules"><p><b>١. الرصيد الحقيقي:</b> الرصيد الابتدائي المدخل + الوارد المثبت − الصادر المثبت.</p><p><b>٢. حساب الالتزامات:</b> نوع من حساباتك البنكية، يظهر ضمن النقد الكلي مرة واحدة؛ التحويل إليه ليس مصروفًا، والصرف منه مصروف واحد.</p><p><b>٣. الميزانية:</b> أرقام مخططة للمقارنة؛ لا تقلل الحسابات البنكية بمجرد إدخالها.</p><p><b>٤. الرسوم والقروض:</b> مواعيد أو أرصدة مرجعية حتى تُسجّل حركة دفع فعلية. سداد القرض يُخفض رصيد البنك، ويُنقص أصل الدين بالقيمة التي تؤكدها.</p><p><b>٥. المشاريع ودراهم:</b> الدخل والربح المعروضان فعليان ومدخلان، بلا نسبة عائد افتراضية.</p></div>',
      );
    return panel(
      "ملفاتك والنسخ الاحتياطية",
      '<p class="body-note">يدعم هذا القسم استيراد النسخة الشاملة New_Finance_Full دفعة واحدة: جميع الحسابات وأرصدة الفيزا ودراهم، الحركات السابقة، أشهر الميزانية، سجل الديون، أهداف المدارس والسيارة والمشاريع، وحاسبة الراتب. الأرصدة تبدأ من تاريخ النسخة ولا يُعاد خصم أي حركة تاريخية منها. لا تُرفع الملفات إلى GitHub.</p><div class="buttons">' +
        button("تصدير جميع بيانات هذا المركز", "export", null, "primary") +
        button("تهيئة بعد التوزيع والسداد", "settledStart", null, "outline") +
        button("بداية جديدة بأرصدة صفر", "freshStart", null, "outline") +
        (localStorage.getItem(KEY+"_before_fresh_start") ? button("استعادة أرشيف ما قبل البداية الجديدة", "restoreFreshStart", null, "outline") : "") +
        button(
          "استيراد V8 المحفوظ على هذا الجهاز",
          "importLocalV8",
          null,
          "outline",
        ) +
        (localStorage.getItem(KEY + "_before_full_import")
          ? button(
              "استعادة حالة ما قبل الاستيراد",
              "restorePreImport",
              null,
              "outline",
            )
          : "") +
        '<label class="button outline file-button">استيراد ملف JSON<input id="importFile" type="file" accept=".json,application/json"></label>' +
        button("مسح بيانات المركز الجديد فقط", "reset", null, "danger") +
        '</div><p class="hint">يمكن استيراد ملف خطة المستقبل المرفق، أو نسخة شاملة من V8 للحسابات والميزانية. لا تُرفع ملفاتك إلى GitHub.</p>',
    );
  }
  function render() {
    autoSalary();
    if (!nav[page]) page = "home";
    const choices = nav[page];
    if (!choices.some((x) => x[0] === sub)) sub = choices[0][0];
    $("pageNav").value = page;
    $("subNav").innerHTML = options(choices, sub);
    $("monthNav").value = period;
    $("periodBox").style.display =
      ["budget", "moves", "charts"].includes(page) ||
      (page === "accounts" && ["balances", "funding"].includes(sub)) ||
      (page === "obligations" && sub === "due") ||
      (page === "projects" && sub === "activity")
        ? ""
        : "none";
    $("pageHeading").textContent = titles[page];
    $("viewHeading").textContent = choices.find((x) => x[0] === sub)[1];
    $("quickAction").style.display =
      page === "moves" && sub === "paste" ? "none" : "";
    $("quickAction").textContent = "＋ لصق رسالة";
    let html =
      page === "home"
        ? contentHome()
        : page === "accounts"
          ? contentAccounts()
          : page === "budget"
            ? contentBudget()
            : page === "moves"
              ? contentMoves()
              : page === "obligations"
                ? contentObligations()
                : page === "debts"
                  ? contentDebts()
                  : page === "investments"
                    ? contentInvestment()
                    : page === "projects"
                      ? contentProjects()
                      : page === "salary"
                        ? contentSalary()
                        : page === "forecast"
                          ? window.RetirementApp?.render(data, sub) ||
                            blank("وحدة التقاعد غير متاحة")
                          : page === "charts"
                            ? contentChart()
                            : contentData();
    if (page==="accounts") {
      const a=acc(data.settings.salaryAccountId), status=window.Accounting.salaryStatus(data,period);
      html=panel("حساب الراتب",'<p>'+esc(a?.name || "اختر حساب الراتب عند الإثبات")+' • الرصيد '+money(a?accountBalance(a):0)+' • '+(status.confirmed?"وصول الراتب مثبت لشهر ":"إثبات الراتب لشهر ")+esc(period)+'</p>',button("إثبات وصول الراتب","recordSalary",null,"primary"))+html;
    }
    const start = data.settledStarts?.[period];
    $("content").innerHTML = (start ? '<section class="panel"><p>شهر ' + esc(period) + ' معتمد التوزيع ومفتوح للصرف. أرصدة البداية مطابقة بتاريخ ' + esc(start.date) + '؛ البنود المثبتة سُددت سابقًا دون خصم جديد.</p></section>' : "") + html;
    updateSmsVisibility();
    window.SalaryCountdown?.refresh(document, data.salaryCountdown);
    $("storageStatus").textContent =
      "الإصدار ٣.٠.٧ • " +
      data.moves.length +
      " حركة مسجلة • " +
      data.accounts.length +
      " حساب" +
      (data.legacy?.bankHistoryCount
        ? " • " + data.legacy.bankHistoryCount + " تاريخية"
        : "");
  }
  function field(label, name, value, type, extras) {
    return (
      '<label class="form-field"><span>' +
      esc(label) +
      '</span><input name="' +
      esc(name) +
      '" type="' +
      (type || "text") +
      '" ' +
      (type === "number" ? 'min="0" step="any" inputmode="decimal"' : "") +
      ' value="' +
      esc(value == null ? "" : value) +
      '" ' +
      (extras || "") +
      "></label>"
    );
  }
  function select(label, name, items, selected, empty) {
    return (
      '<label class="form-field"><span>' +
      esc(label) +
      '</span><select name="' +
      esc(name) +
      '">' +
      options(items, selected, empty) +
      "</select></label>"
    );
  }
  function editor(kind, id) {
    modalType = kind;
    editingId = id || "";
    let title = "",
      inner = "",
      date = field("تاريخ العملية", "date", now(), "date"),
      amount = field("المبلغ بالريال", "amount", "", "number", "required");
    if (kind === "account") {
      title = editingId ? "تعديل الحساب ورصيده الفعلي" : "إضافة حساب حقيقي";
      inner =
        field("اسم الحساب", "name", "", "text", "required") +
        field("اسم البنك أو الجهة", "bank") +
        field("آخر أربعة أرقام (اختياري)", "last4") +
        field("بطاقات مدى المرتبطة (آخر ٤ أرقام، افصل بفاصلة)", "cardsText") +
        field(
          "الرصيد الحالي الفعلي — كما يظهر في البنك",
          "currentBalance",
          editingId && acc(editingId) ? accountBalance(acc(editingId)) : "0",
          "number",
          "required",
        ) +
        (editingId
          ? '<p class="hint">اكتب الرصيد الحالي الذي تريده. عند الحفظ سيصبح الرقم المعروض مطابقًا لما كتبته، دون حذف الحركات القديمة أو زيادته عليها. تُحفظ الفروقات كتسوية داخل الحساب.</p>'
          : '<p class="hint">عند إضافة الحساب، هذا هو الرصيد الحالي المعتمد الآن.</p>') +
        select(
          "نوع الحساب",
          "role",
          [
            ["bank", "حساب بنكي"],
            ["reserve", "حساب الالتزامات (ادخار)"],
            ["investment", "محفظة استثمارية"],
            ["cash", "نقد في اليد / محفظة نقدية"],
          ],
          "bank",
        );
    } else if (kind === "budgetSalary") {
      title = "تعديل الراتب المخطط لشهر " + period;
      inner =
        field("الشهر", "month", period, "month", "readonly") +
        field(
          "الراتب المخطط",
          "salary",
          incomePlanForMonth(period).salary,
          "number",
          "required",
        );
    } else if (kind === "budgetIncome") {
      title = editingId ? "تعديل دخل إضافي" : "إضافة دخل آخر";
      inner =
        field("الشهر", "month", period, "month", "readonly") +
        field(
          "مصدر الدخل (مثال: أرباح دراهم)",
          "name",
          "",
          "text",
          "required",
        ) +
        field("المبلغ المتوقع لهذا الشهر", "amount", "", "number", "required");
    } else if (kind === "budget") {
      title = "إضافة بند ميزانية";
      inner =
        field("الشهر", "month", period, "month", "required") +
        field("اسم البند", "name", "", "text", "required") +
        field("المخصص للشهر", "amount", "", "number", "required") +
        select(
          "نوع التخصيص",
          "type",
          [
            ["expense", "مصروف مخطط"],
            ["debt", "قسط دين مخطط"],
            ["saving", "تحويل ادخار للالتزامات"],
            ["investment", "استثمار مخطط"],
          ],
          "expense",
        ) +
        select(
          "دور البند في الخطة",
          "financialCategory",
          [
            ["", "تحديد من الاسم والنوع"],
            ["other", "مصروف عام"],
            ["visa", "فيزا"],
            ["loan", "قروض"],
            ["reserve", "التزامات"],
            ["invest", "استثمار"],
            ["wife", "صندوق الزوجة"],
            ["driver", "سائق"],
            ["clothes", "ملابس"],
            ["car", "سيارة"],
          ],
          "",
        ) +
        select(
          "البنك / الحساب المخصص لتنفيذ هذا البند",
          "bankAccountId",
          data.accounts
            .filter(
              (a) =>
                a.role === "bank" ||
                a.role === "reserve" ||
                a.role === "investment" ||
                a.role === "cash",
            )
            .map((a) => [a.id, bankGroup(a) + " — " + a.name]),
          "",
          "غير محدد (يرجى الاختيار)",
        );
    } else if (kind === "commitment") {
      title = "تسجيل موعد التزام";
      inner =
        field(
          "الالتزام (رسوم مدرسة / سيارة / صيانة)",
          "name",
          "",
          "text",
          "required",
        ) +
        field("شهر أول استحقاق", "firstMonth", period, "month", "required") +
        amount +
        field("عدد الدفعات", "count", "1", "number", "required") +
        field(
          "الفاصل بين الدفعات بالأشهر",
          "interval",
          "1",
          "number",
          "required",
        ) +
        select(
          "هل يُغطّى هذا الاستحقاق من حساب الالتزامات؟",
          "useObligations",
          [
            ["yes", "نعم — من حساب الالتزامات"],
            ["no", "لا — من مصدر آخر"],
          ],
          "yes",
        );
    } else if (kind === "debt") {
      title = "إضافة رصيد دين حقيقي";
      inner =
        field("اسم الدين", "name", "", "text", "required") +
        field(
          "الرصيد الحالي من كشف البنك",
          "opening",
          "",
          "number",
          "required",
        ) +
        field("تاريخ الرصيد", "asOf", now(), "date") +
        field("آخر ٤ أرقام لبطاقة الفيزا", "cardLast4") +
        select(
          "النوع",
          "kind",
          [
            ["loan", "قرض بنكي"],
            ["credit", "بطاقة فيزا"],
          ],
          "loan",
        ) +
        field("القسط المخطط شهريًا", "monthlyPayment", "0", "number") +
        field("آخر شهر للقسط", "lastMonth", "", "month") +
        select(
          "معنى رصيد القرض",
          "principalBasis",
          [
            ["unverified", "غير مؤكد"],
            ["principal", "أصل الدين من جدول البنك"],
            ["total-due", "إجمالي مستحق"],
          ],
          "unverified",
        );
    } else if (kind === "project") {
      title = editingId ? "تعديل المشروع وأرباحه" : "إضافة مشروع";
      inner =
        field("اسم المشروع", "name", "", "text", "required") +
        field("وصف اختياري", "description") +
        '<div class="form-section-note">الأرباح المتوقعة — لا تُسجل كدخل بنكي فعلي</div>' +
        select(
          "إدخال أرباح المشروع في التنبؤ؟",
          "forecastEnabled",
          [
            ["false", "لا — حتى تبدأ الخطة"],
            ["true", "نعم — أدرج الأرباح المتوقعة"],
          ],
          "false",
        ) +
        field(
          "صافي الربح المتوقع لكل دفعة (بالريال)",
          "expectedNetProfit",
          "0",
          "number",
        ) +
        field(
          "أول شهر متوقع لاستلام الأرباح",
          "profitStart",
          changeMonth(month(), "next"),
          "month",
        ) +
        select(
          "تكرار الأرباح",
          "profitInterval",
          [
            ["1", "شهريًا"],
            ["3", "كل ٣ أشهر"],
            ["6", "كل ٦ أشهر"],
            ["12", "سنويًا"],
            ["0", "مرة واحدة فقط"],
          ],
          "1",
        ) +
        field(
          "عدد الدفعات (٠ = تستمر حتى نهاية التنبؤ)",
          "profitCount",
          "0",
          "number",
        ) +
        field(
          "الريالات المخصصة من كل دفعة لحساب الالتزامات",
          "profitToObligations",
          "0",
          "number",
        ) +
        select(
          "هل مبلغ الالتزامات من المشروع داخل ادخار الميزانية بالفعل؟",
          "profitInBudget",
          [
            ["false", "لا — مبلغ إضافي للالتزامات"],
            ["true", "نعم — لا تكرر احتسابه"],
          ],
          "false",
        ) +
        '<p class="hint">الربح الصافي بعد تكاليف المشروع، والمبلغ المخصص للالتزامات لا يجوز أن يتجاوز الربح. لا تضف الربح إلى مصروفات الميزانية؛ إن كان مدرجًا بالدخل الإضافي سنستبعد تكراره من توقع الالتزامات.</p>';
    } else {
      const kinds = [
        ["income", "دخل إلى حساب"],
        ["expense", "مصروف فعلي من البنك"],
        ["transfer", "تحويل بين الحسابات"],
        ["charge", "شراء بالفيزا — دون خصم بنكي"],
        ["cash_advance", "سحب نقدي من فيزا — يزيد الدين"],
        ["refund", "استرداد إلى الفيزا — ينقص الدين"],
        ["fee", "رسوم بطاقة منفصلة"],
        ["repayment", "سداد دين فعلي"],
        ["profit", "ربح دراهم مستلم"],
      ];
      title = editingId ? "تصحيح حركة مالية مسجلة" : "تسجيل حركة مالية";
      inner =
        select(
          "نوع الحركة",
          "kind",
          kinds,
          kind === "move" ? "expense" : kind,
        ) +
        date +
        amount;
      const from = select(
        "الحساب الذي خُصم منه المبلغ فعليًا",
        "from",
        getAccounts(),
        "",
        "اختر الحساب البنكي",
      );
      const to = select(
        "الحساب الذي استلم المبلغ",
        "to",
        getAccounts(),
        "",
        "اختر الحساب",
      );
      if (kind === "transfer") inner += from + to;
      else if (kind === "expense") inner += from;
      else if (kind === "repayment")
        inner +=
          from +
          select(
            "هل سُجل خصم البنك سابقًا؟",
            "bankAlreadyPosted",
            [
              ["no", "لا — الخصم جديد من الحساب المختار"],
              ["yes", "نعم — حدث أصل الدين فقط دون خصم البنك مرة أخرى"],
            ],
            "no",
          );
      else if (["income", "profit"].includes(kind)) inner += to;
      else if (kind === "cash_advance")
        inner +=
          to +
          '<p class="hint">لا يُخصم هذا السحب من حساب الراتب. يزيد دين الفيزا، ويمكنك تحديد حساب استقبال النقد إن أودعته في بنك أو محفظة نقدية. اتركه بلا حساب إذا كان النقد خارج حسابات البرنامج.</p>';
      if (
        ["charge", "repayment", "cash_advance", "refund", "fee"].includes(kind)
      )
        inner += select(
          "بطاقة الفيزا / القرض المتأثر",
          "debtId",
          kind === "repayment"
            ? allDebts()
            : data.debts
                .filter((d) => d.kind === "credit")
                .map((d) => [d.id, d.name + " • " + money(debtsBalance(d))]),
          "",
          "اختر الفيزا",
        );
      if (kind === "repayment")
        inner +=
          field("المبلغ الذي انخفض به أصل الدين", "principal", "", "number") +
          '<p class="hint">فيزا: كامل مبلغ السداد غالبًا. القرض: أدخل الجزء الذي نقص فعليًا من أصل القرض بعد الفوائد.</p>';
      if (
        ["expense", "charge", "income", "cash_advance", "refund"].includes(kind)
      )
        inner += field(
          "البند / التصنيف",
          "category",
          kind === "charge"
            ? "مشتريات فيزا"
            : kind === "cash_advance"
              ? "سحب نقدي من الفيزا"
              : kind === "refund"
                ? "استرداد فيزا"
                : kind === "income"
                  ? "دخل إضافي"
                  : "مصروف",
          "text",
          "required",
        );
      if (kind === "profit")
        inner += field("اسم المحفظة", "category", "أرباح دراهم");
      if (kind === "expense") {
        const choices = dueItems()
          .filter((x) => x.rest > 0)
          .map((x) => [
            x.key,
            x.name + " — " + x.date + " • المتبقي " + money(x.rest),
          ]);
        inner += select(
          "ربط الدفع باستحقاق (اختياري)",
          "commitmentKey",
          choices,
          "",
          "مصروف عادي بدون استحقاق",
        );
      }
      if (["income", "expense"].includes(kind))
        inner += select(
          "مشروع مرتبط (اختياري)",
          "projectId",
          projectOptions(),
          "",
          "دون مشروع",
        );
      inner +=
        field("شهر الميزانية (اختياري)", "budgetMonth", period, "month") +
        select(
          "ربط ببند (اختياري)",
          "budgetItemId",
          data.budget
            .filter((b) => b.month === period)
            .map((b) => [b.id, b.name]),
          "",
          "دون بند",
        ) +
        select(
          "غرض التحويل",
          "purpose",
          [
            ["", "عادي"],
            ["surplus", "توزيع فائض"],
            ["restore", "استعادة دراهم"],
            ["new-investment", "استثمار جديد"],
          ],
          "",
        ) +
        select(
          "حركة الخصم السابقة (عند عدم الخصم مجددًا)",
          "cashEvidenceId",
          data.moves
            .filter((m) => window.Accounting.active(m) && m.kind === "expense")
            .map((m) => [m.id, m.date + " " + money(m.amount)]),
          "",
          "لا يوجد",
        ) +
        field("ملاحظة", "note") +
        (editingId
          ? '<p class="ledger-warning">تعديل هذه الحركة سيصحح تأثيرها على الأرصدة والديون تلقائيًا. لا تغير الرصيد الافتتاحي لتعويض خطأ في تصنيف الحركة.</p>'
          : "");
    }
    $("modalTitle").textContent = editingId ? "تعديل: " + title : title;
    $("editorForm").innerHTML =
      '<div class="form-grid">' +
      inner +
      '</div><div class="modal-footer"><button type="button" class="button outline" data-action="close">إلغاء</button><button class="button primary" type="submit">حفظ</button></div>';
    if (editingId) {
      const source =
        kind === "budgetIncome"
          ? incomePlanForMonth(period).lines.find((x) => x.id === editingId)
          : kind === "account"
            ? acc(editingId)
            : kind === "budget"
              ? data.budget.find((x) => x.id === editingId)
              : kind === "commitment"
                ? data.commitments.find((x) => x.id === editingId)
                : kind === "debt"
                  ? debt(editingId)
                  : kind === "project"
                    ? project(editingId)
                    : data.moves.find((x) => x.id === editingId);
      if (source)
        $("editorForm")
          .querySelectorAll("[name]")
          .forEach((el) => {
            if (el.name === "cardsText")
              el.value = (source.cards || []).join(", ");
            else if (el.name === "bankAccountId" && kind === "budget")
              el.value = linkedAccount(source)?.id || "";
            else if (el.name === "forecastEnabled" && kind === "project")
              el.value = String(!!source.forecastEnabled);
            else if (el.name === "profitInBudget" && kind === "project")
              el.value = String(!!source.profitInBudget);
            else if (
              el.name === "kind" &&
              [
                "expense",
                "income",
                "transfer",
                "charge",
                "cash_advance",
                "refund",
                "repayment",
                "profit",
              ].includes(kind)
            )
              el.value = kind;
            else if (el.name === "bankAlreadyPosted" && kind === "repayment")
              el.value = source.bankAlreadyPosted ? "yes" : "no";
            else if (el.name === "useObligations" && kind === "commitment")
              el.value =
                String(
                  source.obligationFundingExplicit
                    ? !!source.useObligations
                    : /مدرس|تعليم|جامع|رسوم|سيار|صيان|مركب|فحص|تأمين|مركبة/i.test(
                        source.name || "",
                      ) || source.useObligations === true,
                ) === "true"
                  ? "yes"
                  : "no";
            else if (source[el.name] != null) el.value = source[el.name];
          });
    }
    $("dialog").hidden = false;
    $("dialog").setAttribute("aria-hidden", "false");
  }
  function storeRecord(name, record) {
    const arr = data[name],
      i = arr.findIndex((x) => x.id === editingId);
    if (editingId && i >= 0) arr[i] = { ...arr[i], ...record, id: editingId };
    else arr.push(record);
  }
  function validateFinancialMove(m, previous) {
    const amount = Number(m.amount),
      skip = previous?.id;
    const viable = [
      "expense",
      "income",
      "transfer",
      "charge",
      "cash_advance",
      "refund",
      "repayment",
      "profit",
      "fee",
    ];
    window.Accounting.validateMove(data, m);
    if (
      !viable.includes(m.kind) ||
      !(amount > 0) ||
      !Number.isFinite(amount) ||
      !/^20\d{2}-\d{2}-\d{2}$/.test(m.date)
    )
      throw Error("نوع الحركة أو المبلغ أو التاريخ غير صحيح");
    if (["expense", "transfer"].includes(m.kind) && !acc(m.from))
      throw Error("الحساب المسحوب منه غير معروف");
    if (["income", "profit", "transfer"].includes(m.kind) && !acc(m.to))
      throw Error("اختر الحساب المستلم");
    if (m.kind === "cash_advance" && m.to && !acc(m.to))
      throw Error("حساب استلام النقد غير معروف");
    if (m.kind === "transfer" && m.from === m.to)
      throw Error("التحويل يجب أن يكون بين حسابين مختلفين");
    if (
      ["charge", "cash_advance", "refund"].includes(m.kind) &&
      debt(m.debtId)?.kind !== "credit"
    )
      throw Error("اختر بطاقة الفيزا؛ هذه ليست عملية من الحساب البنكي");
    if (
      m.kind === "repayment" &&
      (!debt(m.debtId) || (!m.bankAlreadyPosted && !acc(m.from)))
    )
      throw Error("حدد بطاقة الدين وحساب السداد أو أن الخصم سبق تسجيله");
    if (
      m.kind === "repayment" &&
      (!Number.isFinite(m.principal) || m.principal < 0 || m.principal > amount)
    )
      throw Error(
        "المبلغ المخصوم من أصل الدين يجب أن يكون بين صفر ومبلغ السداد",
      );
    if (["refund", "repayment"].includes(m.kind)) {
      const d = debt(m.debtId),
        balance = Math.max(
          0,
          num(d.opening) +
            data.moves.reduce(
              (sum, x) =>
                x.id === skip || x.posted === false || x.debtId !== d.id
                  ? sum
                  : sum + debtMovement(x),
              0,
            ),
        );
      if (
        (m.kind === "refund" ? amount : m.principal) > balance + 0.005 &&
        !confirm(
          "المبلغ أكبر من دين البطاقة المسجل؛ ربما يوجد رصيد دائن أو بيانات ناقصة. هل تؤكد؟",
        )
      )
        throw Error("لم تُعتمد عملية تزيد سداد الدين على رصيده");
    }
    const bankOut =
      ["expense", "transfer"].includes(m.kind) ||
      (m.kind === "repayment" && !m.bankAlreadyPosted);
    if (bankOut) {
      const a = acc(m.from);
      const baseline =
        Number(a.opening || 0) +
        Number(a.balanceAdjustment || 0) +
        data.moves.reduce(
          (sum, x) =>
            x.id === skip || x.posted === false
              ? sum
              : sum +
                (x.to === a.id ? num(x.amount) : 0) -
                (x.from === a.id && !x.bankAlreadyPosted ? num(x.amount) : 0),
          0,
        );
      if (
        baseline + 0.005 < amount &&
        !confirm(
          "سيسبب هذا الخصم رصيدًا بنكيًا سالبًا. تأكد أن الخصم من البنك فعلًا وليس من الفيزا. متابعة؟",
        )
      )
        throw Error("أُلغي الخصم لحماية الحساب من تصنيف خاطئ");
    }
  }
  function saveForm(form) {
    const v = Object.fromEntries(new FormData(form).entries()),
      kind = modalType;
    if (kind === "budgetSalary") {
      if (
        !/^[0-9]{4}-[0-9]{2}$/.test(v.month) ||
        !Number.isFinite(Number(v.salary)) ||
        Number(v.salary) < 0
      )
        throw Error("أدخل راتبًا صحيحًا للشهر");
      ensureIncomePlan(v.month).salary = Number(v.salary);
      period = v.month;
    } else if (kind === "budgetIncome") {
      const name = String(v.name || "").trim(),
        amount = Number(v.amount),
        m = String(v.month || "");
      if (
        !/^[0-9]{4}-[0-9]{2}$/.test(m) ||
        !name ||
        !Number.isFinite(amount) ||
        amount <= 0
      )
        throw Error("أدخل مصدر الدخل والمبلغ الصحيح للشهر");
      const bucket = ensureIncomePlan(m);
      const normalize = (x) =>
        String(x || "")
          .replace(/\s+/g, "")
          .toLowerCase();
      const isDarahim = (x) => /دراهم|darahim/i.test(x || "");
      const same = bucket.lines.some(
        (x) =>
          x.id !== editingId &&
          (normalize(x.name) === normalize(name) ||
            (isDarahim(x.name) && isDarahim(name))),
      );
      if (same)
        throw Error(
          "هذا الدخل مسجل بالفعل لهذا الشهر. استخدم زر تعديل على السطر الموجود بدل إضافته مرتين.",
        );
      const idx = editingId
        ? bucket.lines.findIndex((x) => x.id === editingId)
        : -1;
      if (editingId && idx < 0)
        throw Error("لم أجد الدخل المراد تعديله في هذا الشهر");
      if (idx >= 0) bucket.lines[idx] = { ...bucket.lines[idx], name, amount };
      else bucket.lines.push({ id: uid(), name, amount });
      period = m;
    } else if (kind === "account") {
      if (!v.name.trim()) throw Error("أدخل اسم الحساب");
      const desired = Number(v.currentBalance);
      if (v.currentBalance === "" || !Number.isFinite(desired) || desired < 0)
        throw Error("أدخل الرصيد الحالي الصحيح من البنك");
      if (!["bank", "reserve", "investment", "cash"].includes(v.role))
        throw Error("اختر نوع حساب صحيح");
      const prior = editingId ? acc(editingId) : null;
      if (editingId && !prior) throw Error("لم أجد الحساب المراد تعديله");
      const oldBalance = prior ? accountBalance(prior) : null;
      // Reconcile to the explicitly entered current balance instead of treating it as an opening value.
      // Retain all recorded movements and the original imported reference balance.
      const opening = prior ? Number(prior.opening || 0) : desired;
      const adjustment = prior
        ? Math.round(
            (Number(prior.balanceAdjustment || 0) + desired - oldBalance) * 100,
          ) / 100
        : 0;
      const record = {
        id: prior?.id || uid(),
        name: v.name.trim(),
        bank: v.bank || "",
        last4: v.last4 || "",
        role: v.role,
        opening,
        balanceAdjustment: adjustment,
        cards: String(v.cardsText || "")
          .split(/[،,\s;]+/)
          .map((x) => x.trim())
          .filter((x) => /^\d{4}$/.test(x)),
      };
      storeRecord("accounts", record);
      if (prior && Math.abs(desired - oldBalance) > 0.005) {
        if (!Array.isArray(data.balanceReconciliations))
          data.balanceReconciliations = [];
        data.balanceReconciliations.push({
          accountId: prior.id,
          at: new Date().toISOString(),
          before: oldBalance,
          after: desired,
          difference: Math.round((desired - oldBalance) * 100) / 100,
        });
      }
    } else if (kind === "budget") {
      if (!v.name.trim() || !v.month) throw Error("أكمل اسم البند والشهر");
      const old = data.budget.find((x) => x.id === editingId);
      const amount = num(v.amount),
        bankAccountId = v.bankAccountId || "";
      if (bankAccountId && !data.accounts.some((a) => a.id === bankAccountId))
        throw Error("اختر حسابًا موجودًا");
      if (
        old &&
        old.type !== v.type &&
        data.moves.some(
          (m) => window.Accounting.active(m) && m.budgetItemId === old.id,
        )
      )
        throw Error(
          "للبند دفعات مسجلة؛ أضف بندًا مستقلًا للنوع الجديد للحفاظ على تاريخ الدفع",
        );
      const changed =
        !!old &&
        (old.amount !== amount ||
          old.name !== v.name.trim() ||
          old.month !== v.month ||
          linkedAccount(old)?.id !== bankAccountId);
      storeRecord("budget", {
        id: uid(),
        month: v.month,
        name: v.name.trim(),
        amount,
        type: v.type,
        financialCategory:
          v.financialCategory ||
          window.Accounting.category({ name: v.name.trim(), type: v.type }),
        bankAccountId,
        paid: old ? (changed ? false : !!old.paid) : false,
      });
      period = v.month;
    } else if (kind === "commitment") {
      if (!v.name.trim() || !v.firstMonth) throw Error("أكمل موعد الاستحقاق");
      storeRecord("commitments", {
        id: uid(),
        name: v.name.trim(),
        firstMonth: v.firstMonth,
        amount: num(v.amount),
        count: Math.min(240, Math.max(1, Number(v.count) || 1)),
        interval: Math.min(120, Math.max(1, Number(v.interval) || 1)),
        useObligations: v.useObligations === "yes",
        obligationFundingExplicit: true,
        active: editingId
          ? data.commitments.find((x) => x.id === editingId)?.active !== false
          : true,
      });
    } else if (kind === "debt") {
      if (!v.name.trim()) throw Error("أدخل اسم الدين");
      storeRecord("debts", {
        id: uid(),
        name: v.name.trim(),
        opening: num(v.opening),
        kind: v.kind,
        asOf: v.asOf || now(),
        cardLast4: String(v.cardLast4 || "")
          .replace(/\D/g, "")
          .slice(-4),
        monthlyPayment: num(v.monthlyPayment),
        lastMonth: v.lastMonth || undefined,
        principalBasis: v.principalBasis || "unverified",
        source: "manual",
      });
    } else if (kind === "project") {
      const name = String(v.name || "").trim(),
        net = Number(v.expectedNetProfit || 0),
        alloc = Number(v.profitToObligations || 0),
        count = Number(v.profitCount || 0),
        interval = Number(v.profitInterval);
      if (!name) throw Error("أدخل اسم المشروع");
      if (
        ![net, alloc, count, interval].every(Number.isFinite) ||
        net < 0 ||
        alloc < 0 ||
        alloc > net ||
        count < 0 ||
        !Number.isInteger(count) ||
        count > 240 ||
        ![0, 1, 3, 6, 12].includes(interval)
      )
        throw Error(
          "راجع الربح الصافي والمبلغ المخصص للالتزامات وتكرار الدفعات. المبلغ المخصص لا يمكن أن يزيد على الربح.",
        );
      if (
        v.forecastEnabled === "true" &&
        (net <= 0 || !/^20[0-9]{2}-(0[1-9]|1[0-2])$/.test(v.profitStart))
      )
        throw Error("لتفعيل التنبؤ أدخل صافي ربح موجبًا وشهر البداية الصحيح");
      storeRecord("projects", {
        id: uid(),
        name,
        description: v.description || "",
        expectedNetProfit: net,
        profitStart: v.profitStart || "",
        profitInterval: interval,
        profitCount: count,
        profitToObligations: alloc,
        profitInBudget: v.profitInBudget === "true",
        forecastEnabled: v.forecastEnabled === "true",
      });
    } else {
      const prior = editingId
        ? data.moves.find((x) => x.id === editingId)
        : null;
      if (editingId && !prior) throw Error("لم أجد الحركة للتصحيح");
      if (prior?.importedHistory)
        throw Error(
          "حركة تاريخية مدمجة في الرصيد المستورد؛ لا يمكن تعديلها من هذه الشاشة",
        );
      const amount = Number(v.amount),
        kind = v.kind,
        paidElsewhere = kind === "repayment" && v.bankAlreadyPosted === "yes";
      const debtId = [
        "charge",
        "cash_advance",
        "refund",
        "repayment",
        "fee",
      ].includes(kind)
        ? v.debtId || ""
        : "";
      const principal =
        kind === "repayment"
          ? v.principal === "" && debt(debtId)?.kind === "credit"
            ? amount
            : Number(v.principal || 0)
          : 0;
      const m = {
        id: prior?.id || uid(),
        date: v.date || now(),
        kind,
        amount,
        from:
          ["expense", "transfer"].includes(kind) ||
          (kind === "repayment" && !paidElsewhere)
            ? v.from || ""
            : "",
        to: ["transfer", "income", "profit", "cash_advance"].includes(kind)
          ? v.to || ""
          : "",
        debtId,
        category: (v.category || "").trim(),
        note: v.note || "",
        commitmentKey: kind === "expense" ? v.commitmentKey || "" : "",
        projectId: ["income", "expense"].includes(kind)
          ? v.projectId || ""
          : "",
        principal,
        principalKnown:
          kind !== "repayment" ||
          debt(debtId)?.kind === "credit" ||
          v.principal !== "",
        bankAlreadyPosted: paidElsewhere,
        budgetMonth: v.budgetMonth || undefined,
        budgetItemId: v.budgetItemId || undefined,
        purpose: v.purpose || undefined,
        cashEvidenceId: v.cashEvidenceId || undefined,
        posted: true,
      };
      validateFinancialMove(m, prior);
      if (m.kind === "expense" && m.commitmentKey) {
        const due = dueItems().find((x) => x.key === m.commitmentKey);
        if (!due) throw Error("الاستحقاق المحدد لم يعد موجودًا");
        if (
          m.amount >
            due.rest +
              (prior?.commitmentKey === m.commitmentKey
                ? num(prior.amount)
                : 0) +
              0.005 &&
          !confirm("المبلغ أكبر من المتبقي لهذا الاستحقاق؛ هل تؤكد؟")
        )
          return;
      }
      if (
        m.kind === "cash_advance" &&
        !m.to &&
        !confirm(
          "يزيد السحب النقدي دين الفيزا؛ لم تحدد مكان إيداع النقد المستلم. هل تريد المتابعة؟",
        )
      )
        return;
      const old = prior ? JSON.parse(JSON.stringify(prior)) : null;
      storeRecord("moves", m);
      if (old) {
        if (!Array.isArray(data.correctionHistory)) data.correctionHistory = [];
        data.correctionHistory.push({
          at: new Date().toISOString(),
          id: m.id,
          before: old,
          after: JSON.parse(
            JSON.stringify(data.moves.find((x) => x.id === m.id)),
          ),
          action: "edit",
        });
      }
      period = m.date.slice(0, 7);
    }
    closeModal();
    keep();
  }
  function removeRecord(type, id) {
    const table = {
      Account: "accounts",
      Budget: "budget",
      Commitment: "commitments",
      Debt: "debts",
      Project: "projects",
      Move: "moves",
    };
    const key = table[type],
      row = data[key]?.find((x) => x.id === id);
    if (!key || !row) return;
    if (type === "Move" && row.importedHistory)
      throw Error(
        "الحركة القديمة مدرجة في الرصيد المستورد؛ لا يمكن حذفها دون إعادة تسوية الرصيد المرجعي.",
      );
    if (
      type === "Account" &&
      data.moves.some((x) => x.from === id || x.to === id)
    )
      throw Error("الحساب مرتبط بحركات فعلية. لا تحذفه قبل تصحيح العمليات.");
    if (type === "Debt" && data.moves.some((x) => x.debtId === id))
      throw Error("هناك عمليات فيزا/قرض مرتبطة بهذا الدين؛ لا تحذفه أولًا.");
    if (type === "Project" && data.moves.some((x) => x.projectId === id))
      throw Error("المشروع له عمليات مثبتة؛ لا تحذفه قبل مراجعتها.");
    if (
      type === "Commitment" &&
      data.moves.some((x) => String(x.commitmentKey || "").startsWith(id + "-"))
    )
      throw Error("الاستحقاق له مدفوعات؛ أوقفه بدل حذفه.");
    const msg =
      type === "Move"
        ? "إلغاء حركة " +
          money(row.amount) +
          " من " +
          (row.date || "") +
          "؟ ستُعكس آثارها على الحساب والفيزا، ويمكن استعادتها من سجل المراجعة."
        : "حذف " + (row.name || row.category || row.kind || "هذا السجل") + "؟";
    if (!confirm(msg)) return;
    if (type === "Move") {
      if (!Array.isArray(data.voidedMoves)) data.voidedMoves = [];
      data.voidedMoves.push({
        at: new Date().toISOString(),
        move: JSON.parse(JSON.stringify(row)),
      });
      if (data.lastSmsMoveId === id) data.lastSmsMoveId = "";
      // Allow a corrected version of a cancelled pasted SMS to be imported again.
      const hs = new Set(row.smsHashes || []);
      if (
        row.source === "sms-paste" &&
        row.raw &&
        window.FinanceImport &&
        window.BankSMS
      ) {
        hs.add(
          window.FinanceImport.hash(window.FinanceImport.normalize(row.raw)),
        );
        hs.add(window.BankSMS.parse(row.raw, data).hash);
      }
      for (const h of hs)
        if (
          !data.moves.some(
            (x) => x.id !== id && (x.smsHashes || []).includes(h),
          )
        )
          delete data.seenHashes[h];
    }
    data[key] = data[key].filter((x) => x.id !== id);
    keep();
  }

  function closeModal() {
    $("dialog").hidden = true;
    $("dialog").setAttribute("aria-hidden", "true");
    modalType = "";
    editingId = "";
  }
  function download() {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            app: "BMSActualFinance",
            version: 1,
            exportedAt: new Date().toISOString(),
            data,
          },
          null,
          2,
        ),
      ],
      { type: "application/json;charset=utf-8" },
    );
    const link = document.createElement("a"),
      url = URL.createObjectURL(blob);
    link.href = url;
    link.download = "bms_actual_finance_" + now() + ".json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function loadPlan(doc) {
    const p = doc.plan;
    let goals = 0,
      loans = 0;
    (p.goals || []).forEach((g) => {
      if (data.commitments.some((x) => x.sourceId === g.id)) return;
      data.commitments.push({
        id: uid(),
        sourceId: g.id,
        name: g.name,
        firstMonth: g.date,
        amount: num(g.amount),
        count: Math.min(240, Math.max(1, Number(g.count) || 1)),
        interval: Math.max(1, Number(g.interval) || 1),
        active: g.enabled !== false,
        source: "plan",
      });
      goals++;
    });
    (p.loans || []).forEach((l) => {
      if (data.debts.some((x) => x.sourceId === l.id)) return;
      data.debts.push({
        id: uid(),
        sourceId: l.id,
        name: l.name,
        opening: num(l.balance),
        asOf: (doc.exportedAt || now()).slice(0, 10),
        kind: "loan",
        source: "plan",
      });
      loans++;
    });
    return (
      "استُورد " +
      goals +
      " التزام و" +
      loans +
      " رصيد قرض مرجعي. لم تُضف حركة دفع واحدة."
    );
  }
  function loadOld(doc) {
    const rawBank =
      typeof doc.accounts === "string"
        ? JSON.parse(doc.accounts)
        : doc.accounts;
    const rawBudget =
      typeof doc.budget === "string" ? JSON.parse(doc.budget) : doc.budget;
    if (
      !rawBank ||
      !Array.isArray(rawBank.accounts) ||
      !rawBudget ||
      !Array.isArray(rawBudget.items)
    )
      throw Error("نسخة V8 غير مكتملة");
    let nAcc = 0,
      nBud = 0,
      nDebt = 0;
    rawBank.accounts
      .filter((a) => a.kind !== "credit")
      .forEach((a) => {
        if (data.accounts.some((x) => x.legacyId === a.id)) return;
        const role =
          a.id === "amuju7ih2gtiyr" ||
          a.id === rawBank.finance?.obligationAccountId ||
          /حساب\s*الالتزام/i.test(a.name || "")
            ? "reserve"
            : /دراهم|darahim/i.test((a.name || "") + " " + (a.bank || ""))
              ? "investment"
              : "bank";
        data.accounts.push({
          id: uid(),
          legacyId: a.id,
          name: a.name || "حساب",
          bank: a.bank || "",
          last4: a.last4 || "",
          role,
          opening: Number(a.balance) || 0,
        });
        nAcc++;
      });
    (rawBank.finance?.debts || []).forEach((d) => {
      if (data.debts.some((x) => x.legacyId === d.id)) return;
      data.debts.push({
        id: uid(),
        legacyId: d.id,
        name: d.name || "دين",
        opening: Math.max(
          0,
          num(d.original) +
            num(d.addedDebt) -
            num(d.balanceCorrection) -
            num(d.paid),
        ),
        kind: /^فيزا/.test(d.name || "") ? "credit" : "loan",
        asOf: (doc.exportedAt || now()).slice(0, 10),
        source: "v8",
      });
      nDebt++;
    });
    const rows = rawBudget.items || [],
      billMonth = rawBudget.month || month();
    rows.forEach((b) => {
      if (data.budget.some((x) => x.legacyId === b.id && x.month === billMonth))
        return;
      const saving = /^\s*(?:الالتزامات|حساب الالتزامات)\s*$/.test(
        b.name || "",
      );
      data.budget.push({
        id: uid(),
        legacyId: b.id,
        month: billMonth,
        name: b.name || "بند",
        amount: num(b.amount),
        type: saving
          ? "saving"
          : /قرض|فيزا|دراهم|سداد/.test(b.name || "")
            ? "debt"
            : "expense",
      });
      nBud++;
    });
    return (
      "استُورد " +
      nAcc +
      " رصيد حساب و" +
      nDebt +
      " دين و" +
      nBud +
      " بند ميزانية. لم تُرحّل سجل الحركات التاريخية حتى لا تُخصم مرتين من الأرصدة الحالية."
    );
  }
  async function completeImport(doc) {
    if (!window.FinanceImport?.isFull(doc))
      throw Error("الصيغة غير مدعومة؛ اختر النسخة الشاملة من المركز.");
    const result = window.FinanceImport.migrate(doc),
      n = result.summary;
    const answer =
      "تم التحقق من ملف النسخة الشاملة:\n" +
      n.accounts +
      " حسابًا، " +
      n.creditCards +
      " فيزا، " +
      n.debts +
      " دينًا، " +
      n.history +
      " حركة قديمة، " +
      n.budgetMonths +
      " أشهر ميزانية، " +
      n.budgetItems +
      " بندًا، " +
      n.debtLogs +
      " حركة دين، " +
      n.goals +
      " هدفًا، " +
      n.learnedRules +
      " قواعد تعلّم.\n\n" +
      "سيُستبدل سجل المركز الجديد الحالي بهذه النسخة. ستبقى النسخة القديمة محفوظة في المتصفح كنسخة رجوع، ولن نخصم الحركات التاريخية من الأرصدة مرة أخرى.\nهل تريد الاعتماد؟";
    if (!confirm(answer)) return false;
    const before = JSON.stringify(data),
      next = JSON.stringify(result.data);
    // A separate rollback snapshot avoids silent loss of local new data.
    localStorage.setItem(KEY + "_before_full_import", before);
    data = await store.replaceLocked(result.data);
    data = data;
    period = month();
    page = "data";
    sub = "inspect";
    render();
    alert(
      "تم استيراد جميع أقسام الملف: الحسابات والفيزا ودراهم، سجلات العمليات، الميزانيات السابقة، الأهداف، المشاريع والخطة. لم تُكرر أي خصومات.",
    );
    return true;
  }
  async function importFile(file) {
    const doc = JSON.parse(await file.text());
    if (!doc || typeof doc !== "object") throw Error("ملف غير صالح");
    if (doc.app === "BMSActualFinance" && doc.data) {
      if (
        !confirm("هل تريد استبدال جميع بيانات المركز الجديد بنسختك المحفوظة؟")
      )
        return;
      const d = doc.data;
      if (
        !Array.isArray(d.accounts) ||
        !Array.isArray(d.moves) ||
        !Array.isArray(d.commitments)
      )
        throw Error("نسخة المركز الجديد غير مكتملة");
      localStorage.setItem(KEY + "_before_full_import", JSON.stringify(data));
      data = await store.replaceLocked(d);
      render();
      alert("تم استرجاع البيانات المثبتة");
      return;
    }
    if (window.FinanceImport?.isFull(doc)) {
      await completeImport(doc);
      return;
    }
    if (doc.app === "FinanceFuturePlanner" && doc.plan) {
      if (
        !confirm(
          "استيراد الأهداف والقروض المرجعية وخطة المشاريع من ملف المستقبل؟ لن تُسجل أي عملية دفع فعلي.",
        )
      )
        return;
      window.FinanceImport.fromPlan(doc, data);
      if (!(await keep())) return;
      alert(
        "تم نقل الأهداف والديون المرجعية وخطة المشاريع. لا توجد مصروفات جديدة مسجلة.",
      );
      return;
    }
    throw Error(
      "الملف غير مدعوم. استخدم النسخة الشاملة New_Finance_Full، أو نسخة مستقبل، أو نسخة بوصلة المال.",
    );
  }
  const route = new URLSearchParams(location.search);
  if (nav[route.get("page")]) {
    page = route.get("page");
    sub = route.get("sub") || nav[page][0][0];
    if (/^\d{4}-\d{2}$/.test(route.get("month") || ""))
      period = route.get("month");
  }
  $("pageNav").innerHTML = options(Object.entries(titles), "home");
  $("pageNav").addEventListener("change", (e) => {
    page = e.target.value;
    sub = nav[page][0][0];
    render();
  });
  $("subNav").addEventListener("change", (e) => {
    sub = e.target.value;
    render();
  });
  $("monthNav").addEventListener("change", (e) => {
    if (e.target.value) period = e.target.value;
    render();
  });
  $("prevMonth").addEventListener("click", () => {
    period = changeMonth(period, "prev");
    render();
  });
  $("nextMonth").addEventListener("click", () => {
    period = changeMonth(period, "next");
    render();
  });
  $("quickAction").addEventListener("click", () => {
    page = "moves";
    sub = "paste";
    smsDraft = null;
    smsStatus = "";
    render();
  });
  $("content").addEventListener("input", (e) => {
    if (e.target?.id !== "smsRaw" || e.inputType !== "insertFromPaste") return;
    const value = e.target.value?.trim();
    if (!value) return;
    try {
      processIncomingSms(value);
    } catch (err) {
      smsDraft = null;
      smsStatus = "تعذر قراءة الرسالة: " + err.message;
      render();
    }
  });
  $("content").addEventListener("paste", (e) => {
    if (e.target?.id !== "smsRaw") return;
    const value = e.clipboardData?.getData("text") || "";
    if (!value) return;
    e.preventDefault();
    try {
      processIncomingSms(value);
    } catch (err) {
      smsDraft = null;
      smsStatus = "تعذر التسجيل: " + err.message;
      render();
    }
  });
  $("content").addEventListener("change", (e) => {
    if (e.target.id === "auditAccount") {
      accountPick = e.target.value;
      render();
    } else if (
      e.target.id === "smsKind" ||
      e.target.id === "smsPaidElsewhere"
    ) {
      updateSmsVisibility();
    } else if (e.target.id === "fundBank") {
      bankPick = e.target.value;
      accountPick = "";
      render();
    } else if (e.target.id === "fundAccount") {
      accountPick = e.target.value;
      render();
    } else if (e.target.id === "obligationForecastBase") {
      if (!data.obligationForecast) data.obligationForecast = {};
      data.obligationForecast.referenceMonth = e.target.value;
      keep();
    } else if (e.target.id === "obligationForecastMonths") {
      if (!data.obligationForecast) data.obligationForecast = {};
      data.obligationForecast.months = Number(e.target.value) || 120;
      keep();
    }
  });
  $("content").addEventListener("click", async (e) => {
    const target = e.target.closest("[data-action]");
    if (!target) return;
    const action = target.dataset.action;
    const m = {
      newAccount: "account",
      newBudget: "budget",
      newCommitment: "commitment",
      newDebt: "debt",
      newProject: "project",
      newInvestmentAccount: "account",
      newMove: "expense",
      newExpense: "expense",
      newTransfer: "transfer",
      newProfit: "profit",
    };
    if (action === "openSalaryCountdown") {
      page = "salary";
      sub = "countdown";
      render();
      return;
    }
    if (action === "saveSalaryCountdown") {
      try {
        if (!window.SalaryCountdown) throw Error("عداد الراتب غير محمل");
        const settings = window.SalaryCountdown.validate(
          $("salaryPayDay")?.value,
          $("salaryPayTime")?.value,
          $("salaryWeekendRule")?.value,
        );
        data.salaryCountdown = settings;
        data.settings.salary = { ...settings };
        data.autoSalary = {
          ...data.autoSalary,
          day: settings.day,
          enabled: false,
        };
        keep();
      } catch (err) {
        alert("تعذر حفظ موعد الراتب: " + err.message);
      }
      return;
    }
    if (action === "resetSalaryCountdown") {
      if (!window.SalaryCountdown) return;
      if (
        !confirm(
          "استعادة اليوم ٢٧ الساعة ٠٨:٠٠ صباحًا للصرف المتوقع؟ لن تتغير أي حركة مالية.",
        )
      )
        return;
      data.salaryCountdown = window.SalaryCountdown.defaults();
      data.settings.salary = { ...data.salaryCountdown };
      keep();
      return;
    }
    if (action === "reviewAccount") {
      if (target.dataset.id) accountPick = target.dataset.id;
      page = "accounts";
      sub = "review";
      render();
      return;
    }
    if (action === "reviewLedger") {
      page = "moves";
      sub = "review";
      render();
      return;
    }
    if (action === "undoLastSms") {
      const id = data.lastSmsMoveId;
      const m = data.moves.find((x) => x.id === id);
      if (!m) {
        alert("لا توجد رسالة يمكن التراجع عنها");
        return;
      }
      try {
        removeRecord("Move", id);
      } catch (err) {
        alert(err.message);
      }
      return;
    }
    if (action === "restoreMove") {
      const id = target.dataset.id,
        z = (data.voidedMoves || []).find((x) => x.move?.id === id);
      if (!z) {
        alert("لم أجد نسخة الحركة الملغاة");
        return;
      }
      if (data.moves.some((x) => x.id === id && window.Accounting.active(x))) {
        alert("الحركة موجودة بالفعل");
        return;
      }
      if (
        !confirm(
          "استعادة الحركة " +
            money(z.move.amount) +
            "؟ ستؤثر في البنك أو الفيزا بحسب نوعها المسجل.",
        )
      )
        return;
      const inactive = data.moves.find((x) => x.id === id);
      if (inactive) {
        Object.assign(inactive, z.move, { posted: true });
        delete inactive.reversedAt;
        delete inactive.reversalReason;
      } else data.moves.push(z.move);
      data.voidedMoves = data.voidedMoves.filter((x) => x.move?.id !== id);
      (z.move.smsHashes || []).forEach((h) => (data.seenHashes[h] = 1));
      keep();
      return;
    }
    if (action === "showObligationForecast") {
      page = "obligations";
      sub = "forecast";
      render();
      return;
    }
    if (action === "projectForecasts") {
      page = "projects";
      sub = "forecasts";
      render();
      return;
    }
    if (action === "newInvestmentAccount") {
      editor("account");
      const role = $("editorForm").querySelector('[name="role"]');
      if (role) role.value = "investment";
      return;
    }
    if (m[action]) {
      editor(m[action]);
      return;
    }
    if (action === "saveForecast") {
      const inp = (name) =>
        $("content").querySelector('[name="f_' + name + '"]')?.value || "";
      const current = { ...(data.forecastOverrides || {}) };
      for (const key of [
        "retirement",
        "pension",
        "monthlyExpenses",
        "monthlyObligationsSaving",
        "paymentPool",
        "newMonthly",
        "annualNetReturn",
        "horizon",
      ]) {
        const value = inp(key);
        if (!value) continue;
        if (key === "retirement") {
          if (!/^20\d{2}-\d{2}$/.test(value)) {
            alert("تاريخ التقاعد غير صحيح");
            return;
          }
          current[key] = value;
        } else {
          const n = Number(value);
          if (!Number.isFinite(n) || n < 0) {
            alert("أدخل قيمة صحيحة للحقل " + key);
            return;
          }
          current[key] = n;
        }
      }
      data.forecastOverrides = current;
      keep();
      return;
    }
    if (action === "resetForecast") {
      if (
        confirm(
          "العودة إلى افتراضات الخطة المستوردة وربط الميزانية الحالية، دون تغيير الحسابات أو الديون؟",
        )
      ) {
        delete data.forecastOverrides;
        keep();
      }
      return;
    }
    if (action === "toggleCommitment") {
      const c = data.commitments.find((x) => x.id === target.dataset.id);
      if (c) {
        c.active = c.active === false ? true : false;
        keep();
      }
      return;
    }
    if (action === "newIncomePlan") {
      editor("budgetIncome");
      return;
    }
    if (action === "editIncomePlan") {
      editor("budgetIncome", target.dataset.id);
      return;
    }
    if (action === "editSalaryPlan") {
      editor("budgetSalary");
      return;
    }
    if (action === "deleteIncomePlan") {
      const bucket = ensureIncomePlan(period),
        item = bucket.lines.find((x) => x.id === target.dataset.id);
      if (!item) {
        alert("لم أجد مصدر الدخل");
        return;
      }
      if (
        confirm(
          "حذف دخل " +
            item.name +
            " من خطة " +
            period +
            "؟ لن تتغير الحسابات البنكية ولا سجل النسخة الأصلية.",
        )
      ) {
        bucket.lines = bucket.lines.filter((x) => x.id !== item.id);
        keep();
      }
      return;
    }
    if (action.startsWith("edit")) {
      const type = action.slice(4),
        id = target.dataset.id;
      if (
        type === "Move" &&
        data.moves.find((x) => x.id === id)?.importedHistory
      ) {
        alert(
          "الحركة التاريخية مدرجة بالفعل في الرصيد المستورد؛ لا يمكن تعديل مبلغها دون تغيير الرصيد الأصلي.",
        );
        return;
      }
      const map = {
        Account: "account",
        Budget: "budget",
        Commitment: "commitment",
        Debt: "debt",
        Project: "project",
      };
      const kind =
        type === "Move" ? data.moves.find((x) => x.id === id)?.kind : map[type];
      if (kind) editor(kind, id);
      return;
    }
    if (action.startsWith("delete")) {
      try {
        removeRecord(action.slice(6), target.dataset.id);
      } catch (err) {
        alert(err.message);
      }
      return;
    }
    if (action === "copyPrevBudget") {
      const prev = changeMonth(period, "prev"),
        items = data.budget.filter((x) => x.month === prev);
      if (data.budget.some((x) => x.month === period)) {
        alert("الشهر الحالي يحتوي بنودًا بالفعل. لن أكررها.");
        return;
      }
      if (!items.length) {
        alert("لم أجد بنود ميزانية في " + prev + " لنسخها.");
        return;
      }
      if (
        !confirm(
          "نسخ " +
            items.length +
            " بند من " +
            prev +
            " إلى " +
            period +
            "؟ لن تُنشأ حركات دفع أو تحويلات فعلية.",
        )
      )
        return;
      items.forEach((x) =>
        data.budget.push({ ...x, id: uid(), month: period, paid: false }),
      );
      keep();
      return;
    }
    if (action === "openSms") {
      page = "moves";
      sub = "paste";
      smsDraft = null;
      smsStatus = "";
      render();
      return;
    }
    if (action.startsWith("ret-")) {
      try {
        if (
          window.RetirementApp?.action(data, action, target, $("content"), keep)
        )
          return;
      } catch (err) {
        alert("تعذر تحديث التقاعد: " + err.message);
      }
      return;
    }
    if (action === "analyzeSms") {
      try {
        analyzeSMS();
      } catch (err) {
        alert(err.message);
      }
      return;
    }
    if (action === "linkSmsExisting") {
      try {
        saveSMS();
      } catch (err) {
        alert(err.message);
      }
      return;
    }
    if (action === "saveSms") {
      try {
        saveSMS();
      } catch (err) {
        alert(err.message);
      }
      return;
    }
    if (action === "clearSms") {
      smsDraft = null;
      smsStatus = "";
      render();
      return;
    }
    if (action === "goData") {
      page = "data";
      sub = "backup";
      render();
      return;
    }
    if (action === "export") {
      download();
      return;
    }
    if (action === "restorePreImport") {
      const raw = localStorage.getItem(KEY + "_before_full_import");
      if (!raw) {
        alert("لا توجد نسخة رجوع محفوظة");
        return;
      }
      if (
        !confirm(
          "استعادة حالة المركز الجديدة قبل آخر استيراد شامل؟ سيُستبدل ما أدخلته بعد الاستيراد. يُنصح بتصدير نسخة الآن أولًا.",
        )
      )
        return;
      try {
        const old = JSON.parse(raw);
        if (!Array.isArray(old.accounts) || !Array.isArray(old.moves))
          throw Error("بيانات الرجوع غير صالحة");
        data = await store.replaceLocked(old);
        render();
        alert("تم استرجاع بيانات ما قبل آخر استيراد");
      } catch (err) {
        alert(err.message);
      }
      return;
    }
    if (action === "importLocalV8") {
      try {
        const oldAccounts = localStorage.getItem(
          "bank_manager_v11_seeded_exact",
        );
        const oldBudget = localStorage.getItem("budget_finance_clean_v4");
        if (!oldAccounts || !oldBudget)
          throw Error(
            "لم أجد نسخة V8 القديمة محفوظة على هذا الجهاز. استخدم استيراد ملف JSON بدلًا من ذلك.",
          );
        // The full import itself displays the count and requests confirmation.
        const currentFuture = localStorage.getItem(
          "finance_future_planner_2026_v1",
        );
        const doc = {
          format: "UnifiedFinanceBackupV1",
          accounts: JSON.parse(oldAccounts),
          budget: JSON.parse(oldBudget),
          future: currentFuture ? JSON.parse(currentFuture) : null,
          exportedAt: new Date().toISOString(),
        };
        await completeImport(doc);
      } catch (err) {
        alert("تعذر استيراد V8 المحلي: " + err.message);
      }
      return;
    }
    if (action === "reset") {
      if (
        confirm(
          "هل تريد مسح بيانات هذا المركز الجديد بالكامل؟ تأكد من تنزيل نسخة احتياطية أولًا.",
        ) &&
        confirm("تأكيد أخير: مسح الحسابات والحركات والميزانية الجديدة؟")
      ) {
        data = await store.replaceLocked({
          ...def(),
          confirmations: { accounts: {}, budget: {} },
        });
        render();
      }
      return;
    }
  });
  $("dialog").addEventListener("click", (e) => {
    if (e.target === $("dialog") || e.target.closest('[data-action="close"]'))
      closeModal();
  });
  $("editorForm").addEventListener("change", (e) => {
    if (e.target.name === "kind") {
      const kind = e.target.value,
        values = {};
      $("editorForm")
        .querySelectorAll("[name]")
        .forEach((el) => {
          values[el.name] = el.value;
        });
      const preserveId = editingId;
      editor(kind, preserveId);
      $("editorForm")
        .querySelectorAll("[name]")
        .forEach((el) => {
          if (el.name !== "kind" && values[el.name] != null)
            el.value = values[el.name];
        });
      const p = $("editorForm").querySelector('[name="principal"]');
      if (
        p &&
        !p.value &&
        values.amount &&
        debt($("editorForm").querySelector('[name="debtId"]')?.value)?.kind ===
          "credit"
      )
        p.value = values.amount;
    }
  });
  $("editorForm").addEventListener("submit", (e) => {
    e.preventDefault();
    try {
      saveForm(e.target);
    } catch (err) {
      alert(err.message);
    }
  });
  document.addEventListener("change", async (e) => {
    if (e.target.id !== "importFile") return;
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      await importFile(file);
    } catch (err) {
      alert("تعذر الاستيراد: " + err.message);
    } finally {
      e.target.value = "";
    }
  });
  window.setInterval?.(
    () => window.SalaryCountdown?.refresh(document, data.salaryCountdown),
    1000,
  );
  render();
})();
