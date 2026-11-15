"use strict";
(function(root){
  // A display-only timer. Changing its settings never creates or edits a financial transaction.
  const zone="Asia/Riyadh";
  const formatter=new Intl.DateTimeFormat("en-GB",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"});
  const dateLabel=new Intl.DateTimeFormat("ar-SA-u-ca-gregory",{timeZone:zone,weekday:"long",day:"numeric",month:"long",year:"numeric"});
  const number=new Intl.NumberFormat("ar-SA",{minimumIntegerDigits:2,useGrouping:false});
  const escape=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const defaults=()=>({day:27,hour:8,minute:0,weekend:"ksa"});
  const config=c=>{
    const source=c&&typeof c==="object"?c:{},v=defaults();
    const day=Number(source.day),hour=Number(source.hour),minute=Number(source.minute);
    if(Number.isInteger(day)&&day>=1&&day<=31)v.day=day;
    if(Number.isInteger(hour)&&hour>=0&&hour<=23)v.hour=hour;
    if(Number.isInteger(minute)&&minute>=0&&minute<=59)v.minute=minute;
    if(["ksa","none"].includes(source.weekend))v.weekend=source.weekend;
    return v;
  };
  function riyadhDate(at){
    const p=Object.fromEntries(formatter.formatToParts(new Date(at)).filter(x=>x.type!=="literal").map(x=>[x.type,Number(x.value)]));
    return {year:p.year,month:p.month,day:p.day,hour:p.hour,minute:p.minute,second:p.second};
  }
  function dateForMonth(year,month,cfg){
    const d=config(cfg);
    const max=new Date(Date.UTC(year,month,0)).getUTCDate();
    const day=Math.min(max,d.day);
    // Thursday before Friday / Sunday after Saturday, as a configurable planning convention.
    let date=new Date(Date.UTC(year,month-1,day,12));
    if(d.weekend==="ksa"){
      const w=date.getUTCDay();
      if(w===5)date.setUTCDate(date.getUTCDate()-1);
      else if(w===6)date.setUTCDate(date.getUTCDate()+1);
    }
    return Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate(),d.hour-3,d.minute,0);
  }
  function next(at,settings){
    const current=riyadhDate(at),first=current.year*12+current.month-1,cfg=config(settings);
    for(let i=0;i<36;i++){
      const index=first+i,year=Math.floor(index/12),month=index%12+1,millis=dateForMonth(year,month,cfg);
      if(millis>at)return {at:millis,date:new Date(millis),label:dateLabel.format(new Date(millis)),time:number.format(cfg.hour)+":"+number.format(cfg.minute),cfg};
    }
    return null;
  }
  function remaining(at,settings){
    const n=next(at,settings);if(!n)return null;
    let sec=Math.max(0,Math.ceil((n.at-at)/1000));
    const days=Math.floor(sec/86400);sec%=86400;
    const hours=Math.floor(sec/3600);sec%=3600;
    const minutes=Math.floor(sec/60);sec%=60;
    return {...n,days,hours,minutes,seconds:sec};
  }
  function widget(settings,{compact=false}={}){
    return '<section class="salary-clock '+(compact?'salary-clock-compact':'')+'" data-salary-clock>'+
      '<div class="salary-clock-top"><div><span class="salary-clock-kicker">الراتب القادم</span><strong>الوقت المتبقي لنزول الراتب</strong></div>'+
      '<button class="button outline salary-clock-settings" data-action="openSalaryCountdown" type="button">تغيير موعد الصرف</button></div>'+
      '<div class="salary-clock-units" aria-label="الوقت المتبقي للصرف">'+
      [['days','يوم'],['hours','ساعة'],['minutes','دقيقة'],['seconds','ثانية']].map(([key,label])=>
        '<div><strong data-salary-value="'+key+'">--</strong><span>'+label+'</span></div>').join("")+'</div>'+
      '<p class="salary-clock-next">موعد الصرف المتوقع: <b data-salary-value="date">—</b>، الساعة <b data-salary-value="time">—</b> (بتوقيت السعودية)</p>'+
      '</section>';
  }
  function settings(settings){
    const c=config(settings),time=String(c.hour).padStart(2,"0")+":"+String(c.minute).padStart(2,"0");
    return widget(c)+
      '<section class="panel salary-clock-editor"><div class="panel-top"><h2>إعداد موعد الصرف</h2></div>'+
      '<p class="hint">اختر يوم الصرف المعتاد والساعة والدقيقة. يظهر العداد أيضًا في «ملخص اليوم» ويُحدّث نفسه كل ثانية. تستطيع تغيير الموعد متى شئت.</p>'+
      '<div class="form-grid"><label class="form-field"><span>يوم الصرف من كل شهر (١ إلى ٣١)</span>'+
      '<input id="salaryPayDay" type="number" min="1" max="31" step="1" inputmode="numeric" value="'+c.day+'"></label>'+
      '<label class="form-field"><span>وقت الصرف المعتاد</span>'+
      '<input id="salaryPayTime" type="time" value="'+time+'"></label>'+
      '<label class="form-field"><span>إذا صادف الموعد الجمعة أو السبت</span>'+
      '<select id="salaryWeekendRule"><option value="ksa" '+(c.weekend==="ksa"?'selected':'')+'>الجمعة إلى الخميس، والسبت إلى الأحد</option>'+
      '<option value="none" '+(c.weekend==="none"?'selected':'')+'>ابقَ على اليوم المحدد</option></select></label></div>'+
      '<div class="buttons"><button class="button primary" type="button" data-action="saveSalaryCountdown">حفظ يوم ووقت الصرف</button>'+
      '<button class="button outline" type="button" data-action="resetSalaryCountdown">استعادة الافتراضي (٢٧، ٨ صباحًا)</button></div>'+
      '<p class="body-note">العداد تقديري، وليس إشعارًا من البنك بإيداع الراتب. تعديل الموعد لا يضيف راتبًا إلى الحسابات ولا يغيّر الميزانية أو الرسائل المسجلة. إذا اخترت يوم ٣١ في شهر أقصر، يُستخدم آخر يوم في الشهر قبل تطبيق قاعدة نهاية الأسبوع.</p></section>';
  }
  function refresh(documentRoot,settings,at=Date.now()){
    const n=remaining(at,settings);
    if(!n||!documentRoot?.querySelectorAll)return;
    documentRoot.querySelectorAll("[data-salary-clock]").forEach(w=>{
      const data={days:n.days,hours:n.hours,minutes:n.minutes,seconds:n.seconds,date:n.label,time:n.time};
      for(const [key,val] of Object.entries(data)){
        const node=w.querySelector('[data-salary-value="'+key+'"]');
        if(node)node.textContent=key==="date"||key==="time"?String(val):number.format(val);
      }
    });
  }
  function validate(dayText,timeText,weekend){
    if(!/^\d{1,2}$/.test(String(dayText||"").trim()))throw Error("أدخل يوم صرف صحيحًا بين ١ و٣١");
    const day=Number(dayText),m=String(timeText||"").match(/^(\d{2}):(\d{2})$/);
    if(!Number.isInteger(day)||day<1||day>31||!m)throw Error("أدخل يومًا بين ١ و٣١ ووقتًا بصيغة ساعة ودقيقة");
    const hour=Number(m[1]),minute=Number(m[2]);
    if(hour>23||minute>59||!["ksa","none"].includes(weekend))throw Error("وقت الصرف أو قاعدة نهاية الأسبوع غير صحيحة");
    return {day,hour,minute,weekend};
  }
  root.SalaryCountdown={defaults,config,riyadhDate,dateForMonth,next,remaining,widget,settings,refresh,validate};
})(window);