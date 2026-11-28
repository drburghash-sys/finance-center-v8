const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm");
const A = require("../accounting-engine.js");
require("../finance-core.js");
const C = global.FinanceCore;
const fixture = () =>
  A.migrate({
    accounts: [
      { id: "salary", role: "bank", opening: 20000 },
      { id: "bills", role: "bank", opening: 0 },
      { id: "reserve", role: "reserve", opening: 0 },
      { id: "investment", role: "investment", opening: 10000 },
      { id: "emergency-reserve-v1", role: "cash", opening: 0 },
    ],
    debts: [
      { id: "card", kind: "credit", opening: 7000 },
      { id: "card2", kind: "credit", opening: 1300 },
      {
        id: "loan",
        kind: "loan",
        opening: 100000,
        monthlyPayment: 1000,
        lastMonth: "2030-02",
      },
    ],
    moves: [],
    budget: [
      {
        id: "b",
        month: "2026-12",
        amount: 1000,
        type: "expense",
        name: "bill",
        bankAccountId: "bills",
      },
    ],
    commitments: [],
    projects: [],
    legacy: { budgetMonths: { "2026-12": { salary: 10000 } } },
    unknown: { preserve: true },
  });
const move = (id, kind, amount, extra = {}) => ({
  id,
  kind,
  date: "2026-11-26",
  amount,
  posted: true,
  ...extra,
});
const cash = (d) =>
  A.sum(
    d.accounts.filter((x) => x.role !== "investment"),
    (a) => A.balance(d, a),
  );
