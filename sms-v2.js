"use strict";
(function(root){
const tidy=t=>String(t||"").replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g," ").replace(/[–—]/g,"-").replace(/\s+/g," ").trim();
const ascii=t=>String(t||"").replace(/[٠-٩۰-۹]/g,c=>{const i=c.charCodeAt(0);return String(i>=0x06F0?i-0x06F0:i-0x0660)}).replace(/٬/g,",").replace(/٫/g,".");
const text=t=>ascii(tidy(t));
const hash=s=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return(h>>>0).toString(16)};
const amount=s=>{
 const t=text(s);
 const patterns=[
  /(?:المبلغ|مبلغ|amount|قيمة\s*العملية|قيمة\s*الشراء|القيمة)\s*[:：\-]?\s*(?:SAR|ر\.?\s*س\.?\s*)?\s*([\d,]+(?:\.\d{1,2})?)/i,
  /(?:^|\s)ب[ـ\s-]*([\d,]+(?:\.\d{1,2})?)\s*(?:SAR|ر\.?\s*س)/i,
  /\bSAR\s*([\d,]+(?:\.\d{1,2})?)/i,
  /([\d,]+(?:\.\d{1,2})?)\s*(?:SAR|ر\.?\s*س\.?)(?=\s|$)/i
 ];
 for(const p of patterns){const m=t.match(p);if(m){const n=Number(m[1].replace(/,/g,""));if(Number.isFinite(n)&&n>0)return Math.round(n*100)/100}}
 return null;
};
const last4=(label,t)=>{
 const re=new RegExp(label+'\\s*:?\\s*(?:[^\\d]{0,8})?(\\d{4})(?!\\d)','i');return t.match(re)?.[1]||"";
};
const cards=t=>{
 const res=new Set();
 const pats=[
 /(?:بطاقة|البطاقة|بطاقتك)\s*[:\s\-]*(?:المنتهية\s*بالرقم\s*)?\*+\s*(\d{4})/gi,
 /(?:mada|مدى)(?:\s*[-]?\s*باي)?[^0-9]{0,12}\*+\s*(\d{4})/gi,
 /(?:إلى|الى|لصالح)\s*(?:بطاقة|فيزا)[^\d]{0,20}\*+\s*(\d{4})/gi,
 /(?:credit\s*card|visa)[^\d]{0,12}\*+\s*(\d{4})/gi
 ];
 for(const p of pats)for(const m of t.matchAll(p))res.add(m[1]);
 return [...res];
};
const byDigit=(accounts,id,mode)=>{
 if(!id)return[];
 const nonCredit=accounts.filter(x=>x.role!=="investment");
 if(mode==="account")return nonCredit.filter(x=>String(x.last4||"")===id);
 return nonCredit.filter(x=>String(x.last4||"")===id||x.cards?.some(z=>String(z)===id));
};
const cardDebt=(debts,n,hasVisaName)=>{
 if(n){const d=debts.filter(x=>x.kind==="credit"&&String(x.cardLast4||"")===n);if(d.length===1)return d[0]}
 if(hasVisaName==="1")return debts.find(x=>x.kind==="credit"&&/فيزا\s*[١1]/.test(x.name||""));
 if(hasVisaName==="2")return debts.find(x=>x.kind==="credit"&&/فيزا\s*[٢2]/.test(x.name||""));
 return null;
};
const parseDate=t=>{
 const t1=text(t);
 let m=t1.match(/(?:20\d{2})[-\/](?:0?[1-9]|1[0-2])[-\/](?:[0-2]?\d|3[01])/);
 if(m)return m[0].replace(/\//g,"-").replace(/^(\d{4})-(\d)-/,"$1-0$2-").replace(/-(\d)$/,"-0$1");
 m=t1.match(/(?:^|[^\d])([0-3]?\d)[\/](0?[1-9]|1[0-2])[\/](20\d{2}|\d{2})(?!\d)/);
 if(m){let year=m[3].length===2?"20"+m[3]:m[3];return year+"-"+m[2].padStart(2,"0")+"-"+m[1].padStart(2,"0")}
 m=t1.match(/(?:^|[^\d])(\d{2})-(0?[1-9]|1[0-2])-([0-3]?\d)(?!\d)/);
 if(m)return "20"+m[1]+"-"+m[2].padStart(2,"0")+"-"+m[3].padStart(2,"0");
 const now=new Date();return now.getFullYear()+"-"+String(now.getMonth()+1).padStart(2,"0")+"-"+String(now.getDate()).padStart(2,"0");
};
function parse(raw,data){
 const t=text(raw),low=t.toLowerCase(),a=amount(t),all=data?.accounts||[],debts=data?.debts||[];
 const ids=cards(t),debitId=last4("(?:من\\s*حساب|حساب)",t),creditId=last4("(?:إلى\\s*حساب|الى\\s*حساب)",t);
 let d=null;
 for(const id of ids){d=cardDebt(debts,id);if(d)break}
 const visaNamed=t.match(/(?:فيزا|visa)\s*([١٢12])/i)?.[1]||"";
 if(!d&&visaNamed)d=cardDebt(debts,"",visaNamed==="١"?"1":visaNamed==="٢"?"2":visaNamed);
 const hasCredit=/فيزا|visa|بطاقة\s*(?:ائتمانية|إئتمانية|الائتمان|ائتمان)|credit\s*card|سداد\s*بطاقة/i.test(t);
 const isPayment=/سداد|تسديد|قيد\s*دائن|حوالة\s*واردة\s*إلى\s*فيزا|دفعة\s*بطاقة/i.test(t)||/تحويل|حوالة|خصم/.test(t)&&/(?:إلى|الى|لـ|لصالح)\s*(?:بطاقة|فيزا)/.test(t);
 const isPurchase=/شراء|POS|mada|مدى|apple\s*pay|samsungpay/i.test(t);
 const rejected=/مرفوض|لم\s*تكتمل|الرصيد\s*غير\s*كافي|عملية\s*ملغاة/i.test(t);
 const transfer=/تحويل\s*بين\s*حساباتك|تحويل\s*بين\s*الحسابات|حوالة\s*صادرة\s*داخلية|تحويل\s*داخلي/i.test(t);
 const incoming=/حوالة\s*واردة|إيداع|تم\s*استلام|استلام\s*حوالة|إضافة\s*رصيد/i.test(t);
 const outgoing=/حوالة\s*صادرة|تحويل\s*صادر/i.test(t);
 const withdrawal=/سحب\s*نقدي/i.test(t);
 const bill=/سداد\s*فاتورة|مدفوعات\s*وزارة\s*الداخلية/i.test(t);
 const profit=/أرباح\s*دراهم|توزيع\s*أرباح|ربح\s*محفظة/i.test(t);
 let kind="unclassified";
 const rule=(data?.learnedRules||[]).find(r=>r.key&&t.toLowerCase().includes(String(r.key).toLowerCase()));
 if(rejected)kind="rejected";
 else if(d&&(isPayment||incoming&&!isPurchase))kind="repayment";
 else if(d&&(isPurchase||hasCredit&&!isPayment))kind="charge";
 else if(profit&&incoming)kind="profit";
 else if(transfer)kind="transfer";
 else if(incoming)kind="income";
 else if(bill||isPurchase||withdrawal)kind="expense";
 else if(outgoing)kind="expense";
 if(kind==="unclassified"&&rule){kind=({incoming:"income",outgoing:"expense",purchase:"expense",withdrawal:"expense",bill:"expense",moi:"expense",transfer:"transfer"})[rule.type]||kind;}
 const selected=new Set();
 for(const id of ids){for(const a of byDigit(all,id,"card"))selected.add(a.id)}
 const isBankAccount=x=>x&&x.role==="bank"||x?.role==="reserve";
 let from="",to="";
 if(debitId){const c=byDigit(all,debitId,"account");if(c.length===1)from=c[0].id}
 if(creditId){const c=byDigit(all,creditId,"account");if(c.length===1)to=c[0].id}
 if(rule?.accountMode==="fixed"&&rule.accountId&&all.some(x=>x.id===rule.accountId)){
   if(["expense","transfer","repayment"].includes(kind))from=rule.accountId;
   else if(["income","profit"].includes(kind))to=rule.accountId;
 }
 if(kind==="expense"||kind==="charge"){
  if(!from){const eligible=[...selected].map(id=>all.find(x=>x.id===id)).filter(isBankAccount);if(eligible.length===1)from=eligible[0].id}
 }
 if(kind==="income"||kind==="profit"){
  if(!to){const eligible=[...selected].map(id=>all.find(x=>x.id===id)).filter(isBankAccount);if(eligible.length===1)to=eligible[0].id}
 }
 if(kind==="repayment"&&d){
  // Only take money out of a bank if the message actually names the payer; otherwise review explicitly.
  const candidates=[...selected].map(id=>all.find(x=>x.id===id)).filter(isBankAccount);
  if(!from&&candidates.length===1)from=candidates[0].id;
 }
 if(kind==="expense"&&outgoing&&from&&to&&from!==to)kind="transfer";
 if(kind==="transfer"&&!from&&!to){
  const scoped=[...selected].map(id=>all.find(x=>x.id===id)).filter(isBankAccount);
  if(scoped.length===1){if(outgoing)from=scoped[0].id;else if(incoming)to=scoped[0].id}
 }
 let merchant=(t.match(/(?:لدى|من\s+(?!حساب))\s*[:：]\s*([^،\n]+?)(?=\s+في[:\s]|$)/i)||[])[1]||"";
 if(!merchant)merchant=(t.match(/(?:لدى|at)\s*[:：]?\s*([a-zA-Z\u0600-\u06FF0-9 \-]{3,35})/i)||[])[1]||"";
 merchant=merchant.trim().slice(0,70);
 const category=kind==="charge"?"مشتريات فيزا":kind==="expense"?(outgoing?"حوالة صادرة":merchant||"مشتريات بنكية"):kind==="repayment"?"سداد فيزا":kind==="income"?"حوالة واردة":kind==="profit"?"أرباح دراهم":kind==="transfer"?"تحويل بين الحسابات":"غير مصنف";
 return{raw:String(raw||""),normalized:t,hash:hash(t),learnedRule:rule?.key||"",date:parseDate(raw),kind,amount:a,from,to,debtId:d?.id||"",cardDigits:ids,accountDigits:[debitId,creditId].filter(Boolean),category,principal:0,confidence:kind!=="unclassified"&&!!a?(kind==="charge"||kind==="repayment"?!!d:true):false,reason:rejected?"العملية مرفوضة؛ لا تُخصم من الأرصدة":kind==="unclassified"?"تعذر تحديد نوع العملية. اختر نوعها وحسابها قبل الحفظ":!a?"لم أستطع تحديد المبلغ":kind==="transfer"&&(!from||!to)?"اختر طرفي التحويل قبل التسجيل":kind==="repayment"&&!from?"حدّد هل خصم السداد البنكي مسجل مسبقًا":"راجع التفاصيل قبل التسجيل"};
}
root.BankSMS={parse,normalize:tidy,hash,amount,cards};
})(window);