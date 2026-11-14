"use strict";
(function(root){
const n=x=>Number.isFinite(Number(x))?Math.max(0,Number(x)):0;
const signed=x=>Number.isFinite(Number(x))?Number(x):0;
const money=x=>new Intl.NumberFormat("ar-SA",{maximumFractionDigits:0}).format(x||0)+" ر.س";
const esc=x=>String(x==null?"":x).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const monthKey=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");
const curMonth=()=>monthKey(new Date());
const mi=x=>{const a=String(x||"").split("-").map(Number);return a[0]*12+(a[1]||1)-1};
const ym=t=>Math.floor(t/12)+"-"+String(t%12+1).padStart(2,"0");
const fields=["visa","restore","invest","projects","obligations"];
const names={visa:"الفيزا",restore:"إعادة دراهم",invest:"استثمار جديد",projects:"المشاريع",obligations:"حساب الالتزامات"};
const colors={visa:"#e87e44",restore:"#6e73df",invest:"#56a9a4",projects:"#b482cc",obligations:"#e6b44a",cash:"#406bdf",income:"#4a9bac",expenses:"#e56c77",debt:"#e87e44",portfolio:"#9473d8",projectReserve:"#ab6fbb",reserve:"#e7ad39"};
const defAlloc=()=>({visa:0,restore:0,invest:0,projects:0,obligations:0});
const copy=x=>JSON.parse(JSON.stringify(x));
const budgets=d=>(d.budget||[]).filter(x=>x.month===curMonth());
const latestBudget=d=>{
 const byMonth=(d.budget||[]).reduce((a,x)=>x.month>a?x.month:a,"");
 return (d.budget||[]).filter(x=>x.month===byMonth);
};
const dataSnapshot=d=>{
 const accountBalance=a=>signed(a.opening)+ (d.moves||[]).reduce((s,m)=>s+(m.posted===false?0:((m.to===a.id?n(m.amount):0)-(m.from===a.id&&!m.bankAlreadyPosted?n(m.amount):0))),0);
 const bank=(d.accounts||[]).filter(x=>x.role==="bank"),reserve=(d.accounts||[]).filter(x=>x.role==="reserve");
 const investments=(d.accounts||[]).filter(x=>x.role==="investment");
 const debts=(d.debts||[]).filter(x=>x.kind==="credit");
 const visa=debts.reduce((s,x)=>s+Math.max(0,n(x.opening)+(d.moves||[]).reduce((t,m)=>t+(m.posted===false||m.debtId!==x.id?0:m.kind==="charge"?n(m.amount):m.kind==="repayment"?-n(m.principal):0),0)),0);
 const darahim=investments.filter(a=>/دراهم|darahim/i.test((a.name||"")+" "+(a.bank||"")));
 return {cash:bank.reduce((s,a)=>s+accountBalance(a),0),reserve:reserve.reduce((s,a)=>s+accountBalance(a),0),portfolio:darahim.reduce((s,a)=>s+accountBalance(a),0),visa,hasPortfolio:darahim.length>0,hasVisa:debts.length>0};
};
function monthlyBasis(d){
 const items=latestBudget(d),inc=d.legacy?.incomeRecords||[],future=d.legacy?.future||{},p=future.settings||{},b=d.legacy?.budgetMonths||{};
 const last=Object.keys(b).sort().at(-1),salary=n(b[last]?.salary)||n(p.salary)||n(d.legacy?.salaryCalc?.net);
 const inBudget=items.reduce((s,x)=>s+(x.type==="expense"&&!/مدارس|رسوم.*دراس|رسوم الابنة|سيار|صيان/i.test(x.name||"")?n(x.amount):0),0);
 const visaItems=items.filter(x=>/فيزا|visa/i.test(x.name||"")).reduce((s,x)=>s+n(x.amount),0);
 const saving=items.filter(x=>x.type==="saving").reduce((s,x)=>s+n(x.amount),0);
 const investment=items.filter(x=>x.type==="investment").reduce((s,x)=>s+n(x.amount),0);
 const loanItems=items.filter(x=>x.type==="debt"&&!/فيزا|دراهم|visa/i.test(x.name||"")).reduce((s,x)=>s+n(x.amount),0);
 return {salary,pension:n(p.pension),retirement:p.retirement||"2031-12",loanEnd:p.fallbackLoanEnd||"2031-11",living:inBudget||n(p.monthlyExpenses),loanPayment:loanItems||n(p.fallbackLoanInstallments),visaNew:n(future.visa?.newMonthly),visaAPR:n(future.visa?.apr),visaFees:n(future.visa?.monthlyFees),annualInflation:n(p.inflation)||0,newInvestment:investment||n(future.darahim?.newInvestment),monthlySaving:saving,visaPool:visaItems||n(future.visa?.paymentPool),future};
}
function defaults(d){
 const b=monthlyBasis(d),v=b.future.visa||{},p=b.future.darahim||{},during=defAlloc(),after=defAlloc();
 during.visa=v.strategy==="later"?0:v.strategy==="visaFirst"?b.visaPool:Math.min(b.visaPool,n(v.visaDuring));
 during.restore=v.strategy==="visaFirst"?0:b.visaPool-during.visa;
 // New investment and obligations may already be in the monthly budget; keep them as independent allocations.
 during.invest=b.newInvestment;during.obligations=b.monthlySaving;
 after.visa=Math.min(b.visaPool,n(v.visaAfter)||b.visaPool);
 after.invest=b.newInvestment;after.obligations=b.monthlySaving;
 const restoredRemaining=Math.max(0,n(p.restoreTarget)-n(p.alreadyRestored));
 const oldDebt=(d.debts||[]).find(x=>/دراهم/i.test(x.name||""));
 return {version:1,retirement:b.retirement,loanEnd:b.loanEnd,pension:b.pension,salary:b.salary,living:b.living,loanPayment:b.loanPayment,
   visaNew:b.visaNew,visaAPR:b.visaAPR,visaFees:b.visaFees,annualInflation:b.annualInflation,months:144,annualReturn:0,profitMode:"reinvest",
   restoreRemaining:oldDebt?n(oldDebt.opening):restoredRemaining,assumeFutureProjectIncome:false,
   projectIncome:0,projectIncomeStart:"2032-01",during,after,draws:[],goalsEnabled:true,projectionStart:curMonth()};
}
function model(data){
 if(!data.retirement||typeof data.retirement!=="object")data.retirement=defaults(data);
 const o=data.retirement;o.during={...defAlloc(),...(o.during||{})};o.after={...defAlloc(),...(o.after||{})};
 o.draws=Array.isArray(o.draws)?o.draws:[];
 return o;
}
function goals(data,start,end){
 const events=[];
 (data.commitments||[]).filter(x=>x.active!==false).forEach(c=>{
  const count=Math.min(240,Math.max(1,Number(c.count)||1)),gap=Math.max(1,Number(c.interval)||1);
  const first=mi(c.firstMonth);if(!(first>0))return;
  for(let i=0;i<count;i++){
   const m=first+i*gap;if(m<start||m>=end)continue;
   const key=c.id+"-"+i,already=(data.moves||[]).filter(x=>x.commitmentKey===key&&x.kind==="expense").reduce((s,x)=>s+n(x.amount),0);
   const need=Math.max(0,n(c.amount)-already);if(need<=0)continue;
   events.push({month:m,amount:need,name:c.name||"استحقاق",project:/مشروع|بناء|عقار/i.test(c.name||""),useReserve:!!c.useObligations||/مدرس|تعليم|رسوم|صيان|سيار|مركب/i.test(c.name||"")});
  }
 });
 return events;
}
function simulate(d){
 const o=model(d),a=dataSnapshot(d),start=mi(curMonth())+1,end=mi(curMonth())+1+Math.min(240,Math.max(24,Math.round(n(o.months)||144))),
       retire=mi(o.retirement),events=goals(d,start,end),due=new Map();
 for(const e of events){if(!due.has(e.month))due.set(e.month,[]);due.get(e.month).push(e)}
 const draws=o.draws.filter(x=>x.month&&x.amount>=0).slice().sort((x,y)=>x.month.localeCompare(y.month));
 let cash=a.cash,reserve=a.reserve,portfolio=a.portfolio,visa=a.visa,projects=0,profitHold=0,remaining=n(o.restoreRemaining),
     schedule={during:copy(o.during),after:copy(o.after)},index=0,warnings=[];
 const rows=[];let totalUncovered=0,uncertainLoan=0;
 for(let i=0;i<end-start;i++){
  const month=ym(start+i),retired=start+i>=retire,year=i/12;
  let drawAmount=0;let newSchedule=false;
  while(index<draws.length&&mi(draws[index].month)<=start+i){
   const event=draws[index++];
   // Planned draws are future only; actual withdrawals must already appear in banking balances.
   const requested=n(event.amount),taken=Math.min(requested,Math.max(0,portfolio));
   portfolio-=taken;cash+=taken;remaining+=taken;drawAmount+=taken;newSchedule=true;
   if(requested>taken)warnings.push("السحب المخطط في "+event.month+" تجاوز قيمة المحفظة المقدرة؛ تم احتساب المتاح فقط.");
   schedule={during:{...defAlloc(),...(event.during||{})},after:{...defAlloc(),...(event.after||{})}};
  }
  const allocation=remaining>0.005?schedule.during:schedule.after;
  const income=retired?n(o.pension):n(o.salary);
  const living=n(o.living)*Math.pow(1+n(o.annualInflation)/100,year);
  const loanPayment=(o.loanEnd&&start+i>mi(o.loanEnd))?0:n(o.loanPayment);
  const addedCard=n(o.visaNew)+n(o.visaFees)+visa*n(o.visaAPR)/1200;
  visa+=addedCard;
  let payVisa=Math.min(visa,n(allocation.visa));visa-=payVisa;
  let restore=Math.min(remaining,n(allocation.restore));remaining-=restore;portfolio+=restore;
  let invest=n(allocation.invest),toProjects=n(allocation.projects),toObligations=n(allocation.obligations);
  // If the restore target finishes, unused planned restore allocation remains unspent this month.
  const out=payVisa+restore+invest+toProjects+toObligations;
  cash+=income-living-loanPayment-out;
  portfolio+=invest;reserve+=toObligations;projects+=toProjects;
  const modeledReturn=portfolio*(Math.pow(1+n(o.annualReturn)/100,1/12)-1);
  let profitIntoCash=0;
  if(o.profitMode==="withdraw"){profitIntoCash=modeledReturn;cash+=modeledReturn}
  else if(o.profitMode==="hold")profitHold+=modeledReturn;
  else portfolio+=modeledReturn;
  let goalExpense=0,uncovered=0;
  for(const e of due.get(start+i)||[]){
   let need=e.amount;
   if(e.useReserve){const v=Math.min(Math.max(0,reserve),need);reserve-=v;need-=v}
   else if(e.project){const v=Math.min(Math.max(0,projects),need);projects-=v;need-=v}
   const v=Math.min(Math.max(0,cash),need);cash-=v;need-=v;
   goalExpense+=e.amount-need;uncovered+=need;
  }
  totalUncovered+=uncovered;
  rows.push({month,retired,income,living,loanPayment,payVisa,restore,invest,toProjects,toObligations,visa,remaining,
    cash,portfolio,reserve,projects,profitHold,modeledReturn,profitIntoCash,drawAmount,addedCard,goalExpense,uncovered,
    freeFlow:income-living-loanPayment-out,
    totalLiquid:cash+reserve+projects+profitHold,overallAssets:cash+reserve+projects+portfolio+profitHold,stage:remaining>0.005?"إعادة دراهم":"ما بعد إعادة دراهم",newSchedule});
 }
 if(n(o.salary)===0)warnings.push("لا يوجد راتب شهري موثق؛ اضبط الراتب ضمن افتراضات التقاعد.");
 if(n(o.annualReturn)>0)warnings.push("العائد السنوي على دراهم افتراض اختياري فقط؛ لا يمثل توزيعات أو أرباحًا فعلية مضمونة.");
 if(n(o.pension)===0)warnings.push("المعاش التقاعدي غير محدد؛ قد تبدو سيولة ما بعد التقاعد أقل من الواقع.");
 if(n(o.loanPayment)>0)warnings.push("أقساط القروض تخصم من السيولة دون افتراض انخفاض محدد لأصل الدين؛ راجع مواعيد انتهائها.");
 if(n(o.visaAPR)===0&&a.visa>0)warnings.push("فائدة الفيزا مفترضة صفرًا حتى تدخل معدل التمويل الحقيقي.");
 if(totalUncovered>0)warnings.push("ظهرت استحقاقات مستقبلية لا تكفي لتغطيتها المدخرات والسيولة؛ الرقم توقع وليس دينًا فعليًا.");
 if(rows.some(x=>x.cash<0))warnings.push("السيولة الحرة المستقبلية تصبح سالبة في بعض الأشهر؛ هذه علامة عدم كفاية المخصصات، وليست رصيدًا بنكيًا حقيقيًا.");
 return {rows,warnings,actual:a,retirement:o.retirement,totalUncovered};
}
function field(k,label,value,type,extra){
 return '<label class="form-field"><span>'+esc(label)+'</span><input data-ret="'+esc(k)+'" type="'+(type||"number")+'" '+(type==="number"?'step="any" min="0" inputmode="decimal"':"")+' value="'+esc(value==null?"":value)+'" '+(extra||"")+'></label>';
}
function allocationFields(path,ob){
 return fields.filter(k=>!path.endsWith("after")||k!=="restore").map(k=>field(path+"."+k,names[k],n(ob?.[k]))).join("");
}
function legend(series){return '<div class="retire-legend">'+series.map(x=>'<span><i style="background:'+esc(colors[x.key]||"#678bdd")+'"></i>'+esc(x.label)+'</span>').join("")+'</div>'}
function graph(title,subtitle,rows,series){
 if(!rows.length)return "";
 let max=1;
 rows.forEach(r=>series.forEach(v=>{max=Math.max(max,Math.abs(signed(r[v.key]))) }));
 const shown=rows.length>10?rows.filter((_,i)=>i%Math.ceil(rows.length/10)===0||i===rows.length-1):rows;
 let out='<section class="panel retire-panel"><div class="panel-top"><h2>'+esc(title)+'</h2></div><p class="hint">'+esc(subtitle)+'</p>'+legend(series)+'<div class="retire-chart" role="group" aria-label="'+esc(title)+'">';
 for(const r of shown){
  out+='<div class="retire-column-group"><div class="retire-columns">';
  for(const v of series){
   const a=signed(r[v.key]),h=Math.max(0,Math.min(100,Math.abs(a)/max*100));
   out+='<div class="retire-rect '+(a<0?"is-negative":"")+'" style="height:'+Math.max(2,h)+'%;background:'+(a<0?"#bf3e55":colors[v.key]||"#678bdd")+'" title="'+esc(v.label+" — "+r.label+": "+money(a))+'"></div>';
  }
  out+='</div><span class="retire-axis-label">'+esc(r.label)+'</span></div>';
 }
 out+='</div><p class="hint">اضغط مطولًا على العمود لمعرفة القيمة. القيم المتوقعة ليست عمليات بنكية منفذة.</p></section>';
 return out;
}
const metrics=items=>'<div class="metrics">'+items.map(x=>'<div class="metric '+esc(x.cls||"blue")+'"><div class="metric-label">'+esc(x.label)+'</div><strong>'+esc(x.value)+'</strong><small>'+esc(x.hint||"")+'</small></div>').join("")+'</div>';
function annualRows(rows){
 const groups=new Map();
 rows.forEach(r=>{const yr=r.month.slice(0,4);if(!groups.has(yr))groups.set(yr,[]);groups.get(yr).push(r)});
 return [...groups].map(([label,rs])=>{
  const end=rs.at(-1),avg=k=>rs.reduce((s,r)=>s+signed(r[k]),0)/rs.length;
  return {label,income:avg("income"),expenses:avg("living"),loanPayment:avg("loanPayment"),payVisa:avg("payVisa"),
   restore:avg("restore"),invest:avg("invest"),toProjects:avg("toProjects"),toObligations:avg("toObligations"),
   cash:end.cash,reserve:end.reserve,projects:end.projects,portfolio:end.portfolio,profitHold:end.profitHold,visa:end.visa,remaining:end.remaining};
 });
}
function charts(d){
 const s=simulate(d),a=s.actual,o=model(d),rows=s.rows,years=annualRows(rows),before=rows.filter(r=>!r.retired),after=rows.filter(r=>r.retired);
 const average=(r,k)=>r.length?r.reduce((x,v)=>x+signed(v[k]),0)/r.length:0;
 const compare=[{label:"قبل التقاعد",income:average(before,"income"),expenses:average(before,"living"),loanPayment:average(before,"loanPayment"),payVisa:average(before,"payVisa"),restore:average(before,"restore"),invest:average(before,"invest"),toObligations:average(before,"toObligations")},
 {label:"بعد التقاعد",income:average(after,"income"),expenses:average(after,"living"),loanPayment:average(after,"loanPayment"),payVisa:average(after,"payVisa"),restore:average(after,"restore"),invest:average(after,"invest"),toObligations:average(after,"toObligations")}];
 const retirement=rows.find(x=>x.retired),negative=rows.filter(x=>x.cash<0).length;
 let html='<p class="body-note">هذه الصفحة <b>توقع مالي</b> يبدأ من الأرصدة الفعلية الحالية. لا تغيّر المصروفات المسجلة أو الحسابات البنكية. كل رسم مستقل، والأعمدة تعرض ريالًا شهريًا أو رصيدًا بنهاية السنة.</p>';
 html+=metrics([{label:"السيولة الحرة اليوم",value:money(a.cash),hint:"فعلي من الحسابات",cls:"blue"},
 {label:"رصيد الفيزا اليوم",value:money(a.visa),hint:"فعلي من البطاقات",cls:"coral"},
 {label:"المحفظة الاستثمارية",value:money(a.portfolio),hint:"من حسابات دراهم",cls:"violet"},
 {label:"الشهر المتوقع للتقاعد",value:o.retirement||"غير محدد",hint:"من إعداداتك",cls:"amber"}]);
 html+=graph("الدخل والمصروف قبل التقاعد وبعده","متوسط شهري لكل مرحلة — أعمدة مقارنة، وليست إجمالي سنوات",compare,[{key:"income",label:"دخل"},{key:"expenses",label:"معيشة"},{key:"loanPayment",label:"قروض"},{key:"payVisa",label:"فيزا"}]);
 html+=graph("رصيد الفيزا والمتبقي لإعادة دراهم","الرصيد المتوقع بنهاية كل سنة. الانخفاض في البنود هو المطلوب مراقبته.",years,[{key:"visa",label:"دين الفيزا"},{key:"remaining",label:"المبلغ المتبقي لإعادة دراهم"}]);
 html+=graph("توزيع المبلغ الشهري","متوسط المبالغ المخصصة شهريًا في كل سنة — أرقام بالريال وليس نسبًا",years,[{key:"payVisa",label:"سداد الفيزا"},{key:"restore",label:"إعادة دراهم"},{key:"invest",label:"استثمار جديد"},{key:"toProjects",label:"مشاريع"},{key:"toObligations",label:"التزامات"}]);
 html+=graph("السيولة قبل التقاعد وبعده","رصيد نهاية السنة؛ الادخار المخصص لا يُجمع مرتين مع السيولة الحرة",years,[{key:"cash",label:"السيولة الحرة"},{key:"reserve",label:"حساب الالتزامات"},{key:"projects",label:"رصيد المشاريع"},{key:"portfolio",label:"محفظة دراهم"}]);
 html+='<section class="panel"><h2>تنبيهات تحتاج مراجعة</h2>'+
 (s.warnings.length?'<div class="retire-notes">'+s.warnings.map(x=>'<p>'+esc(x)+'</p>').join("")+'</div>':'<p class="hint">لا توجد تنبيهات محاسبية وفق الافتراضات الحالية.</p>')+
 '<div class="hint">عدد الأشهر التي تنخفض فيها السيولة الحرة عن الصفر: '+negative+' • مجموع الاستحقاقات المتوقع نقص تمويلها: '+money(s.totalUncovered)+'</div></section>';
 return html;
}
function allocations(d){
 const o=model(d);
 let html='<p class="body-note">المبالغ التالية تخص توزيعًا شهريًا <b>مستقبليًا</b>، ولا تنشئ تحويلات أو عمليات سداد فعلية. اختر رقمًا بالريال لكل وجهة. الاستثمار الجديد منفصل عن إعادة رأس مال دراهم.</p>';
 html+='<section class="panel"><h2>المبالغ قبل إعادة دراهم بالكامل</h2><div class="form-grid">'+allocationFields("during",o.during)+'</div><p class="hint">المجموع الشهري المخطط: '+money(fields.reduce((z,k)=>z+n(o.during[k]),0))+'</p></section>';
 html+='<section class="panel"><h2>المبالغ بعد اكتمال إعادة دراهم</h2><div class="form-grid">'+allocationFields("after",o.after)+'</div><p class="hint">المجموع الشهري المخطط: '+money(fields.reduce((z,k)=>z+n(o.after[k]),0))+'</p></section>';
 html+='<section class="panel"><h2>افتراضات التقاعد</h2><div class="form-grid">'+
 field("retirement","شهر بدء التقاعد",o.retirement,"month")+
 field("salary","الراتب الشهري حتى التقاعد",o.salary)+field("pension","المعاش بعد التقاعد",o.pension)+
 field("living","مصاريف المعيشة الشهرية",o.living)+field("loanPayment","أقساط القروض الشهرية",o.loanPayment)+
 field("visaNew","مشتريات الفيزا الجديدة شهريًا",o.visaNew)+field("visaFees","رسوم الفيزا الشهرية",o.visaFees)+
 field("visaAPR","معدل تمويل الفيزا سنويًا (%)",o.visaAPR)+field("restoreRemaining","رصيد دراهم المطلوب إعادته",o.restoreRemaining)+
 field("annualInflation","ارتفاع المصروفات سنويًا (%)",o.annualInflation)+
 field("months","مدة الرسم بالأشهر",o.months)+'</div>'+
 '<div class="buttons"><button class="button primary" data-action="ret-save-settings">حفظ التقسيم والافتراضات</button><button class="button outline" data-action="ret-reset-settings">إعادة اقتراح الأرقام من الميزانية</button></div></section>';
 return html;
}
function draws(d){
 const o=model(d);
 let html='<p class="body-note">كل سحب تضيفه هنا هو <b>سحب مخطط في المستقبل</b>؛ لا يعدّل الحسابات الفعلية. إذا سحبت من دراهم وسجلت العملية بالفعل في الحسابات، فأدخل مبلغ السحب هنا <b>صفرًا</b> لتغيير توزيع المخصصات فقط دون تكرار السحب.</p>';
 html+='<section class="panel"><h2>سحب جديد وتوزيع يدوي جديد</h2><div class="form-grid">'+
 field("draw.month","الشهر الذي يبدأ فيه التقسيم",ym(mi(curMonth())+1),"month")+
 field("draw.amount","سحب جديد من دراهم (٠ إذا نُفذ فعليًا)",0)+'</div>'+
 '<h3>المبالغ الشهرية أثناء إعادة المال</h3><div class="form-grid">'+allocationFields("draw.during",o.during)+'</div>'+
 '<h3>المبالغ الشهرية بعد اكتمال إعادته</h3><div class="form-grid">'+allocationFields("draw.after",o.after)+'</div>'+
 '<button class="button primary" data-action="ret-add-draw">اعتماد السحب والتقسيم الجديد في التوقعات</button></section>';
 html+='<section class="panel"><h2>قرارات السحب السابقة في هذه الخطة</h2>';
 if(!o.draws.length)html+='<p class="hint">لم تضف أي سحوبات مستقبلية بعد.</p>';
 else for(const e of o.draws.slice().sort((a,b)=>a.month.localeCompare(b.month)))html+='<div class="list-row"><div><b>'+esc(e.month)+' — '+money(e.amount)+'</b><small>إعادة دراهم شهريًا: '+money(e.during?.restore)+' • فيزا: '+money(e.during?.visa)+' • استثمار: '+money(e.during?.invest)+'</small></div><button class="button danger" data-action="ret-remove-draw" data-id="'+esc(e.id)+'">حذف</button></div>';
 html+='</section>';return html;
}
function method(){
 return '<section class="panel"><h2>طريقة الحساب — الحقيقي مقابل المتوقع</h2><div class="rules">'+
 '<p><b>١. الأرصدة الحالية:</b> تؤخذ مباشرة من الحسابات والفيزا ودراهم كما هي محفوظة؛ لا تُحسب حركات الاستيراد التاريخية مرة أخرى.</p>'+
 '<p><b>٢. إعادة دراهم:</b> تحويل من النقد إلى محفظتك، وليس مصروف معيشة. السحب المخطط يعكس الحركة: ينقص المحفظة ويزيد النقد ويرفع المتبقي المطلوب إعادته.</p>'+
 '<p><b>٣. الفيزا:</b> المشتريات المستقبلية تزيد رصيد الدين فقط، والسداد ينقص الدين والسيولة مرة واحدة.</p>'+
 '<p><b>٤. المشاريع والالتزامات:</b> الأموال المحولة لها تبقى في رصيد مخصص منفصل؛ لا تُعامل كمصروف حتى يأتي الاستحقاق المسجل ويُغطى منها.</p>'+
 '<p><b>٥. كل سحب جديد:</b> يعتمد تقسيمًا شهريًا يدويًا جديدًا أثناء الإعادة وبعد اكتمالها، دون تعديل العمليات التاريخية.</p>'+
 '<p><b>٦. التقاعد:</b> يتغير الدخل من الراتب إلى المعاش في الشهر المحدد؛ لا يُفترض أي دخل جديد من مشاريع أو أرباح محفظة دون إدخاله وتوثيقه.</p>'+
 '<p><b>٧. حدود التوقع:</b> سداد القروض وتكاليف البطاقة والتضخم تقديرات قابلة للتعديل؛ لا تعتمد الرسوم وحدها لاتخاذ قرار تمويلي.</p></div></section>';
}
function render(d,sub){
 return sub==="allocations"?allocations(d):sub==="draws"?draws(d):sub==="method"?method():charts(d);
}
function action(d,action,btn,rootElement,commit){
 const read=k=>rootElement.querySelector('[data-ret="'+k+'"]')?.value;
 const values=prefix=>{
  const o=defAlloc();for(const k of fields){if(prefix.endsWith("after")&&k==="restore"){o[k]=0;continue}const v=Number(read(prefix+"."+k));if(!Number.isFinite(v)||v<0)throw Error("أدخل مبلغًا صحيحًا غير سالب لخانة "+names[k]);o[k]=v}return o;
 };
 const m=model(d);
 if(action==="ret-save-settings"){
  const v={...m,during:values("during"),after:values("after")};
  for(const k of ["salary","pension","living","loanPayment","visaNew","visaFees","visaAPR","restoreRemaining","annualInflation","months"]){const x=Number(read(k));if(!Number.isFinite(x)||x<0)throw Error("تحقق من خانة "+k);v[k]=x}
  const rt=read("retirement");if(!/^\d{4}-\d{2}$/.test(rt))throw Error("حدد شهر التقاعد");
  v.retirement=rt;v.months=Math.min(240,Math.max(24,Math.round(v.months||144)));
  d.retirement=v;commit();return true;
 }
 if(action==="ret-add-draw"){
  const month=read("draw.month"),amount=Number(read("draw.amount"));
  if(!/^\d{4}-\d{2}$/.test(month)||mi(month)<mi(curMonth()))throw Error("اختر الشهر الحالي أو شهرًا مستقبلًا.");
  if(!Number.isFinite(amount)||amount<0)throw Error("مبلغ السحب يجب أن يكون صفرًا أو أكثر.");
  if(m.draws.some(x=>x.month===month))throw Error("يوجد تقسيم آخر يبدأ في هذا الشهر. احذف القديم قبل إضافة الجديد.");
  const entry={id:"draw"+Date.now().toString(36),month,amount,during:values("draw.during"),after:values("draw.after")};
  m.draws.push(entry);d.retirement=m;commit();return true;
 }
 if(action==="ret-remove-draw"){
  if(!confirm("حذف هذا السحب المخطط وتقسيمه الشهري من التوقعات؟ لن تتغير الحركات البنكية."))return true;
  m.draws=m.draws.filter(x=>x.id!==btn.dataset.id);d.retirement=m;commit();return true;
 }
 if(action==="ret-reset-settings"){
  if(!confirm("إعادة افتراضات التقاعد من خطة المستقبل والميزانية الحالية؟ سيُحذف تخصيصك اليدوي لكن لا تتغير الأرصدة والحركات."))return true;
  d.retirement=defaults(d);commit();return true;
 }
 return false;
}
root.RetirementApp={render,action,simulate,defaults,dataSnapshot};
})(window);