test("migration preserves unknown fields and is idempotent", () => {
  const d = fixture();
  assert.deepEqual(A.migrate(d), d);
  assert.deepEqual(d.unknown, { preserve: true });
  assert.equal(d.schemaVersion, 3);
});
test("transfer conserves cash; cancellation and repost retain audit", () => {
  const d = fixture(),
    start = cash(d);
  A.post(d, move("t", "transfer", 1000, { from: "salary", to: "bills" }));
  assert.equal(cash(d), start);
  assert.equal(A.balance(d, "bills"), 1000);
  A.reverse(d, "t");
  assert.equal(A.balance(d, "bills"), 0);
  assert.ok(d.moves.find((m) => m.id === "t"));
  A.post(d, move("t2", "transfer", 1000, { from: "salary", to: "bills" }));
  assert.equal(A.balance(d, "bills"), 1000);
  assert.ok(d.ledgerEvents.some((e) => e.type === "reverse"));
});
test("pay from funded account debits that account once", () => {
  const d = fixture();
  A.post(d, move("t", "transfer", 1000, { from: "salary", to: "bills" }));
  A.post(
    d,
    move("e", "expense", 600, {
      from: "bills",
      budgetItemId: "b",
      budgetMonth: "2026-12",
    }),
  );
  assert.equal(A.balance(d, "salary"), 19000);
  assert.equal(A.balance(d, "bills"), 400);
  assert.equal(A.paymentStatus(d, d.budget[0]).rest, 400);
});
test("partial and multiple payments, changed plan leaves posted amount", () => {
  const d = fixture();
  for (const [id, a] of [
    ["p1", 300],
    ["p2", 700],
  ])
    A.post(
      d,
      move(id, "expense", a, {
        from: "salary",
        budgetItemId: "b",
        budgetMonth: "2026-12",
      }),
    );
  assert.equal(A.paymentStatus(d, d.budget[0]).complete, true);
  d.budget[0].amount = 1200;
  assert.equal(A.paymentStatus(d, d.budget[0]).rest, 200);
  assert.equal(d.moves[0].amount, 300);
});
test("savings remain assets and are not external expenses", () => {
  const d = fixture(),
    start = cash(d);
  A.post(d, move("s", "transfer", 1, { from: "salary", to: "reserve" }));
  assert.equal(cash(d), start);
  assert.equal(A.balance(d, "reserve"), 1);
});
test("credit payments, fees, reversal do not affect other card", () => {
  const d = fixture();
  A.post(
    d,
    move("p", "repayment", 5000, {
      from: "salary",
      debtId: "card",
      principal: 5000,
    }),
  );
  assert.equal(A.debtBalance(d, "card"), 2000);
  assert.equal(A.debtBalance(d, "card2"), 1300);
  A.post(d, move("f", "fee", 50, { debtId: "card" }));
  assert.equal(A.debtBalance(d, "card"), 2050);
  A.reverse(d, "p");
  assert.equal(A.debtBalance(d, "card"), 7050);
});
test("loan unknown principal does not reduce principal", () => {
  const d = fixture();
  A.post(
    d,
    move("l", "repayment", 1000, {
      from: "salary",
      debtId: "loan",
      principal: 0,
      principalKnown: false,
    }),
  );
  assert.equal(A.debtBalance(d, "loan"), 100000);
  assert.equal(A.balance(d, "salary"), 19000);
});
test("operation keys and SMS hashes prevent duplicate posting", () => {
  const d = fixture(),
    m = move("x", "expense", 100, {
      from: "salary",
      operationKey: "one",
      smsHashes: ["a"],
    });
  A.post(d, m);
  A.post(d, m);
  assert.equal(d.moves.length, 1);
  assert.throws(() => A.post(d, { ...m, id: "y", operationKey: "two" }));
  assert.equal(d.moves.length, 1);
});
test("validation rejects bad references, dates, NaN, fractions, same account", () => {
  for (const m of [
    move("x", "expense", -1, { from: "salary" }),
    move("x", "expense", 0.001, { from: "salary" }),
    move("x", "expense", 1, { from: "unknown" }),
    move("x", "transfer", 1, { from: "salary", to: "salary" }),
    move("x", "income", 1, { to: "salary", date: "2026-02-30" }),
  ])
    assert.throws(() => A.post(fixture(), m));
  assert.throws(() => A.cents(NaN));
});
for (const reserve of [4999, 5000, 9999, 10000])
  test("split boundary " + reserve, () => {
    const p = C.split(2000, reserve, 52000);
    assert.equal(
      A.cents(p.emergency) + A.cents(p.restore) + A.cents(p.obligations),
      200000,
    );
    assert.ok(p.emergency >= 0 && p.restore >= 0);
  });
