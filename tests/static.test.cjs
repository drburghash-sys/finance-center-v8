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
