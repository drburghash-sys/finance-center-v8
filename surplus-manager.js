(function (g) {
  "use strict";
  g.SurplusManager = {
    split: (...args) => g.FinanceCore.split(...args),
    balance: (...args) => g.Accounting.balance(...args),
    id: "emergency-reserve-v1",
  };
})(globalThis);
