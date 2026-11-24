(function(){
"use strict";
const n=x=>Number(x)||0, round=x=>Math.round(x*100)/100, id="emergency-reserve-v1";
function balance(d,a){return round(n(a.opening)+n(a.balanceAdjustment)+d.moves.reduce((v,m)=>v+(m.posted===false?0:(m.to===a.id?n(m.amount):0)-(m.from===a.id&&!m.bankAlreadyPosted?n(m.amount):0)),0))}
function split(amount,reserve,restore){let left=Math.max(0,round(amount)),e=0,r=0,o=0;while(left>0.005){let rate=reserve+e<5000?1:reserve+e<10000?.7:.1;let limit=rate===1?5000:rate===.7?10000:Infinity;let part=Math.min(left,(limit-reserve-e)/rate);let ep=Math.min(part,round(part*rate));let rp=Math.min(Math.max(0,restore-r),round(part*(rate===1?0:rate===.7?.3:.6)));e=round(e+ep);r=round(r+rp);o=round(o+part-ep-rp);left=round(left-part);if(part<.005){o=round(o+left);break}}return {emergency:e,restore:r,obligations:o}}
window.SurplusManager={split,balance,id};
})();