test("split crosses thresholds and restoration excess redirects", () => {
  assert.deepEqual(C.split(100, 0, 0), {
    emergency: 100,
    restore: 0,
    obligations: 0,
  });
  assert.deepEqual(C.split(100, 10000, 0), {
    emergency: 10,
    restore: 0,
    obligations: 90,
  });
  const p = C.split(10000, 4999, 10);
  assert.equal(p.restore, 10);
  assert.equal(
    A.cents(p.emergency) + A.cents(p.restore) + A.cents(p.obligations),
    1000000,
  );
});
class Memory {
  constructor(d) {
    this.m = new Map(d ? [[A.KEY, JSON.stringify(d)]] : []);
  }
  getItem(k) {
    return this.m.get(k) ?? null;
  }
  setItem(k, v) {
    if (this.fail && k === A.KEY) throw Error("quota");
    this.m.set(k, v);
  }
}
test("storage conflict rejects stale tab and leaves persisted data intact", () => {
  const memory = new Memory(fixture()),
    a = A.storage(memory),
    b = A.storage(memory),
    da = a.get();
  da.extra = 1;
  a.commit(da);
  assert.throws(() => b.commit(b.get()), /تبويب/);
  assert.equal(JSON.parse(memory.getItem(A.KEY)).extra, 1);
});
test("failed save is atomic and has recoverable pre-save snapshot", () => {
  const memory = new Memory(fixture()),
    a = A.storage(memory),
    raw = memory.getItem(A.KEY),
    d = a.get();
  d.extra = 1;
  memory.fail = true;
  assert.throws(() => a.commit(d));
  assert.equal(memory.getItem(A.KEY), raw);
  assert.equal(a.get().extra, undefined);
});
test("corrupt backup never overwrites valid state", () => {
  const memory = new Memory(fixture()),
    s = A.storage(memory),
    raw = memory.getItem(A.KEY);
  assert.throws(() => s.replace({ accounts: [] }));
  assert.equal(memory.getItem(A.KEY), raw);
  memory.m.set(A.KEY, "{bad");
  assert.throws(() => A.storage(memory));
});
test("round trip all arrays and unknown fields", () => {
  const d = fixture(),
    memory = new Memory(d),
    s = A.storage(memory),
    next = s.replace(JSON.parse(JSON.stringify(d)));
  assert.deepEqual(next, d);
});
test("legacy editor deletion retains original and reverse audit", () => {
  const d = fixture();
  A.post(d, move("x", "expense", 10, { from: "salary" }));
  const next = A.clone(d);
  next.moves = [];
  A.reconcileChanges(d, next);
  assert.equal(next.moves.length, 1);
  assert.equal(next.moves[0].posted, false);
  assert.equal(A.balance(next, "salary"), 20000);
});
test("independent bank move survives unlink", () => {
  const d = fixture();
  A.post(d, move("x", "expense", 10, { from: "salary" }));
  A.link(d, "x", "b", "2026-12");
  delete d.moves[0].budgetItemId;
  assert.equal(A.balance(d, "salary"), 19990);
  assert.equal(d.moves.length, 1);
});
test("salary expected settings never post; received salary excluded from projected cash", () => {
  const d = fixture();
  d.settings.salary.day = 28;
  A.post(
    d,
    move("salary-paid", "income", 10000, {
      to: "salary",
      budgetMonth: "2026-12",
      category: "راتب",
    }),
  );
  const r = C.simulate(d, { start: "2026-12", months: 1 });
  assert.equal(r.rows[0].received, 10000);
  assert.equal(r.rows[0].flow, -1000);
  assert.equal(d.moves.length, 1);
});
test("loan schedule end, retirement and goal intervals", () => {
  const d = fixture();
  d.budget[0].financialCategory = "loan";
  d.retirement = { retirement: "2031-12", pension: 5000 };
  d.commitments = [
    {
      id: "school",
      name: "school",
      amount: 7500,
      firstMonth: "2027-09",
      count: 3,
      interval: 6,
      useObligations: true,
    },
    {
      id: "car",
      name: "سيارة ثانية",
      amount: 2500,
      firstMonth: "2028-12",
      count: 40,
      interval: 1,
      useObligations: false,
    },
  ];
  assert.equal(C.month(d, "2030-02", true).loan, 1000);
  assert.equal(C.month(d, "2030-03", true).loan, 0);
  assert.equal(C.month(d, "2031-12", true).income, 5000);
  assert.equal(C.events(d, "2028-03")[0].amount, 7500);
  assert.equal(
    C.events(d, "2032-03").some((e) => e.car),
    true,
  );
  assert.equal(
    C.events(d, "2032-04").some((e) => e.car),
    false,
  );
});
test("surplus deficit remains negative; emergency spending not deducted twice", () => {
  const d = fixture();
  d.budget[0].amount = 11000;
  assert.equal(C.surplus(d, "2026-12").surplus, -1000);
  A.post(
    d,
    move("e", "expense", 100, {
      from: "emergency-reserve-v1",
      budgetMonth: "2026-12",
    }),
  );
  assert.equal(C.surplus(d, "2026-12").surplus, -1000);
});
test("project optional scenario never posts and custom goals can change", () => {
  const d = fixture();
  d.projects.push({
    id: "p",
    name: "p",
    forecastEnabled: true,
    profitStart: "2027-01",
    profitInterval: 1,
    expectedNetProfit: 200,
    profitToObligations: 100,
  });
  const a = C.simulate(d, { start: "2027-01", months: 1 }),
    b = C.simulate(d, { start: "2027-01", months: 1, projects: true });
  assert.equal(b.rows[0].income - a.rows[0].income, 200);
  assert.equal(d.moves.length, 0);
});
test("same operation key with changed amount is a conflict", () => {
  const d = fixture();
  A.post(d, move("x", "expense", 10, { from: "salary", operationKey: "k" }));
  assert.throws(() =>
    A.post(d, move("y", "expense", 11, { from: "salary", operationKey: "k" })),
  );
});
test("surplus restoration to emergency cannot be subtracted twice", () => {
  const d = fixture();
  A.post(
    d,
    move("x", "transfer", 100, {
      from: "salary",
      to: "emergency-reserve-v1",
      budgetMonth: "2026-12",
      purpose: "restore",
    }),
  );
  const p = C.surplus(d, "2026-12");
  assert.equal(p.executed, 100);
  assert.equal(p.deposits, 0);
  assert.equal(p.surplus, 8900);
});
test("planned payment already posted affects monthly plan once and residual cash once", () => {
  const d = fixture();
  A.post(
    d,
    move("x", "expense", 400, {
      from: "salary",
      budgetMonth: "2026-12",
      budgetItemId: "b",
    }),
  );
  const r = C.simulate(d, { start: "2026-12", months: 1 }).rows[0];
  assert.equal(r.net, 9000);
  assert.equal(r.flow, 9400);
  assert.equal(r.cash, 29000);
});
test("custom investment assumptions stay separate and never post", () => {
  const d = fixture();
  d.retirement = {
    salary: 10000,
    pension: 5000,
    annualReturn: 12,
    profitMode: "withdraw",
    annualInflation: 10,
    during: { visa: 0, restore: 100, invest: 50, obligations: 100 },
    after: { visa: 0, restore: 0, invest: 50, obligations: 100 },
  };
  const a = C.simulate(d, { start: "2027-01", months: 2 }),
    b = C.simulate(d, { start: "2027-01", months: 2, custom: true });
  assert.notEqual(b.rows[1].cash, a.rows[1].cash);
  assert.equal(d.moves.length, 0);
});
test("budget and forecast share month data and reserve excludes emergency", () => {
  const d = fixture();
  d.accounts.find((x) => x.id === "emergency-reserve-v1").opening = 999;
  const r = C.simulate(d, { start: "2026-12", months: 1 }).rows[0];
  assert.equal(r.v.planned, C.month(d, "2026-12", true).planned);
  assert.equal(r.emergency, 999);
  assert.equal(r.cash, 29000);
});
test("loan expiry second schedule inclusive, direct car and school use correct pools", () => {
  const d = fixture();
  d.debts.push({
    id: "loan2",
    kind: "loan",
    opening: 100000,
    monthlyPayment: 3856,
    lastMonth: "2036-08",
  });
  d.budget[0].financialCategory = "loan";
  assert.equal(C.month(d, "2036-08", true).loan, 3856);
  assert.equal(C.month(d, "2036-09", true).loan, 0);
  d.commitments = [
    {
      id: "school",
      name: "school",
      firstMonth: "2027-01",
      count: 1,
      interval: 1,
      amount: 100,
      useObligations: true,
    },
    {
      id: "car",
      sourceId: "car",
      name: "car",
      firstMonth: "2027-01",
      count: 1,
      interval: 1,
      amount: 200,
      useObligations: false,
    },
  ];
  const row = C.month(d, "2027-01", true);
  assert.equal(row.reserveDue, 100);
  assert.equal(row.car, 200);
});
test("historical moves excluded from all balances", () => {
  const d = fixture();
  d.moves.push(
    move("old", "expense", 10000, {
      from: "salary",
      importedHistory: true,
      posted: false,
    }),
  );
  assert.equal(A.balance(d, "salary"), 20000);
});
test("budget link requires matching financial operation", () => {
  const d = fixture();
  d.budget[0].type = "debt";
  assert.throws(() =>
    A.post(
      d,
      move("x", "expense", 100, {
        from: "salary",
        budgetMonth: "2026-12",
        budgetItemId: "b",
      }),
    ),
  );
});
test("linked repayment protects its independent bank evidence", () => {
  const d = fixture();
  A.post(d, move("e", "expense", 100, { from: "salary" }));
  A.post(
    d,
    move("r", "repayment", 100, {
      debtId: "card",
      principal: 100,
      bankAlreadyPosted: true,
      cashEvidenceId: "e",
    }),
  );
  const next = A.clone(d);
  A.reverse(next, "e");
  assert.throws(() => A.reconcileChanges(d, next));
  assert.equal(A.balance(d, "salary"), 19900);
});
test("policy scenario earmarks surplus without inventing actual transactions", () => {
  const d = fixture();
  const a = C.simulate(d, { start: "2026-12", months: 1 }),
    b = C.simulate(d, { start: "2026-12", months: 1, distribute: true });
  const x = b.rows[0];
  assert.equal(x.toEmergency, 7800);
  assert.equal(x.toRestore, 1200);
  assert.equal(
    x.cash + x.emergency + x.portfolio + x.reserve,
    a.rows[0].cash +
      a.rows[0].emergency +
      a.rows[0].portfolio +
      a.rows[0].reserve,
  );
  assert.equal(d.moves.length, 0);
});
function grouped() {
  const d = fixture();
  d.budget[0] = {
    id: "b",
    month: "2026-12",
    amount: 3500,
    type: "debt",
    name: "قروض",
    bankAccountId: "bills",
  };
  d.debts.push({
    id: "loan2",
    kind: "loan",
    opening: 200000,
    monthlyPayment: 2500,
    lastMonth: "2036-08",
  });
  return d;
}
function groupRequest() {
  return {
    itemId: "b",
    from: "salary",
    date: "2026-11-26",
    operationKey: "batch",
    payments: [
      { id: "p1", debtId: "loan", amount: 1000, principal: "" },
      { id: "p2", debtId: "loan2", amount: 2500, principal: "" },
    ],
  };
}
test("combined loan confirmation splits cash correctly and preserves unknown principal", () => {
  const d = grouped(),
    next = A.payLoanGroup(d, groupRequest());
  assert.equal(A.balance(next, "salary"), 16500);
  assert.equal(A.balance(next, "bills"), 0);
  assert.equal(next.moves.length, 2);
  assert.equal(A.debtBalance(next, "loan"), 100000);
  assert.equal(A.debtBalance(next, "loan2"), 200000);
  assert.equal(A.paymentStatus(next, next.budget[0]).paid, 3500);
  assert.equal(next.budget[0].bankAccountId, "salary");
  assert.equal(d.moves.length, 0);
  assert.throws(() => A.payLoanGroup(next, groupRequest()));
});
test("loan group failures are atomic and reject credit cards", () => {
  const d = grouped(),
    r = groupRequest();
  r.payments[1].amount = 3000;
  assert.throws(() => A.payLoanGroup(d, r));
  assert.equal(d.moves.length, 0);
  r.payments[1].debtId = "card";
  assert.throws(() => A.payLoanGroup(d, r));
});
test("loan group partial, independent linking and reversal leave other loan intact", () => {
  let d = grouped();
  A.post(d, {
    id: "old",
    kind: "repayment",
    date: "2026-11-26",
    budgetMonth: "2026-12",
    amount: 1000,
    principal: 0,
    from: "salary",
    debtId: "loan",
    posted: true,
  });
  const r = groupRequest();
  r.payments[0].existing = "old";
  r.payments[1].amount = 500;
  d = A.payLoanGroup(d, r);
  assert.equal(d.moves.length, 2);
  assert.equal(A.loanInstallments(d, d.budget[0])[1].due, 2000);
  A.reverse(d, "p2");
  assert.equal(A.loanInstallments(d, d.budget[0])[0].due, 0);
  assert.equal(A.loanInstallments(d, d.budget[0])[1].due, 2500);
  assert.equal(d.moves.find((x) => x.id === "old").posted, true);
});

