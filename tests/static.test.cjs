const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const root = path.resolve(__dirname, "..");
test("all web JavaScript and inline HTML scripts parse", () => {
  for (const name of fs.readdirSync(root)) {
    if (name.endsWith(".js"))
      new vm.Script(fs.readFileSync(path.join(root, name), "utf8"), {
        filename: name,
      });
    if (name.endsWith(".html")) {
      const html = fs.readFileSync(path.join(root, name), "utf8");
      for (const m of html.matchAll(
        /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g,
      ))
        new vm.Script("(async()=>{" + m[1] + "})()", { filename: name });
    }
  }
});
test("all live script, stylesheet and navigation references resolve", () => {
  for (const name of [
    "index.html",
    "financial-forecast.html",
    "surplus.html",
  ]) {
    const html = fs.readFileSync(path.join(root, name), "utf8");
    for (const m of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
      if (/^(https?:|blob:)/.test(m[1])) continue;
      const target = m[1].split("?")[0];
      if (!target) continue;
      assert.ok(fs.existsSync(path.join(root, target)), name + ": " + target);
    }
  }
});
test("live pages do not invoke obsolete automatic migration or parallel forecast engines", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  for (const old of [
    "finance-meeting-migration.js",
    "meeting-reconcile.js",
    "forecast-engine.js",
    "finance-forecast.js",
    "obligation-forecast-v1.js",
  ])
    assert.ok(!html.includes('src="' + old));
  assert.ok(html.includes("accounting-engine.js?v=3"));
});

test("account confirmation display matches saved funding status with halalas and partial transfers", () => {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, "accounting-engine.js"), "utf8"), context);
  const source = fs.readFileSync(path.join(root, "actual-v1.js"), "utf8");
  const display = source.slice(source.indexOf("  function isAccountConfirmed(a)"), source.indexOf("  function bankGroups()"));
  context.window.Accounting = context.Accounting;
  context.period = "2026-12";
  context.data = {
    accounts: [{ id: "bills" }],
    budget: [0.1, 0.2].map((amount, i) => ({ id: String(i), month: "2026-12", bankAccountId: "bills", amount })),
    moves: [], priorFunding: { "2026-12": { bills: 0.3 } }
  };
  vm.runInContext(display, context);
  assert.equal(vm.runInContext('isAccountConfirmed(data.accounts[0])', context), true);
  context.data.priorFunding["2026-12"].bills = 0.1;
  assert.equal(vm.runInContext('isAccountConfirmed(data.accounts[0])', context), false);
  context.data.moves = [{ id: "transfer", kind: "transfer", amount: 0.2, posted: true }];
  context.data.fundingLinks = [{ month: "2026-12", accountId: "bills", moveId: "transfer" }];
  assert.equal(vm.runInContext('isAccountConfirmed(data.accounts[0])', context), true);
  context.period = "2027-01";
  assert.equal(vm.runInContext('isAccountConfirmed(data.accounts[0])', context), false);
});
