"use strict";
(function(root){
 const asMoney=x=>new Intl.NumberFormat("ar-SA",{maximumFractionDigits:0}).format(Number(x)||0)+" ر.س";
 const escape=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const amount=x=>Math.max(0,Number(x)||0);
 const kMonth=x=>{const d=new Date(x||Date.now());return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")};
 const idx=m=>{const a=String(m||"").split("-").map(Number);return a.length===2&&a[0]>=2000&&a[1]>=1&&a[1]<=12?a[0]*12+a[1]-1:NaN};
 const mAt=i=>Math.floor(i/12)+"-"+String(i%12+1).padStart(2,"0");
 const normalize=s=>String(s||"").normalize("NFKC").replace(/[\u064B-\u065F\u0670]/g,"").replace(/[إأآ]/g,"ا").replace(/[\s_\-–—]+/g,"").toLowerCase();
 function monthlyPlan(data,now=kMonth()){
   const months=[...new Set((data.budget||[]).map(x=>x.month))].filter(m=>Number.isFinite(idx(m))).sort();
   const selected=data.obligationForecast?.referenceMonth;
   if(selected&&months.includes(selected))return selected;
   return months.find(m=>m>now)||months.filter(m=>m<=now).at(-1)||"";
 }
 function monthlySaving(data,ref){
   const all=(data.budget||[]).filter(x=>x.month===ref);
   const items=all.filter(x=>x.type==="saving" && (/التزام/i.test(x.name||"")||
     (!x.name||x.type==="saving"&&data.accounts?.some(a=>a.role==="reserve"&&(a.id===x.bankAccountId||a.legacyId===x.linkedBankId)))||
     // Earlier versions used the saving type specifically for obligations transfers.
     !all.some(t=>t.type==="saving"&&/التزام/i.test(t.name||""))));
   const planned=items.reduce((s,x)=>s+amount(x.amount),0);
   const excluded=new Set(items);
   const other=all.filter(x=>!excluded.has(x)).reduce((s,x)=>s+amount(x.amount),0);
   const legacy=data.legacy?.budgetMonths||{},overrides=data.budgetIncomeOverrides||{};
   const months=[...new Set([...Object.keys(legacy),...Object.keys(overrides)])].filter(m=>Number.isFinite(idx(m))&&m<=ref).sort();
   const source=months.at(-1),own=overrides[ref]||overrides[source],old=legacy[ref]||legacy[source];
   const salary=own?.salary??old?.salary??data.legacy?.future?.settings?.salary;
   const lines=incomeSources(data,ref).length?incomeSources(data,ref):(own?.lines||old?.incomeLines||[]);
   const known=salary!=null&&Number.isFinite(Number(salary));
   const income=known?amount(salary)+lines.reduce((t,x)=>t+amount(x.amount),0):null;
   const canSave=known?Math.max(0,income-other):planned;
   const money=Math.min(planned,canSave);
   return {money,planned,shortfall:planned-money,known,income,other,items,source};
 }
 function incomeSources(data,month){
   const overlay=data.budgetIncomeOverrides?.[month];
   if(Array.isArray(overlay?.lines))return overlay.lines;
   return data.legacy?.budgetMonths?.[month]?.incomeLines||[];
 }
 function isIncomeAlreadyBudgeted(data,project,reference){
   if(project.profitInBudget)return true;
   const key=normalize(project.name);
   if(!key||key.length<4)return false;
   return incomeSources(data,reference).some(i=>{
     if(i.projectId&&i.projectId===project.id)return true;
     const name=normalize(i.name);
     return name.includes(key)||key.includes(name)&&name.length>=5;
   });
 }
 function hasProfit(project){
   return !!project.forecastEnabled&&amount(project.expectedNetProfit)>0&&
     amount(project.profitToObligations)>0&&Number.isFinite(idx(project.profitStart));
 }
 function profitOn(project,month){
   if(!hasProfit(project))return 0;
   const interval=Math.max(0,Math.floor(Number(project.profitInterval)||0));
   const from=idx(project.profitStart),to=idx(month),delta=to-from;
   if(delta<0)return 0;
   if(interval===0)return delta===0?Math.min(amount(project.profitToObligations),amount(project.expectedNetProfit)):0;
   if(delta%interval!==0)return 0;
   const count=Math.floor(amount(project.profitCount));
   if(count>0&&delta/interval>=count)return 0;
   return Math.min(amount(project.profitToObligations),amount(project.expectedNetProfit));
 }
 function isObligationsDue(c){
   if(c.obligationFundingExplicit===true)return !!c.useObligations;
   if(c.useObligations===true)return true;
   // Old backup imports set false even when the source goal never specified a funding account.
   return /مدرس|تعليم|جامع|رسوم|سيار|صيان|مركب|فحص|تأمين|مركبة/i.test(c.name||"");
 }
 function dataInputs(data,opts={}){
   const now=opts.now||kMonth(),reference=monthlyPlan(data,now),base=monthlySaving(data,reference);
   const accounts=(data.accounts||[]).filter(x=>x.role==="reserve");
   const reserve=accounts.reduce((s,a)=>s+Number(a.opening||0)+Number(a.balanceAdjustment||0)+(data.moves||[]).reduce((total,m)=>{
     if(m.posted===false)return total;
     return total+(m.to===a.id?amount(m.amount):0)-(m.from===a.id&&!m.bankAlreadyPosted?amount(m.amount):0);
   },0),0);
   const projects=(data.projects||[]).filter(hasProfit);
   const overlaps=projects.filter(p=>isIncomeAlreadyBudgeted(data,p,reference));
   const validProjects=projects.filter(p=>!isIncomeAlreadyBudgeted(data,p,reference));
   const dues=(opts.dues||[]).filter(x=>{
     const c=(data.commitments||[]).find(g=>g.id===x.id);
     return c&&isObligationsDue(c)&&amount(x.rest)>0&&Number.isFinite(idx(x.date));
   }).map(x=>({...x,rest:amount(x.rest)})).sort((a,b)=>a.date.localeCompare(b.date)||String(a.id).localeCompare(String(b.id)));
   return {now,reference,base,initialReserve:reserve,dues,projects:validProjects,overlaps};
 }
 function scenario(i,withProjects,months){
   const from=idx(i.now),last=from+months,byMonth=new Map();
   for(const due of i.dues){
     const t=idx(due.date);
     if(t<from||t>=last)continue;
     if(!byMonth.has(t))byMonth.set(t,[]);
     byMonth.get(t).push(due);
   }
   const items=[],rows=[];let reserve=i.initialReserve,overdue=0,totalMissing=0,projectAdded=0;
   for(let t=from;t<last;t++){
     const month=mAt(t),saved=t>from?i.base.money:0;
     const additional=t>from&&withProjects?i.projects.reduce((s,p)=>s+profitOn(p,month),0):0;
     reserve+=saved+additional;
     projectAdded+=additional;
     const oldUnpaid=Math.min(Math.max(0,reserve),overdue);
     reserve-=oldUnpaid;overdue-=oldUnpaid;
     const dues=byMonth.get(t)||[];
     const required=dues.reduce((s,x)=>s+x.rest,0);
     const before=reserve;
     const fraction=required?Math.max(0,Math.min(1,reserve/required)):1;
     const covered=required*fraction,missing=required-covered;
     for(const due of dues)items.push({key:due.key,name:due.name,date:due.date,amount:due.rest,before,covered:due.rest*fraction,uncovered:due.rest*(1-fraction),saved,profit:additional});
     reserve-=covered;overdue+=missing;totalMissing+=missing;
     rows.push({month,closing:Math.max(0,reserve),arrears:overdue,saved,profit:additional,required,covered,missing});
   }
   return {items,rows,totalMissing,projectAdded,finalReserve:Math.max(0,reserve),remainingArrears:overdue};
 }
 function simulate(data,opts={}){
   const i=dataInputs(data,opts),months=Math.max(12,Math.min(240,Math.floor(Number(opts.months||data.obligationForecast?.months||120))));
   return {...i,months,without:scenario(i,false,months),with:scenario(i,true,months)};
 }
 function firstDeficit(s){
   const d=s.items.find(x=>x.uncovered>.005);
   return d?d.date+" • "+d.name+" • "+asMoney(d.uncovered):"لا يوجد ضمن الفترة المختارة";
 }
 function status(value,label){
   return '<span class="obligation-status '+(value>.005?"missing":"covered")+'">'+label+': '+(value>.005?"عجز "+asMoney(value):"مغطى بالكامل")+'</span>';
 }
 function summary(data,opts={}){
   const s=simulate(data,{...opts,months:opts.months||data.obligationForecast?.months||120});
   const deficits=s.with.items.filter(x=>x.uncovered>.005);
   return '<section class="panel"><div class="panel-top"><h2>هل تكفي مدخرات الالتزامات عند الاستحقاق؟</h2></div>'+
     '<div class="obligation-kpis"><div><small>الرصيد الحالي الحقيقي</small><strong>'+asMoney(s.initialReserve)+'</strong></div>'+
     '<div><small>ادخار شهري قابل للتغطية</small><strong>'+asMoney(s.base.money)+'</strong></div>'+
     '<div><small>أول عجز متوقع مع المشاريع</small><strong class="'+(deficits.length?"danger":"good")+'">'+escape(firstDeficit(s.with))+'</strong></div></div>'+
     '<p class="hint">حساب توقع يبدأ من الرصيد الحالي ويضيف تحويلات الشهور القادمة، ثم يخصم الرسوم عند موعدها. الأرباح المتوقعة غير مضمونة.</p>'+
     '<button class="button primary" type="button" data-action="showObligationForecast">عرض التنبؤ بالتفصيل مع أرباح المشاريع وبدونها</button></section>';
 }
 function graph(rows){
   const r=rows.filter((_,j)=>j<12);
   const max=Math.max(1,...r.map(x=>Math.max(x.base,x.with)));
   return '<div class="obligation-projection-chart">'+r.map((x,j)=>{
     const a=x.base<0?0:x.base,b=x.with<0?0:x.with;
     return '<div class="obligation-mini"><small>'+escape(x.month)+'</small>'+
       '<div><span class="obligation-bar base" style="width:'+Math.min(100,100*a/max)+'%"></span><b>'+asMoney(a)+'</b></div>'+
       '<div><span class="obligation-bar profit" style="width:'+Math.min(100,100*b/max)+'%"></span><b>'+asMoney(b)+'</b></div></div>';
   }).join("")+'</div>';
 }
 function view(data,opts={}){
   const s=simulate(data,opts),months=[12,24,60,120,180,240],choices=[...new Set((data.budget||[]).map(x=>x.month))].filter(m=>Number.isFinite(idx(m))).sort();
   const current=s.months,items=s.with.items.slice(0,40);
   const noByKey=new Map(s.without.items.map(x=>[x.key,x]));
   const timeline=s.with.rows.map((x,j)=>({month:x.month,with:x.closing,base:s.without.rows[j].closing}));
   let out='<section class="panel"><div class="panel-top"><h2>التنبؤ بتغطية المستحقات</h2></div>'+
     '<p class="body-note">الأرصدة الحالية والأقساط المسددة فعلية؛ الأرقام المستقبلية تقديرات. التحويلات الشهرية من الميزانية، وأرباح المشاريع لا تدخل إلا في سيناريو «مع المشاريع».</p>'+
     '<div class="obligation-forecast-controls"><label>شهر الميزانية المرجعي<select id="obligationForecastBase">'+
     choices.map(m=>'<option value="'+escape(m)+'" '+(m===s.reference?"selected":"")+'>'+escape(m)+'</option>').join("")+'</select></label>'+
     '<label>مدة التنبؤ<select id="obligationForecastMonths">'+
     months.map(m=>'<option value="'+m+'" '+(m===current?"selected":"")+'>'+m+' شهرًا</option>').join("")+'</select></label></div>'+
     '<div class="obligation-kpis"><div><small>رصيد حساب الالتزامات الآن</small><strong>'+asMoney(s.initialReserve)+'</strong></div>'+
     '<div><small>ادخار شهري ممكن من الميزانية</small><strong>'+asMoney(s.base.money)+'</strong></div>'+
     '<div><small>إجمالي الأرباح المحولة ضمن الفترة</small><strong>'+asMoney(s.with.projectAdded)+'</strong></div></div>'+
     '<div class="obligation-comparison"><div><b>بدون أرباح مشاريع</b><small>أول عجز: '+escape(firstDeficit(s.without))+'</small></div>'+
     '<div><b>مع أرباح المشاريع</b><small>أول عجز: '+escape(firstDeficit(s.with))+'</small></div></div>';
   if(s.base.shortfall>.005)out+='<p class="obligation-warning">بنود ادخار الالتزامات المخططة: '+asMoney(s.base.planned)+'، لكن المتاح حسب دخل ومخصصات الميزانية: '+asMoney(s.base.money)+' فقط. خُفض الادخار المتوقع بمقدار '+asMoney(s.base.shortfall)+' شهريًا لتجنب توقع تغطية غير ممكنة.</p>';
   if(!s.base.known&&s.base.planned>0)out+='<p class="obligation-warning">الدخل المخطط للميزانية المرجعية غير معروف؛ استُخدم الادخار المحدد دون التحقق من قدرته على التغطية.</p>';
   if(!s.reference)out+='<p class="obligation-warning">لا توجد ميزانية شهرية للادخار. سيُحسب رصيد اليوم والاستحقاقات فقط، حتى تُدخل بند «الالتزامات» في ميزانية شهر.</p>';
   if(s.overlaps.length)out+='<p class="obligation-warning">لمنع احتساب الدخل مرتين، لم تُضف أرباح المشاريع المسجلة أيضًا في مصادر دخل الميزانية: '+s.overlaps.map(x=>escape(x.name)).join("، ")+'؛ ويُفترض أن مخصصاتها مدرجة ضمن الادخار الشهري.</p>';
   out+='<p class="hint">الادخار الشهري يفترض تكرار مبلغ الميزانية المرجعية. لا نضيف ادخار الشهر الحالي مرة ثانية لأنه قد دخل بالفعل في الرصيد؛ ومن الشهر التالي نفترض التحويل قبل سداد الرسوم. وإذا كانت الميزانية عاجزة فلا تعد هذه التحويلات مضمونة.</p>';
   out+='</section><section class="panel"><h2>كل استحقاق: مقارنة التمويل عند موعده</h2>';
   if(!items.length)out+='<p class="hint">لا توجد استحقاقات من حساب الالتزامات ضمن الفترة المختارة، أو أنها مسددة بالفعل.</p>';
   for(const x of items){
     const base=noByKey.get(x.key);
     out+='<div class="obligation-due-row"><div class="obligation-due-title"><b>'+escape(x.name)+'</b><small>'+escape(x.date)+' • المطلوب '+asMoney(x.amount)+'</small></div>'+
       '<div class="obligation-two-status">'+status(base?.uncovered||0,"بدون أرباح المشاريع")+
       status(x.uncovered,"مع أرباح المشاريع")+'</div></div>';
   }
   if(s.with.items.length>40)out+='<p class="hint">عُرض أول ٤٠ استحقاقًا؛ يمكن تقليص فترة التنبؤ من الأعلى.</p>';
   out+='</section><details class="panel"><summary>رسم رصيد حساب الالتزامات خلال ١٢ شهرًا</summary>'+
     '<div class="obligation-chart-legend"><span>بنفسجي: دون الأرباح</span><span>سماوي: مع الأرباح</span></div>'+
     graph(timeline)+'</details>';
   out+='<p class="body-note">إذا عجزت المدخرات في شهر معين، يحتفظ التنبؤ بالمبلغ غير الممول ويعطيه أولوية قبل الاستحقاقات التالية، حتى لا يبدو الهدف التالي ممولًا بأموال كانت مطلوبة سابقًا. إذا تعددت الاستحقاقات في الشهر نفسه، يوزع الرصيد المتاح بينها بالتناسب.</p>';
   return out;
 }
 root.ObligationForecast={simulate,summary,view,profitOn,isIncomeAlreadyBudgeted,isObligationsDue};
})(window);