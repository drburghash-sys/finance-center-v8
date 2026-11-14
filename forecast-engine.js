
/* Finance Future Planner — deterministic monthly financial scenario engine. No external services. */
const FinanceEngine = (() => {
  const EPS = 1e-7;
  const n = (v) => Math.max(0, Number(v) || 0);
  const raw = (v) => Number(v) || 0;
  const ymi = (s) => { const [y,m] = String(s || '2026-12').split('-').map(Number); return (y*12)+(m-1); };
  const ym = (v) => { const y = Math.floor(v/12), m = (v%12)+1; return `${y}-${String(m).padStart(2,'0')}`; };
  const defaultPlan = () => ({
    version: 1,
    updated: '2026-11-12',
    settings: {start:'2026-12', months:120, retirement:'2031-12',salary:0,pension:0,
      monthlyExpenses:0, openingCash:0,openingObligations:0,monthlyObligationsSaving:0,inflation:3,salaryGrowth:0,projectIncome:0,projectIncomeStart:'2031-01',
      fallbackLoanInstallments:0, fallbackLoanEnd:'2031-11'},
    loans: [
      {id:'loan1',name:'القرض البنكي الأول',balance:0,apr:0,payment:0,extra:0},
      {id:'loan2',name:'القرض البنكي الثاني',balance:0,apr:0,payment:0,extra:0}
    ],
    visa: {v1:0,v2:0,newMonthly:0,purchaseShare1:100,monthlyFees:0,apr:0,
      paymentPool:0,strategy:'parallel',visaDuring:0,visaAfter:0},
    darahim: {restoreTarget:0,alreadyRestored:0,newInvestment:0,currentPortfolio:0,annualNetReturn:6,incomeTargetLow:3000,incomeTargetHigh:5000,profitMode:'reinvest',profitReinvestEvery:6,profitEntries:[]},
    goals: [
      {id:'car',name:'شراء سيارة ثانية',date:'2027-11',amount:0,count:1,interval:12,enabled:true},
      {id:'jana',name:'رسوم الابنة الأولى',date:'2027-09',amount:0,count:2,interval:12,enabled:true},
      {id:'jumana',name:'رسوم الابنة الثانية',date:'2027-09',amount:0,count:3,interval:12,enabled:true},
      {id:'hikmah',name:'رسوم الابنة الثالثة',date:'2030-09',amount:0,count:1,interval:12,enabled:true},
      {id:'rayan',name:'زواج أحد الأبناء',date:'2030-06',amount:0,count:1,interval:12,enabled:true},
      {id:'building',name:'بناء الأرض',date:'2029-01',amount:0,count:1,interval:12,enabled:true},
      {id:'project',name:'رأس مال المشاريع',date:'2030-01',amount:0,count:1,interval:12,enabled:true}
    ]
  });
  const copy = o => JSON.parse(JSON.stringify(o));
  function normalized(user) {
    const d=defaultPlan(), p=copy(user && typeof user==='object'?user:d);
    p.settings={...d.settings,...(p.settings||{})};p.visa={...d.visa,...(p.visa||{})};p.darahim={...d.darahim,...(p.darahim||{})};
    p.loans=Array.isArray(p.loans)?p.loans:d.loans;
    p.goals=(Array.isArray(p.goals)?p.goals:d.goals).map(g=>({...g,
      paymentMode:['once','monthly','periodic'].includes(g.paymentMode)?g.paymentMode:(Number(g.count)<=1?'once':Number(g.interval)===1?'monthly':'periodic'),
      useObligations:typeof g.useObligations==='boolean'?g.useObligations:/مدرس|تعليم|رسوم|سيار|صيان|مركب|vehicle/i.test(String(g.name||''))||['car','jana','jumana','hikmah'].includes(g.id)
    }));
    if(!Array.isArray(p.darahim.profitEntries))p.darahim.profitEntries=[];
    if(!['reinvest','accumulate','withdraw'].includes(p.darahim.profitMode))p.darahim.profitMode='reinvest';
    p.settings.months=Math.max(12,Math.min(240,Math.round(n(p.settings.months)||120)));
    return p;
  }
  function eventsOf(goals, start) {
    const arr=[];
    for (const g of goals) {
      if(!g.enabled || !(n(g.amount)>0))continue;
      const mode=g.paymentMode||((Number(g.count)||1)<=1?'once':Number(g.interval)===1?'monthly':'periodic');
      const repeat=mode==='once'?1:Math.min(240,Math.max(1,Math.floor(n(g.count)||1))), interval=mode==='monthly'?1:mode==='once'?12:Math.max(1,Math.floor(n(g.interval)||12));
      for(let k=0;k<repeat;k++){
        const when=ymi(g.date)+k*interval;
        if (when<start) continue;
        arr.push({id:`${g.id}-${k}`,goalId:g.id,name:g.name,when,amount:n(g.amount),useObligations:!!g.useObligations,funded:0,fromObligations:0,paid:0,uncovered:0});
      }
    }
    return arr.sort((a,b)=>a.when-b.when);
  }
  function simulate(input){
    const p=normalized(input), s=p.settings, v=p.visa, d=p.darahim;
    const start=ymi(s.start),retire=ymi(s.retirement),endLoan=ymi(s.fallbackLoanEnd),projectStart=ymi(s.projectIncomeStart);
    let c1=n(v.v1),c2=n(v.v2), restoreLeft=Math.max(0,n(d.restoreTarget)-n(d.alreadyRestored));
    let portfolio=n(d.currentPortfolio),cash=raw(s.openingCash),obligationReserve=n(s.openingObligations),totalUncovered=0,visaPeak=c1+c2;
    let totalObligationTransferred=0,totalObligationSpent=0,totalMissedObligationSaving=0;
    let profitReserve=0,totalProfit=0,totalProfitReinvested=0,totalProfitWithdrawn=0;
    const events=eventsOf(p.goals,start),loans=(p.loans||[]).map(l=>({...l,remaining:n(l.balance)}));
    const useExplicit=loans.some(l=>n(l.balance)>EPS && n(l.payment)>EPS);
    const initialVisa=c1+c2,rows=[],warnings=[];
    let visaCleared=null,restoreCompleted=restoreLeft<EPS?ym(start):null, loanCleared=null;
    for(let i=0;i<s.months;i++){
      const tick=start+i, month=ym(tick),years=i/12;
      const retired=tick>=retire;
      const income=(retired?n(s.pension):n(s.salary)*Math.pow(1+n(s.salaryGrowth)/100,years)) +
        (tick>=projectStart?n(s.projectIncome):0);
      const living=n(s.monthlyExpenses)*Math.pow(1+n(s.inflation)/100,years);
      let loanPayment=0,loanInterest=0,loanRemain=0;
      if(useExplicit){
        for(const loan of loans){
          if(loan.remaining<=EPS)continue;
          const interest=loan.remaining*n(loan.apr)/1200;
          loanInterest+=interest;
          let due=loan.remaining+interest;
          const paid=Math.min(due,n(loan.payment)+n(loan.extra));
          loan.remaining=Math.max(0,due-paid);
          loanPayment+=paid;
          loanRemain+=loan.remaining;
        }
        if (loanRemain<EPS && loanCleared===null)loanCleared=month;
      } else {
        loanPayment=tick<=endLoan?n(s.fallbackLoanInstallments):0;
        loanRemain=null;
      }
      const spending=n(v.newMonthly),fees=n(v.monthlyFees),openingVisa=c1+c2,interest=openingVisa*n(v.apr)/1200;
      const share=Math.min(1,n(v.purchaseShare1)/100),interestShare=openingVisa>EPS?c1/openingVisa:share;
      c1 += spending*share + fees*share + interest*interestShare;
      c2 += spending*(1-share)+fees*(1-share)+interest*(1-interestShare);
      const availPool=n(v.paymentPool),activeRestore=restoreLeft>EPS;
      let visaBudget=0,restoreBudget=0;
      if(activeRestore){
        if(v.strategy==='later'){restoreBudget=availPool;}
        else if(v.strategy==='visaFirst'){visaBudget=availPool;}
        else {visaBudget=Math.min(availPool,n(v.visaDuring));restoreBudget=availPool-visaBudget;}
      } else {
        visaBudget=Math.min(availPool,n(v.visaAfter));
      }
      const paid1=Math.min(c1,visaBudget);c1-=paid1;
      const paid2=Math.min(c2,Math.max(0,visaBudget-paid1));c2-=paid2;
      const visaPaid=paid1+paid2;
      if(activeRestore && v.strategy==='visaFirst')restoreBudget=Math.max(0,availPool-visaPaid);
      if(activeRestore && v.strategy==='parallel')restoreBudget+=Math.max(0,visaBudget-visaPaid);
      if(activeRestore && v.strategy==='later')restoreBudget=availPool;
      const restored=Math.min(restoreLeft,restoreBudget);restoreLeft-=restored;
      // Any unused finance pool stays unspent; it is not fictitious income or investment.
      if(restoreLeft<EPS && restoreCompleted===null)restoreCompleted=month;
      const inv=n(d.newInvestment);
      const projectIncome=income;
      portfolio += inv+restored;
      // Projected net return: it can compound, accumulate outside the invested portfolio, or be withdrawn.
      // Do not count the same return in the portfolio and in cash simultaneously.
      const profitEarned=portfolio*(Math.pow(1+n(d.annualNetReturn)/100,1/12)-1);
      let profitReinvested=0,profitCash=0;
      totalProfit+=profitEarned;
      if(d.profitMode==='withdraw'){
        profitCash=profitEarned;totalProfitWithdrawn+=profitCash;
      }else if(d.profitMode==='accumulate'){
        profitReserve+=profitEarned;
        const cycle=Math.min(120,Math.max(1,Math.round(n(d.profitReinvestEvery)||6)));
        if((i+1)%cycle===0){profitReinvested=profitReserve;portfolio+=profitReserve;profitReserve=0;totalProfitReinvested+=profitReinvested;}
      }else {
        profitReinvested=profitEarned;portfolio+=profitEarned;totalProfitReinvested+=profitReinvested;
      }
      const operationalNet=projectIncome+profitCash-living-loanPayment-visaPaid-restored-inv;
      cash += operationalNet;
      // Internal bank transfer: not an expense; move the same cash between non-overlapping pools.
      const requestedObligationTransfer=n(s.monthlyObligationsSaving);
      const obligationTransferred=Math.min(requestedObligationTransfer,Math.max(0,cash));
      const obligationTransferShortfall=requestedObligationTransfer-obligationTransferred;
      cash-=obligationTransferred;obligationReserve+=obligationTransferred;
      totalObligationTransferred+=obligationTransferred;totalMissedObligationSaving+=obligationTransferShortfall;
      if(c1+c2<EPS && visaCleared===null)visaCleared=month;
      visaPeak=Math.max(visaPeak,c1+c2);
      // Allocate only existing positive cash to dated goals, earliest deadline first.
      let reserved=0,goalPaid=0,uncoveredThisMonth=0,obligationsUsedThisMonth=0;
      for(const e of events){
        if(e.when<tick || e.paid)continue;
        const remainingNeed=Math.max(0,e.amount-e.funded);
        const monthsToDue=e.when-tick+1;
        const targetContribution=remainingNeed/Math.max(1,monthsToDue);
        // Money earmarked from the bank reserve must leave its unallocated pool immediately.
        const fromObligations=e.useObligations?Math.min(targetContribution,obligationReserve):0;
        obligationReserve-=fromObligations;e.fromObligations+=fromObligations;
        const contribution=Math.min(targetContribution-fromObligations,Math.max(0,cash));
        e.funded+=fromObligations+contribution;cash-=contribution;reserved+=fromObligations+contribution;
      }
      for(const e of events){
        if(e.when!==tick || e.paid)continue;
        let missing=Math.max(0,e.amount-e.funded);
        // At due date, obligations-sourced goals draw the remaining available bank reserve first.
        const extraFromObligations=e.useObligations?Math.min(missing,obligationReserve):0;
        obligationReserve-=extraFromObligations;e.fromObligations+=extraFromObligations;missing-=extraFromObligations;
        const direct=Math.min(missing,Math.max(0,cash));cash-=direct;missing-=direct;
        e.paid=e.amount-missing;e.uncovered=missing;
        totalObligationSpent+=e.fromObligations;obligationsUsedThisMonth+=e.fromObligations;
        goalPaid+=e.paid;uncoveredThisMonth+=missing;
        totalUncovered+=missing;
        e.funded=0;
      }
      const reservedTotal=events.reduce((a,e)=>a+e.funded,0);
      rows.push({i,month,retired,income,living,loanPayment,loanInterest,loanRemain,
        visaOpening:i===0?initialVisa:rows[i-1].visaDebt,visaNew:spending,visaFees:fees+interest,visaPaid,card1:c1,card2:c2,visaDebt:c1+c2,
        restored,restoreRemaining:restoreLeft,restoreAccumulated:n(d.restoreTarget)-restoreLeft,
        obligationsReserve:obligationReserve,obligationsTransfer:obligationTransferred,obligationsTransferShortfall:obligationTransferShortfall,obligationsSpent:totalObligationSpent,obligationsUsedThisMonth,
        invested:inv,portfolio,profitEarned,profitReinvested,profitCash,profitReserve,profitReinvestedTotal:totalProfitReinvested,profitWithdrawnTotal:totalProfitWithdrawn,monthlyPotentialIncome:portfolio*n(d.annualNetReturn)/1200,
        operationalNet,reserved,reservedTotal,goalPaid,uncovered:uncoveredThisMonth,
        cash,netWorthAvailable:cash+obligationReserve+reservedTotal+portfolio+profitReserve-(c1+c2)-(loanRemain||0)});
    }
    const end=rows[rows.length-1],cardIncreasing=end.visaDebt>initialVisa+EPS;
    if (!useExplicit && n(s.fallbackLoanInstallments)>0) warnings.push('القرضان: تُستخدم أقساط إجمالية مؤقتة؛ أدخل رصيد وقسط كل قرض للحصول على تاريخ سداد دقيق.');
    if ((p.goals||[]).some(g=>g.enabled && !(n(g.amount)>0)))warnings.push('بعض الأهداف لم تُحدد تكلفتها، لذلك لا تدخل في مجموع الالتزامات بعد.');
    if (end.cash<-EPS)warnings.push('الرصيد النقدي المتوقع في نهاية المدة سالب؛ الخطة تحتاج تخفيض التزامات أو زيادة الدخل.');
    if (totalUncovered>EPS)warnings.push('يوجد عجز متوقع في أهداف مؤرخة؛ يتغير بحسب الدخل والالتزامات وترتيب استحقاق الأهداف.');
    if(totalMissedObligationSaving>EPS)warnings.push('الدخل الحر لا يغطي جميع التحويلات الشهرية المخططة لحساب الالتزامات؛ احتسب البرنامج فقط ما يمكن تحويله دون أن تصبح السيولة النقدية الحرة سالبة بسبب التحويل.');
    if (cardIncreasing)warnings.push('دين الفيزا في نهاية المحاكاة أعلى من رصيد البداية.');
    if (n(v.newMonthly)+n(v.monthlyFees)>n(v.visaDuring) && v.strategy==='parallel')warnings.push('المشتريات والرسوم أعلى من مخصص الفيزا أثناء دراهم؛ قد يتزايد الدين.');
    if(n(d.annualNetReturn)>0)warnings.push('عائد دراهم افتراض محاكاة وليس ضمانًا أو توزيعًا نقديًا فعليًا.');
    if(events.some(e=>e.when>=start+s.months))warnings.push('بعض دفعات الأهداف بعد نهاية فترة المحاكاة؛ لا تعرضها كأهداف مغطاة حتى توسع أفق المحاكاة.');
    const goalSummary=events.map(e=>({id:e.id,goalId:e.goalId,name:e.name,date:ym(e.when),amount:e.amount,paid:e.paid,uncovered:e.uncovered,fromObligations:e.fromObligations,useObligations:e.useObligations,funded:e.funded,assessed:e.when<start+s.months}));
    return {plan:p,rows,events:goalSummary,summary:{initialVisa,lastVisa:end.visaDebt,visaCleared,visaPeak,
        restoreCompleted,restoreLeft,obligationsReserve:end.obligationsReserve,obligationsTransferred:totalObligationTransferred,obligationsSpent:totalObligationSpent,obligationsSavingShortfall:totalMissedObligationSaving,portfolio:end.portfolio,profitReserve:end.profitReserve,projectedProfit:totalProfit,profitReinvested:totalProfitReinvested,profitWithdrawn:totalProfitWithdrawn,monthlyPotentialIncome:end.monthlyPotentialIncome,
        cash:end.cash,uncovered:totalUncovered,loanCleared,useExplicit,investTargetLow:n(d.incomeTargetLow),
        investTargetHigh:n(d.incomeTargetHigh),retireMonth:s.retirement,
        incomeAtRetirement:rows.find(r=>r.retired)?.income ?? null,
        netAtRetirement:rows.find(r=>r.retired)?.operationalNet ?? null},warnings};
  }
  return {defaultPlan,normalized,simulate,ym,ymi};
})();
window.FinanceEngine=FinanceEngine;