test("settled opening reconciles assets and debts without inventing transactions", () => {
  const d = fixture(), original = JSON.stringify(d);
  const r = {month:"2026-12",date:"2026-11-28",salaryReceived:10000,
    accounts:Object.fromEntries(d.accounts.map(a=>[a.id,a.id==="salary"?1250:0])),
    debts:Object.fromEntries(d.debts.map(a=>[a.id,900])),installments:{loan:950},paidItems:["b"]};
  const next=A.settledStart(d,r);
  assert.equal(JSON.stringify(d),original);
  assert.deepEqual(next.moves,d.moves);
  assert.equal(A.balance(next,"salary"),1250);
  assert.equal(A.debtBalance(next,"card"),900);
  assert.equal(next.debts.find(x=>x.id==="loan").monthlyPayment,950);
  assert.equal(A.paymentStatus(next,next.budget[0]).rest,0);
  assert.equal(next.settledStarts["2026-12"].closed,false);
  assert.throws(()=>A.settledStart(next,r));
  assert.throws(()=>A.post(next,move("duplicate","expense",1000,{from:"salary",budgetMonth:"2026-12",budgetItemId:"b"})));
  assert.throws(()=>A.post(next,move("salaryagain","income",10000,{to:"salary",budgetMonth:"2026-12",category:"راتب"})));
  const row=C.simulate(next,{start:"2026-12",months:1}).rows[0];
  assert.equal(row.cash,1250);
  A.post(next,move("daily","expense",25,{from:"salary"}));
  assert.equal(A.balance(next,"salary"),1225);
  assert.equal(A.debtBalance(A.migrate(JSON.parse(JSON.stringify(next))),"card"),900);
});

