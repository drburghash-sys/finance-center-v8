(function (g) {
  "use strict";
  const C = g.FinanceCore,
    A = g.Accounting,
    old = g.RetirementApp;
  const esc = (x) =>
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
    fmt = (x) =>
      Number(x).toLocaleString("ar-SA", { maximumFractionDigits: 2 });
  function chart(rows, keys) {
    const max = Math.max(
      1,
      ...rows.flatMap((r) => keys.map((k) => Math.abs(r[k]))),
    );
    return (
      '<div class="retire-chart">' +
      rows
        .map(
          (r) =>
            '<div class="retire-column-group"><div class="retire-columns">' +
            keys
              .map(
                (k, i) =>
                  '<div class="retire-rect" style="height:' +
                  Math.max(1, (Math.abs(r[k]) * 100) / max) +
                  "%;background:" +
                  (r[k] < 0
                    ? "#bf3e55"
                    : ["#406bdf", "#9473d8", "#e7ad39"][i % 3]) +
                  '" title="' +
                  esc(r.month + " " + k + " " + fmt(r[k])) +
                  '"></div>',
              )
              .join("") +
            '</div><span class="retire-axis-label">' +
            esc(r.month) +
            "</span></div>",
        )
        .join("") +
      "</div>"
    );
  }
  function view(d, opts = {}) {
    const r = C.simulate(d, opts),
      sample = r.rows.filter((x, i) => i % 12 === 0 || i === r.rows.length - 1),
      first = r.rows[0];
    return (
      '<section class="panel"><h2>التوقعات والتقاعد — المحرك الموحد</h2><p>تبدأ ' +
      esc(first?.month) +
      " • التقاعد " +
      esc(d.retirement?.retirement || "2031-12") +
      " • " +
      (opts.projects
        ? "سيناريو يشمل المشاريع الاختيارية"
        : "الأساسي دون أرباح مشاريع افتراضية") +
      '</p><div class="metrics">' +
      [
        ["أول عجز شهري", r.firstMonthly || "لا يوجد"],
        ["أول عجز نقد حر", r.firstCash || "لا يوجد"],
        ["أول عجز التزامات", r.firstReserve || "لا يوجد"],
      ]
        .map(
          ([a, b]) =>
            '<div class="metric"><span>' +
            a +
            "</span><strong>" +
            b +
            "</strong></div>",
        )
        .join("") +
      '</div><p>النقد الحر يستبعد الطوارئ والالتزامات والاستثمارات. الفائض الشهري يختلف عن رصيد البنك؛ الإيداعات المسجلة لشهر الميزانية لا تتكرر.</p></section><section class="panel"><h2>الدخل والميزانية</h2><p>أزرق: الدخل • بنفسجي: مخصصات الميزانية</p>' +
      chart(sample, ["income", "planned"]) +
      '</section><section class="panel"><h2>السيولة والالتزامات والمحفظة</h2><p>أزرق: نقد حر • بنفسجي: المحفظة • أصفر: الالتزامات</p>' +
      chart(sample, ["cash", "portfolio", "reserve"]) +
      '</section><section class="panel"><h2>الفيزا واستعادة دراهم</h2><p>أزرق: الفيزا • بنفسجي: المتبقي للاستعادة</p>' +
      chart(sample, ["visa", "remaining"]) +
      '</section><section class="panel"><h2>المخصصات الشهرية</h2><p>أزرق: القروض • بنفسجي: الفيزا • أصفر: الاستثمار</p>' +
      chart(sample, ["loanPayment", "payVisa", "invest"]) +
      '</section><section class="panel"><h2>التفصيل الشهري</h2><label>السنة <select id="unifiedYear"><option value="">الكل</option>' +
      [...new Set(r.rows.map((x) => x.month.slice(0, 4)))]
        .map((y) => "<option>" + y + "</option>")
        .join("") +
      '</select></label><div class="table-scroll"><table class="unified-table"><thead><tr>' +
      [
        "الشهر",
        "الدخل",
        "المخصصات",
        "المضاف من الراتب بعد المسجل",
        "صافي متوقع",
        "نقد حر",
        "الالتزامات",
        "فيزا",
        "دراهم",
      ]
        .map((x) => "<th>" + x + "</th>")
        .join("") +
      "</tr></thead><tbody>" +
      r.rows
        .map(
          (x) =>
            '<tr data-month="' +
            x.month +
            '"><td>' +
            x.month +
            (x.retired ? " تقاعد" : "") +
            "</td>" +
            [
              x.income,
              x.planned,
              x.income - x.received,
              x.net,
              x.cash,
              x.reserve,
              x.visa,
              x.portfolio,
            ]
              .map(
                (v) =>
                  '<td class="' +
                  (v < 0 ? "negative" : "") +
                  '">' +
                  fmt(v) +
                  "</td>",
              )
              .join("") +
            "</tr>",
        )
        .join("") +
      '</tbody></table></div></section><section class="panel"><h2>الافتراضات</h2>' +
      r.warnings.map((x) => "<p>" + esc(x) + "</p>").join("") +
      "<p>قواعد الاستمرار للشهور غير المحفوظة قابلة للتعديل في إعدادات التخطيط. اختبار الضغط والمشاريع والتقسيم اليدوي سيناريوهات مستقلة.</p></section>"
    );
  }
  const controls = () =>
    '<section class="panel"><label>السيناريو <select id="unifiedScenario"><option value="base">الأساسي</option><option value="policy">مع سياسة توزيع الفائض المخطط</option><option value="stress">ضغط المعيشة +١٠٪</option><option value="projects">مع أرباح المشاريع الاختيارية</option><option value="custom">الافتراضات والتقسيم اليدوي المحفوظ</option></select></label></section><div id="unifiedResults"></div>';
  function render(d, sub) {
    if (sub === "charts") return controls() + view(d);
    if (sub === "allocations")
      return (
        '<button class="button primary" data-action="planningSettings">قواعد الخطة الأساسية</button><p class="body-note">تقسيمك اليدوي محفوظ لسيناريو مستقل. الخطة الأساسية من الميزانية والقروض والالتزامات؛ اختَر «الافتراضات والتقسيم اليدوي» للمقارنة.</p>' +
        old.render(d, sub)
      );
    return old.render(d, sub);
  }
  g.RetirementApp = {
    ...old,
    render,
    simulate: (d, opts) => C.simulate(d, opts),
  };
  g.ObligationForecast = {
    view: (d) => controls() + view(d),
    summary: (d) => {
      const r = C.simulate(d);
      return (
        '<section class="panel"><h2>تغطية الالتزامات من المحرك الموحد</h2><p>أول عجز: ' +
        esc(r.firstReserve || "لا يوجد ضمن المدة") +
        '</p><button class="button primary" data-action="showObligationForecast">عرض التفاصيل والسيناريوهات</button></section>'
      );
    },
  };
  document.addEventListener("change", (e) => {
    if (e.target.id === "unifiedYear") {
      document
        .querySelectorAll(".unified-table tbody tr")
        .forEach(
          (row) =>
            (row.hidden =
              !!e.target.value &&
              !row.dataset.month.startsWith(e.target.value)),
        );
      return;
    }
    if (e.target.id !== "unifiedScenario") return;
    const d = g.FinanceApp?.get() || g.ForecastData,
      opts = {
        stress: e.target.value === "stress" ? 10 : 0,
        projects: e.target.value === "projects",
        custom: e.target.value === "custom",
        distribute: e.target.value === "policy",
      };
    document.getElementById("unifiedResults").innerHTML = view(d, opts);
    let next = document.getElementById("unifiedResults").nextElementSibling;
    while (next) {
      const n = next.nextElementSibling;
      next.remove();
      next = n;
    }
  });
  g.UnifiedForecastUI = { view, controls, chart };
})(window);
