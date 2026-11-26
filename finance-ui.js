(function (g) {
  "use strict";
  const A = g.Accounting,
    C = g.FinanceCore,
    esc = (x) =>
      String(x ?? "").replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c],
      ),
    money = (x) =>
      Number(x).toLocaleString("ar-SA", { maximumFractionDigits: 2 }) + " ر.س",
    id = () => crypto.randomUUID();
  const options = (xs, sel) =>
    xs
      .map(
        ([v, t]) =>
          '<option value="' +
          esc(v) +
          '" ' +
          (v === sel ? "selected" : "") +
          ">" +
          esc(t) +
          "</option>",
      )
      .join("");
  const field = (name, label, value, type = "text", attrs = "") =>
    '<label class="form-field"><span>' +
    esc(label) +
    '</span><input name="' +
    name +
    '" type="' +
    type +
    '" value="' +
    esc(value) +
    '" ' +
    attrs +
    "></label>";
  const select = (name, label, choices, sel) =>
    '<label class="form-field"><span>' +
    esc(label) +
    '</span><select name="' +
    name +
    '">' +
    options(choices, sel) +
    "</select></label>";
  let host;
  function dialog(title, body, submit) {
    host?.remove();
    host = document.createElement("div");
    host.className = "v3-modal";
    host.innerHTML =
      '<div class="dialog-box" role="dialog" aria-modal="true"><h2>' +
      esc(title) +
      '</h2><form><div class="form-grid">' +
      body +
      '</div><p role="alert" class="negative" id="v3-error"></p><div class="modal-footer"><button class="button outline" type="button" data-v3-close>إلغاء</button><button class="button primary" type="submit">اعتماد العملية</button></div></form></div>';
    document.body.append(host);
    host.querySelector("[data-v3-close]").onclick = () => host.remove();
    host.querySelector("form").onsubmit = async (e) => {
      e.preventDefault();
      try {
        if (
          (await submit(Object.fromEntries(new FormData(e.target)))) !== false
        )
          host.remove();
      } catch (err) {
        host.querySelector("#v3-error").textContent = err.message;
      }
    };
    host.querySelector("input,select,button")?.focus();
  }
  const accounts = (d) =>
    d.accounts.map((a) => [a.id, a.name + " — " + money(A.balance(d, a))]);
  function candidates(d, b) {
    return d.moves.filter(
      (m) =>
        A.active(m) &&
        !m.budgetItemId &&
        ["expense", "transfer", "repayment"].includes(m.kind) &&
        ((m.budgetMonth || m.date.slice(0, 7)) === b.month ||
          Math.abs(new Date(m.date) - new Date(b.month + "-01")) <=
            7 * 86400000),
    );
  }
  function pay(bid) {
    const app = g.FinanceApp,
      d = app.get(),
      b = d.budget.find((x) => x.id === bid);
    if (!b) throw Error("البند غير موجود");
    const status = A.paymentStatus(d, b),
      cat = A.category(b),
      debt = cat === "visa" || cat === "loan" || b.type === "debt",
      saving = ["saving", "investment"].includes(b.type),
      candidate = candidates(d, b);
    const linked = status.moves
      .map(
        (m) =>
          '<div class="list-row"><span>' +
          esc(m.date) +
          " • " +
          money(m.amount) +
          '</span><button class="button mini danger" type="button" data-v3-undo="' +
          esc(m.id) +
          '">' +
          (["budget-payment-v3", "budget-visa"].includes(m.source)
            ? "عكس الدفعة"
            : "فك الربط فقط") +
          "</button></div>",
      )
      .join("");
    const source = A.accountFor(d, b)?.id || d.settings.salaryAccountId || "",
      dest =
        d.accounts.find(
          (a) => a.role === (b.type === "saving" ? "reserve" : "investment"),
        )?.id || "";
    const body =
      "<p>المخطط " +
      money(b.amount) +
      " • المثبت " +
      money(status.paid) +
      " • المتبقي " +
      money(status.rest) +
      ". تعديل الخطة لا يغير الدفعات السابقة.</p>" +
      linked +
      select("existing", "اربط حركة مسجلة بدل إنشاء أخرى", [
        ["", "دفعة جديدة مؤكدة"],
        ...candidate.map((m) => [
          m.id,
          m.date + " " + m.kind + " " + money(m.amount),
        ]),
      ]) +
      field(
        "amount",
        "المبلغ الفعلي",
        status.rest || b.amount,
        "number",
        'min="0.01" step="0.01" required',
      ) +
      field("date", "تاريخ التنفيذ", A.today(), "date", "required") +
      select("from", "الحساب الذي دفع بالفعل", accounts(d), source) +
      (saving
        ? select("to", "وعاء الادخار / الاستثمار", accounts(d), dest)
        : "") +
      (debt
        ? select(
            "debtId",
            "البطاقة أو القرض",
            d.debts
              .filter((x) => cat !== "visa" || x.kind === "credit")
              .map((x) => [x.id, x.name + " " + money(A.debtBalance(d, x))]),
          ) +
          field(
            "principal",
            "أصل القرض المسدد (اتركه فارغًا إن لم يُعرف؛ الفيزا تلقائيًا كامل الدفعة)",
            "",
            "number",
            'min="0" step="0.01"',
          )
        : "") +
      '<label><input name="confirmed" type="checkbox" required> أؤكد حدوث العملية وأني راجعت الحركات السابقة.</label>';
    const operationKey = id();
    dialog("دفع البند: " + b.name, body, (v) => {
      if (v.existing) {
        const m = d.moves.find((x) => x.id === v.existing);
        if (
          (debt && m.kind !== "repayment") ||
          (saving && m.kind !== "transfer") ||
          (!debt && !saving && m.kind !== "expense")
        )
          throw Error("نوع الحركة لا يطابق البند");
        A.link(d, v.existing, b.id, b.month);
      } else {
        const card = d.debts.find((x) => x.id === v.debtId),
          amount = A.sar(A.cents(v.amount)),
          principal = debt
            ? card?.kind === "credit"
              ? amount
              : v.principal === ""
                ? 0
                : A.sar(A.cents(v.principal))
            : 0;
        if (debt && principal > A.debtBalance(d, card))
          throw Error("أصل الدفعة يتجاوز الدين الحالي");
        const m = {
          id: id(),
          operationKey,
          date: v.date,
          budgetMonth: b.month,
          budgetItemId: b.id,
          kind: debt ? "repayment" : saving ? "transfer" : "expense",
          amount,
          from: v.from,
          to: saving ? v.to : "",
          debtId: debt ? v.debtId : "",
          principal,
          principalKnown:
            !debt || card?.kind === "credit" || v.principal !== "",
          category: b.name,
          source: "budget-payment-v3",
          posted: true,
        };
        A.post(d, m);
      }
      return app.save();
    });
    host.querySelectorAll("[data-v3-undo]").forEach(
      (btn) =>
        (btn.onclick = async () => {
          const m = d.moves.find((x) => x.id === btn.dataset.v3Undo);
          if (!confirm("اعتماد التراجع؟ سيُحفظ الأثر في سجل التدقيق.")) return;
          if (m.source === "budget-payment-v3" || m.source === "budget-visa") {
            A.reverse(d, m.id);
          } else {
            A.audit(d, "unlink-budget", {
              moveId: m.id,
              before: {
                budgetItemId: m.budgetItemId,
                budgetMonth: m.budgetMonth,
              },
            });
            delete m.budgetItemId;
          }
          if (await app.save()) {
            host.remove();
            pay(bid);
          }
        }),
    );
  }
  function funding(accountIds) {
    const app = g.FinanceApp,
      d = app.get(),
      month = app.period(),
      planId = id(),
      chunks = [];
    for (const aid of accountIds) {
      const a = d.accounts.find((x) => x.id === aid),
        items = d.budget.filter(
          (x) => x.month === month && A.accountFor(d, x)?.id === aid,
        ),
        planned = A.sum(items, (x) => x.amount),
        links = (d.fundingLinks || []).filter(
          (x) => x.month === month && x.accountId === aid && !x.unlinked,
        ),
        actual = links.reduce(
          (s, l) =>
            s +
            (d.moves.find((m) => m.id === l.moveId && A.active(m))?.amount ||
              0),
          0,
        ),
        existing = d.moves.filter(
          (m) =>
            A.active(m) &&
            m.kind === "transfer" &&
            m.to === aid &&
            !links.some((l) => l.moveId === m.id),
        );
      chunks.push(
        "<fieldset><legend>" +
          esc(a.name) +
          "</legend><p>المخصص " +
          money(planned) +
          " • تحويلات مرتبطة " +
          money(actual) +
          " • الفرق " +
          money(planned - actual) +
          "</p>" +
          links
            .map(
              (l) =>
                "<p>" +
                money(d.moves.find((m) => m.id === l.moveId)?.amount || 0) +
                ' <button class="button mini danger" type="button" data-unfund="' +
                esc(l.id) +
                '">تراجع عن الربط / التمويل</button></p>',
            )
            .join("") +
          select(
            "mode_" + aid,
            "الإجراء",
            [
              ["skip", "اترك دون تغيير"],
              ["new", "تحويل فعلي جديد"],
              ...existing.map((m) => [
                m.id,
                "ربط " + m.date + " " + money(m.amount),
              ]),
            ],
            "skip",
          ) +
          select(
            "from_" + aid,
            "مصدر التحويل الفعلي",
            accounts(d).filter((x) => x[0] !== aid),
            d.settings.salaryAccountId,
          ) +
          field(
            "amount_" + aid,
            "المبلغ المحول بالفعل",
            Math.max(0, planned - actual),
            "number",
            'min="0" step="0.01"',
          ) +
          field("date_" + aid, "تاريخ التحويل", A.today(), "date") +
          "</fieldset>",
      );
    }
    dialog(
      "تأكيد تمويل الحسابات — " + month,
      chunks.join("") +
        '<label><input type="checkbox" name="confirmed" required> تحققت من المصدر والمبلغ والتنفيذ الفعلي لكل تحويل اخترته.</label>',
      (v) => {
        const staged = A.clone(d);
        for (const aid of accountIds) {
          const mode = v["mode_" + aid];
          if (mode === "skip") continue;
          let m;
          if (mode === "new") {
            m = {
              id: id(),
              operationKey: planId + "-" + aid,
              date: v["date_" + aid],
              budgetMonth: month,
              kind: "transfer",
              amount: A.sar(A.cents(v["amount_" + aid])),
              from: v["from_" + aid],
              to: aid,
              source: "budget-funding-v3",
              posted: true,
            };
            A.post(staged, m);
          } else {
            m = staged.moves.find(
              (x) =>
                x.id === mode &&
                A.active(x) &&
                x.kind === "transfer" &&
                x.to === aid,
            );
            if (!m) throw Error("الحركة لم تعد صالحة");
            if (
              (staged.fundingLinks || []).some(
                (l) => !l.unlinked && l.moveId === m.id,
              )
            )
              throw Error("التحويل مرتبط بتمويل سابق؛ راجع السجل");
          }
          staged.fundingLinks ??= [];
          staged.fundingLinks.push({
            id: id(),
            month,
            accountId: aid,
            moveId: m.id,
            owned: mode === "new",
            at: new Date().toISOString(),
          });
        }
        Object.assign(d, staged);
        return app.save();
      },
    );
    host.querySelectorAll("[data-unfund]").forEach(
      (btn) =>
        (btn.onclick = async () => {
          if (
            !confirm(
              "التراجع عن التمويل؟ الحركة البنكية المستقلة سيُفك ربطها فقط.",
            )
          )
            return;
          const l = d.fundingLinks.find((x) => x.id === btn.dataset.unfund);
          if (l.owned) A.reverse(d, l.moveId);
          A.audit(d, "unlink-funding", { link: l });
          l.unlinked = true;
          if (await app.save()) {
            host.remove();
            funding(accountIds);
          }
        }),
    );
  }
  function salary() {
    const app = g.FinanceApp,
      d = app.get(),
      month = app.period(),
      existing = d.moves.filter(
        (m) =>
          A.active(m) &&
          m.kind === "income" &&
          (m.category === "راتب" ||
            m.source === "scheduled-salary" ||
            m.source === "salary-v3"),
      );
    dialog(
      "إيداع راتب مثبت",
      field("month", "شهر الميزانية", month, "month", "required") +
        field("date", "تاريخ الإيداع", A.today(), "date", "required") +
        field(
          "amount",
          "المبلغ",
          C.income(d, month).salary,
          "number",
          'step="0.01" min="0.01" required',
        ) +
        select(
          "to",
          "الحساب المستلم",
          accounts(d),
          d.settings.salaryAccountId,
        ) +
        "<p>الإيداعات الموجودة: " +
        existing
          .map(
            (m) =>
              esc(m.date) + " / " + esc(m.budgetMonth) + " " + money(m.amount),
          )
          .join("، ") +
        '</p><label><input type="checkbox" required name="confirmed"> تأكدت من إيداع البنك وعدم تسجيله سابقًا</label>',
      (v) => {
        if (
          existing.some(
            (m) =>
              m.budgetMonth === v.month ||
              (m.date === v.date &&
                m.to === v.to &&
                m.amount === Number(v.amount)),
          )
        )
          throw Error(
            "راتب هذا الشهر موجود؛ اربط رسالة البنك بالحركة بدل تكراره",
          );
        A.post(d, {
          id: id(),
          operationKey: "salary:" + v.month,
          kind: "income",
          date: v.date,
          budgetMonth: v.month,
          amount: Number(v.amount),
          to: v.to,
          category: "راتب",
          source: "salary-v3",
          evidence: "user-confirmed",
          posted: true,
        });
        return app.save();
      },
    );
  }
  function planning() {
    const app = g.FinanceApp,
      d = app.get();
    const categories = [
      ["", "اختر دور البند"],
      ["visa", "فيزا"],
      ["wife", "صندوق الزوجة"],
      ["driver", "سائق"],
      ["clothes", "ملابس"],
      ["invest", "استثمار"],
      ["reserve", "التزامات"],
      ["loan", "قروض"],
      ["car", "سيارة"],
    ];
    const entries = [...(d.scheduleRules || []), {}];
    const ruleFields = entries
      .map(
        (r, i) =>
          "<fieldset><legend>" +
          (i === entries.length - 1
            ? "إضافة قاعدة (اختياري)"
            : "قاعدة مستقبلية") +
          "</legend>" +
          select("r_category_" + i, "البند", categories, r.category || "") +
          field("r_from_" + i, "يبدأ من", r.from || "", "month") +
          field(
            "r_amount_" + i,
            "المخصص الشهري",
            r.amount ?? "",
            "number",
            'min="0" step="0.01"',
          ) +
          field(
            "r_until_" + i,
            "آخر شهر (اتركه فارغًا للاستمرار)",
            r.until || "",
            "month",
          ) +
          (i < entries.length - 1
            ? '<label><input type="checkbox" name="r_delete_' +
              i +
              '"> حذف هذه القاعدة</label>'
            : "") +
          "</fieldset>",
      )
      .join("");
    dialog(
      "قواعد الخطة الأساسية",
      select(
        "salaryAccountId",
        "حساب إيداع الراتب",
        accounts(d),
        d.settings.salaryAccountId,
      ) +
        field(
          "retirement",
          "شهر التقاعد",
          d.retirement?.retirement || "2031-12",
          "month",
          "required",
        ) +
        field(
          "pension",
          "المعاش المتوقع",
          d.retirement?.pension ?? 30000,
          "number",
          'min="0" step="0.01" required',
        ) +
        field(
          "restoreTarget",
          "هدف استعادة دراهم",
          d.policy.restoreTarget,
          "number",
          'min="0" step="0.01" required',
        ) +
        field(
          "emergencyFirst",
          "عتبة الطوارئ الأولى",
          d.policy.emergencyFirst,
          "number",
          'min="0.01" step="0.01" required',
        ) +
        field(
          "emergencySecond",
          "عتبة الطوارئ الثانية",
          d.policy.emergencySecond,
          "number",
          'min="0.01" step="0.01" required',
        ) +
        ruleFields +
        "<p>تطبق القواعد على الأشهر غير المحفوظة؛ الأشهر التي أدخلت ميزانيتها مستقلة. القروض ومواعيد انتهائها من محرر الديون. هذه إعدادات تخطيط، لا حركات مالية.</p>",
      (v) => {
        const rules = entries.flatMap((r, i) => {
          if (v["r_delete_" + i] || !v["r_category_" + i]) return [];
          return [
            {
              category: v["r_category_" + i],
              from: v["r_from_" + i],
              amount: Number(v["r_amount_" + i]),
              ...(v["r_until_" + i] ? { until: v["r_until_" + i] } : {}),
            },
          ];
        });
        if (
          !Array.isArray(rules) ||
          rules.some(
            (r) =>
              ![
                "visa",
                "wife",
                "driver",
                "clothes",
                "invest",
                "reserve",
                "loan",
                "car",
                "other",
              ].includes(r.category) ||
              !Number.isFinite(C.idx(r.from)) ||
              (r.until && !Number.isFinite(C.idx(r.until))) ||
              A.cents(r.amount) < 0,
          )
        )
          throw Error("قواعد غير صالحة");
        if (Number(v.emergencySecond) <= Number(v.emergencyFirst))
          throw Error("العتبة الثانية يجب أن تكون أكبر من الأولى");
        d.settings.salaryAccountId = v.salaryAccountId;
        d.retirement = {
          ...d.retirement,
          retirement: v.retirement,
          pension: Number(v.pension),
        };
        d.policy = {
          ...d.policy,
          restoreTarget: Number(v.restoreTarget),
          emergencyFirst: Number(v.emergencyFirst),
          emergencySecond: Number(v.emergencySecond),
        };
        d.scheduleRules = rules;
        return app.save();
      },
    );
  }
  function review(d) {
    const issues = (d.reviewIssues || []).filter((x) => x.status === "open");
    return (
      '<section class="panel"><h2>مراجعة الترحيل والسجل الموحد — الإصدار ٣</h2><p>حُفظت الأرصدة الافتتاحية والتسويات والحقول القديمة. ' +
      issues.length +
      " ملاحظة للمطابقة؛ " +
      (d.ledgerEvents || []).length +
      " أثر تدقيق.</p><details><summary>عرض الملاحظات</summary>" +
      issues
        .map(
          (x) =>
            "<p>" +
            esc(x.detail.message) +
            " " +
            esc(x.detail.month || "") +
            "</p>",
        )
        .join("") +
      "</details><details><summary>سجل التدقيق</summary>" +
      (d.ledgerEvents || [])
        .slice(-50)
        .reverse()
        .map(
          (x) =>
            "<p>" +
            esc(x.at) +
            " • " +
            esc(x.type) +
            " • " +
            esc(x.moveId || "") +
            "</p>",
        )
        .join("") +
      "</details></section>"
    );
  }
  // Capture before the retained UI's legacy handlers. No duplicate posting paths.
  document.addEventListener(
    "click",
    (e) => {
      const b = e.target.closest("[data-action]");
      if (!b || !g.FinanceApp) return;
      if (g.FinanceApp.busy?.()) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      const action = b.dataset.action;
      if (
        ![
          "payBudgetV3",
          "confirmVisaPayment",
          "toggleBudgetPaid",
          "toggleAccountFunding",
          "toggleBankFunding",
          "recordSalary",
          "saveAutoSalary",
          "planningSettings",
        ].includes(action)
      )
        return;
      e.preventDefault();
      e.stopImmediatePropagation();
      try {
        const d = g.FinanceApp.get();
        if (action === "planningSettings") planning();
        else if (
          ["payBudgetV3", "confirmVisaPayment", "toggleBudgetPaid"].includes(
            action,
          )
        )
          pay(b.dataset.id);
        else if (action === "toggleAccountFunding") funding([b.dataset.id]);
        else if (action === "toggleBankFunding") {
          const bank = b.dataset.id,
            bankName = g.FinanceApp.bankGroup;
          funding(
            d.accounts
              .filter(
                (a) =>
                  bankName(a) === bank &&
                  d.budget.some(
                    (x) =>
                      x.month === g.FinanceApp.period() &&
                      A.accountFor(d, x)?.id === a.id,
                  ),
              )
              .map((a) => a.id),
          );
        } else salary();
      } catch (err) {
        alert(err.message);
      }
    },
    true,
  );
  g.FinanceUI = { pay, funding, salary, review };
})(window);