test("settled opening accounts for existing payments and keeps new income separate",()=>{
  const d=fixture();
  A.post(d,move("part","expense",400,{from:"salary",budgetMonth:"2026-12",budgetItemId:"b"}));
  A.post(d,move("salaryold","income",10000,{to:"salary",budgetMonth:"2026-12",category:"راتب"}));
  const r={month:"2026-12",date:"2026-11-28",salaryReceived:10000,
    accounts:Object.fromEntries(d.accounts.map(a=>[a.id,a.id==="salary"?1500:0])),
    debts:Object.fromEntries(d.debts.map(a=>[a.id,1000])),installments:{loan:1000},paidItems:["b"]};
  const n=A.settledStart(d,r);
  assert.equal(A.paymentStatus(n,n.budget[0]).paid,1000);
  assert.equal(n.settledStarts["2026-12"].items.b.paid,600);
  assert.equal(C.simulate(n,{start:"2026-12",months:1}).rows[0].cash,1500);
  A.post(n,move("extra","income",200,{to:"salary",budgetMonth:"2026-12"}));
  assert.equal(C.simulate(n,{start:"2026-12",months:1}).rows[0].cash,1500);
  assert.equal(A.balance(n,"salary"),1700);
  const bad=structuredClone(r);delete bad.accounts.bills;
  assert.throws(()=>A.settledStart(d,bad));
});

