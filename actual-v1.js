"use strict";
(function(){
const KEY="bms_actual_20261114_v1";
const $=id=>document.getElementById(id);
const now=()=>{const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")};
const month=()=>now().slice(0,7);
const uid=()=>Math.random().toString(36).slice(2,10)+Date.now().toString(36);
const money=v=>new Intl.NumberFormat("ar-SA",{maximumFractionDigits:2}).format(Number(v)||0)+" ر.س";
const num=v=>Math.max(0,Number(v)||0);
const esc=x=>String(x==null?"":x).replace(/[&<>"']/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[t]));
const def=()=>({version:2,created:now(),accounts:[],moves:[],budget:[],commitments:[],debts:[],projects:[],journal:[],seenHashes:{},learnedRules:[],legacy:{budgetMonths:{},incomeRecords:[],debtLogs:[]}});
let data;
try{data=JSON.parse(localStorage.getItem(KEY)||"null")||def();}catch(e){data=def()}
["accounts","moves","budget","commitments","debts","projects","journal"].forEach(k=>{if(!Array.isArray(data[k]))data[k]=[]});
if(!data.seenHashes||typeof data.seenHashes!=="object")data.seenHashes={};
if(!Array.isArray(data.learnedRules))data.learnedRules=[];
if(!data.legacy||typeof data.legacy!=="object")data.legacy={budgetMonths:{},incomeRecords:[],debtLogs:[]};
let page="home",sub="summary",period=month(),modalType="",editingId="",chartKind="expenses",smsDraft=null,smsStatus="";
const nav={
home:[["summary","ملخص اليوم"],["recent","آخر الحركات"]],
accounts:[["balances","الأرصدة الحقيقية"],["transfers","التحويلات"],["paste","لصق رسالة البنك"]],
budget:[["month","ميزانية الشهر"],["categories","المصروفات الفعلية"],["history","الأشهر السابقة"]],
moves:[["ledger","سجل الحركات"],["income","الإيرادات"],["spend","المصروفات"],["paste","إدخال من رسالة"]],
obligations:[["reserve","حساب الادخار"],["due","الاستحقاقات"],["catalog","إدارة المواعيد"],["paid","المدفوع فعليًا"]],
debts:[["balances","أرصدة الديون"],["payments","السداد المثبت"],["paste","لصق رسالة الفيزا"],["history","سجلات الفيزا المستوردة"]],
investments:[["darahim","محفظة دراهم"],["profits","الأرباح الفعلية"]],
projects:[["list","المشاريع"],["activity","حركات المشاريع"]],
charts:[["expenses","المصروف حسب البند"],["spending","المصروف الكامل"],["accounts","أرصدة الحسابات"],["projects","المشاريع"],["obligations","الالتزامات"],["debts","الديون"],["darahim","دراهم"],["monthly","حركة ١٢ شهرًا"]],
data:[["backup","النسخ والاستيراد"],["inspect","ملخص بيانات الاستيراد"],["about","طريقة الحساب"]]
};
const titles={home:"لوحة الواقع",accounts:"الحسابات",budget:"الميزانية",moves:"الحركات",obligations:"الالتزامات",debts:"الديون",investments:"دراهم",projects:"المشاريع",charts:"الرسوم البيانية",data:"البيانات"};
const acc=id=>data.accounts.find(x=>x.id===id);
const debt=id=>data.debts.find(x=>x.id===id);
const project=id=>data.projects.find(x=>x.id===id);
const accountBalance=a=>Number(a.opening||0)+data.moves.reduce((v,m)=>v+(m.posted===false?0:((m.to===a.id?num(m.amount):0)-(m.from===a.id&&!m.bankAlreadyPosted?num(m.amount):0))),0);
const debtsBalance=d=>Math.max(0,num(d.opening)+data.moves.reduce((v,m)=>{if(m.posted===false||m.debtId!==d.id)return v;return v+(m.kind==="charge"?num(m.amount):m.kind==="repayment"?-num(m.principal):0);},0));
const reserves=()=>data.accounts.filter(x=>x.role==="reserve");
const banks=()=>data.accounts.filter(x=>x.role==="bank"||x.role==="reserve");
const movements=(m=period)=>data.moves.filter(x=>x.date.slice(0,7)===m);
const total=(a,selector)=>a.reduce((sum,x)=>sum+(selector?selector(x):num(x.amount)),0);
const incomeM=(m=period)=>total(movements(m).filter(x=>x.kind==="income"||x.kind==="profit"));
const expenseM=(m=period)=>total(movements(m).filter(x=>x.kind==="expense"||x.kind==="charge"));
const paidM=(m=period)=>total(movements(m).filter(x=>x.kind==="repayment"));
const netCash=()=>total(banks(),accountBalance);
const reserveCash=()=>total(reserves(),accountBalance);
const invCash=()=>total(data.accounts.filter(x=>x.role==="investment"),accountBalance);
const sumDebt=()=>total(data.debts,debtsBalance);
const monthKey=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");
const changeMonth=(m,v)=>{const[y,x]=m.split("-").map(Number);if(v==="prev")return monthKey(new Date(y,x-2,1));if(v==="next")return monthKey(new Date(y,x,1));return m};
function keep(){localStorage.setItem(KEY,JSON.stringify(data));render();}
function box(title,value,hint,accent){return '<div class="metric '+(accent||'')+'"><div class="metric-label">'+esc(title)+'</div><strong>'+money(value)+'</strong><small>'+esc(hint||"")+'</small></div>'}
function panel(title,body,action){return '<section class="panel"><div class="panel-top"><h2>'+esc(title)+'</h2>'+(action||"")+'</div>'+body+'</section>'}
function blank(txt){return '<div class="empty">'+esc(txt||"لا توجد حركات مسجلة بعد")+'</div>'}
function pill(txt,type){return '<span class="pill '+(type||"")+'">'+esc(txt)+'</span>'}
function button(txt,action,id,cls){return '<button type="button" class="button '+(cls||"outline")+'" data-action="'+esc(action)+'" '+(id?'data-id="'+esc(id)+'"':"")+'>'+esc(txt)+'</button>'}
function shortDate(d){return esc(d||"غير محدد")}
function stats(items){return '<div class="metrics">'+items.join("")+'</div>'}
function options(items,selected,empty){return (empty?'<option value="">'+esc(empty)+'</option>':"")+items.map(x=>'<option value="'+esc(x[0])+'" '+(String(x[0])===String(selected)?'selected':"")+'>'+esc(x[1])+'</option>').join("")}
function getAccounts(){return data.accounts.map(a=>[a.id,a.name+" — "+money(accountBalance(a))])}
function projectOptions(){return data.projects.map(p=>[p.id,p.name])}
function allDebts(){return data.debts.map(d=>[d.id,d.name+" • "+money(debtsBalance(d))])}
function actions(type,id){return '<span class="row-actions">'+button("تعديل","edit"+type,id,"mini")+button("حذف","delete"+type,id,"mini danger")+'</span>';}
function entryList(arr,empty){
 if(!arr.length)return blank(empty);
 return '<div class="compact-list">'+arr.map(x=>'<div class="list-row"><div><b>'+esc(x.title)+'</b><small>'+esc(x.subtitle||"")+'</small></div><div class="right">'+(x.tag?pill(x.tag,x.tagType):"")+'<b class="'+(x.negative?"negative":"")+'">'+esc(x.value||"")+'</b>'+(x.actions||"")+'</div></div>').join("")+'</div>';
}
function contentHome(){
 const latest=data.moves.slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,6);
 const metrics=stats([box("النقد في الحسابات",netCash(),"يشمل حساب الالتزامات","blue"),box("المخصص للالتزامات",reserveCash(),"ضمن النقد أعلاه، لا يُضاف مرة ثانية","violet"),box("مصروف الشهر الفعلي",expenseM(),"مشتريات ومصاريف مثبتة فقط","coral"),box("مجموع الديون المثبتة",sumDebt(),"بحسب آخر أرصدة مدخلة وحركاتها","amber")]);
 if(sub==="recent")return panel("آخر الحركات المسجلة",entryList(latest.map(m=>({title:moveName(m),subtitle:m.date+" • "+esc(m.category||"")+ " • "+moveAccounts(m),value:money(m.amount),negative:m.kind==="expense"||m.kind==="charge"})),"لم تُسجّل حركات فعلية بعد"),button("تسجيل حركة","newMove",null,"primary"));
 const start=(!data.accounts.length&&!data.moves.length)?panel("البدء في المركز الجديد",'<p class="body-note">الموقع جديد وخالٍ من المدخلات القديمة. يمكنك استيراد ملف «المستقبل المالي» للمواعيد والأقساط، أو إحضار الأرصدة السابقة من نفس الجهاز. لا يتحول الموعد إلى مصروف إلا إذا سجلت عملية دفع.</p><div class="buttons">'+button("فتح الاستيراد","goData",null,"primary")+button("إضافة أول حساب","newAccount",null,"outline")+'</div>'):"";
 return metrics+start+panel("ماذا يعرض هذا المركز؟",'<div class="intro-grid"><div><span class="round-icon">✓</span><b>حقيقي ومسجل</b><p>الأرصدة والحركات والأرباح التي أدخلتها بالفعل. لا نمو افتراضي ولا حساب لعجز مستقبلي.</p></div><div><span class="round-icon">≠</span><b>ادخار ليس مصروفًا</b><p>التحويل إلى حساب الالتزامات يبقى ضمن ثروتك، ويُحسب المصروف فقط عندما تسدد فاتورة حقيقية.</p></div><div><span class="round-icon">◷</span><b>موعد غير مدفوع</b><p>رسوم الدراسة والسيارة مواعيد مخططة، وليست دفعات حقيقية إلى أن تُسجّل عملية السداد.</p></div></div>')+
 panel("ملخص هذا الشهر",entryList([{title:"دخل مثبت",value:money(incomeM())},{title:"مصاريف ومشتريات مثبتة",value:money(expenseM())},{title:"سداد ديون مثبت",value:money(paidM())},{title:"تحويل إلى حساب الادخار",value:money(total(movements().filter(m=>m.kind==="transfer"&&acc(m.to)?.role==="reserve")))}]));
}
function smsBankOptions(selected){
 return options(data.accounts.map(a=>[a.id,a.bank+" — "+a.name+" (••••"+a.last4+")"]),selected,"اختر الحساب");
}
function smsDebtOptions(selected){
 return options(data.debts.filter(x=>x.kind==="credit"||x.kind==="loan").map(x=>[x.id,x.name+" • "+money(debtsBalance(x))]),selected,"اختر الفيزا أو الدين");
}
function contentSMS(){
 const d=smsDraft;
 const desc='<p class="body-note">انسخ رسالة البنك أو الفيزا والصقها هنا، ثم اضغط «تحليل الرسالة». لن يغيّر البرنامج أي رصيد قبل مراجعتك والضغط على «تسجيل العملية». الرسائل المستوردة سابقًا أو المكررة لا تُسجل مرة أخرى.</p>';
 const input='<label class="form-field"><span>نص رسالة البنك أو البطاقة</span><textarea id="smsRaw" rows="6" spellcheck="false" placeholder="ألصق الرسالة هنا كما وصلتك من البنك">'+esc(d?.raw||"")+'</textarea></label><div class="buttons">'+button("تحليل الرسالة","analyzeSms",null,"primary")+button("مسح النص","clearSms",null,"outline")+'</div>';
 if(!d)return panel("إدخال بالنسخ واللصق",desc+input+(smsStatus?'<p class="body-note">'+esc(smsStatus)+'</p>':""));
 const kinds=[["expense","مصروف/شراء من حساب"],["income","حوالة واردة"],["transfer","تحويل بين حساباتك"],["charge","شراء بالفيزا"],["repayment","سداد فيزا أو قرض"],["profit","ربح دراهم مستلم"]];
 const fields='<div class="paste-grid">'+
 '<label class="form-field"><span>نوع العملية</span><select name="smsKind" id="smsKind">'+options(kinds,d.kind==="unclassified"?"expense":d.kind)+'</select></label>'+
 '<label class="form-field"><span>المبلغ</span><input name="smsAmount" id="smsAmount" type="number" min="0.01" step="0.01" inputmode="decimal" value="'+esc(d.amount||"")+'"></label>'+
 '<label class="form-field"><span>التاريخ</span><input name="smsDate" id="smsDate" type="date" value="'+esc(d.date)+'"></label>'+
 '<label class="form-field"><span>البند/التصنيف</span><input name="smsCategory" id="smsCategory" value="'+esc(d.category||"")+'"></label>'+
 '<label class="form-field"><span>الحساب الصادر منه</span><select name="smsFrom" id="smsFrom">'+smsBankOptions(d.from)+'</select></label>'+
 '<label class="form-field"><span>الحساب الوارد إليه</span><select name="smsTo" id="smsTo">'+smsBankOptions(d.to)+'</select></label>'+
 '<label class="form-field"><span>الفيزا / القرض</span><select name="smsDebt" id="smsDebt">'+smsDebtOptions(d.debtId)+'</select></label>'+
 '<label class="form-field"><span>أصل الدين المسدد (فيزا: كامل المبلغ غالبًا؛ القرض: كما في كشف البنك)</span><input name="smsPrincipal" id="smsPrincipal" type="number" min="0" step="0.01" value="'+esc(d.amount||0)+'"></label>'+
 '<label class="form-field"><span>حالة الخصم البنكي عند سداد الفيزا</span><select name="smsPaidElsewhere" id="smsPaidElsewhere">'+
 '<option value="no">خصم جديد من الحساب المحدد</option><option value="yes">الخصم البنكي مسجل سابقًا؛ حدّث رصيد الفيزا فقط</option></select></label>'+
 '</div>';
 return panel("تحليل الرسالة قبل التسجيل",desc+input+
 '<div class="paste-result"><strong>التحليل الأولي:</strong> '+esc(d.reason)+'<div class="hint">نوع متعرف عليه: '+esc(d.kind)+' • بطاقات: '+esc(d.cardDigits.join("، ")||"غير ظاهرة")+'</div></div>'+
 fields+'<div class="buttons">'+button("تسجيل العملية بعد المراجعة","saveSms",null,"primary")+'</div>');
}
function analyzeSMS(){
 const raw=$("smsRaw")?.value?.trim()||"";
 if(!raw)throw Error("ألصق نص رسالة البنك أو البطاقة أولًا");
 const parsed=window.BankSMS?.parse(raw,data);
 if(!parsed)throw Error("تعذر تشغيل قارئ الرسائل البنكية");
 if(parsed.kind==="rejected")throw Error("هذه رسالة لعملية مرفوضة؛ لا توجد حركة مالية تُسجّل");
 const oldHash=window.FinanceImport.hash(window.FinanceImport.normalize(raw));
 const normalizedHash=parsed.hash;
 const already=!!(data.seenHashes[oldHash]||data.seenHashes[normalizedHash]||data.moves.some(m=>m.raw&&window.FinanceImport.normalize(m.raw)===window.FinanceImport.normalize(raw)));
 if(already)throw Error("هذه الرسالة محفوظة سابقًا في النسخة الشاملة أو سجل العمليات. لم يتغير أي رصيد.");
 smsDraft=parsed;smsStatus="";render();
}
function saveSMS(){
 if(!smsDraft)throw Error("حلّل الرسالة أولًا");
 const v=name=>$("content").querySelector('[name="'+name+'"]')?.value||"";
 const kind=v("smsKind"),sum=Number(v("smsAmount")),date=v("smsDate");
 const from=v("smsFrom"),to=v("smsTo"),debtId=v("smsDebt"),paidElsewhere=v("smsPaidElsewhere")==="yes";
 const principal=Number(v("smsPrincipal"));
 const category=v("smsCategory").trim()||"غير مصنف";
 if(!Number.isFinite(sum)||sum<=0||!Number.isFinite(principal)||principal<0||principal>sum||!/^20\d{2}-\d{2}-\d{2}$/.test(date))throw Error("تأكد من المبلغ والتاريخ وأصل الدين المسدد");
 if(!["income","expense","transfer","charge","repayment","profit"].includes(kind))throw Error("حدد نوع العملية");
 if(["expense","transfer"].includes(kind)&&!acc(from))throw Error("حدد الحساب الذي خرج منه المبلغ");
 if(["income","profit","transfer"].includes(kind)&&!acc(to))throw Error("حدد الحساب الذي استقبل المبلغ");
 if(kind==="transfer"&&from===to)throw Error("التحويل بين حسابين مختلفين فقط");
 if(kind==="charge"&&debt(debtId)?.kind!=="credit")throw Error("اختر بطاقة الفيزا الصحيحة للشراء");
 if(kind==="repayment"){
  if(!debt(debtId))throw Error("اختر الفيزا أو القرض الذي سُدّد");
  if(!paidElsewhere&&!acc(from))throw Error("اختر حساب السداد أو اختر أن الخصم البنكي مسجل سابقًا");
  if(debt(debtId).kind==="loan"&&principal===sum&&!confirm("القرض: تأكد أن أصل الدين انخفض فعلًا بكامل مبلغ القسط. هل تؤكد؟"))return;
 }
 const raw=smsDraft.raw,oldHash=window.FinanceImport.hash(window.FinanceImport.normalize(raw));
 if(data.seenHashes[oldHash]||data.seenHashes[smsDraft.hash]||data.moves.some(m=>m.raw&&window.FinanceImport.normalize(m.raw)===window.FinanceImport.normalize(raw)))throw Error("هذه الرسالة مسجلة سابقًا؛ تم إلغاء الحفظ المكرر");
 if(smsDraft.kind==="unclassified"&&!confirm("صيغة الرسالة لم تُتعرف عليها تلقائيًا. هل راجعت نوع العملية والحساب والمبلغ بنفسك؟"))return;
 if(["expense","transfer","repayment"].includes(kind)&&!paidElsewhere&&acc(from)&&accountBalance(acc(from))+0.005<sum&&!confirm("رصيد الحساب المسجل أقل من مبلغ العملية. هل تريد تسجيلها رغم ذلك؟"))return;
 const entry={id:uid(),date,kind,amount:sum,from:["expense","transfer","repayment"].includes(kind)?from:"",to:["income","profit","transfer"].includes(kind)?to:"",debtId:kind==="repayment"||kind==="charge"?debtId:"",principal:kind==="repayment"?principal:0,bankAlreadyPosted:kind==="repayment"&&paidElsewhere,category,raw,note:"مُدخل باللصق بعد مراجعة المستخدم",posted:true,source:"sms-paste",smsImported:true};
 data.moves.push(entry);
 data.seenHashes[oldHash]=1;data.seenHashes[smsDraft.hash]=1;
 period=date.slice(0,7);
 smsDraft=null;smsStatus="تم تسجيل "+money(sum)+" — "+category+" دون تكرار الرسائل السابقة";
 keep();
}

function contentBudgetHistory(){
 const xs=Object.entries(data.legacy?.budgetMonths||{}).sort((a,b)=>b[0].localeCompare(a[0]));
 if(!xs.length)return panel("الأشهر القديمة",blank("لم يُستورد سجل شهور سابق بعد"));
 return panel("الأشهر المحفوظة من النسخة الشاملة",entryList(xs.map(([m,v])=>({title:"ميزانية "+m,subtitle:v.budgetItems+" بندًا • دخل إضافي مخطط "+money((v.incomeLines||[]).reduce((z,x)=>z+num(x.amount),0)),value:"راتب "+money(v.salary)})),''));
}
function contentDebtHistory(){
 const xs=data.legacy?.debtLogs||[];
 if(!xs.length)return panel("سجلات الديون السابقة",blank("لا توجد حركات فيزا أو دراهم مستوردة"));
 return panel("عمليات الديون المحفوظة من النسخة",entryList(xs.slice(0,100).map(x=>({title:x.name+" • "+x.kind,subtitle:x.date+" • محفوظة ضمن الرصيد المرجعي، لا تخصم مرة أخرى",value:money(x.amount)})),"لا توجد حركات"));
}
function contentImportReview(){
 const l=data.legacy||{},hist=data.moves.filter(x=>x.importedHistory);
 const summary=stats([
  box("الحسابات",data.accounts.length,"أرصدة كما في النسخة الشاملة","blue"),
  box("الحركات التاريخية",l.bankHistoryCount||hist.length,"لا تُخصم ثانية من الرصيد","violet"),
  box("بنود الميزانيات",data.budget.length,Object.keys(l.budgetMonths||{}).length+" أشهر","coral"),
  box("حركات الفيزا ودراهم",l.debtLogs?.length||0,"سجل الدين القديم محفوظ","amber")
 ]);
 return summary+panel("تفاصيل البيانات المنقولة",entryList([
 {title:"الديون والبطاقات",value:String(data.debts.length)+" دين/فيزا"},
 {title:"الأهداف والالتزامات",value:String(data.commitments.length)+" موعد"},
 {title:"المشاريع",value:String(data.projects.length)+" مشروع أو خطة"},
 {title:"قواعد التعرف على الرسائل",value:String(data.learnedRules.length)+" قاعدة"},
 {title:"قواعد منع الرسائل المكررة",value:String(Object.keys(data.seenHashes||{}).length)+" بصمة"},
 {title:"خطة المستقبل الأصلية",value:l.future?"محفوظة":"لم تُستورد"},
 {title:"حاسبة الراتب القديمة",value:l.salaryCalc?"محفوظة":"غير موجودة"}
 ],"لا توجد بيانات مستوردة"))+
 '<p class="body-note">الحركات التاريخية محفوظة للعرض والتحليل ضمن الرصيد النهائي المستورد. لا تنشئ عمليات سداد جديدة لفيزا أو دراهم إلا إذا حدثت بعد تاريخ النسخة أو لم تكن موجودة فيها.</p>';
}

function contentAccounts(){
 if(sub==="paste")return contentSMS();
 if(sub==="transfers"){
  const arr=data.moves.filter(x=>x.kind==="transfer").slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,35);
  return panel("التحويلات بين الحسابات",entryList(arr.map(x=>({title:(acc(x.from)?.name||"—")+" ← "+(acc(x.to)?.name||"—"),subtitle:x.date+" • لا يعد مصروفًا",value:money(x.amount),actions:actions("Move",x.id)})), "لا توجد تحويلات"),button("تحويل جديد","newTransfer",null,"primary"));
 }
 return stats([box("الرصيد النقدي الكلي",netCash(),"الحسابات البنكية + حساب الالتزامات","blue"),box("حساب الالتزامات",reserveCash(),"جزء من الإجمالي أعلاه","violet"),box("دراهم والاستثمارات",invCash(),"أصول منفصلة عن النقد البنكي","amber")])+panel("حساباتك الحالية",entryList(data.accounts.map(a=>({title:a.name,subtitle:a.role==="reserve"?"حساب مدخر للالتزامات":a.role==="investment"?"محفظة/استثمار":"حساب بنكي",value:money(accountBalance(a)),tag:a.last4?"•••• "+a.last4:"",actions:actions("Account",a.id)})),"لم تُدخل حسابات بنكية بعد"),button("إضافة حساب","newAccount",null,"primary"));
}
function contentBudget(){
 if(sub==="history")return contentBudgetHistory();
 const items=data.budget.filter(x=>x.month===period);
 const planned=total(items);const saved=total(items.filter(x=>x.type==="saving"));
 const categories={};
 data.moves.filter(m=>m.date.slice(0,7)===period&&(m.kind==="expense"||m.kind==="charge")).forEach(m=>{const k=m.category||"أخرى";categories[k]=(categories[k]||0)+num(m.amount)});
 const metrics=stats([box("بنود مخططة للشهر",planned,"تتضمن تحويل الادخار إن وجد","blue"),box("منها ادخار مخطط",saved,"ليس مصروفًا فعليًا","violet"),box("المصروف الفعلي",expenseM(),"من الحركات المسجلة","coral")]);
 if(sub==="categories")return metrics+panel("المصروفات المنفذة حسب البند",bars(Object.entries(categories).sort((a,b)=>b[1]-a[1]),"تم احتساب الصرف من عمليات فعلية فقط"));
 return metrics+panel("بنود ميزانية "+period,entryList(items.map(x=>({title:x.name,subtitle:x.type==="saving"?"ادخار مخطط — لا يصنف كمصروف":x.type==="debt"?"سداد دين مخطط":"مصروف مخطط",value:money(x.amount),tag:x.type==="saving"?"ادخار":"خطة",actions:actions("Budget",x.id)})),"لم تُنشأ ميزانية لهذا الشهر"),button("إضافة بند","newBudget",null,"primary")+button("نسخ بنود الشهر السابق","copyPrevBudget",null,"outline"))+
 panel("التنفيذ الفعلي",entryList([{title:"مصروفات فعلية",value:money(expenseM())},{title:"سداد ديون من البنك",value:money(paidM())},{title:"ادخار محوّل بالفعل",value:money(total(movements().filter(m=>m.kind==="transfer"&&acc(m.to)?.role==="reserve")))}]));
}
function moveName(m){return ({income:"دخل",expense:"مصروف",transfer:"تحويل بين حسابين",repayment:"سداد دين",charge:"شراء بالفيزا",profit:"ربح استثماري"})[m.kind]||"حركة"}
function moveAccounts(m){return m.kind==="charge"?(debt(m.debtId)?.name||"فيزا"):(acc(m.from)?.name||"")+(m.to?" ← "+(acc(m.to)?.name||""):"")}
function contentMoves(){
 if(sub==="paste")return contentSMS();
 const kinds=sub==="income"?["income","profit"]:sub==="spend"?["expense","charge"]:null;
 const arr=data.moves.filter(x=>x.date.slice(0,7)===period&&(!kinds||kinds.includes(x.kind))).slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,100);
 return stats([box("دخل الشهر",incomeM(),"دخل وأرباح مدخلة","blue"),box("مصروف الشهر",expenseM(),"يشمل مشتريات الفيزا المسجلة","coral"),box("سداد الديون",paidM(),"تدفق نقدي وليس شراء جديدًا","amber")])+panel("حركات "+period,entryList(arr.map(m=>({title:moveName(m)+" • "+(m.category||"بدون تصنيف"),subtitle:m.date+" • "+moveAccounts(m)+(m.commitmentKey?" • مرتبط باستحقاق":""),value:money(m.amount),tag:m.importedHistory?"تاريخية ضمن الرصيد":m.kind==="transfer"?"ليس مصروفًا":"",negative:["expense","charge"].includes(m.kind),actions:m.importedHistory?"":actions("Move",m.id)})),"لا توجد حركات في هذا الشهر"),button("إضافة حركة","newMove",null,"primary"));
}
function addMonths(s,n){const a=s.split("-").map(Number);return monthKey(new Date(a[0],a[1]-1+Number(n),1))}
function dueItems(){
 const rows=[];
 data.commitments.filter(x=>x.active!==false).forEach(c=>{const count=Math.min(240,Math.max(1,Number(c.count)||1)),gap=Math.max(1,Number(c.interval)||1);
  for(let i=0;i<count;i++){const m=addMonths(c.firstMonth,i*gap),k=c.id+"-"+i;
   const paid=total(data.moves.filter(x=>x.commitmentKey===k&&x.kind==="expense"));
   rows.push({key:k,id:c.id,name:c.name,date:m,amount:num(c.amount),paid,rest:Math.max(0,num(c.amount)-paid),i});
  }
 });
 return rows.sort((a,b)=>a.date.localeCompare(b.date));
}
function contentObligations(){
 const isReserve=reserves().length>0;
 if(sub==="reserve"){
 const transfers=data.moves.filter(x=>x.kind==="transfer"&&acc(x.to)?.role==="reserve");
 const spent=data.moves.filter(x=>x.kind==="expense"&&acc(x.from)?.role==="reserve");
 return stats([box("رصيد حساب الالتزامات",reserveCash(),"مال موجود بالفعل، وليس تقديرًا","violet"),box("حُوّل إلى الادخار",total(transfers),"إجمالي التحويلات المسجلة","blue"),box("صُرف من الادخار",total(spent),"مصروفات مدفوعة بالفعل","coral")])+panel("كيف تعمل الأموال المخصصة؟",'<p class="body-note">حوّل مبلغًا من حسابك الجاري إلى حساب من نوع «الالتزامات». لا يسجل التحويل مصروفًا. عند دفع مدرسة أو صيانة أو قسط سيارة اختر حساب الالتزامات مصدرًا للدفع؛ عندها ينخفض رصيد الحساب ويُسجل المصروف مرة واحدة.</p>'+(isReserve?'':pill("أضف حسابًا بنوع «الالتزامات» أولًا","warn")),button("تحويل إلى الالتزامات","newTransfer",null,"primary"));
 }
 if(sub==="catalog"){
 return panel("إدارة جميع الالتزامات المخططة",entryList(data.commitments.map(c=>({
  title:c.name,subtitle:"أول موعد "+c.firstMonth+" • "+c.count+" دفعة • كل "+c.interval+" شهر",
  value:money(c.amount)+" للدفعة",tag:c.active===false?"متوقف":"مفعّل",tagType:c.active===false?"warn":"",
  actions:button(c.active===false?"تفعيل":"إيقاف","toggleCommitment",c.id,"mini")+actions("Commitment",c.id)
 })),"لم تُسجّل مواعيد الالتزامات بعد"),button("إضافة موعد","newCommitment",null,"primary"))+
 '<p class="body-note">يمكن إيقاف موعد مستقبلي دون حذف سجلات الدفع السابقة. الاستحقاق المخطط لا يُخصم من البنك حتى تسجيل دفع حقيقي.</p>';
 }
 if(sub==="paid"){
 const paid=data.moves.filter(x=>x.kind==="expense"&&x.commitmentKey).sort((a,b)=>b.date.localeCompare(a.date));
 return panel("مدفوعات الالتزامات الفعلية",entryList(paid.map(m=>({title:m.category||"دفعة التزام",subtitle:m.date+" • "+moveAccounts(m),value:money(m.amount),actions:actions("Move",m.id)})),"لم يُدفع أي استحقاق مرتبط بعد"),button("تسجيل دفع حقيقي","newExpense",null,"primary"));
 }
 const due=dueItems().filter(x=>x.rest>0&&x.date>=period).slice(0,50);
 const near=due.filter(x=>x.date<=addMonths(period,12)),amount=total(near,x=>x.rest);
 return stats([box("رصيد ادخار متاح اليوم",reserveCash(),"يمكن أن يستعمل للمدارس والسيارة والصيانة","violet"),box("استحقاقات ١٢ شهرًا",amount,"مواعيد مخططة، لم تُدفع بعد","amber")])+
 panel("الاستحقاقات المسجلة",entryList(due.slice(0,25).map(x=>({title:x.name,subtitle:"استحقاق "+x.date+" • المدفوع فعليًا "+money(x.paid),value:money(x.rest),tag:x.date<month()?"متأخر":x.date===month()?"هذا الشهر":"مخطط",tagType:x.date<month()?"warn":""})),"لا توجد استحقاقات مفتوحة"),button("إضافة التزام","newCommitment",null,"primary"))+
 '<p class="body-note">المبالغ هنا ليست توقع عجز: إنما قيمة استحقاقات مخططة لم تُسدَّد بعد. رصيد الادخار يختلف عن تكلفة الاستحقاقات، ولا نجمعهما كأنه دخل جديد.</p>';
}
function contentDebts(){
 if(sub==="paste")return contentSMS();
 if(sub==="history")return contentDebtHistory();
 const all=data.debts;
 if(sub==="payments"){
 const rows=data.moves.filter(x=>x.kind==="repayment").slice().sort((a,b)=>b.date.localeCompare(a.date));
 return panel("السداد من حساباتك الفعلية",entryList(rows.map(x=>({title:debt(x.debtId)?.name||"دين",subtitle:x.date+" • خُصم من أصل الدين: "+money(x.principal||0),value:money(x.amount),actions:actions("Move",x.id)})),"لم تُسجّل دفعات دين بعد"),button("إضافة سداد","newRepayment",null,"primary"));
 }
 return stats([box("إجمالي أرصدة الديون",sumDebt(),"قيم مُدخلة وليست محاكاة مستقبلية","coral"),box("المدفوع المسجل هذا الشهر",paidM(),"حركات سداد فعلية","blue")])+panel("ديونك",entryList(all.map(x=>({title:x.name,subtitle:(x.kind==="credit"?"بطاقة ائتمانية":"قرض أو تمويل")+" • الرصيد المرجعي بتاريخ "+(x.asOf||"غير محدد"),value:money(debtsBalance(x)),tag:x.source==="plan"?"من الملف":"مسجل",actions:actions("Debt",x.id)})),"أضف الدين أو استورد خطة الالتزامات"),button("إضافة دين","newDebt",null,"primary"))+
 '<p class="body-note">قيمة القرض من ملف الخطة هي رصيد مرجعي وقت إدخالها؛ قد يتغير في البنك. لا نخصم الأقساط تلقائيًا من الرصيد: سجل الخصم الحقيقي من أصل الدين عند السداد.</p>';
}
function contentInvestment(){
 const accounts=data.accounts.filter(x=>x.role==="investment"),profits=data.moves.filter(x=>x.kind==="profit");
 if(sub==="profits")return panel("الأرباح المستلمة فعلًا",entryList(profits.map(x=>({title:x.category||"ربح استثماري",subtitle:x.date+" • دخل إلى "+(acc(x.to)?.name||"الحساب"),value:money(x.amount),actions:actions("Move",x.id)})),"لم تسجل توزيعات أرباح مثبتة"),button("تسجيل ربح","newProfit",null,"primary"));
 return stats([box("المحفظة المسجلة",total(accounts,accountBalance),"قيمة مسجلة في آخر رصيد + الحركات","amber"),box("الأرباح المستلمة",total(profits),"مسجلة كدخل فعلي، وليست نموًا مفترضًا","violet")])+panel("الحسابات الاستثمارية",entryList(accounts.map(a=>({title:a.name,subtitle:"الأصل المسجل والحركات المرتبطة",value:money(accountBalance(a)),actions:actions("Account",a.id)})),"لا يوجد حساب استثماري حقيقي بعد"),button("إضافة محفظة","newInvestmentAccount",null,"primary"))+'<p class="body-note">لم نعد نحسب عائدًا افتراضيًا بنسبة ٦٪ أو تراكمًا لسنوات. الأرباح هنا لا تظهر إلا عندما تسجلها مستلمة أو داخلة إلى المحفظة فعليًا.</p>';
}
function contentProjects(){
 if(sub==="activity"){
 const arr=data.moves.filter(x=>x.projectId&&x.date.slice(0,7)===period);
 return panel("حركات المشاريع في "+period,entryList(arr.map(x=>({title:project(x.projectId)?.name||"مشروع",subtitle:x.date+" • "+moveName(x),value:money(x.amount),actions:actions("Move",x.id)})),"لا توجد حركة مشروع في هذا الشهر"),button("إضافة حركة مشروع","newMove",null,"primary"));
 }
 return panel("المشاريع المسجلة",entryList(data.projects.map(p=>{
 const tx=data.moves.filter(x=>x.projectId===p.id),income=total(tx.filter(x=>x.kind==="income")),out=total(tx.filter(x=>x.kind==="expense"));
 return {title:p.name,subtitle:"دخل فعلي "+money(income)+" • مصروف فعلي "+money(out),value:"الصافي "+money(income-out),actions:actions("Project",p.id)};}),"لا توجد مشاريع مُسجّلة"),button("إضافة مشروع","newProject",null,"primary"))+
 '<p class="body-note">لا يدخل دخل مشروع محتمل أو مستقبلي هنا. الأرباح فقط من حركات الدخل والمصروف التي سجلتها بالفعل.</p>';
}
function bars(entries,hint){
 if(!entries.length)return blank("لا توجد بيانات فعلية لهذا الرسم بعد");
 const max=Math.max(1,...entries.map(x=>Math.abs(Number(x[1])||0)));
 return '<div class="bar-chart" role="img" aria-label="'+esc(hint||"مخطط مستطيلات")+'">'+entries.map((x,i)=>{
 const v=Number(x[1])||0,p=Math.max(v===0?0:3,Math.min(100,Math.abs(v)/max*100));
 return '<div class="bar-row"><div class="bar-head"><span>'+esc(x[0])+'</span><strong>'+money(v)+'</strong></div><div class="bar-track"><div class="bar-fill tone-'+(i%7)+'" style="width:'+p+'%"></div></div></div>';
 }).join("")+'</div>'+(hint?'<p class="hint">'+esc(hint)+'</p>':"");
}
function categoryTotals(period){
 const agg={};
 movements(period).filter(x=>x.kind==="expense"||x.kind==="charge").forEach(x=>{let k=x.category||"غير مصنف";agg[k]=(agg[k]||0)+num(x.amount)});
 return Object.entries(agg).sort((a,b)=>b[1]-a[1]);
}
function contentChart(){
 let entries=[],heading="",note="هذه الرسوم مبنية على عمليات حقيقية مُدخلة وليست محاكاة مستقبلية.";
 if(sub==="expenses"){heading="مصروف كل بند — "+period;entries=categoryTotals(period)}
 else if(sub==="spending"){heading="التدفقات المثبتة — "+period;entries=[["الدخل",incomeM()],["المصروف والمشتريات",expenseM()],["سداد القروض والفيزا",paidM()],["الادخار المنقول",total(movements().filter(x=>x.kind==="transfer"&&acc(x.to)?.role==="reserve"))]];note="الادخار المنقول ليس مصروفًا ولا يُجمع مع المصروفات."}
 else if(sub==="accounts"){heading="أرصدة الحسابات الآن";entries=data.accounts.map(x=>[x.name,accountBalance(x)]).sort((a,b)=>b[1]-a[1])}
 else if(sub==="debts"){heading="رصيد كل دين مسجل";entries=data.debts.map(x=>[x.name,debtsBalance(x)])}
 else if(sub==="obligations"){heading="الادخار والاستحقاقات";entries=[["رصيد حساب الالتزامات",reserveCash()],["مدفوعات استحقاقات هذا الشهر",total(movements().filter(x=>x.kind==="expense"&&x.commitmentKey))],["استحقاقات شهر "+period+" غير المسددة",total(dueItems().filter(x=>x.date===period),x=>x.rest)]];note="يُعرض رصيد الادخار الفعلي منفصلًا عن المواعيد غير المدفوعة، دون تنبؤ."}
 else if(sub==="projects"){heading="المشاريع — حركة مثبتة";entries=data.projects.map(p=>[p.name+" دخل",total(data.moves.filter(m=>m.projectId===p.id&&m.kind==="income"))]).concat(data.projects.map(p=>[p.name+" مصروف",total(data.moves.filter(m=>m.projectId===p.id&&m.kind==="expense"))]))}
 else if(sub==="darahim"){heading="دراهم — فعلي فقط";entries=[["الرصيد الاستثماري",invCash()],["أرباح فعلية مسجلة",total(data.moves.filter(x=>x.kind==="profit"))],["الإيداعات إلى محفظة",total(data.moves.filter(x=>x.kind==="transfer"&&acc(x.to)?.role==="investment"))]]}
 else {heading="مصروفات آخر ١٢ شهرًا";let m=period;for(let i=0;i<12;i++){entries.unshift([m,expenseM(m)]);m=changeMonth(m,"prev");}}
 return panel(heading,bars(entries,note));
}
function contentData(){
 if(sub==="inspect")return contentImportReview();
 if(sub==="about")return panel("كيف نحسب المال؟",'<div class="rules"><p><b>١. الرصيد الحقيقي:</b> الرصيد الابتدائي المدخل + الوارد المثبت − الصادر المثبت.</p><p><b>٢. حساب الالتزامات:</b> نوع من حساباتك البنكية، يظهر ضمن النقد الكلي مرة واحدة؛ التحويل إليه ليس مصروفًا، والصرف منه مصروف واحد.</p><p><b>٣. الميزانية:</b> أرقام مخططة للمقارنة؛ لا تقلل الحسابات البنكية بمجرد إدخالها.</p><p><b>٤. الرسوم والقروض:</b> مواعيد أو أرصدة مرجعية حتى تُسجّل حركة دفع فعلية. سداد القرض يُخفض رصيد البنك، ويُنقص أصل الدين بالقيمة التي تؤكدها.</p><p><b>٥. المشاريع ودراهم:</b> الدخل والربح المعروضان فعليان ومدخلان، بلا نسبة عائد افتراضية.</p></div>');
 return panel("ملفاتك والنسخ الاحتياطية",'<p class="body-note">هذا إصدار جديد مستقل عن واجهة V8 السابقة، وبمخزن بيانات جديد. لا تُحذف البيانات القديمة تلقائيًا من المتصفح. ملف «المستقبل المالي» يُستورد كمواعيد وديون مرجعية، ولا يحوّل أهدافك إلى مصاريف مدفوعة.</p><div class="buttons">'+
 button("تصدير جميع بيانات هذا المركز","export",null,"primary")+
 button("استيراد V8 المحفوظ على هذا الجهاز","importLocalV8",null,"outline")+
 '<label class="button outline file-button">استيراد ملف JSON<input id="importFile" type="file" accept=".json,application/json"></label>'+
 button("مسح بيانات المركز الجديد فقط","reset",null,"danger")+'</div><p class="hint">يمكن استيراد ملف خطة المستقبل المرفق، أو نسخة شاملة من V8 للحسابات والميزانية. لا تُرفع ملفاتك إلى GitHub.</p>');
}
function render(){
 if(!nav[page])page="home";
 const choices=nav[page];if(!choices.some(x=>x[0]===sub))sub=choices[0][0];
 $("pageNav").value=page;$("subNav").innerHTML=options(choices,sub);
 $("monthNav").value=period;$("periodBox").style.display=["budget","moves","charts"].includes(page)||(page==="obligations"&&sub==="due")||(page==="projects"&&sub==="activity")?"":"none";
 $("pageHeading").textContent=titles[page];
 $("viewHeading").textContent=choices.find(x=>x[0]===sub)[1];
 $("quickAction").style.display=page==="charts"?"none":"";
 let html=page==="home"?contentHome():page==="accounts"?contentAccounts():page==="budget"?contentBudget():page==="moves"?contentMoves():page==="obligations"?contentObligations():page==="debts"?contentDebts():page==="investments"?contentInvestment():page==="projects"?contentProjects():page==="charts"?contentChart():contentData();
 $("content").innerHTML=html;
 $("storageStatus").textContent=data.moves.length+" حركة مسجلة • "+data.accounts.length+" حساب"+(data.legacy?.bankHistoryCount?" • "+data.legacy.bankHistoryCount+" تاريخية":"");
}
function field(label,name,value,type,extras){return '<label class="form-field"><span>'+esc(label)+'</span><input name="'+esc(name)+'" type="'+(type||"text")+'" '+(type==="number"?'min="0" step="any" inputmode="decimal"':"")+' value="'+esc(value==null?"":value)+'" '+(extras||"")+'></label>'}
function select(label,name,items,selected,empty){return '<label class="form-field"><span>'+esc(label)+'</span><select name="'+esc(name)+'">'+options(items,selected,empty)+'</select></label>'}
function editor(kind,id){
 modalType=kind;editingId=id||"";
 let title="",inner="",date=field("تاريخ العملية","date",now(),"date"),amount=field("المبلغ بالريال","amount","","number",'required');
 if(kind==="account"){title="إضافة حساب حقيقي";inner=field("اسم الحساب","name","","text","required")+field("اسم البنك أو الجهة","bank")+field("آخر أربعة أرقام (اختياري)","last4")+field("الرصيد الافتتاحي قبل الحركات","opening","0","number","required")+select("نوع الحساب","role",[["bank","حساب بنكي"],["reserve","حساب الالتزامات (ادخار)"],["investment","محفظة استثمارية"]],"bank");}
 else if(kind==="budget"){title="إضافة بند ميزانية";inner=field("الشهر","month",period,"month","required")+field("اسم البند","name","","text","required")+field("المخصص للشهر","amount","","number","required")+select("نوع التخصيص","type",[["expense","مصروف مخطط"],["debt","قسط دين مخطط"],["saving","تحويل ادخار للالتزامات"]],"expense");}
 else if(kind==="commitment"){title="تسجيل موعد التزام";inner=field("الالتزام (رسوم مدرسة / سيارة / صيانة)","name","","text","required")+field("شهر أول استحقاق","firstMonth",period,"month","required")+amount+field("عدد الدفعات","count","1","number","required")+field("الفاصل بين الدفعات بالأشهر","interval","1","number","required");}
 else if(kind==="debt"){title="إضافة رصيد دين حقيقي";inner=field("اسم الدين","name","","text","required")+field("الرصيد الحالي من كشف البنك","opening","","number","required")+field("تاريخ الرصيد","asOf",now(),"date")+select("النوع","kind",[["loan","قرض بنكي"],["credit","بطاقة فيزا"]],"loan");}
 else if(kind==="project"){title="إضافة مشروع";inner=field("اسم المشروع","name","","text","required")+field("وصف اختياري","description");}
 else {
  const kinds=[["income","دخل"],["expense","مصروف فعلي"],["transfer","تحويل بين حسابين"],["repayment","سداد قرض أو فيزا"],["charge","شراء بالفيزا"],["profit","ربح دراهم مستلم"]];
  title="تسجيل حركة حقيقية";
  inner=select("نوع الحركة","kind",kinds,kind==="move"?"expense":kind)+date+amount;
  const from=select("الحساب الذي خرج منه المبلغ","from",getAccounts(),"","اختر الحساب");
  const to=select("الحساب الذي استلم المبلغ","to",getAccounts(),"","اختر الحساب");
  if(kind==="transfer")inner+=from+to;
  else if(["expense","repayment"].includes(kind))inner+=from;
  else if(["income","profit"].includes(kind))inner+=to;
  if(kind==="charge"||kind==="repayment")inner+=select("الدين / الفيزا","debtId",allDebts(),"","اختر الدين");
  if(kind==="repayment")inner+=field("المبلغ الذي نقص فعلًا من أصل الدين","principal","0","number")+'<p class="hint">اكتب قيمة انخفاض أصل الدين من كشف البنك. قد يختلف عن القسط بسبب الفوائد.</p>';
  if(kind==="expense"||kind==="charge"||kind==="income")inner+=field("البند / التصنيف","category",kind==="income"?"دخل إضافي":"مصروف","text","required");
  if(kind==="profit")inner+=field("اسم المحفظة","category","أرباح دراهم");
  if(kind==="expense"){
    const choices=dueItems().filter(x=>x.rest>0).map(x=>[x.key,x.name+" — "+x.date+" • المتبقي "+money(x.rest)]);
    inner+=select("ربط الدفع باستحقاق (اختياري)","commitmentKey",choices,"","مصروف عادي بدون استحقاق");
  }
  if(["income","expense"].includes(kind))inner+=select("مشروع مرتبط (اختياري)","projectId",projectOptions(),"","دون مشروع");
  inner+=field("ملاحظة","note");
 }
 $("modalTitle").textContent=editingId?"تعديل: "+title:title;
 $("editorForm").innerHTML='<div class="form-grid">'+inner+'</div><div class="modal-footer"><button type="button" class="button outline" data-action="close">إلغاء</button><button class="button primary" type="submit">حفظ</button></div>';
 if(editingId){
  const source=kind==="account"?acc(editingId):kind==="budget"?data.budget.find(x=>x.id===editingId):kind==="commitment"?data.commitments.find(x=>x.id===editingId):kind==="debt"?debt(editingId):kind==="project"?project(editingId):data.moves.find(x=>x.id===editingId);
  if(source)$("editorForm").querySelectorAll("[name]").forEach(el=>{if(source[el.name]!=null)el.value=source[el.name]});
 }
 $("dialog").hidden=false;$("dialog").setAttribute("aria-hidden","false");
}
function storeRecord(name,record){
 const arr=data[name],i=arr.findIndex(x=>x.id===editingId);
 if(editingId&&i>=0)arr[i]={...arr[i],...record,id:editingId};
 else arr.push(record);
}
function saveForm(form){
 const v=Object.fromEntries(new FormData(form).entries()),kind=modalType;
 if(kind==="account"){if(!v.name.trim())throw Error("أدخل اسم الحساب");storeRecord("accounts",{id:uid(),name:v.name.trim(),bank:v.bank||"",last4:v.last4||"",role:v.role,opening:num(v.opening)});}
 else if(kind==="budget"){if(!v.name.trim()||!v.month)throw Error("أكمل اسم البند والشهر");storeRecord("budget",{id:uid(),month:v.month,name:v.name.trim(),amount:num(v.amount),type:v.type});period=v.month;}
 else if(kind==="commitment"){if(!v.name.trim()||!v.firstMonth)throw Error("أكمل موعد الاستحقاق");storeRecord("commitments",{id:uid(),name:v.name.trim(),firstMonth:v.firstMonth,amount:num(v.amount),count:Math.min(240,Math.max(1,Number(v.count)||1)),interval:Math.min(120,Math.max(1,Number(v.interval)||1)),active:editingId?(data.commitments.find(x=>x.id===editingId)?.active!==false):true});}
 else if(kind==="debt"){if(!v.name.trim())throw Error("أدخل اسم الدين");storeRecord("debts",{id:uid(),name:v.name.trim(),opening:num(v.opening),kind:v.kind,asOf:v.asOf||now(),source:"manual"});}
 else if(kind==="project"){if(!v.name.trim())throw Error("أدخل اسم المشروع");storeRecord("projects",{id:uid(),name:v.name.trim(),description:v.description||""});}
 else{
  const m={id:uid(),date:v.date||now(),kind:v.kind,amount:Number(v.amount),from:v.from||"",to:v.to||"",debtId:v.debtId||"",category:(v.category||"").trim(),note:v.note||"",commitmentKey:v.commitmentKey||"",projectId:v.projectId||"",principal:num(v.principal),posted:true};
  if(!(m.amount>0)&&Number.isFinite(m.amount))throw Error("المبلغ يجب أن يكون أكبر من صفر");
  if(!(Number.isFinite(m.amount)&&m.amount>0))throw Error("أدخل مبلغًا صحيحًا");
  if(["expense","transfer","repayment"].includes(m.kind)&&!acc(m.from))throw Error("اختر الحساب الذي دفع");
  if(["income","profit","transfer"].includes(m.kind)&&!acc(m.to))throw Error("اختر الحساب الذي استلم");
  if(m.kind==="transfer"&&m.from===m.to)throw Error("اختر حسابين مختلفين");
  if(["charge","repayment"].includes(m.kind)&&!debt(m.debtId))throw Error("اختر الدين");
  if(m.kind==="charge"&&debt(m.debtId).kind!=="credit")throw Error("المشتريات الائتمانية تُسجل على بطاقة فيزا فقط");
  if(m.kind==="expense"&&m.commitmentKey){
    const due=dueItems().find(x=>x.key===m.commitmentKey);
    if(!due)throw Error("الاستحقاق المحدد لم يعد موجودًا");
    if(m.amount>due.rest+0.005&&!confirm("المبلغ أكبر من المتبقي لهذا الاستحقاق. هل تريد تسجيله؟"))return;
  }
  if(m.kind==="repayment"&&m.principal>m.amount)throw Error("المخفض من أصل الدين لا يمكن أن يتجاوز قيمة السداد");
  if(["expense","transfer","repayment"].includes(m.kind)&&accountBalance(acc(m.from))+0.005<m.amount&&!confirm("الرصيد المسجل أقل من قيمة الحركة. هل تريد تسجيلها على أي حال؟"))return;
  storeRecord("moves",m);period=m.date.slice(0,7);
 }
 closeModal();keep();
}
function removeRecord(type,id){
 const table={Account:"accounts",Budget:"budget",Commitment:"commitments",Debt:"debts",Project:"projects",Move:"moves"};
 const key=table[type],row=data[key]?.find(x=>x.id===id);
 if(!row)return;
 if(type==="Move"&&row.importedHistory)throw Error("الحركة التاريخية محفوظة ضمن الرصيد المستورد. لا تحذفها كحركة جديدة؛ عدّل تصنيفها فقط من سجل المراجعة.");
 if(type==="Account"&&data.moves.some(x=>x.from===id||x.to===id))throw Error("الحساب مرتبط بحركات فعلية. عدّل الحركات أو انقلها أولًا.");
 if(type==="Debt"&&data.moves.some(x=>x.debtId===id))throw Error("الدين مرتبط بسداد أو مشتريات مثبتة؛ لا يمكن حذفه قبل معالجة الحركات.");
 if(type==="Project"&&data.moves.some(x=>x.projectId===id))throw Error("المشروع مرتبط بحركات فعلية؛ احفظها أو انقلها قبل الحذف.");
 if(type==="Commitment"&&data.moves.some(x=>String(x.commitmentKey||"").startsWith(id+"-")))throw Error("هذا الالتزام له دفعات مدفوعة فعلًا. يمكنك إيقافه بدل حذفه.");
 if(!confirm("حذف "+(row.name||row.category||row.kind||"هذا السجل")+"؟ ستنعكس العملية على الأرصدة والحسابات تلقائيًا."))return;
 data[key]=data[key].filter(x=>x.id!==id);keep();
}
function closeModal(){$("dialog").hidden=true;$("dialog").setAttribute("aria-hidden","true");modalType="";editingId="";}
function download(){
 const blob=new Blob([JSON.stringify({app:"BMSActualFinance",version:1,exportedAt:new Date().toISOString(),data},null,2)],{type:"application/json;charset=utf-8"});
 const link=document.createElement("a"),url=URL.createObjectURL(blob);link.href=url;link.download="bms_actual_finance_"+now()+".json";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function loadPlan(doc){
 const p=doc.plan;let goals=0,loans=0;
 (p.goals||[]).forEach(g=>{
  if(data.commitments.some(x=>x.sourceId===g.id))return;
  data.commitments.push({id:uid(),sourceId:g.id,name:g.name,firstMonth:g.date,amount:num(g.amount),count:Math.min(240,Math.max(1,Number(g.count)||1)),interval:Math.max(1,Number(g.interval)||1),active:g.enabled!==false,source:"plan"});
  goals++;
 });
 (p.loans||[]).forEach(l=>{
  if(data.debts.some(x=>x.sourceId===l.id))return;
  data.debts.push({id:uid(),sourceId:l.id,name:l.name,opening:num(l.balance),asOf:(doc.exportedAt||now()).slice(0,10),kind:"loan",source:"plan"});loans++;
 });
 return "استُورد "+goals+" التزام و"+loans+" رصيد قرض مرجعي. لم تُضف حركة دفع واحدة.";
}
function loadOld(doc){
 const rawBank=typeof doc.accounts==="string"?JSON.parse(doc.accounts):doc.accounts;
 const rawBudget=typeof doc.budget==="string"?JSON.parse(doc.budget):doc.budget;
 if(!rawBank||!Array.isArray(rawBank.accounts)||!rawBudget||!Array.isArray(rawBudget.items))throw Error("نسخة V8 غير مكتملة");
 let nAcc=0,nBud=0,nDebt=0;
 rawBank.accounts.filter(a=>a.kind!=="credit").forEach(a=>{
  if(data.accounts.some(x=>x.legacyId===a.id))return;
  const role=a.id==="amuju7ih2gtiyr"||a.id===rawBank.finance?.obligationAccountId||/حساب\s*الالتزام/i.test(a.name||"")?"reserve":/دراهم|darahim/i.test((a.name||"")+" "+(a.bank||""))?"investment":"bank";
  data.accounts.push({id:uid(),legacyId:a.id,name:a.name||"حساب",bank:a.bank||"",last4:a.last4||"",role,opening:Number(a.balance)||0});
  nAcc++;
 });
 (rawBank.finance?.debts||[]).forEach(d=>{
  if(data.debts.some(x=>x.legacyId===d.id))return;
  data.debts.push({id:uid(),legacyId:d.id,name:d.name||"دين",opening:Math.max(0,num(d.original)+num(d.addedDebt)-num(d.balanceCorrection)-num(d.paid)),kind:/^فيزا/.test(d.name||"")?"credit":"loan",asOf:(doc.exportedAt||now()).slice(0,10),source:"v8"});nDebt++;
 });
 const rows=rawBudget.items||[],billMonth=rawBudget.month||month();
 rows.forEach(b=>{
  if(data.budget.some(x=>x.legacyId===b.id&&x.month===billMonth))return;
  const saving=/^\s*(?:الالتزامات|حساب الالتزامات)\s*$/.test(b.name||"");
  data.budget.push({id:uid(),legacyId:b.id,month:billMonth,name:b.name||"بند",amount:num(b.amount),type:saving?"saving":/قرض|فيزا|دراهم|سداد/.test(b.name||"")?"debt":"expense"});
  nBud++;
 });
 return "استُورد "+nAcc+" رصيد حساب و"+nDebt+" دين و"+nBud+" بند ميزانية. لم تُرحّل سجل الحركات التاريخية حتى لا تُخصم مرتين من الأرصدة الحالية.";
}
function completeImport(doc){
 if(!window.FinanceImport?.isFull(doc))throw Error("الصيغة غير مدعومة؛ اختر النسخة الشاملة من المركز.");
 const result=window.FinanceImport.migrate(doc),n=result.summary;
 const answer="تم التحقق من ملف النسخة الشاملة:\n"+
 n.accounts+" حسابًا، "+n.creditCards+" فيزا، "+n.debts+" دينًا، "+n.history+" حركة قديمة، "+
 n.budgetMonths+" أشهر ميزانية، "+n.budgetItems+" بندًا، "+n.debtLogs+" حركة دين، "+n.goals+" هدفًا، "+n.learnedRules+" قواعد تعلّم.\n\n"+
 "سيُستبدل سجل المركز الجديد الحالي بهذه النسخة. ستبقى النسخة القديمة محفوظة في المتصفح كنسخة رجوع، ولن نخصم الحركات التاريخية من الأرصدة مرة أخرى.\nهل تريد الاعتماد؟";
 if(!confirm(answer))return false;
 const before=JSON.stringify(data),next=JSON.stringify(result.data);
 // A separate rollback snapshot avoids silent loss of local new data.
 localStorage.setItem(KEY+"_before_full_import",before);
 localStorage.setItem(KEY,next);
 data=result.data;period=String(doc.budget?.month||month()).slice(0,7);page="data";sub="inspect";render();
 alert("تم استيراد جميع أقسام الملف: الحسابات والفيزا ودراهم، سجلات العمليات، الميزانيات السابقة، الأهداف، المشاريع والخطة. لم تُكرر أي خصومات.");
 return true;
}
async function importFile(file){
 const doc=JSON.parse(await file.text());if(!doc||typeof doc!=="object")throw Error("ملف غير صالح");
 if(doc.app==="BMSActualFinance"&&doc.data){
  if(!confirm("هل تريد استبدال جميع بيانات المركز الجديد بنسختك المحفوظة؟"))return;
  const d=doc.data;if(!Array.isArray(d.accounts)||!Array.isArray(d.moves)||!Array.isArray(d.commitments))throw Error("نسخة المركز الجديد غير مكتملة");
  localStorage.setItem(KEY+"_before_full_import",JSON.stringify(data));
  data=d;keep();alert("تم استرجاع البيانات المثبتة");return;
 }
 if(window.FinanceImport?.isFull(doc)){completeImport(doc);return}
 if(doc.app==="FinanceFuturePlanner"&&doc.plan){
  if(!confirm("استيراد الأهداف والقروض المرجعية وخطة المشاريع من ملف المستقبل؟ لن تُسجل أي عملية دفع فعلي."))return;
  window.FinanceImport.fromPlan(doc,data);keep();alert("تم نقل الأهداف والديون المرجعية وخطة المشاريع. لا توجد مصروفات جديدة مسجلة.");return;
 }
 throw Error("الملف غير مدعوم. استخدم النسخة الشاملة New_Finance_Full، أو نسخة مستقبل، أو نسخة بوصلة المال.");
}
$("pageNav").innerHTML=options(Object.entries(titles),"home");
$("pageNav").addEventListener("change",e=>{page=e.target.value;sub=nav[page][0][0];render()});
$("subNav").addEventListener("change",e=>{sub=e.target.value;render()});
$("monthNav").addEventListener("change",e=>{if(e.target.value)period=e.target.value;render()});
$("prevMonth").addEventListener("click",()=>{period=changeMonth(period,"prev");render()});
$("nextMonth").addEventListener("click",()=>{period=changeMonth(period,"next");render()});
$("quickAction").addEventListener("click",()=>editor("expense"));
$("content").addEventListener("click",e=>{
 const target=e.target.closest("[data-action]");if(!target)return;
 const action=target.dataset.action;
 const m={newAccount:"account",newBudget:"budget",newCommitment:"commitment",newDebt:"debt",newProject:"project",newInvestmentAccount:"account",newMove:"expense",newExpense:"expense",newTransfer:"transfer",newRepayment:"repayment",newProfit:"profit"};
 if(action==="newInvestmentAccount"){editor("account");const role=$("editorForm").querySelector('[name="role"]');if(role)role.value="investment";return;}
 if(m[action]){editor(m[action]);return;}
 if(action==="toggleCommitment"){
  const c=data.commitments.find(x=>x.id===target.dataset.id);
  if(c){c.active=c.active===false?true:false;keep()}
  return;
 }
 if(action.startsWith("edit")){
  const type=action.slice(4),id=target.dataset.id;
  if(type==="Move"&&data.moves.find(x=>x.id===id)?.importedHistory){alert("الحركة التاريخية مدرجة بالفعل في الرصيد المستورد؛ لا يمكن تعديل مبلغها دون تغيير الرصيد الأصلي.");return;}
  const map={Account:"account",Budget:"budget",Commitment:"commitment",Debt:"debt",Project:"project"};
  const kind=type==="Move"?data.moves.find(x=>x.id===id)?.kind:map[type];
  if(kind)editor(kind,id);
  return;
 }
 if(action.startsWith("delete")){
  try{removeRecord(action.slice(6),target.dataset.id)}catch(err){alert(err.message)}
  return;
 }
 if(action==="copyPrevBudget"){
  const prev=changeMonth(period,"prev"),items=data.budget.filter(x=>x.month===prev);
  if(data.budget.some(x=>x.month===period)){alert("الشهر الحالي يحتوي بنودًا بالفعل. لن أكررها.");return;}
  if(!items.length){alert("لم أجد بنود ميزانية في "+prev+" لنسخها.");return;}
  if(!confirm("نسخ "+items.length+" بند من "+prev+" إلى "+period+"؟ لن تُنشأ حركات دفع أو تحويلات فعلية."))return;
  items.forEach(x=>data.budget.push({...x,id:uid(),month:period}));
  keep();return;
 }
 if(action==="analyzeSms"){try{analyzeSMS()}catch(err){alert(err.message)}return;}
 if(action==="saveSms"){try{saveSMS()}catch(err){alert(err.message)}return;}
 if(action==="clearSms"){smsDraft=null;smsStatus="";render();return;}
 if(action==="goData"){page="data";sub="backup";render();return;}
 if(action==="export"){download();return;}
 if(action==="importLocalV8"){
  try{
   const oldAccounts=localStorage.getItem("bank_manager_v11_seeded_exact");
   const oldBudget=localStorage.getItem("budget_finance_clean_v4");
   if(!oldAccounts||!oldBudget)throw Error("لم أجد نسخة V8 القديمة محفوظة على هذا الجهاز. استخدم استيراد ملف JSON بدلًا من ذلك.");
   // The full import itself displays the count and requests confirmation.
   const currentFuture=localStorage.getItem("finance_future_planner_2026_v1");
   const doc={format:"UnifiedFinanceBackupV1",accounts:JSON.parse(oldAccounts),budget:JSON.parse(oldBudget),future:currentFuture?JSON.parse(currentFuture):null,exportedAt:new Date().toISOString()};
   completeImport(doc);
  }catch(err){alert("تعذر استيراد V8 المحلي: "+err.message)}
  return;
 }
 if(action==="reset"){
  if(confirm("هل تريد مسح بيانات هذا المركز الجديد بالكامل؟ تأكد من تنزيل نسخة احتياطية أولًا.")&&confirm("تأكيد أخير: مسح الحسابات والحركات والميزانية الجديدة؟")){
   data=def();localStorage.removeItem(KEY);render();
  }
  return;
 }
});
$("dialog").addEventListener("click",e=>{if(e.target===$("dialog")||e.target.closest('[data-action="close"]'))closeModal()});
$("editorForm").addEventListener("change",e=>{if(e.target.name==="kind"){const kind=e.target.value;const old=$("editorForm").querySelector('[name="amount"]')?.value;const preserveId=editingId;editor(kind,preserveId);if(old)$("editorForm").querySelector('[name="amount"]').value=old;}});
$("editorForm").addEventListener("submit",e=>{e.preventDefault();try{saveForm(e.target)}catch(err){alert(err.message)}});
document.addEventListener("change",async e=>{
 if(e.target.id!=="importFile")return;
 const file=e.target.files&&e.target.files[0];if(!file)return;
 try{await importFile(file)}catch(err){alert("تعذر الاستيراد: "+err.message)}finally{e.target.value=""}
});
render();
})();