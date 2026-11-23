"use strict";
(function(){
const KEY="bms_actual_20261114_v1",TAG="meeting20261123",BACKUP=KEY+"_before_meeting_20261123";
const N=x=>Math.max(0,Number(x)||0),norm=x=>String(x||"").replace(/[أإآ]/g,"ا").replace(/\s+/g,"");
const index=m=>Number(m.slice(0,4))*12+Number(m.slice(5,7))-1;
const ym=t=>Math.floor(t/12)+"-"+String(t%12+1).padStart(2,"0");
function apply(d){
 if(!d||!Array.isArray(d.budget)||!d.budget.length)return false;
 if(d[TAG]?.version>=3)return false;\n if(d[TAG]?.version===2){d.retirement=d.retirement||{};d.retirement.loanSchedule2026=true;d[TAG].version=3;return true;}
 const dec=d.budget.filter(x=>x.month==="2026-12");
 if(!dec.length)return false;
 const budget=(month)=>d.budget.filter(x=>x.month===month);
 function item(month,keyword,amount,type="expense"){
   const xs=budget(month).filter(x=>norm(x.name).includes(norm(keyword)));
   if(xs.length){xs[0].amount=amount;for(const duplicate of xs.slice(1))duplicate.amount=0}
   else d.budget.push({id:"reconciled-"+keyword+"-"+month,month,name:keyword,amount,type,category:"تخطيط",notes:"قرار اجتماع نوفمبر ٢٠٢٦"});
 }
 // Existing future month budgets are not replaced; only explicitly agreed changes are applied.
 for(const month of ["2026-12","2027-01","2027-02"]){
  if(!budget(month).length)for(const x of dec)d.budget.push({...x,id:"reconciled-"+x.id+"-"+month,month,paid:false});
  item(month,"قروض",19226,"debt");
  item(month,"فيزا",month==="2026-12"?5000:2000,"debt");
  item(month,"سائق",month==="2026-12"?0:2000);
  item(month,"دورية ملابس",1000);
  item(month,"صندوق الزوجة",1000);
  item(month,"استثمار",0,"investment");
 }
 // Preserve all historical account balances and transactions, and do not count a receivable as cash.
 const car=(d.commitments||[]).find(x=>x.id==="plan-goal-car"||/شراءسيارةثانية/.test(norm(x.name)));
 if(car){car.useObligations=false;car.obligationFundingExplicit=true;car.fundingSource="salary"}
 const r=d.retirement||{};r.loanEnd="2036-08";r.loanPayment=19226;r.loanSchedule2026=true;r.restoreRemaining=Math.max(N(r.restoreRemaining),52000);
 r.during={...(r.during||{}),visa:2000,invest:0};
 r.after={...(r.after||{}),visa:2000,invest:550};
 // Old hypothetical 50k portfolio draw is NOT an actual transaction.
 r.draws=(r.draws||[]).filter(x=>!(x.month==="2027-12"&&N(x.amount)===50000));
 d.retirement=r;
 d[TAG]={version:3,appliedAt:new Date().toISOString(),salary:47233,pension:30000,loan1Payment:15370,loan1LastMonth:"2030-02",loan2Payment:3856,loan2LastMonth:"2036-08",visaFrom:"2027-01",visaPayment:2000,clothingStart:"2026-12",clothing:1000,driverStart:"2027-01",driver:2000,wifeMonthsRemaining:7,wifeMonthly:1000,carFrom:"2028-12",carPayment:2500,carSource:"salary",schoolsSource:"reserve",reserveSaving:1738,restoreRemaining:52000,profitMode:"actual_only",profitSplit:"from_actual_transactions",note:"No modifications to account balances, debt balances, or actual moves. 2027+ plan is forecast-driven."};
 return true;
}
try{
 const raw=localStorage.getItem(KEY);if(!raw)return;
 const d=JSON.parse(raw);if(d[TAG]?.version>=3)return;
 const before=JSON.stringify(d);
 if(!apply(d))return;
 localStorage.setItem(BACKUP,before);
 try{localStorage.setItem(KEY,JSON.stringify(d))}catch(e){localStorage.setItem(KEY,before);throw e}
}catch(e){console.warn("Financial meeting reconciliation skipped safely",e)}
})();