test("legacy migration never rewrites the amount of an old visa payment",()=>{
  const d=fixture();delete d.schemaVersion;
  d.budget=[{id:"v",name:"فيزا",month:"2026-12",type:"debt",amount:5000}];
  d.moves=[move("budget-visa-v","repayment",2000,{source:"budget-visa",from:"salary",debtId:"card",principal:2000,budgetMonth:"2026-12"})];
  assert.equal(A.migrate(d).moves[0].amount,2000);
});

test("settled opening stores a dedicated rollback copy and rejects bypassed duplicate payments",()=>{
  const d=fixture(), r={month:"2026-12",date:"2026-11-28",salaryReceived:10000,
    accounts:Object.fromEntries(d.accounts.map(a=>[a.id,A.balance(d,a)])),
    debts:Object.fromEntries(d.debts.map(a=>[a.id,A.debtBalance(d,a)])),installments:{loan:1000},paidItems:["b"]};
  const mem=new Map([[A.KEY,JSON.stringify(d)]]);
  const storage={getItem:k=>mem.get(k)||null,setItem:(k,v)=>mem.set(k,v)};
  const st=A.storage(storage);st.commit(A.settledStart(st.get(),r));
  assert.equal(mem.get(A.KEY+"_before_settled_start_2026-12"),JSON.stringify(d));
  const bad=st.get();bad.moves.push(move("bypass","expense",1000,{from:"salary",budgetItemId:"b",budgetMonth:"2026-12"}));
  assert.throws(()=>st.commit(bad));
  assert.equal(st.get().moves.length,0);
});

