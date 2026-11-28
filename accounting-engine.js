/* Pure accounting domain. All public amounts are SAR; calculations use integer halalas. */
(function (g) {
  "use strict";
  const KEY = "bms_actual_20261114_v1",
    VERSION = 3;
  const clone = (x) => JSON.parse(JSON.stringify(x)),
    stamp = () => new Date().toISOString();
  const today = () =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Riyadh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  function cents(x) {
    if (x === "" || x == null || !Number.isFinite(Number(x)))
      throw Error("المبلغ غير صالح");
    const v = Math.round(Number(x) * 100);
    if (!Number.isSafeInteger(v) || Math.abs(Number(x) * 100 - v) > 0.00001)
      throw Error("أدخل مبلغًا بدقة هللتين فقط");
    return v;
  }
  const sar = (x) => x / 100,
    val = (x) => cents(x ?? 0),
    sum = (a, f) => sar(a.reduce((s, x) => s + val(f(x)), 0));
  const idx = (m) =>
    /^\d{4}-(0[1-9]|1[0-2])$/.test(m || "")
      ? +m.slice(0, 4) * 12 + +m.slice(5) - 1
      : NaN;
  const ym = (i) =>
    Math.floor(i / 12) + "-" + String((i % 12) + 1).padStart(2, "0");
  const active = (m) => m.posted !== false && !m.importedHistory;
  function delta(m, id) {
    return active(m)
      ? (m.to === id ? val(m.amount) : 0) -
          (m.from === id && !m.bankAlreadyPosted ? val(m.amount) : 0)
      : 0;
  }
  function balance(d, a) {
    if (typeof a === "string") a = d.accounts.find((x) => x.id === a);
    if (!a) throw Error("الحساب غير موجود");
    return sar(
      val(a.opening) +
        val(a.balanceAdjustment) +
        d.moves.reduce((s, m) => s + delta(m, a.id), 0),
    );
  }
  function debtDelta(m) {
    return ["charge", "cash_advance", "fee"].includes(m.kind)
      ? val(m.amount)
      : m.kind === "refund"
        ? -val(m.amount)
        : m.kind === "repayment"
          ? -val(m.principal)
          : 0;
  }
  function debtBalance(d, a) {
    if (typeof a === "string") a = d.debts.find((x) => x.id === a);
    if (!a) throw Error("الدين غير موجود");
    return sar(
      val(a.opening) +
        val(a.snapshotAdjustment) +
        d.moves
          .filter((m) => active(m) && m.debtId === a.id)
          .reduce((s, m) => s + debtDelta(m), 0),
    );
  }
  function validateMove(d, m) {
    if (
      !m.id ||
      ![
        "income",
        "profit",
        "expense",
        "transfer",
        "repayment",
        "charge",
        "cash_advance",
        "refund",
        "fee",
      ].includes(m.kind) ||
      val(m.amount) <= 0
    )
      throw Error("نوع الحركة أو مبلغها غير صحيح");
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(m.date) ||
      new Date(m.date + "T12:00:00Z").toISOString().slice(0, 10) !== m.date
    )
      throw Error("تاريخ الحركة غير صالح");
    if (m.budgetMonth && !Number.isFinite(idx(m.budgetMonth)))
      throw Error("شهر الميزانية غير صالح");
    if (m.kind === "income" && (m.category === "راتب" || ["scheduled-salary", "salary-v3"].includes(m.source)) && d.settledStarts?.[m.budgetMonth]?.salaryReceived > 0 && !d.settledStarts[m.budgetMonth].existingMoveIds.includes(m.id))
      throw Error("راتب الشهر مثبت ضمن نقطة البداية");
    const account = (id) => d.accounts.some((a) => a.id === id),
      debt = d.debts.find((x) => x.id === m.debtId);
    if (
      (["expense", "transfer"].includes(m.kind) ||
        (m.kind === "repayment" && !m.bankAlreadyPosted)) &&
      !account(m.from)
    )
      throw Error("اختر حساب السحب");
    if (
      (["income", "profit", "transfer"].includes(m.kind) && !account(m.to)) ||
      (m.kind === "cash_advance" && m.to && !account(m.to))
    )
      throw Error("اختر حساب الاستلام");
    if (["charge", "fee", "refund"].includes(m.kind) && (m.from || m.to))
      throw Error("عملية البطاقة لا تخصم أو تضيف نقدًا بنكيًا");
    if (
      (["income", "profit"].includes(m.kind) && m.from) ||
      (["expense", "repayment"].includes(m.kind) && m.to)
    )
      throw Error("جهة الحركة لا تطابق نوعها");
    if (m.kind === "transfer" && m.from === m.to)
      throw Error("اختر حسابين مختلفين");
    if (
      ["charge", "refund", "cash_advance", "fee", "repayment"].includes(
        m.kind,
      ) &&
      !debt
    )
      throw Error("اختر البطاقة أو الدين");
    if (
      ["charge", "refund", "fee", "cash_advance"].includes(m.kind) &&
      debt.kind !== "credit"
    )
      throw Error("هذه العملية لبطاقة ائتمانية");
    if (
      m.kind === "repayment" &&
      (val(m.principal) < 0 || val(m.principal) > val(m.amount))
    )
      throw Error("أصل الدين لا يتجاوز الدفعة");
    if (
      m.bankAlreadyPosted &&
      !d.moves.some(
        (x) =>
          active(x) &&
          x.id === m.cashEvidenceId &&
          x.kind === "expense" &&
          val(x.amount) === val(m.amount),
      )
    )
      throw Error("اربط السداد بحركة الخصم البنكي المسجلة أولًا");
    if (
      m.budgetItemId &&
      !d.budget.some(
        (x) =>
          x.id === m.budgetItemId &&
          x.month === (m.budgetMonth || m.date.slice(0, 7)),
      )
    )
      throw Error("البند أو شهر الميزانية غير موجود");
    if (m.budgetItemId) {
      const b = d.budget.find((x) => x.id === m.budgetItemId);
      if (
        (b.type === "debt" && m.kind !== "repayment") ||
        (["saving", "investment"].includes(b.type) && m.kind !== "transfer") ||
        (b.type === "expense" && !["expense", "charge", "fee"].includes(m.kind))
      )
        throw Error("نوع الحركة لا يطابق بند الميزانية");
    }
    if (m.projectId && !d.projects.some((x) => x.id === m.projectId))
      throw Error("المشروع غير موجود");
  }
  function validate(d) {
    for (const k of [
      "accounts",
      "moves",
      "budget",
      "debts",
      "commitments",
      "projects",
    ]) {
      if (!Array.isArray(d[k])) throw Error("ملف غير مكتمل: " + k);
      const ids = new Set();
      for (const x of d[k]) {
        if (!x || typeof x.id !== "string" || !x.id || ids.has(x.id))
          throw Error("معرف مكرر أو مفقود: " + k);
        ids.add(x.id);
      }
    }
    for (const a of [...d.accounts, ...d.debts]) {
      val(a.opening);
      val(a.balanceAdjustment);
      val(a.snapshotAdjustment);
    }
    for (const m of d.moves) {
      val(m.amount);
      val(m.principal);
    }
    for (const b of d.budget) {
      if (val(b.amount) < 0 || !Number.isFinite(idx(b.month)))
        throw Error("بند ميزانية غير صالح");
    }
    for (const [month, snap] of Object.entries(d.settledStarts || {})) {
      if (!Number.isFinite(idx(month)) || !Array.isArray(snap.existingMoveIds) || val(snap.salaryReceived) < 0)
        throw Error("تهيئة شهر غير صالحة");
      for (const [id, record] of Object.entries(snap.items || {})) {
        if (!d.budget.some(b => b.id === id && b.month === month) || val(record.paid) < 0)
          throw Error("بند نقطة البداية غير صالح؛ احتفظ به للتدقيق");
      }
    }
    return true;
  }
  const category = (x) =>
    x.financialCategory ||
    (/قروض|قرض بنكي/.test(x.name)
      ? "loan"
      : /فيزا|visa/i.test(x.name)
        ? "visa"
        : /صندوق الزوجة|جمعية الزوجة/.test(x.name)
          ? "wife"
          : /سائق|سواق/.test(x.name)
            ? "driver"
            : /ملابس/.test(x.name)
              ? "clothes"
              : x.type === "investment"
                ? "invest"
                : x.type === "saving"
                  ? "reserve"
                  : /سيارة ثانية|قسط السيارة/.test(x.name)
                    ? "car"
                    : "other");
  function accountFor(d, b) {
    const refs = [
      b.bankAccountId,
      b.linkedBankId,
      d.legacy?.itemLinks?.[b.legacyId]?.bankAccountId,
      d.legacy?.links?.[b.legacyAccountId],
    ];
    return (
      refs
        .map((r) => d.accounts.find((a) => a.id === r || a.legacyId === r))
        .find(Boolean) || null
    );
  }
  function paymentStatus(d, b) {
    const ms = d.moves.filter((m) => active(m) && m.budgetItemId === b.id),
      paid = sar(val(sum(ms, (m) => m.amount)) + val(d.settledStarts?.[b.month]?.items?.[b.id]?.paid)),
      rest = Math.max(0, sar(val(b.amount) - val(paid)));
    return {
      paid,
      rest,
      complete: rest === 0,
      partial: paid > 0 && rest > 0,
      moves: ms,
      legacy: !!b.paid && ms.length === 0,
    };
  }
  function audit(d, type, detail) {
    d.ledgerEvents ??= [];
    d.ledgerEvents.push({
      id: "event-" + (d.ledgerEvents.length + 1),
      at: stamp(),
      type,
      ...clone(detail),
    });
  }
  function post(d, m) {
    validateMove(d, m);
    if (m.budgetItemId && d.settledStarts?.[m.budgetMonth]?.items?.[m.budgetItemId]) {
      const b = d.budget.find(x => x.id === m.budgetItemId);
      if (val(m.amount) > val(paymentStatus(d, b).rest))
        throw Error("البند مثبت ضمن نقطة البداية؛ لا تسجل سداده مرة أخرى");
    }
    const same = d.moves.find(
      (x) =>
        x.id === m.id ||
        (m.operationKey && x.operationKey === m.operationKey && active(x)),
    );
    if (same) {
      if (
        JSON.stringify(same) === JSON.stringify(m) ||
        (m.operationKey &&
          same.operationKey === m.operationKey &&
          [
            "kind",
            "amount",
            "from",
            "to",
            "debtId",
            "principal",
            "budgetMonth",
          ].every((k) => (same[k] ?? "") === (m[k] ?? "")))
      )
        return same;
      throw Error("معرف الحركة مستخدم بالفعل");
    }
    for (const hash of m.smsHashes || [])
      if (d.moves.some((x) => active(x) && (x.smsHashes || []).includes(hash)))
        throw Error("الرسالة مسجلة بالفعل");
    d.moves.push(clone(m));
    audit(d, "post", { moveId: m.id, after: m });
    return m;
  }
  function reverse(d, id, reason = "تراجع المستخدم") {
    const m = d.moves.find((x) => x.id === id);
    if (!m || !active(m)) return false;
    if (m.importedHistory) throw Error("الحركة مرجعية");
    audit(d, "reverse", { moveId: id, before: m, reason });
    m.posted = false;
    m.reversedAt = stamp();
    m.reversalReason = reason;
    return true;
  }
  function link(d, id, itemId, month) {
    const m = d.moves.find((x) => x.id === id && active(x));
    if (!m) throw Error("الحركة غير موجودة");
    if (m.budgetItemId && m.budgetItemId !== itemId)
      throw Error("الحركة مرتبطة ببند آخر");
    audit(d, "link", {
      moveId: id,
      before: { budgetItemId: m.budgetItemId, budgetMonth: m.budgetMonth },
      after: { budgetItemId: itemId, budgetMonth: month },
    });
    m.budgetItemId = itemId;
    m.budgetMonth = month;
  }
  function migrate(input) {
    const d = clone(input);
    validate(d);
    if (d.schemaVersion > VERSION) throw Error("هذه النسخة أحدث من البرنامج");
    if (d.schemaVersion === VERSION) return d;
    d.schemaVersion = VERSION;
    d.revision = 0;
    d.seenHashes ??= {};
    d.learnedRules ??= [];
    d.legacy ??= {};
    d.journal ??= [];
    d.confirmations ??= { accounts: {}, budget: {} };
    d.ledgerEvents ??= [];
    d.reviewIssues ??= [];
    const issue = (code, detail) =>
      d.reviewIssues.push({ code, status: "open", detail });
    d.settings = {
      ...d.settings,
      salaryAccountId:
        d.settings?.salaryAccountId ||
        d.accounts.find((a) => a.legacyId === "ahli0105")?.id ||
        "",
      salary: {
        day: 27,
        hour: 8,
        minute: 0,
        weekend: "ksa",
        ...d.salaryCountdown,
        ...d.settings?.salary,
      },
    };
    d.salaryCountdown = { ...d.settings.salary };
    d.autoSalary = {
      ...d.autoSalary,
      day: d.settings.salary.day,
      enabled: false,
    };
    for (const b of d.budget) {
      b.financialCategory = category(b);
      if (b.paid)
        issue("legacy-paid", {
          itemId: b.id,
          month: b.month,
          message: "تأكيد متابعة قديم؛ لا يعد سدادًا مثبتًا",
        });
    }
    for (const debt of d.debts) {
      if (debt.kind === "loan") debt.principalBasis ??= "unverified";
      if (["loan1", "loan2"].includes(debt.sourceId))
        debt.lastMonth ??= debt.sourceId === "loan1" ? "2030-02" : "2036-08";
    }
    const visa = d.budget.find(
      (x) => x.month === "2026-12" && category(x) === "visa",
    );
    const repayment =
      visa &&
      d.moves.find(
        (m) =>
          active(m) &&
          m.id === "budget-visa-" + visa.id &&
          m.source === "budget-visa",
      );
    if (repayment) issue("visa-payment", {
      moveId: repayment.id,
      message: "دفعة فيزا قديمة؛ تُراجع مع البنك دون تعديل مبلغها تلقائيًا",
    });
    for (const m of d.moves.filter(active)) {
      if (m.source === "scheduled-salary") {
        m.evidence ??= "assumed-legacy";
        issue("salary-evidence", {
          moveId: m.id,
          message: "إيداع محفوظ دون كشف مستقل؛ لم ينشأ إيداع جديد",
        });
      }
      try {
        validateMove(d, m);
      } catch (e) {
        issue("legacy-move", { moveId: m.id, message: e.message });
      }
    }
    for (const [month, flags] of Object.entries(
      d.confirmations?.accounts || {},
    ))
      for (const [accountId, v] of Object.entries(flags))
        if (v && !v.ledgerId)
          issue("funding-evidence", {
            month,
            accountId,
            message: "تأكيد قديم بلا حركة؛ لا يثبت مبلغ التحويل أو مصدره",
          });
    issue("restore-target", {
      message:
        "هدف استعادة دراهم ٥٢٠٠٠، والدين المرجعي ٥٠٠٠٠؛ لا تُزاد المديونية تلقائيًا",
    });
    d.policy = {
      restoreTarget: 52000,
      emergencyFirst: 5000,
      emergencySecond: 10000,
      emergencyLong: 30000,
      ...d.policy,
    };
    d.scheduleRules ??= [
      { category: "visa", from: "2027-01", amount: 2000 },
      { category: "driver", from: "2027-01", amount: 2000 },
      { category: "wife", from: "2027-07", amount: 0 },
      { category: "invest", from: "2027-03", amount: 550 },
    ];
    audit(d, "migration", {
      from: input.schemaVersion || 2,
      to: VERSION,
      counts: Object.fromEntries(
        ["accounts", "moves", "budget", "debts", "commitments", "projects"].map(
          (k) => [k, d[k].length],
        ),
      ),
    });
    return d;
  }
  function reconcileChanges(before, next) {
    // Legacy editors are adapters: cancellations retain the original and every edit has a before-image.
    for (const old of before.moves) {
      let m = next.moves.find((x) => x.id === old.id);
      if (!m) {
        next.moves.push(clone(old));
        reverse(next, old.id, "إلغاء من سجل الحركات");
        continue;
      }
      if (JSON.stringify(old) !== JSON.stringify(m)) {
        if (old.importedHistory) throw Error("الحركة التاريخية محمية");
        if (active(m)) validateMove(next, m);
        audit(next, "edit", { moveId: old.id, before: old, after: m });
      }
    }
    for (const m of next.moves)
      if (!before.moves.some((x) => x.id === m.id)) {
        validateMove(next, m);
        audit(next, "post", { moveId: m.id, after: m });
      }
    for (const m of next.moves.filter(active)) {
      if (
        m.bankAlreadyPosted &&
        !(next.reviewIssues || []).some(
          (x) => x.code === "legacy-move" && x.detail.moveId === m.id,
        )
      )
        validateMove(next, m);
    }
    for (const k of [
      "accounts",
      "budget",
      "debts",
      "commitments",
      "projects",
      "settings",
      "scheduleRules",
      "policy",
    ]) {
      if (JSON.stringify(before[k]) !== JSON.stringify(next[k]))
        audit(next, "change-" + k, {
          before: before[k] ?? null,
          after: next[k] ?? null,
        });
    }
    for (const [month, snap] of Object.entries(next.settledStarts || {}))
      for (const itemId of Object.keys(snap.items || {})) {
        const b = next.budget.find(x => x.id === itemId);
        const added = next.moves.some(m => active(m) && m.budgetItemId === itemId && !before.moves.some(old => old.id === m.id));
        if (added && b && val(paymentStatus(next,b).paid) > val(b.amount))
          throw Error("السداد الجديد يتجاوز المتبقي بعد نقطة البداية");
      }
    validate(next);
    return next;
  }
  function storage(storage, key = KEY) {
    let raw = storage.getItem(key),
      state;
    if (raw) {
      state = migrate(JSON.parse(raw));
      if (JSON.stringify(state) !== raw) {
        storage.setItem(key + "_before_schema3", raw);
        const s = JSON.stringify(state);
        storage.setItem(key, s);
        raw = s;
      }
    } else
      state = migrate({
        accounts: [],
        moves: [],
        budget: [],
        debts: [],
        commitments: [],
        projects: [],
        journal: [],
        legacy: {},
        seenHashes: {},
        learnedRules: [],
        confirmations: { accounts: {}, budget: {} },
      });
    return {
      get: () => clone(state),
      async commitLocked(next) {
        if (!g.navigator?.locks)
          throw Error(
            "المتصفح لا يدعم الحفظ المتزامن الآمن؛ افتح الموقع عبر HTTPS بمتصفح حديث",
          );
        return g.navigator.locks.request(key + ":write", () =>
          this.commit(next),
        );
      },
      async replaceLocked(next) {
        if (!g.navigator?.locks)
          throw Error("استخدم متصفحًا حديثًا واتصال HTTPS");
        return g.navigator.locks.request(key + ":write", () =>
          this.replace(next),
        );
      },
      replace(next) {
        if (storage.getItem(key) !== raw)
          throw Error("تغيرت البيانات في تبويب آخر");
        const candidate = migrate(next),
          s = JSON.stringify(candidate);
        if (raw) storage.setItem(key + "_before_full_import", raw);
        storage.setItem(key, s);
        state = candidate;
        raw = s;
        return clone(state);
      },
      commit(next) {
        if (next.revision !== state.revision)
          throw Error("تغيرت نسخة البيانات أثناء انتظار الحفظ؛ أعد المحاولة");
        if (storage.getItem(key) !== raw)
          throw Error(
            "تغيرت البيانات في تبويب آخر. أعد تحميل الصفحة قبل المحاولة",
          );
        const candidate = reconcileChanges(state, migrate(next));
        candidate.revision = (state.revision || 0) + 1;
        const s = JSON.stringify(candidate);
        for (const month of Object.keys(candidate.settledStarts || {}))
          if (!state.settledStarts?.[month] && raw)
            storage.setItem(key + "_before_settled_start_" + month, raw);
        if (raw) storage.setItem(key + "_last_good", raw);
        storage.setItem(key, s);
        state = candidate;
        raw = s;
        return clone(state);
      },
      reload() {
        raw = storage.getItem(key);
        state = migrate(JSON.parse(raw));
        return clone(state);
      },
    };
  }
  function loanInstallments(d, item) {
    return d.debts
      .filter(
        (x) =>
          x.kind === "loan" &&
          Number(x.monthlyPayment) > 0 &&
          (!x.firstMonth || item.month >= x.firstMonth) &&
          (!x.lastMonth || item.month <= x.lastMonth),
      )
      .map((loan) => {
        const paid = (d.settledStarts?.[item.month]?.loans?.[loan.id] || 0) + sum(
          d.moves.filter(
            (m) =>
              active(m) &&
              m.kind === "repayment" &&
              m.debtId === loan.id &&
              m.budgetItemId === item.id &&
              (m.budgetMonth || m.date.slice(0, 7)) === item.month,
          ),
          (m) => m.amount,
        );
        return {
          loan,
          paid,
          due: Math.max(0, sar(val(loan.monthlyPayment) - val(paid))),
        };
      });
  }
  function payLoanGroup(d, request) {
    const next = clone(d),
      item = next.budget.find((b) => b.id === request.itemId);
    if (!item || category(item) !== "loan") throw Error("اختر بند القروض");
    const rows = loanInstallments(next, item),
      seen = new Set();
    let changed = false;
    for (const p of request.payments) {
      if (seen.has(p.debtId)) throw Error("القرض مكرر في الطلب");
      seen.add(p.debtId);
      const row = rows.find((r) => r.loan.id === p.debtId);
      if (!row) throw Error("القرض غير مجدول لهذا الشهر");
      if (p.existing) {
        const m = next.moves.find(
          (m) =>
            m.id === p.existing &&
            active(m) &&
            m.kind === "repayment" &&
            m.debtId === p.debtId &&
            !m.budgetItemId,
        );
        if (!m || val(m.amount) > val(row.due))
          throw Error("الدفعة السابقة تحتاج مراجعة قبل الربط");
        link(next, m.id, item.id, item.month);
        changed = true;
        continue;
      }
      const amount = cents(p.amount);
      if (amount === 0) continue;
      if (amount < 0 || amount > val(row.due))
        throw Error("المبلغ يتجاوز القسط المتبقي؛ راجع دفعات القرض");
      const principal =
        p.principal === "" || p.principal == null ? 0 : cents(p.principal);
      if (principal > val(debtBalance(next, row.loan)))
        throw Error("أصل السداد يتجاوز رصيد القرض");
      post(next, {
        id: p.id,
        operationKey: request.operationKey + ":" + p.debtId,
        kind: "repayment",
        date: request.date,
        budgetMonth: item.month,
        budgetItemId: item.id,
        amount: sar(amount),
        principal: sar(principal),
        principalKnown: p.principal !== "" && p.principal != null,
        from: request.from,
        debtId: p.debtId,
        category: item.name,
        source: "budget-payment-v3",
        batchId: request.operationKey,
        posted: true,
      });
      changed = true;
    }
    if (!changed)
      throw Error("لا توجد دفعات جديدة؛ القسطان المسددان لا يسجلان مرتين");
    if (request.from) item.bankAccountId = request.from;
    return next;
  }
  // A reviewed opening snapshot acknowledges past execution without inventing cash moves.
  function settledStart(input, r) {
    const d = clone(input);
    if (!Number.isFinite(idx(r.month)) || !/^\d{4}-\d{2}-\d{2}$/.test(r.date))
      throw Error("حدد تاريخ المطابقة وشهر الميزانية");
    if (new Date(r.date + "T12:00:00Z").toISOString().slice(0,10) !== r.date || r.date > today())
      throw Error("تاريخ المطابقة غير صالح");
    if (d.settledStarts?.[r.month]) throw Error("تمت تهيئة هذا الشهر سابقًا؛ استخدم التسوية لتصحيح رصيد");
    const items = d.budget.filter(b => b.month === r.month);
    if (!items.length) throw Error("أضف ميزانية الشهر أولًا");
    if (d.surplusPlans?.[r.month]?.closed) throw Error("الشهر مغلق");
    const snap = {date:r.date, month:r.month, distributionApproved:true, closed:false,
      existingMoveIds:d.moves.map(m => m.id), salaryReceived:sar(cents(r.salaryReceived)), items:{}, loans:{}, funding:{}, at:stamp()};
    if (snap.salaryReceived < 0) throw Error("الراتب غير صالح");
    for (const a of d.accounts) {
      if (!Object.hasOwn(r.accounts || {}, a.id)) throw Error("راجع رصيد كل حساب");
      const target = sar(cents(r.accounts[a.id]));
      if (target < 0) throw Error("رصيد الحساب سالب");
      a.balanceAdjustment = sar(val(a.balanceAdjustment) + val(target) - val(balance(d,a)));
      snap.funding[a.id] = Math.max(0, sar(val(sum(items.filter(b => accountFor(d,b)?.id === a.id), b => b.amount)) - val(sum((d.fundingLinks || []).filter(l => l.month === r.month && l.accountId === a.id && !l.unlinked), l => d.moves.find(m => m.id === l.moveId && active(m))?.amount || 0))));
    }
    for (const debt of d.debts) {
      if (!Object.hasOwn(r.debts || {}, debt.id)) throw Error("راجع رصيد كل دين");
      const target = sar(cents(r.debts[debt.id]));
      if (target < 0) throw Error("رصيد الدين سالب");
      debt.snapshotAdjustment = sar(val(debt.snapshotAdjustment) + val(target) - val(debtBalance(d,debt)));
      if (debt.kind === "loan" && debt.monthlyPayment != null) {
        const payment = sar(cents(r.installments?.[debt.id]));
        if (payment < 0) throw Error("القسط غير صالح");
        debt.monthlyPayment = payment;
      }
    }
    for (const b of items) {
      if (category(b) === "loan" && items.filter(x => category(x) === "loan").length === 1) b.amount = sum(loanInstallments(d,b), row => row.loan.monthlyPayment);
      if (!(r.paidItems || []).includes(b.id)) continue;
      snap.items[b.id] = {paid:paymentStatus(d,b).rest};
      if (category(b) === "loan") for (const row of loanInstallments(d,b)) snap.loans[row.loan.id] = row.due;
    }
    d.settledStarts ??= {};
    d.settledStarts[r.month] = snap;
    audit(d,"settled-start",{month:r.month, after:snap});
    validate(d);
    return d;
  }
  g.Accounting = {
    settledStart,
    KEY,
    loanInstallments,
    payLoanGroup,
    VERSION,
    clone,
    cents,
    sar,
    val,
    sum,
    idx,
    ym,
    today,
    active,
    delta,
    balance,
    debtDelta,
    debtBalance,
    validate,
    validateMove,
    category,
    accountFor,
    paymentStatus,
    audit,
    post,
    reverse,
    link,
    migrate,
    reconcileChanges,
    storage,
  };
  if (typeof module !== "undefined") module.exports = g.Accounting;
})(globalThis);
