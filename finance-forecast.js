"use strict";
(function(root){
 const n=x=>Number(x)||0,positive=x=>Math.max(0,n(x));
 const fmt=x=>new Intl.NumberFormat("ar-SA",{maximumFractionDigits:0}).format(n(x))+" ر.س";
 const pct=x=>Math.min(100,Math.max(0,x));
 const safe=x=>String(x==null?"":x).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const latestMonth=(data)=>{
  const available=[...new Set((data.budget||[]).map(x=>x.month))].sort();
  // Prefer the current/future month's recorded budget, not an older or paid month.
  const now=new Date(),next=new Date(now.getFullYear(),now.getMonth()+1,1);
  const key=next.getFullYear()+"-"+String(next.getMonth()+1).padStart(2,"0");
  return available.find(x=>x>=key)||available[available.length-1]||key;
 };
 const startMonth=()=>{
  const now=new Date(),d=new Date(now.getFullYear(),now.getMonth()+1,1);
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");
 };
 const balance=(data,a)=>n(a.opening)+(data.moves||[]).reduce((v,m)=>{
  if(m.posted===false)return v;
  return v+(m.to===a.id?positive(m.amount):0)-(m.from===a.id&&!m.bankAlreadyPosted?positive(m.amount):0);
 },0);
 const debtBalance=(data,d)=>Math.max(0,n(d.opening)+(data.moves||[]).reduce((v,m)=>{
  if(m.posted===false||m.debtId!==d.id)return v;
  return v+(m.kind==="charge"?positive(m.amount):m.kind==="repayment"?-positive(m.principal):0);
 },0));
 function snapshot(data,overrides={}){
  if(!root.FinanceEngine)throw Error("محرك التوقعات غير متوفر");
  const original=data.legacy?.future;
  if(!original||!original.settings)return null;
  const plan=root.FinanceEngine.normalized(original);
  const month=latestMonth(data),items=(data.budget||[]).filter(x=>x.month===month);
  const budgetSalary=n(data.legacy?.budgetMonths?.[month]?.salary);
  const getSum=fn=>items.filter(fn).reduce((v,x)=>v+positive(x.amount),0);
  const expense=getSum(x=>x.type==="expense"),saving=getSum(x=>x.type==="saving"),invest=getSum(x=>x.type==="investment");
  const visaBudget=getSum(x=>x.type==="debt"&&/فيزا|visa/i.test(x.name||""));
  const fallbackLoans=getSum(x=>x.type==="debt"&&!/فيزا|visa|دراهم/i.test(x.name||""));
  if((data.commitments||[]).length){
   plan.goals=data.commitments.map(c=>{
    const previous=(plan.goals||[]).find(g=>g.id===c.sourceId||g.name===c.name)||{};
    const repeat=Math.max(1,Math.round(n(c.count)||1)),gap=Math.max(1,Math.round(n(c.interval)||12));
    return{...previous,id:c.sourceId||c.id,name:c.name,date:c.firstMonth,amount:positive(c.amount),count:repeat,interval:gap,
      paymentMode:repeat===1?"once":gap===1?"monthly":"periodic",enabled:c.active!==false,
      useObligations:typeof c.useObligations==="boolean"?c.useObligations:!!previous.useObligations};
   });
  }
  const accounts=data.accounts||[],bankCash=accounts.filter(x=>x.role==="bank").reduce((v,x)=>v+balance(data,x),0),
    reservedCash=accounts.filter(x=>x.role==="reserve").reduce((v,x)=>v+balance(data,x),0),
    invested=accounts.filter(x=>x.role==="investment").reduce((v,x)=>v+Math.max(0,balance(data,x)),0);
  plan.settings.start=startMonth();
  plan.settings.months=Math.max(12,Math.min(240,Math.round(n(overrides.horizon)||120)));
  if(budgetSalary>0)plan.settings.salary=budgetSalary;
  if(items.length)plan.settings.monthlyExpenses=expense;
  plan.settings.openingCash=bankCash;
  plan.settings.openingObligations=Math.max(0,reservedCash);
  if(items.length)plan.settings.monthlyObligationsSaving=saving;
  if(fallbackLoans>0)plan.settings.fallbackLoanInstallments=fallbackLoans;
  // Never assume that a proposed project generates real income.
  plan.settings.projectIncome=0;
  if(items.length&&visaBudget>0)plan.visa.paymentPool=visaBudget;
  if(items.length)plan.darahim.newInvestment=invest;
  if(accounts.some(x=>x.role==="investment"))plan.darahim.currentPortfolio=invested;
  const credits=(data.debts||[]).filter(x=>x.kind==="credit");
  if(credits.length){
   const v1=credits.find(x=>/فيزا\s*[١1]/.test(x.name||""))||credits[0];
   const v2=credits.find(x=>/فيزا\s*[٢2]/.test(x.name||""))||credits.find(x=>x.id!==v1.id);
   plan.visa.v1=debtBalance(data,v1);plan.visa.v2=v2?debtBalance(data,v2):0;
  }
  for(const l of plan.loans||[]){
   const current=(data.debts||[]).find(x=>x.kind==="loan"&&(x.sourceId===l.id||x.name===l.name));
   if(current)l.balance=debtBalance(data,current);
  }
  if(overrides.retirement&&/^\d{4}-\d{2}$/.test(overrides.retirement))plan.settings.retirement=overrides.retirement;
  for(const [field,min,max] of [["pension",0,1000000],["monthlyExpenses",0,1000000],["monthlyObligationsSaving",0,1000000]]){
   if(overrides[field]!==undefined&&overrides[field]!==null&&String(overrides[field]).trim()!=="")plan.settings[field]=Math.max(min,Math.min(max,n(overrides[field])));
  }
  for(const [field,min,max] of [["paymentPool",0,1000000],["newMonthly",0,1000000]]){
   if(overrides[field]!==undefined&&overrides[field]!==null&&String(overrides[field]).trim()!=="")plan.visa[field]=Math.max(min,Math.min(max,n(overrides[field])));
  }
  if(overrides.annualNetReturn!==undefined&&String(overrides.annualNetReturn).trim()!=="")plan.darahim.annualNetReturn=Math.max(0,Math.min(50,n(overrides.annualNetReturn)));
  return{plan,month,budgetSalary,actualCash:bankCash+reservedCash,visaBalance:plan.visa.v1+plan.visa.v2,invested};
 }
 function calculations(data){
  const input=snapshot(data,data.forecastOverrides||{});
  if(!input)return null;
  return{...input,result:root.FinanceEngine.simulate(input.plan)};
 }
 const color={
  visa:"#e77b7d",restored:"#8c6ad3",cash:"#5277e4",reserve:"#40a8b8",negative:"#c94256"
 };
 function axisBar(label,value,max,shade){
  const proportion=pct(Math.abs(value)/Math.max(1,max)*100);
  const sign=value<0?"negative":"";
  return'<div class="forecast-bar-row '+sign+'"><div class="forecast-bar-head"><span>'+safe(label)+'</span><b>'+fmt(value)+'</b></div><div class="forecast-track"><div class="forecast-fill" style="width:'+proportion+'%;background:'+shade+'"></div></div></div>';
 }
 function periodLabels(r,retirement,step=6){
  const samples=r.rows.filter((x,i)=>i%step===0||i===r.rows.length-1||x.month===retirement||i>0&&r.rows[i-1].month<retirement&&x.month>=retirement);
  return samples;
 }
 function range(items,fn){return Math.max(1,...items.map(fn).map(Math.abs));}
 function infoCard(title,value,hint,c){
  return'<div class="forecast-stat '+(c||"")+'"><small>'+safe(title)+'</small><strong>'+fmt(value)+'</strong><span>'+safe(hint)+'</span></div>';
 }
 function forecastNote(){
  return'<div class="forecast-note"><b>تخطيط مستقبلي — وليس رصيدًا فعليًا</b><span>الأرصدة الحالية والميزانية من البيانات المسجلة. بعد ذلك تُستخدم افتراضات للدخل والتقاعد والمصروفات وعائد دراهم. النتائج تتغير عند تعديل الافتراضات، ولا تعني أن هذه العمليات دُفعت أو أن العائد مضمون.</span></div>';
 }
 function assumptions(data,input){
  const p=input.plan,ov=data.forecastOverrides||{};
  const field=(label,name,val,type="number")=>'<label class="form-field"><span>'+safe(label)+'</span><input type="'+type+'" name="f_'+name+'" value="'+safe(val)+'" '+(type==="number"?'min="0" step="any" inputmode="decimal"':"")+'></label>';
  const select='<label class="form-field"><span>المدة التي تريد رؤيتها</span><select name="f_horizon">'+[60,120,180,240].map(v=>'<option value="'+v+'" '+(p.settings.months===v?'selected':'')+'>'+(v/12)+' سنوات</option>').join("")+'</select></label>';
  return'<details class="forecast-settings"><summary>تعديل افتراضات التوقع (اختياري)</summary>'+
   '<p class="hint">القيم الأساسية تأتي من أحدث ميزانية وأرصدة الحسابات. تعديلاتك هنا تخص الرسوم المستقبلية فقط، ولا تغيّر أي مصروف أو رصيد مسجل.</p>'+
   '<div class="forecast-settings-grid">'+select+
   field("تاريخ بدء التقاعد","retirement",p.settings.retirement,"month")+
   field("الراتب التقاعدي الشهري","pension",p.settings.pension)+
   field("مصروف المعيشة الشهري","monthlyExpenses",p.settings.monthlyExpenses)+
   field("ادخار حساب الالتزامات شهريًا","monthlyObligationsSaving",p.settings.monthlyObligationsSaving)+
   field("مبلغ سداد الفيزا ودراهم شهريًا","paymentPool",p.visa.paymentPool)+
   field("مشتريات الفيزا الجديدة شهريًا","newMonthly",p.visa.newMonthly)+
   field("عائد دراهم السنوي الافتراضي (%)","annualNetReturn",p.darahim.annualNetReturn)+
   '</div><div class="buttons"><button type="button" class="button primary" data-action="saveForecast">تحديث الرسم</button><button type="button" class="button outline" data-action="resetForecast">الرجوع لقيم البيانات الأصلية</button></div></details>';
 }
 function visaView(data,model){
  const p=model.plan,r=model.result,rows=periodLabels(r,p.settings.retirement,Math.max(6,Math.ceil(r.rows.length/12))),max=range(rows,x=>Math.max(x.visaDebt,x.restoreAccumulated));
  return'<div class="forecast-metrics">'+
  infoCard("رصيد الفيزا الآن",model.visaBalance,"من الحسابات المستوردة","coral")+
  infoCard("رصيد الفيزا بنهاية الفترة",r.summary.lastVisa,"حسب سداد الفيزا والمشتريات","coral")+
  infoCard("إعادة رأسمال دراهم خلال الخطة",Math.max(0,p.darahim.restoreTarget-r.summary.restoreLeft),"مقدار مفترض إعادة استثماره","violet")+
  infoCard("متبقي لإعادة رأس مال دراهم",r.summary.restoreLeft,"مبلغ مخطط لإعادته","blue")+
  '</div>'+
  '<div class="forecast-card"><h3>علاقة سداد الفيزا بإعادة رأس مال دراهم</h3><p class="hint">الأحمر: الرصيد المتوقع للفيزا • البنفسجي: المتراكم في إعادة رأس مال دراهم. البيانات تُعرض على فترات منتظمة لتقليل الازدحام.</p>'+
  rows.map(row=>'<div class="forecast-month '+(row.retired?"retired":"")+'"><b>'+safe(row.month)+(row.month===p.settings.retirement?' — بداية التقاعد':'')+'</b>'+
  axisBar("الدين المتبقي للفيزا",row.visaDebt,max,color.visa)+
  axisBar("المعاد إلى دراهم",row.restoreAccumulated,max,color.restored)+'</div>').join("")+'</div>';
 }
 function liquidityView(data,model){
  const p=model.plan,r=model.result,rows=periodLabels(r,p.settings.retirement,Math.max(6,Math.ceil(r.rows.length/12))),max=range(rows,x=>Math.max(Math.abs(x.cash),x.obligationsReserve));
  const before=r.rows.filter(x=>!x.retired),after=r.rows.filter(x=>x.retired);
  const retireLine=after[0]||null;
  return'<div class="forecast-metrics">'+
  infoCard("سيولة البداية المسجلة",model.actualCash,"مجموع الحسابات البنكية والالتزامات","blue")+
  infoCard("قبل التقاعد",before.at(-1)?.cash||0,"السيولة الحرة المتوقعة آخر شهر عمل","violet")+
  infoCard("بعد عام من التقاعد",after[Math.min(11,after.length-1)]?.cash||0,"السيولة الحرة المتوقعة بعد ١٢ شهرًا","amber")+
  infoCard("نهاية المدة",r.summary.cash,"السيولة الحرة المتوقعة","coral")+'</div>'+
  '<div class="forecast-card"><h3>السيولة عبر الزمن — قبل التقاعد وبعده</h3><p class="hint">الأزرق: النقد الحر المتوقع • السماوي: مدخرات الالتزامات غير المخصصة. العجز بالسالب يظهر بالأحمر. علامة التقاعد واضحة عند بداية الفترة.</p>'+
  rows.map(x=>'<div class="forecast-month '+(x.retired?"retired":"")+'">'+(x.month===p.settings.retirement?'<div class="retirement-divider">بداية التقاعد — '+safe(p.settings.retirement)+'</div>':'')+
  '<b>'+safe(x.month)+' <span class="forecast-era">'+(x.retired?"بعد التقاعد":"أثناء العمل")+'</span></b>'+
  axisBar("النقد الحر",x.cash,max,x.cash<0?color.negative:color.cash)+
  axisBar("مدخرات الالتزامات",x.obligationsReserve,max,color.reserve)+'</div>').join("")+'</div>'+
  '<p class="body-note">رصيد دراهم الاستثماري لا يدخل في هذه السيولة الحرة، ومدخرات الالتزامات معروضة منفصلة حتى لا تُحسب مرتين. لا تُعتبر الأموال المحجوزة للأهداف مصروفًا قبل الاستحقاق.</p>';
 }
 function render(data,view){
  const model=calculations(data);
  if(!model)return'<section class="panel"><h2>الرسوم المستقبلية</h2><div class="empty">لا توجد خطة مستقبل مستوردة بعد. استورد ملف النسخة الشاملة من «البيانات ← النسخ والاستيراد» لإظهار علاقة الفيزا ودراهم والسيولة والتقاعد.</div></section>';
  const title=view==="visa"?"سداد الفيزا وإعادة دراهم":"السيولة والتقاعد";
  const warnings=model.result.warnings||[];
  const caveats=warnings.filter(x=>/افتراض|تقاعد|أقساط إجمالية|عجز/.test(x)).slice(0,3);
  return forecastNote()+assumptions(data,model)+
  (view==="visa"?visaView(data,model):liquidityView(data,model))+
  (caveats.length?'<div class="forecast-caveat"><b>ملاحظات المحاكاة:</b> '+caveats.map(safe).join(" • ")+'</div>':"");
 }
 root.FinanceForecast={render,snapshot,calculations};
})(window);