test("fresh December archives exact old document and zeros all actual balances",()=>{
  const d=fixture();d.budget.push({...d.budget[0],id:"old",month:"2026-11"});
  A.post(d,move("oldmove","expense",100,{from:"salary"}));
  d.settledStarts={};d.priorPayments=[];d.surplusPlans={"2026-11":{closed:true}};
  const saved=JSON.stringify(d),mem=new Map([[A.KEY,saved]]);
  const st=A.storage({getItem:k=>mem.get(k)||null,setItem:(k,v)=>mem.set(k,v)});
  const n=st.freshStart("2026-12");
  assert.equal(mem.get(A.KEY+"_before_fresh_start"),saved);
  assert.equal(n.moves.length,0);assert.equal(n.budget.length,1);
  for(const a of n.accounts)assert.equal(A.balance(n,a),0);
  for(const a of n.debts)assert.equal(A.debtBalance(n,a),0);
  assert.equal(n.trackingStartMonth,"2026-12");
  assert.equal(n.openingSalary.amount,10000);
  assert.throws(()=>st.freshStart("2026-12"));
  st.replace(JSON.parse(mem.get(A.KEY+"_before_fresh_start")));
  assert.deepEqual(st.get(),d);
});

test("fresh start archive failure never overwrites active data",()=>{
  const d=fixture(),raw=JSON.stringify(d);let persisted=raw;
  const st=A.storage({getItem:()=>persisted,setItem:(k,v)=>{if(k!==A.KEY)throw Error("quota");persisted=v;}});
  assert.throws(()=>st.freshStart("2026-12"));assert.equal(persisted,raw);
});

test("skip receiver debits source only, settles expense once and reverses correctly",()=>{
  const d=fixture(),r={id:"direct",month:"2026-12",accountId:"bills",from:"salary",date:"2026-11-28",payments:[{itemId:"b"}]};
  const n=A.externalFunding(d,r);
  assert.equal(A.balance(n,"salary"),19000);assert.equal(A.balance(n,"bills"),0);
  assert.equal(A.paymentStatus(n,n.budget[0]).paid,1000);
  assert.equal(d.moves.length,0);assert.throws(()=>A.externalFunding(n,{...r,id:"repeat"}));
  A.reverse(n,n.moves[0].id);assert.equal(A.balance(n,"salary"),20000);
  assert.equal(A.paymentStatus(n,n.budget[0]).paid,0);
  const poor=structuredClone(d);poor.accounts[0].opening=10;
  assert.throws(()=>A.externalFunding(poor,r));assert.equal(poor.moves.length,0);
});

