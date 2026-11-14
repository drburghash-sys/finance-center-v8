"use strict";
(function(root){
const arr=x=>Array.isArray(x)?x:[];
const obj=x=>{if(typeof x==="string"){try{return JSON.parse(x)}catch(_){return null}}return x&&typeof x==="object"?x:null};
const number=x=>Number.isFinite(Number(x))?Number(x):0;
const positive=x=>Math.max(0,number(x));
const sum=(xs,fn)=>arr(xs).reduce((v,x)=>v+number(fn(x)),0);
const date=ts=>{const d=new Date(ts);return Number.isNaN(d.getTime())?new Date().toISOString().slice(0,10):d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")};
const safeId=v=>String(v||"").replace(/[^a-zA-Z0-9_-]/g,"").slice(0,100);
const hash=s=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return(h>>>0).toString(16)};
const normalize=t=>String(t||"").replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g," ").replace(/[–—]/g,"-").replace(/\s+/g," ").trim();
const empty=()=>({version:2,accounts:[],moves:[],budget:[],commitments:[],debts:[],projects:[],journal:[],seenHashes:{},learnedRules:[],legacy:{budgetMonths:{},budgetCategories:[],budgetAccounts:[],incomeRecords:[],salaryCalc:null,future:null,debtLogs:[],bankHistoryCount:0,bankSeenCount:0,sourceExportedAt:null}});
function isFull(doc){return ["UnifiedFinanceBackupV1","FinanceCenterBackupV1","FinanceCenterBackupV2"].includes(doc?.format)&&!!obj(doc?.accounts)&&!!obj(doc?.budget)}
function kindForHistory(h,credit){
 const label=String(h.type||""),raw=String(h.raw||"");
 if(/تصحيح|تعديل|رصيد افتتاحي|فتح حساب/.test(label))return"adjustment";
 if(/تحويل بين الحسابات|تحويل.+حساب الالتزام|حوالة صادرة داخلية|حوالة واردة داخلية/.test(label))return"transfer";
 if(/حوالة واردة إلى فيزا|سداد دين — فيزا/.test(label))return"repayment";
 if(/سداد ميزانية —/.test(label)){
  if(/الالتزامات/.test(label))return"transfer";
  if(/فيزا|قروض|قرض|تمويل|دراهم/.test(label))return"repayment";
  if(/استثمار/.test(label))return"transfer";
  return"expense";
 }
 if(credit){
  if(/سداد|حوالة واردة/.test(label))return"repayment";
  if(/شراء|رسوم/.test(label))return"charge";
 }
 if(/شراء ببطاقة فيزا|فيزا.*شراء/.test(label))return"charge";
 if(/شراء|نقاط بيع|POS|سداد فاتورة|مدفوعات وزارة الداخلية|سحب نقدي/.test(label))return"expense";
 if(/حوالة واردة|إيداع|نزول الراتب/.test(label))return"unclassified";
 if(/حوالة صادرة|تحويل/.test(label))return"unclassified";
 return"unclassified";
}
function budgetType(item){
 const name=String(item.name||"");
 if(/^\s*(?:الالتزامات|حساب الالتزامات)\s*$/.test(name))return"saving";
 if(/استثمار/.test(name)||/دراهم/.test(name)&&!/قرض|دين/.test(name))return"investment";
 if(/قروض|قرض|فيزا|سداد/.test(name)||/قروض/.test(String(item.category||"")))return"debt";
 return"expense";
}
function fromPlan(doc,data){
 const p=obj(doc?.future)||obj(doc?.plan)||null;if(!p)return{goals:0,loans:0};
 data.legacy.future=p;
 let goals=0,loans=0;
 for(const g of arr(p.goals)){
  const id="plan-goal-"+safeId(g.id||hash(String(g.name)));
  if(data.commitments.some(x=>x.id===id))continue;
  data.commitments.push({id,sourceId:g.id,name:String(g.name||"هدف"),firstMonth:String(g.date||"").slice(0,7),amount:positive(g.amount),count:Math.min(240,Math.max(1,Math.round(number(g.count)||1))),interval:String(g.paymentMode||"")==="monthly"?1:Math.min(120,Math.max(1,Math.round(number(g.interval)||12))),active:g.enabled!==false,source:"import-plan",kind:"planned",useObligations:!!g.useObligations});
  goals++;
  if(/مشروع|استثمار/i.test(g.name||"")&&!data.projects.some(x=>x.sourceId===g.id)){
   data.projects.push({id:"future-project-"+safeId(g.id),sourceId:g.id,name:String(g.name),status:"planned",description:"هدف مستقبلي وارد في الملف. لا تُعد أرباحه دخلًا فعليًا."});
  }
 }
 for(const l of arr(p.loans)){
  const id="plan-loan-"+safeId(l.id||hash(String(l.name)));
  if(data.debts.some(x=>x.sourceId===l.id||x.id===id||x.name===l.name))continue;
  data.debts.push({id,sourceId:l.id,name:String(l.name||"قرض"),opening:positive(l.balance),asOf:String(doc.exportedAt||date(Date.now())).slice(0,10),kind:"loan",source:"reference-plan",apr:number(l.apr),monthlyPayment:number(l.payment)});
  loans++;
 }
 const target=positive(p.settings?.projectIncome);
 if(target>0&&!data.projects.some(x=>x.id==="future-project-income")){
  data.projects.push({id:"future-project-income",name:"دخل مشروع مخطط",status:"planned",description:"دخل مستقبلي من خطة سابقة "+target+" ر.س شهريًا — غير مثبت ولم يدخل ضمن الدخل الفعلي.",plannedIncome:target,plannedStart:p.settings?.projectIncomeStart||""});
 }
 return{goals,loans};
}
function migrate(doc){
 if(!isFull(doc))throw Error("الملف ليس نسخة شاملة متوافقة من المركز المالي.");
 const oldBank=obj(doc.accounts),oldBudget=obj(doc.budget);
 if(!arr(oldBank.accounts).length||!arr(oldBudget.items).length)throw Error("ملف الأرصدة أو الميزانية غير مكتمل");
 const d=empty();
 d.legacy.sourceExportedAt=doc.exportedAt||null;
 d.legacy.links=obj(doc.links)||{};
 d.legacy.itemLinks=obj(doc.itemLinks)||{};
 d.legacy.obligationsFund=obj(oldBank.finance?.fund)||null;
 d.legacy.fundArchive=obj(oldBank.finance?.fundArchive)||null;
 d.legacy.archivedDebts=arr(oldBank.finance?.archivedDebts);
 d.legacy.bankHistoryOriginal=arr(oldBank.history);
 d.legacy.learnedRulesOriginal=arr(oldBank.learnedRules);
 d.legacy.budgetTrips=arr(oldBudget.trips);
 d.legacy.salaryCalc=obj(doc.salaryCalc);
 d.legacy.budgetCategories=arr(oldBudget.categories);
 d.legacy.budgetAccounts=arr(oldBudget.accounts);
 const knownDebts=arr(oldBank.finance?.debts);
 const cardDebtById=new Map(),cardDebtByEnd=new Map();
 for(const legacyDebt of knownDebts){
  const name=String(legacyDebt.name||"دين");
  const id="legacy-debt-"+safeId(legacyDebt.id||hash(name));
  const isCard=/^(?:فيزا|visa)/i.test(name)||!!legacyDebt.cardLast4;
  const debit=positive(number(legacyDebt.original)+number(legacyDebt.addedDebt)-number(legacyDebt.paid)-number(legacyDebt.balanceCorrection));
  const debt={id,legacyId:legacyDebt.id,name,opening:debit,asOf:String(doc.exportedAt||date(Date.now())).slice(0,10),kind:isCard?"credit":"loan",source:"bank-snapshot",cardLast4:String(legacyDebt.cardLast4||""),issuer:legacyDebt.issuer||"",legacyDebtOriginal:number(legacyDebt.original),legacyDebtPaid:number(legacyDebt.paid),legacyDebtAdded:number(legacyDebt.addedDebt),legacyDebtCorrection:number(legacyDebt.balanceCorrection)};
  d.debts.push(debt);
  cardDebtById.set(legacyDebt.id,id);
  if(debt.cardLast4)cardDebtByEnd.set(debt.cardLast4,id);
  for(const [i,log]of arr(legacyDebt.log).entries()){
   d.legacy.debtLogs.push({id:"log-"+safeId(legacyDebt.id)+"-"+i,debtId:id,name,kind:log.type||"unknown",amount:number(log.amount),date:String(log.date||"").slice(0,10),raw:log.text||log.raw||"",source:log.source||"legacy",note:"محفوظ من سجل الدين، لا يُطرح مرتين من الرصيد الحالي"});
  }
 }
 for(const a of arr(oldBank.accounts)){
  if(a.kind==="credit")continue;
  const role=a.id===oldBank.finance?.obligationAccountId||a.id==="amuju7ih2gtiyr"||/حساب\s*الالتزام/.test(String(a.name||""))?"reserve":/دراهم|darahim/i.test(String(a.name||"")+" "+String(a.bank||""))?"investment":"bank";
  d.accounts.push({id:"legacy-account-"+safeId(a.id),legacyId:a.id,name:String(a.name||"حساب"),bank:String(a.bank||""),last4:String(a.last4||""),cards:arr(a.cards).map(x=>String(x)),role,opening:number(a.balance),snapshotAsOf:String(doc.exportedAt||"").slice(0,10)});
 }
 const creditAccounts=arr(oldBank.accounts).filter(a=>a.kind==="credit");
 for(const a of creditAccounts){
  const ref=cardDebtById.get(a.financeDebtId);
  if(ref){const debt=d.debts.find(x=>x.id===ref);if(debt){debt.cardLast4=debt.cardLast4||String(a.last4||"");if(debt.cardLast4)cardDebtByEnd.set(debt.cardLast4,ref)}continue}
  const id="credit-snapshot-"+safeId(a.id);
  d.debts.push({id,legacyId:a.id,name:String(a.name||"فيزا"),kind:"credit",opening:Math.max(0,-number(a.balance)),asOf:String(doc.exportedAt||"").slice(0,10),source:"credit-snapshot",cardLast4:String(a.last4||"")});
  if(a.last4)cardDebtByEnd.set(String(a.last4),id);
 }
 const legacyAccountIdToNew=new Map(d.accounts.map(a=>[a.legacyId,a.id]));
 const creditByAccount=new Map();
 for(const c of creditAccounts){
  const mapped=cardDebtById.get(c.financeDebtId)||cardDebtByEnd.get(String(c.last4||""));
  if(mapped)creditByAccount.set(c.id,mapped);
 }
 for(const [i,h]of arr(oldBank.history).entries()){
  const credit=creditByAccount.has(h.accountId);
  let kind=kindForHistory(h,credit);
  if(kind==="repayment"&&credit&&number(h.delta)<0)kind="charge";
  const delta=number(h.delta),amt=Math.abs(delta);
  const a=legacyAccountIdToNew.get(h.accountId)||"";
  const to=delta>0?a:"",from=delta<0?a:"";
  const type=String(h.type||"");
  const debtId=creditByAccount.get(h.accountId)||((kind==="repayment"&&/فيزا\s*[١1]/.test(type))?d.debts.find(x=>/فيزا\s*[١1]/.test(x.name))?.id:(kind==="repayment"&&/فيزا\s*[٢2]/.test(type))?d.debts.find(x=>/فيزا\s*[٢2]/.test(x.name))?.id:"");
  const tx={id:"old-history-"+i+"-"+safeId(h.ts||i),legacyIndex:i,legacyType:type,date:date(h.ts),kind,amount:amt,from,to,debtId:debtId||"",principal:0,category:type.replace(/^سداد ميزانية\s*[—-]\s*/,"").slice(0,100),source:h.source||"bank",legacyLinkId:h.linkId||"",raw:String(h.raw||""),note:"سجل سابق ضمن الرصيد المستورد، لم يُخصم ثانية",posted:false,importedHistory:true};
  d.moves.push(tx);
  if(tx.raw){const k=hash(normalize(tx.raw));d.seenHashes[k]=1;}
 }
 for(const [key,val]of Object.entries(obj(oldBank.seen)||{}))if(val)d.seenHashes[String(key)]=1;
 d.learnedRules=arr(oldBank.learnedRules).map(x=>({...x,accountId:legacyAccountIdToNew.get(x.accountId)||""}));
 d.legacy.bankHistoryCount=arr(oldBank.history).length;
 d.legacy.bankSeenCount=Object.keys(obj(oldBank.seen)||{}).length;
 const months={...(obj(oldBudget.months)||{})};
 if(oldBudget.month&&!months[oldBudget.month])months[oldBudget.month]={salary:oldBudget.salary,incomes:oldBudget.incomes,items:oldBudget.items,accountStatus:oldBudget.accountStatus};
 for(const [key,entry]of Object.entries(months)){
  const m=String(key).slice(0,7);
  const rows=arr(entry.items);
  for(const item of rows){
   d.budget.push({id:"legacy-budget-"+m+"-"+safeId(item.id||hash(item.name)),legacyId:item.id,month:m,name:String(item.name||"بند"),amount:positive(item.amount),type:budgetType(item),category:item.category||"",paid:!!item.paid,legacyAccountId:item.accountId||"",linkedBankId:(
    (obj(doc.itemLinks)||{})[item.id]?.bankAccountId||
    (obj(doc.links)||{})[item.accountId]||""),notes:item.notes||"",due:item.due||""});
  }
  const incomeLines=arr(entry.incomes).map(x=>({name:x.name||"دخل إضافي",amount:number(x.amount)}));
  d.legacy.budgetMonths[m]={salary:number(entry.salary),incomeLines,budgetItems:rows.length,accountStatus:obj(entry.accountStatus)||{}};
  for(const inc of incomeLines)d.legacy.incomeRecords.push({month:m,...inc,origin:"budget-only",posted:false});
 }
 // Imported monthly budget income is descriptive, not added as cash again.
 const f=fromPlan(doc,d);
 const summary={accounts:d.accounts.length,creditCards:d.debts.filter(x=>x.kind==="credit").length,debts:d.debts.length,budgetMonths:Object.keys(d.legacy.budgetMonths).length,budgetItems:d.budget.length,history:d.legacy.bankHistoryCount,debtLogs:d.legacy.debtLogs.length,learnedRules:d.learnedRules.length,goals:f.goals,plannedProjects:d.projects.length,preservedFuture:!!d.legacy.future,preservedSalary:!!d.legacy.salaryCalc};
 return{data:d,summary};
}
root.FinanceImport={migrate,isFull,fromPlan,empty,hash,normalize,summary:migrate};
})(window);