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
  function freshStart() {
    const app=g.FinanceApp;
    dialog("بداية جديدة بأرصدة صفر",
      '<p>يُؤرشف السجل الحالي كاملًا على هذا الجهاز، ثم تبدأ الحسابات والديون بأرصدة صفر وبلا حركات. تبقى أسماء الحسابات والبطاقات والقروض وخطة الشهر المختار وأهدافك. ستدخل الأرصدة الحالية يدويًا بعد ذلك. راتب شهر البداية مستلم ومشمول في الأرصدة التي ستدخلها؛ لا تضفه مرة أخرى.</p>'+
      field("month","أول شهر للمتابعة",C.ym(C.idx(A.today().slice(0,7))+1),"month","required")+
      '<label><input type="checkbox" required> أوافق على أرشفة السجل الحالي وبدء سجل جديد بأرصدة صفر.</label>',
      v=>app.freshStart(v.month));
  }
  function settledStart() {
    const app = g.FinanceApp, d = app.get(), month = app.period();
    if (d.settledStarts?.[month]) throw Error("تهيئة هذا الشهر معتمدة بالفعل");
    dialog("تهيئة بعد التوزيع والسداد",
      "<p>أدخل الأرصدة الحالية بعد التنفيذ. لا تُنشأ إيداعات أو خصومات جديدة. البنود المحددة ستثبت كمسددة عند نقطة البداية، والشهر يبقى مفتوحًا. صدّر نسخة احتياطية قبل الاعتماد.</p>" +
      field("month", "شهر الميزانية", month, "month", "required") +
      field("date", "تاريخ مطابقة الأرصدة", A.today(), "date", "required") +
      field("salaryReceived", "راتب هذا الشهر المستلم والمشمول في الأرصدة", C.income(d,month).salary, "number", 'min="0" step="0.01" required') +
      d.accounts.map(a => field("account_"+a.id, a.name+" • "+(a.last4||a.bank||""), A.balance(d,a), "number", 'min="0" step="0.01" required')).join("") +
      d.debts.map(a => field("debt_"+a.id, "المتبقي: "+a.name, A.debtBalance(d,a), "number", 'min="0" step="0.01" required') +
        (a.kind === "loan" && a.monthlyPayment != null ? field("installment_"+a.id,"القسط الشهري: "+a.name,a.monthlyPayment,"number",'min="0" step="0.01" required') : "")).join("") +
      d.budget.filter(b=>b.month===month).map(b=>'<label><input type="checkbox" name="paid_'+esc(b.id)+'" checked> '+esc(b.name)+' — '+money(b.amount)+' سُدد بالفعل</label>').join("") +
      '<label><input type="checkbox" name="confirmed" required> راجعت الأرصدة والبنود المختارة، وجميعها بعد التنفيذ الفعلي.</label>',
      v => {
        if (v.month !== month) throw Error("اختر شهر الميزانية من الصفحة ثم افتح التهيئة مجددًا");
        const r = {month:v.month,date:v.date,salaryReceived:v.salaryReceived,accounts:{},debts:{},installments:{},paidItems:[]};
        for (const a of d.accounts) r.accounts[a.id]=v["account_"+a.id];
        for (const a of d.debts) {r.debts[a.id]=v["debt_"+a.id];r.installments[a.id]=v["installment_"+a.id];}
        for (const b of d.budget.filter(b=>b.month===month)) if(v["paid_"+b.id]) r.paidItems.push(b.id);
        return app.saveState(A.settledStart(d,r));
      });
  }
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
  function payLoans(b) {
    const app = g.FinanceApp,
      d = app.get(),
      rows = A.loanInstallments(d, b),
      operationKey = id();
    const linked = A.paymentStatus(d, b)
      .moves.map(
        (m) =>
          '<div class="list-row"><span>' +
          esc(d.debts.find((x) => x.id === m.debtId)?.name || "دفعة") +
          " • " +
          money(m.amount) +
          '</span><button class="button mini danger" type="button" data-loan-undo="' +
          esc(m.id) +
          '">' +
          (m.source === "budget-payment-v3" ? "عكس الدفعة" : "فك الربط فقط") +
          "</button></div>",
      )
      .join("");
    const fields = rows
      .map(({ loan, due, paid }, i) => {
        const existing = candidates(d, b).filter(
          (m) => m.kind === "repayment" && m.debtId === loan.id,
        );
        return (
          "<fieldset><legend>" +
          esc(loan.name) +
          "</legend><p>القسط الشهري " +
          money(loan.monthlyPayment) +
          " • المسجل " +
          money(paid) +
          " • المتبقي " +
          money(due) +
          "</p>" +
          select(
            "loan_existing_" + i,
            "دفعة مسجلة سابقًا",
            [
              ["", "سداد جديد مؤكد"],
              ...existing.map((m) => [
                m.id,
                m.date +
                  " • " +
                  money(m.amount) +
                  " • " +
                  (d.accounts.find((a) => a.id === m.from)?.name || "خصم سابق"),
              ]),
            ],
            "",
          ) +
          field(
            "loan_amount_" + i,
            "المبلغ المسدد لهذا القرض",
            due,
            "number",
            'min="0" step="0.01" required',
          ) +
          field(
            "loan_principal_" + i,
            "أصل الدين المسدد (اختياري حسب كشف البنك)",
            "",
            "number",
            'min="0" step="0.01"',
          ) +
          "</fieldset>"
        );
      })
      .join("");
    dialog(
      "تأكيد قسطي القروض معًا",
      "<p>بند القروض " +
        money(b.amount) +
        ". يسجل كل قسط على قرضه، ويخصم مجموع الدفعتين من الحساب المختار مرة واحدة لكل دفعة. اترك أصل الدين فارغًا إذا لم يتضح في الكشف.</p>" +
        linked +
        select(
          "from",
          "الحساب الذي دفع القسطين",
          accounts(d),
          d.settings.salaryAccountId || A.accountFor(d, b)?.id,
        ) +
        field("date", "تاريخ الخصم", A.today(), "date", "required") +
        select("paymentMode","طريقة الإثبات",[["new","سداد فعلي — خصم من المصدر فقط"],["prior","تم سابقًا ومشمول في الرصيد — دون خصم"]],"new") + fields +
        '<p id="loan-total"></p><label><input name="confirmed" type="checkbox" required> أؤكد حدوث الخصم البنكي للدفعات المحددة وعدم تسجيلها سابقًا.</label>',
      (v) => {
        if (v.paymentMode === "prior") return app.saveState(A.acknowledgePaid(d,{itemId:b.id,amount:A.paymentStatus(d,b).rest,date:v.date,id:operationKey}));
        const next = A.payLoanGroup(d, {
          itemId: b.id,
          from: v.from,
          date: v.date,
          operationKey,
          payments: rows.map((r, i) => ({
            id: id(),
            debtId: r.loan.id,
            amount: v["loan_amount_" + i],
            principal: v["loan_principal_" + i],
            existing: v["loan_existing_" + i],
          })),
        });
        Object.assign(d, next);
        return app.save();
      },
    );
    const update = () => {
      let total = 0;
      for (let i = 0; i < rows.length; i++) {
        const selected = host.querySelector(
          '[name="loan_existing_' + i + '"]',
        ).value;
        const input = host.querySelector('[name="loan_amount_' + i + '"]');
        input.disabled = !!selected;
        if (!selected) total += Number(input.value) || 0;
      }
      host.querySelector("#loan-total").textContent =
        "إجمالي الخصم الجديد من الحساب: " + money(total);
    };
    host.addEventListener("input", update);
    host.addEventListener("change", update);
    update();
    host.querySelectorAll("[data-loan-undo]").forEach(
      (btn) =>
        (btn.onclick = async () => {
          if (!confirm("التراجع عن هذه الدفعة فقط؟")) return;
          const m = d.moves.find((x) => x.id === btn.dataset.loanUndo);
          if (m.source === "budget-payment-v3") A.reverse(d, m.id);
          else {
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
            pay(b.id);
          }
        }),
    );
  }
  function pay(bid) {
    const app=g.FinanceApp,d=app.get(),b=d.budget.find(x=>x.id===bid);
    if(!b)throw Error("البند غير موجود");
    const loanRows=A.category(b)==="loan"?A.loanInstallments(d,b):[];
    const status=A.paymentStatus(d,b), amount=loanRows.length?A.sum(loanRows,row=>row.due):status.rest;
    const source=A.paymentSource(d,b)?.id || d.settings.salaryAccountId;
    const saving=["saving","investment"].includes(b.type), debt=b.type==="debt" && !loanRows.length;
    const targets=saving?d.accounts.filter(a=>a.role===(b.type==="saving"?"reserve":"investment")):[];
    const debts=debt?d.debts.filter(x=>A.category(b)==="visa"?x.kind==="credit":true):[];
    const debtId=b.debtId || (debts.length===1?debts[0].id:"");
    const to=b.destinationAccountId || (targets.length===1?targets[0].id:"");
    const prior=(d.priorPayments||[]).filter(x=>x.itemId===bid&&!x.reversed);
    dialog("تأكيد دفع: "+b.name,
      '<p>الشهر '+esc(b.month)+' • المتبقي <strong>'+money(amount)+'</strong></p>'+
      select("from","حساب المصدر",accounts(d),source)+
      '<p id="payment-route"></p>'+
      (amount>0?
      '<label class="form-field"><span><input type="radio" name="mode" value="prior" required> دُفع سابقًا</span><small>تأكيد فقط؛ لا خصم ولا إضافة.</small></label>'+
      '<label class="form-field"><span><input type="radio" name="mode" value="new" required> لم يُدفع بعد</span><small>بعد تنفيذ الدفع، أكّده هنا من حساب المصدر المختار.</small></label>'+
      '<div id="payment-targets" hidden>'+
      (debt&&!debtId?select("debtId","البطاقة أو الدين المستفيد — يُحفظ بعد اختياره",[["","اختر المستفيد"],...debts.map(x=>[x.id,x.name])],""):"")+
      (saving&&!to?select("to","حساب الاستلام — يُحفظ بعد اختياره",[["","اختر المستلم"],...targets.map(a=>[a.id,a.name])],""):"")+
      '<p>'+(saving?"سيُخصم المبلغ من المصدر ويُضاف إلى حساب الاستلام.":debt||loanRows.length?"سيُخصم المبلغ من المصدر ويُسجل سداد الدين.":"سيُخصم المبلغ من المصدر كدفع للمستفيد.")+'</p></div>':"<p>✓ البند مدفوع بالكامل.</p>")+
      '<details><summary>تفاصيل إضافية أو سداد جزئي</summary>'+field("amount","المبلغ",amount,"number",'min="0.01" step="0.01"')+field("date","تاريخ التنفيذ",A.today(),"date")+
      '<button class="button outline" type="button" data-payment-advanced>فتح تفاصيل الدفعات</button></details>'+
      (status.moves.length||prior.length?'<details><summary>الدفعات السابقة والتراجع</summary>'+status.moves.map(m=>'<p>'+money(m.amount)+' <button type="button" class="button mini outline" data-payment-undo="'+esc(m.id)+'">تراجع</button></p>').join("")+prior.map(p=>'<p>دُفع سابقًا '+money(p.amount)+' <button type="button" class="button mini outline" data-prior-undo="'+esc(p.id)+'">تراجع</button></p>').join("")+'</details>':""),
      v=>amount<=0 ? app.saveState(A.correctPaymentSource(d,{itemId:bid,from:v.from})) : app.saveState(A.confirmBudgetPayment(d,{...v,itemId:bid,id:id(),debtId:v.debtId||debtId,to:v.to||to})));
    const form=host.querySelector("form"),submit=form.querySelector('[type="submit"]');
    const update=()=>{
      const v=Object.fromEntries(new FormData(form)),box=host.querySelector("#payment-targets");if(box)box.hidden=v.mode!=="new";
      const target=saving?A.accountLabel(d,v.to||to):loanRows.length?loanRows.map(r=>r.loan.name).join(" + "):debt?(d.debts.find(x=>x.id===(v.debtId||debtId))?.name||"اختر البطاقة أو الدين المستفيد"):b.name+" (دفع للمستفيد)";
      host.querySelector("#payment-route").textContent="من: "+A.accountLabel(d,v.from)+" • إلى: "+target+(amount<=0?". تصحيح المصدر فقط؛ لا خصم ولا إضافة.":"");
      const sourceOnly=amount<=0;
      submit.disabled=sourceOnly?(!v.from||v.from===b.paymentSourceId):!v.mode;
      submit.textContent=sourceOnly?"حفظ حساب المصدر فقط":v.mode==="new"?"تأكيد تنفيذ الدفع":"تأكيد أنه دُفع سابقًا";
      const amountInput=form.querySelector('[name="amount"]');if(amountInput)amountInput.disabled=sourceOnly;
    };
    form.addEventListener("change",update);update();
    host.querySelector("[data-payment-advanced]").onclick=()=>payAdvanced(bid);
    host.querySelectorAll("[data-payment-undo],[data-prior-undo]").forEach(btn=>btn.onclick=async()=>{
      if(!confirm("التراجع عن هذه الدفعة فقط؟"))return;
      const next=A.clone(d);
      if(btn.dataset.priorUndo){const p=next.priorPayments.find(x=>x.id===btn.dataset.priorUndo);p.reversed=true;A.audit(next,"reverse-prior-payment",{before:p});}
      else {const m=next.moves.find(x=>x.id===btn.dataset.paymentUndo);if(["budget-payment-v3","budget-visa"].includes(m.source))A.reverse(next,m.id);else{A.audit(next,"unlink-budget",{moveId:m.id});delete m.budgetItemId;}}
      if(await app.saveState(next))pay(bid);
    });
  }
  function payAdvanced(bid) {
    const app = g.FinanceApp,
      d = app.get(),
      b = d.budget.find((x) => x.id === bid);
    if (!b) throw Error("البند غير موجود");
    if (A.category(b) === "loan" && A.loanInstallments(d, b).length)
      return payLoans(b);
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
      (!saving ? '<button type="button" class="button outline" data-item-direct>تخطي — خصم من الحساب فقط</button>' : "") +
      select("existing", "اربط حركة مسجلة بدل إنشاء أخرى", [
        ["", saving ? "تحويل ادخار / استثمار فعلي" : "تخطي الإضافة للمستلم — دفع من الحساب المحدد"],
        ["prior", "تم سابقًا ومشمول في الرصيد — دون خصم"],
        ...candidate.map((m) => [
          m.id,
          m.date + " " + m.kind + " " + money(m.amount),
        ]),
      ]) +
      field(
        "amount",
        "المبلغ الفعلي",
        status.rest,
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
              .filter((x) =>
                cat === "visa"
                  ? x.kind === "credit"
                  : cat === "loan"
                    ? x.kind === "loan"
                    : true,
              )
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
    if (status.complete && d.settledStarts?.[b.month]?.items?.[b.id]) throw Error("البند مسدد ضمن نقطة البداية؛ لا يحتاج خصمًا جديدًا");
    const operationKey = id();
    dialog("دفع البند: " + b.name, body, (v) => {
      if (A.paymentStatus(d,b).complete) throw Error("البند مسدد بالفعل؛ لا يحتاج تأكيدًا جديدًا");
      if (v.existing === "prior") return app.saveState(A.acknowledgePaid(d,{itemId:b.id,amount:v.amount,date:v.date,id:operationKey}));
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
    const directButton=host.querySelector("[data-item-direct]");
    if(directButton) directButton.onclick=()=>{host.querySelector('[name="existing"]').value="";};
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
  function funding(accountIds, selectedId) {
    const app=g.FinanceApp,d=app.get(),month=app.period();
    const choices=accountIds.map(aid=>d.accounts.find(a=>a.id===aid)).filter(Boolean);
    const account=choices.find(a=>a.id===selectedId) || choices.find(a=>A.fundingStatus(d,month,a.id).rest>0) || choices[0];
    if(!account) throw Error("لا يوجد حساب محدد");
    const state=A.fundingStatus(d,month,account.id),operationId=id();
    const defaultSource=d.fundingSources?.[month]?.[account.id] || (d.accounts.some(a=>a.id===d.settings.salaryAccountId && a.id!==account.id)?d.settings.salaryAccountId:
      d.accounts.find(a=>a.id!==account.id && a.role==="bank")?.id || "");
    const links=(d.fundingLinks||[]).filter(l=>l.month===month && l.accountId===account.id && !l.unlinked);
    dialog("تأكيد الحساب — "+month,
      (choices.length>1?select("account","اختر حسابًا واحدًا",choices.map(a=>[a.id,a.name]),account.id):"<h3>"+esc(account.name)+"</h3>")+
      '<p>المتبقي للتأكيد: <strong>'+money(state.rest)+'</strong></p>'+select("from","حساب المصدر",accounts(d),defaultSource)+'<p id="fund-route"></p>'+
      (state.planned===0?'<p>لا توجد مخصصات مرتبطة بهذا الحساب في الشهر المختار. راجع ربط البنود في الميزانية.</p>':state.rest===0?'<p>✓ هذا الحساب مؤكد بالفعل.</p>':
      '<label class="form-field"><span><input type="radio" name="mode" value="prior" required> دُفع سابقًا</span><small>إثبات فقط، دون تغيير الأرصدة.</small></label>'+
      '<label class="form-field"><span><input type="radio" name="mode" value="transfer" required> لم يُدفع بعد</span><small>بعد تنفيذ التحويل، أكّده هنا لخصمه من المصدر وإضافته لهذا الحساب.</small></label>'+
      '<div id="fund-transfer" hidden><p>التحويل من <strong id="fund-source-name"></strong> إلى '+esc(account.name)+'.</p>'+
      '<details><summary>تعديل المبلغ أو حساب المصدر</summary>'+
      field("amount","مبلغ التحويل",state.rest,"number",'min="0.01" step="0.01"')+

      field("date","تاريخ التنفيذ",A.today(),"date")+'</details></div>')+
      (links.length?'<details><summary>العمليات السابقة والتراجع</summary>'+links.map(l=>'<p>'+money(d.moves.find(m=>m.id===l.moveId)?.amount||0)+' <button type="button" class="button mini outline" data-unfund="'+esc(l.id)+'">تراجع</button></p>').join("")+'</details>':""),
      async v=>{
        if(state.rest===0) return app.saveState(A.correctFundingSource(d,{month,accountId:account.id,from:v.from}));
        const next=A.confirmFunding(d,{id:operationId,month,accountId:account.id,mode:v.mode,
          amount:v.mode==="prior"?state.rest:v.amount,from:v.from,date:v.date||A.today()});
        return app.saveState(next);
      });
    const form=host.querySelector("form"),submit=form.querySelector('[type="submit"]');submit.disabled=true;
    const sourceInput=form.querySelector('[name="from"]');if(sourceInput)sourceInput.required=true;
    const update=()=>{
      const v=Object.fromEntries(new FormData(form));
      const box=host.querySelector("#fund-transfer");if(box) box.hidden=v.mode!=="transfer";
      const source=host.querySelector("#fund-source-name");if(source) source.textContent=d.accounts.find(a=>a.id===v.from)?.name||"اختر المصدر من تعديل المبلغ أو الحساب";
      host.querySelector("#fund-route").textContent="من: "+A.accountLabel(d,v.from)+" • إلى: "+A.accountLabel(d,account.id)+(state.rest===0?". حفظ المصدر فقط لا ينفذ تحويلًا.":"");
      submit.textContent=state.rest===0?"حفظ حساب المصدر فقط":v.mode==="transfer"?"تأكيد تنفيذ التحويل":"تأكيد أنه دُفع سابقًا";
      submit.disabled=state.rest===0?(!v.from||v.from===d.fundingSources?.[month]?.[account.id]):!v.mode;
    };
    form.addEventListener("change",update);update();
    const picker=form.querySelector('[name="account"]');if(picker)picker.onchange=()=>funding(accountIds,picker.value);
    host.querySelectorAll("[data-unfund]").forEach(btn=>btn.onclick=async()=>{
      if(!confirm("التراجع عن هذه العملية؟"))return;
      const next=A.clone(d),l=next.fundingLinks.find(x=>x.id===btn.dataset.unfund);
      if(l.owned)A.reverse(next,l.moveId);
      l.unlinked=true;A.audit(next,"unlink-funding",{link:l});
      if(await app.saveState(next))funding(accountIds,account.id);
    });
  }
  function salary() {
    const app=g.FinanceApp, d=app.get(), current=A.today().slice(0,7),
      month=app.period()===current && Number(A.today().slice(8))>=27 ? C.ym(C.idx(current)+1) : app.period();
    const status=A.salaryStatus(d,month), amount=C.income(d,month).salary,
      salaryAccount=d.accounts.find(a=>a.id===d.settings.salaryAccountId) || d.accounts.find(a=>a.role==="bank"),
      defaultMode=!status.confirmed && salaryAccount && A.balance(d,salaryAccount)===0 ? "deposit" : "included";
    dialog("إثبات وصول الراتب إلى حساب الراتب",
      '<p>راتب يوم ٢٧ مخصص لميزانية الشهر التالي. تاريخ الوصول مستقل عن شهر الميزانية.</p>'+
      field("month","شهر الميزانية",month,"month","required")+
      field("date","تاريخ وصول الراتب",A.today(),"date","required")+
      field("amount","مبلغ الراتب المستلم",amount,"number",'min="0.01" step="0.01" required')+
      select("to","حساب الراتب المستلم",d.accounts.filter(a=>a.role==="bank").map(a=>[a.id,a.name+" — الرصيد الحالي "+money(A.balance(d,a))]),d.settings.salaryAccountId)+
      select("mode","أثر إثبات الوصول",[["included","إثبات فقط — الراتب مشمول في الرصيد الحالي"],["deposit","إيداع فعلي — أضف مبلغ الراتب إلى الرصيد"]],defaultMode)+
      '<p id="salary-impact"></p><p id="salary-existing">'+(status.confirmed?"وصول راتب هذا الشهر مثبت بالفعل؛ لن يتكرر.":"لم يتم إثبات وصول الراتب لهذا الشهر من هذا الزر.")+ '</p>'+
      '<label><input type="checkbox" required> تحققت من وصول الراتب واخترت أثره الصحيح على رصيد الحساب.</label>',
      async v=>{const saved=await app.saveState(A.confirmSalary(d,{...v,id:id()}));if(saved) app.navigate("accounts","balances",v.month);return saved;});
    const form=host.querySelector("form");
    const update=()=>{
      const v=Object.fromEntries(new FormData(form)), a=d.accounts.find(x=>x.id===v.to), before=a?A.balance(d,a):0, adding=v.mode==="deposit";
      host.querySelector("#salary-impact").textContent=(adding?"سيزيد الرصيد: ":"سيبقى الرصيد: ")+money(before)+ (adding?" ← "+money(before+(Number(v.amount)||0)):" دون أي إضافة") + (adding && d.openingSalary?.month===v.month?". راجع أنك لم تدخل الرصيد بعد نزول الراتب؛ هذا الخيار يلغي افتراض تضمينه في أرصدة البداية.":"");
      host.querySelector("#salary-existing").textContent=A.salaryStatus(d,v.month).confirmed?"وصول راتب هذا الشهر مثبت بالفعل؛ لن يتكرر.":"راجع المبلغ والتاريخ قبل الاعتماد.";
    };
    form.addEventListener("input",update);form.addEventListener("change",update);update();
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
          "settledStart",
          "freshStart",
          "restoreFreshStart",
        ].includes(action)
      )
        return;
      e.preventDefault();
      e.stopImmediatePropagation();
      try {
        const d = g.FinanceApp.get();
        if (action === "freshStart") freshStart();
        else if (action === "restoreFreshStart") {
          if(confirm("استعادة الأرشيف؟ سيُحفظ السجل الحالي كنسخة قبل الاستعادة.")) g.FinanceApp.restoreFreshStart().catch(err=>alert(err.message));
        }
        else if (action === "settledStart") settledStart();
        else if (action === "planningSettings") planning();
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
                  bankName(a) === bank,
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
  g.FinanceUI = { pay, funding, salary, review, settledStart };
})(window);