test("already paid acknowledgement has no cash or debt effect and rejects repetition",()=>{
  const d=fixture();const r={id:"prior",itemId:"b",amount:1000,date:"2026-11-28"};
  const n=A.acknowledgePaid(d,r);
  assert.equal(A.balance(n,"salary"),20000);assert.equal(A.balance(n,"bills"),0);
  assert.equal(n.moves.length,0);assert.equal(A.paymentStatus(n,n.budget[0]).rest,0);
  assert.throws(()=>A.acknowledgePaid(n,{...r,id:"repeat"}));
});

test("skip receiver supports grouped loans and selected visa without crediting receiver",()=>{
  const d=fixture();d.budget=[{id:"loans",name:"قروض",type:"debt",financialCategory:"loan",month:"2026-12",amount:1000,bankAccountId:"bills"},{id:"visa",name:"فيزا",type:"debt",financialCategory:"visa",month:"2026-12",amount:500,bankAccountId:"bills"}];
  const n=A.externalFunding(d,{id:"debtbatch",month:"2026-12",date:"2026-11-28",accountId:"bills",from:"salary",payments:[{itemId:"loans"},{itemId:"visa",debtId:"card"}]});
  assert.equal(A.balance(n,"salary"),18500);assert.equal(A.balance(n,"bills"),0);
  assert.equal(A.debtBalance(n,"loan"),100000);assert.equal(A.debtBalance(n,"card"),6500);
  assert.equal(A.accountFor(n,n.budget[0]).id,"bills");
  assert.equal(A.paymentStatus(n,n.budget[0]).rest,0);assert.equal(A.paymentStatus(n,n.budget[1]).rest,0);
  const prior=A.acknowledgePaid(d,{id:"pastloan",date:"2026-11-28",itemId:"loans",amount:1000});
  assert.equal(A.loanInstallments(prior,prior.budget[0])[0].due,0);
});

test("salary arrival deposit raises chosen account once and consumes startup assumption",()=>{
  const original=fixture(),d=A.freshStart(original,"2026-12");
  const r={id:"arrival",month:"2026-12",date:"2026-11-28",amount:10000,to:"salary",mode:"deposit"};
  const n=A.confirmSalary(d,r);
  assert.equal(A.balance(n,"salary"),10000);assert.equal(A.balance(n,"bills"),0);
  assert.equal(A.salaryStatus(n,"2026-12").confirmed,true);assert.equal(n.openingSalary,undefined);
  assert.throws(()=>A.confirmSalary(n,{...r,id:"again"}));
  assert.throws(()=>A.post(n,move("smsagain","income",10000,{to:"salary",budgetMonth:"2026-12",category:"راتب"})));
  assert.equal(C.simulate(n,{start:"2026-12",months:1}).rows[0].cash,9000);
  assert.equal(A.balance(d,"salary"),0);
  A.reverse(n,"arrival");assert.equal(A.salaryStatus(n,"2026-12").confirmed,false);
  const rerecorded=A.confirmSalary(n,{...r,id:"rereceived"});assert.equal(A.balance(rerecorded,"salary"),10000);
});

test("salary included acknowledgement leaves balance intact and prevents a future duplicate",()=>{
  const d=fixture();const r={id:"proof",month:"2026-12",date:"2026-11-28",amount:10000,to:"salary",mode:"included"};
  const n=A.confirmSalary(d,r);assert.equal(A.balance(n,"salary"),20000);assert.equal(n.moves.length,0);
  assert.equal(C.simulate(n,{start:"2026-12",months:1}).rows[0].cash,19000);
  assert.throws(()=>A.confirmSalary(n,{...r,mode:"deposit"}));
  assert.throws(()=>A.confirmSalary(d,{...r,to:"missing"}));
  assert.throws(()=>A.confirmSalary(d,{...r,date:"2026-02-30"}));
  A.post(d,move("existing","income",10000,{to:"salary",budgetMonth:"2026-12",category:"راتب"}));
  assert.throws(()=>A.confirmSalary(d,r));
});
