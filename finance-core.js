/* Shared planning projection. Never posts actual transactions. */
(function (g) {
  "use strict";
  const A = g.Accounting,
    n = (x) => Number(x) || 0,
    round = (x) => A.sar(Math.round(x * 100)),
    { idx, ym } = A;
  const sum = (a) => A.sum(a, (x) => x.amount),
    category = A.category;
  function income(d, m) {
    const l = d.legacy?.budgetMonths || {},
      o = d.budgetIncomeOverrides || {},
      source = [...new Set([...Object.keys(l), ...Object.keys(o)])]
        .filter((k) => Number.isFinite(idx(k)) && k <= m)
        .sort()
        .reverse()
        .find((k) => o[k]?.salary != null || l[k]?.salary != null);
    const own = o[m],
      original = l[m],
      salary = Math.max(
        0,
        n(
          own?.salary ??
            original?.salary ??
            o[source]?.salary ??
            l[source]?.salary ??
            d.legacy?.future?.settings?.salary,
        ),
      );
    const lines = (own?.lines || original?.incomeLines || []).map((x, i) => ({
      ...x,
      id: x.id || "legacy-income-" + i,
      name: x.name || "دخل إضافي",
      amount: Math.max(0, n(x.amount)),
    }));
    return {
      salary,
      lines,
      extras: sum(lines),
      total: round(salary + sum(lines)),
      source,
      assumedFromPrevious: !!source && source !== m && !own && !original,
      missing: !source && !own && !original,
    };
  }
  function events(d, m) {
    return (d.commitments || [])
      .filter((c) => c.active !== false)
      .flatMap((c) => {
        const delta = idx(m) - idx(c.firstMonth),
          j = delta / Math.max(1, n(c.interval) || 1);
        if (!Number.isInteger(j) || j < 0 || j >= Math.max(1, n(c.count) || 1))
          return [];
        const key = c.id + "-" + j,
          paid = A.sum(
            d.moves.filter(
              (x) =>
                A.active(x) && x.commitmentKey === key && x.kind === "expense",
            ),
            (x) => x.amount,
          );
        return [
          {
            key,
            id: c.id,
            name: c.name,
            amount: Math.max(0, round(n(c.amount) - paid)),
            car: category(c) === "car" || c.sourceId === "car",
            reserve: !!c.useObligations,
          },
        ];
      });
  }
  function month(d, m, forecast = false) {
    if (!Number.isFinite(idx(m))) throw Error("الشهر غير صالح");
    let items = d.budget.filter((x) => x.month === m).map((x) => ({ ...x })),
      explicit = items.length > 0;
    if (!explicit) {
      const ref = d.budget
        .filter((x) => x.month <= m)
        .map((x) => x.month)
        .sort()
        .at(-1);
      items = d.budget
        .filter((x) => x.month === ref)
        .map((x) => ({ ...x, templateMonth: x.month, month: m, paid: false }));
      for (const rule of d.scheduleRules || []) {
        if (m < rule.from || (rule.until && m > rule.until)) continue;
        const xs = items.filter((x) => category(x) === rule.category);
        if (xs.length) {
          xs[0].amount = rule.amount;
          xs.slice(1).forEach((x) => (x.amount = 0));
        }
      }
      const loans = d.debts.filter(
          (x) => x.kind === "loan" && x.monthlyPayment && x.lastMonth,
        ),
        loanItems = items.filter((x) => category(x) === "loan");
      if (loans.length && loanItems.length) {
        loanItems[0].amount = loans
          .filter(
            (x) => m <= x.lastMonth && (!x.firstMonth || m >= x.firstMonth),
          )
          .reduce((s, x) => s + n(x.monthlyPayment), 0);
        loanItems.slice(1).forEach((x) => (x.amount = 0));
      }
    }
    const inc = income(d, m),
      retire =
        d.retirement?.retirement ||
        d.legacy?.future?.settings?.retirement ||
        "2031-12",
      salary =
        forecast && m >= retire
          ? n(
              d.retirement?.pension ??
                d.legacy?.future?.settings?.pension ??
                30000,
            )
          : inc.salary,
      cat = (k) => sum(items.filter((x) => category(x) === k)),
      ev = events(d, m),
      car = Math.max(0, round(sum(ev.filter((x) => x.car)) - cat("car"))),
      reserveDue = sum(ev.filter((x) => !x.car && x.reserve)),
      otherDue = sum(ev.filter((x) => !x.car && !x.reserve)),
      planned = sum(items);
    return {
      m,
      explicit,
      items,
      income: round(salary + inc.extras),
      planned,
      surplus: round(salary + inc.extras - planned),
      saving: cat("reserve"),
      loan: cat("loan"),
      visa: cat("visa"),
      invest: cat("invest"),
      car,
      reserveDue,
      otherDue,
      events: ev,
      other: cat("other") + cat("clothes") + cat("driver") + cat("wife"),
      retired: m >= retire,
    };
  }
  function split(amount, reserve, restore, policy = {}) {
    let left = Math.max(0, A.cents(amount)),
      e = 0,
      r = 0,
      o = 0,
      b = A.cents(reserve),
      target = Math.max(0, A.cents(restore)),
      first = A.cents(policy.emergencyFirst ?? 5000),
      second = A.cents(policy.emergencySecond ?? 10000);
    while (left > 0) {
      const rate = b + e < first ? 1 : b + e < second ? 0.7 : 0.1,
        limit = rate === 1 ? first : rate === 0.7 ? second : Infinity,
        part = Math.min(left, Math.max(1, Math.ceil((limit - b - e) / rate))),
        ep = Math.min(part, Math.round(part * rate)),
        rp = Math.min(
          target - r,
          Math.round(part * (rate === 1 ? 0 : rate === 0.7 ? 0.3 : 0.6)),
        );
      e += ep;
      r += rp;
      o += part - ep - rp;
      left -= part;
    }
    return { emergency: A.sar(e), restore: A.sar(r), obligations: A.sar(o) };
  }
  function restoreRemaining(d) {
    const restored = A.sum(
      d.moves.filter((x) => A.active(x) && x.purpose === "restore"),
      (x) => x.amount,
    );
    return Math.max(0, round(n(d.policy?.restoreTarget ?? 52000) - restored));
  }
  function surplus(d, m, { visa = 0, urgent = 0 } = {}) {
    const v = month(d, m),
      a = d.accounts.find((x) => x.id === "emergency-reserve-v1"),
      tx = d.moves.filter(
        (x) => A.active(x) && (x.budgetMonth || x.date.slice(0, 7)) === m,
      ),
      unexpected = A.sum(
        tx.filter(
          (x) =>
            x.kind === "expense" &&
            !x.budgetItemId &&
            x.from !== a?.id &&
            !x.commitmentKey,
        ),
        (x) => x.amount,
      ),
      executed = A.sum(
        tx.filter(
          (x) =>
            !x.budgetItemId &&
            (x.purpose === "surplus" || x.purpose === "restore"),
        ),
        (x) => x.amount,
      ),
      deposits = A.sum(
        tx.filter(
          (x) =>
            x.kind === "transfer" &&
            x.to === a?.id &&
            x.purpose !== "surplus" &&
            x.purpose !== "restore",
        ),
        (x) => x.amount,
      ),
      withdrawals = A.sum(
        tx.filter((x) => x.from === a?.id),
        (x) => x.amount,
      ),
      available = round(v.surplus - unexpected - executed - deposits),
      vv = Math.min(Math.max(0, available), Math.max(0, n(visa))),
      uu = Math.min(Math.max(0, available - vv), Math.max(0, n(urgent))),
      reserve = a ? A.balance(d, a) : 0;
    return {
      month: m,
      income: v.income,
      planned: v.planned,
      gross: v.surplus,
      surplus: available,
      unexpected,
      executed,
      deposits,
      withdrawals,
      visa: vv,
      urgent: uu,
      ...split(
        Math.max(0, available - vv - uu),
        reserve,
        restoreRemaining(d),
        d.policy,
      ),
    };
  }
  function projectProfit(d, m, enabled) {
    if (!enabled) return { income: 0, reserve: 0 };
    let income = 0,
      reserve = 0;
    for (const p of d.projects) {
      if (!p.forecastEnabled || p.profitInBudget) continue;
      const delta = idx(m) - idx(p.profitStart),
        gap = n(p.profitInterval);
      if (
        delta < 0 ||
        !Number.isFinite(delta) ||
        (gap === 0 && delta !== 0) ||
        (gap > 0 &&
          (delta % gap !== 0 ||
            (p.profitCount > 0 && delta / gap >= p.profitCount)))
      )
        continue;
      if (
        incomeSources(d, m).some(
          (x) => x.projectId === p.id || x.name === p.name,
        )
      )
        continue;
      income += n(p.expectedNetProfit);
      reserve += n(p.profitToObligations);
    }
    return { income, reserve };
  }
  const incomeSources = (d, m) => income(d, m).lines;
  function simulate(d, opts = {}) {
    const start = opts.start || ym(idx(A.today().slice(0, 7)) + 1),
      months = Math.min(240, Math.max(1, n(opts.months) || 120)),
      stress = n(opts.stress) / 100;
    let cash = A.sum(
        d.accounts.filter(
          (x) =>
            ["bank", "cash"].includes(x.role) &&
            x.id !== "emergency-reserve-v1",
        ),
        (x) => A.balance(d, x),
      ),
      reserve = A.sum(
        d.accounts.filter((x) => x.role === "reserve"),
        (x) => A.balance(d, x),
      ),
      emergency = d.accounts.some((x) => x.id === "emergency-reserve-v1")
        ? A.balance(d, "emergency-reserve-v1")
        : 0,
      portfolio = A.sum(
        d.accounts.filter((x) => x.role === "investment"),
        (x) => A.balance(d, x),
      ),
      visa = A.sum(
        d.debts.filter((x) => x.kind === "credit"),
        (x) => Math.max(0, A.debtBalance(d, x)),
      ),
      restore = restoreRemaining(d),
      profitHold = 0,
      projectReserve = 0,
      firstMonthly = "",
      firstCash = "",
      firstReserve = "",
      rows = [];
    for (let i = 0; i < months; i++) {
      const m = ym(idx(start) + i),
        v = month(d, m, true);
      let allocation = null;
      if (opts.custom) {
        const draw = (d.retirement?.draws || [])
          .filter((x) => x.month <= m)
          .sort((a, b) => a.month.localeCompare(b.month))
          .at(-1);
        allocation =
          (restore > 0
            ? draw?.during || d.retirement?.during
            : draw?.after || d.retirement?.after) || {};
        const factor = Math.pow(
          1 + n(d.retirement?.annualInflation) / 100,
          i / 12,
        );
        for (const b of v.items) {
          const cat = category(b);
          if (["visa", "invest", "reserve"].includes(cat)) {
            const k = cat === "reserve" ? "obligations" : cat;
            if (allocation[k] != null) b.amount = n(allocation[k]);
          } else if (["other", "clothes", "driver", "wife"].includes(cat))
            b.amount = round(n(b.amount) * factor);
        }
        v.planned = sum(v.items);
        v.income = v.retired
          ? n(d.retirement?.pension ?? 30000)
          : n(d.retirement?.salary ?? v.income);
        if (d.retirement?.goalsEnabled === false) {
          v.car = 0;
          v.reserveDue = 0;
          v.otherDue = 0;
        }
      }
      const actual = d.moves.filter(
          (x) => A.active(x) && (x.budgetMonth || x.date.slice(0, 7)) === m,
        ),
        received = A.sum(
          actual.filter((x) => ["income", "profit"].includes(x.kind)),
          (x) => x.amount,
        ),
        extra = round(v.other * stress),
        project = projectProfit(d, m, opts.projects),
        completed = (x) => (v.explicit ? A.paymentStatus(d, x).paid : 0);
      let pending = 0,
        saving = 0,
        invest = 0,
        visaPlanned = 0;
      for (const b of v.items) {
        const rest = Math.max(0, round(n(b.amount) - completed(b))),
          cat = category(b);
        if (cat === "visa") visaPlanned += rest;
        else {
          pending += rest;
          if (cat === "reserve") saving += rest;
          if (cat === "invest") invest += rest;
        }
      }
      const fees = round(
          (opts.custom ? n(d.retirement?.visaFees) : 0) +
            (visa * (opts.custom ? n(d.retirement?.visaAPR) : 0)) / 1200,
        ),
        newVisa = opts.custom ? n(d.retirement?.visaNew) : 0;
      visa = round(visa + fees + newVisa);
      const payVisa = Math.min(visa, visaPlanned);
      visa = round(visa - payVisa);
      pending += payVisa;
      const futureDraws = (opts.custom ? d.retirement?.draws || [] : []).filter(
        (x) => x.month === m,
      );
      let drawn = 0;
      for (const x of futureDraws) {
        const available = Math.min(Math.max(0, portfolio), n(x.amount));
        drawn += available;
        portfolio -= available;
        restore += available;
      }
      let customOut = 0,
        restored = 0,
        projectsOut = 0;
      if (opts.custom) {
        restored = Math.min(restore, n(allocation.restore));
        restore = round(restore - restored);
        projectsOut = n(allocation.projects);
        customOut = restored + projectsOut;
        portfolio += restored;
      }
      const alreadyPaid = A.sum(v.items, (x) => completed(x));
      const net = round(
          v.income +
            project.income -
            pending -
            alreadyPaid -
            v.car -
            v.otherDue -
            extra -
            customOut,
        ),
        flow = round(net - received + alreadyPaid);
      cash = round(cash + flow + drawn - project.reserve);
      reserve = round(reserve + saving + project.reserve - v.reserveDue);
      portfolio = round(portfolio + invest);
      projectReserve = round(projectReserve + projectsOut);
      if (opts.custom) {
        const profit = round(
          portfolio *
            (Math.pow(1 + n(d.retirement?.annualReturn) / 100, 1 / 12) - 1),
        );
        if (d.retirement?.profitMode === "withdraw")
          cash = round(cash + profit);
        else if (d.retirement?.profitMode === "hold")
          profitHold = round(profitHold + profit);
        else portfolio = round(portfolio + profit);
      }
      let toEmergency = 0,
        toRestore = 0,
        toObligations = 0;
      if (opts.distribute) {
        const spent = surplus(d, m).executed + surplus(d, m).deposits,
          allocation = split(
            Math.max(0, round(net - spent)),
            emergency,
            restore,
            d.policy,
          );
        toEmergency = allocation.emergency;
        toRestore = allocation.restore;
        toObligations = allocation.obligations;
        cash = round(cash - toEmergency - toRestore - toObligations);
        emergency = round(emergency + toEmergency);
        reserve = round(reserve + toObligations);
        portfolio = round(portfolio + toRestore);
        restore = round(restore - toRestore);
      }
      if (net < 0 && !firstMonthly) firstMonthly = m;
      if (cash < 0 && !firstCash) firstCash = m;
      if (reserve < 0 && !firstReserve) firstReserve = m;
      rows.push({
        month: m,
        m,
        v,
        income: v.income + project.income,
        planned: v.planned,
        net,
        flow,
        cash,
        reserve,
        emergency,
        portfolio,
        profitHold,
        projectReserve,
        toEmergency,
        toRestore,
        toObligations,
        visa,
        remaining: restore,
        loanPayment: v.loan,
        payVisa,
        living: v.other,
        invest,
        saving,
        retired: v.retired,
        stress: extra,
        received,
        drawn,
        projectProfit: project.income,
        freeFlow: net,
        uncovered: Math.max(0, -reserve),
        goalExpense: v.car + v.reserveDue + v.otherDue,
      });
    }
    return {
      rows,
      firstMonthly,
      firstCash,
      firstReserve,
      warnings: [
        "التوقعات من الحركات الحالية؛ الراتب المستلم لشهر الميزانية لا يُضاف مرتين.",
        "أصل القروض غير موثق، لا يُستهلك افتراضيًا.",
        "الطوارئ خارج النقد الحر. لا عائد استثماري مفترض في السيناريو الأساسي.",
        opts.distribute
          ? "سياسة توزيع الفائض مطبقة في التوقع فقط؛ ليست تحويلات فعلية."
          : "فائض الخطة قبل تخصيصه؛ اختر سيناريو سياسة الفائض لعرض أثر التوزيع.",
      ],
      totalUncovered: Math.max(0, -(rows.at(-1)?.reserve || 0)),
    };
  }
  g.FinanceCore = {
    income,
    balance: A.balance,
    month,
    idx,
    ym,
    round,
    category,
    events,
    split,
    surplus,
    simulate,
    restoreRemaining,
  };
})(globalThis);
