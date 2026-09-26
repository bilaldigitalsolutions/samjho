// Admin Dashboard — Data Loading & Rendering
(function(){
"use strict";
var TABS=[{l:'All',f:null},{l:'Fetch',f:'fetched'},{l:'Refine',f:'refine'},{l:'Verify',f:'verify'},{l:'Review',f:'review'},{l:'Approved',f:'approved'},{l:'Published',f:'published'}];
var aT='All',aI=[],cP=1,PS=10,db=window.SamjhoContentDB;
function esc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function ms(i){var s=(i.status||'').toLowerCase();if(s==='published')return'published';if(s==='approved'||s==='pending_publish')return'approved';if(s==='review')return'review';var vs=(i.verification_status||'').toLowerCase();if(vs==='verified')return'verify';if(vs==='changes_required')return'refine';var rs=(i.refinement_status||'').toLowerCase();if(rs==='completed')return'refine';return'fetched';}
function md(s){return({fetched:'Fetched',refine:'Refined',verify:'Verified',review:'In Review',approved:'Approved',published:'Published'})[s]||s;}
function cc(c){return(c||'government').toLowerCase().replace(/[^a-z]/g,'');}
function bc(s){return'dash-badge dash-badge--'+s;}
function uc(){
var t=aI.length,ir=aI.filter(function(i){return ms(i)==='review';}).length;
var v=aI.filter(function(i){var s=ms(i);return s==='verify'||s==='review'||s==='approved';}).length;
var p=aI.filter(function(i){return ms(i)==='published';}).length;
document.getElementById('card-total').textContent=t;document.getElementById('card-total-sub').textContent=t+' in database';document.getElementById('card-total-badge').textContent=t+' fetched';
document.getElementById('card-review').textContent=ir;document.getElementById('card-review-sub').textContent=ir>0?'Needs attention':'All clear';document.getElementById('card-review-badge').textContent=ir>0?ir+' pending':'All clear';
document.getElementById('card-verified').textContent=v;document.getElementById('card-verified-sub').textContent='From official sources';document.getElementById('card-verified-badge').textContent='OFFICIAL';
document.getElementById('card-published').textContent=p;document.getElementById('card-published-sub').textContent=p>0?'Live on Samjho India':'Not yet published';document.getElementById('card-published-badge').textContent='Live';
document.getElementById('nav-total-count').textContent=t;document.getElementById('nav-content-count').textContent=t;document.getElementById('nav-review-count').textContent=ir;document.getElementById('table-count').textContent=t+' total';
var vp=aI.filter(function(i){return ms(i)==='fetched'||ms(i)==='refine';}).length;
document.getElementById('action-verify').textContent=vp+' items need source check';
var vb=document.getElementById('action-verify-badge');if(vp>0){vb.textContent=vp;vb.style.display='';}else{vb.style.display='none';}
var ap=aI.filter(function(i){return ms(i)==='approved';}).length;
document.getElementById('action-publish').textContent=ap>0?ap+' ready to go live':'No approved content yet';
}
function rT(){var el=document.getElementById('status-tabs');if(!el)return;var c={};c['All']=aI.length;aI.forEach(function(i){var s=ms(i);c[s]=(c[s]||0)+1;});el.innerHTML='';TABS.forEach(function(t){var n=c[t.f]||(t.l==='All'?aI.length:0);var b=document.createElement('button');b.className='dash-tab'+(aT===t.l?' active':'');b.innerHTML=t.l+'<span class="dash-tab-count">'+n+'</span>';b.onclick=function(){aT=t.l;cP=1;rT();rTa();};el.appendChild(b);});}
function rTa(){var tb=document.getElementById('dash-tbody'),em=document.getElementById('dash-empty'),f=aI;if(aT!=='All'){var t=TABS.find(function(x){return x.l===aT;});if(t&&t.f)f=aI.filter(function(i){return ms(i)===t.f;});}var s=(cP-1)*PS,p=f.slice(s,s+PS);
document.getElementById('page-showing').textContent=p.length;document.getElementById('page-total').textContent=f.length;
document.getElementById('page-prev').disabled=cP<=1;document.getElementById('page-next').disabled=s+PS>=f.length;
if(f.length===0){if(tb)tb.innerHTML='';if(em)em.style.display='';return;}if(em)em.style.display='none';
var h='';p.forEach(function(i){var cat=i.primary_category||'Government',st=ms(i),up=i.updated_at?i.updated_at.split('T')[0]:'',src=i.source_name||i.ministry||'';
h+='<tr><td>'+esc(i.title||'Untitled')+'</td><td><span class="dash-cat dash-cat--'+cc(cat)+'"><span class="cat-dot"></span>'+esc(cat)+'</span></td><td>'+esc(src)+'</td><td><span class="'+bc(st)+'">'+md(st)+'</span></td><td>'+esc(up)+'</td></tr>';});
tb.innerHTML=h;}
function ld(){if(!db){document.getElementById('card-total-sub').textContent='DB not loaded';return;}
db.select({columns:'*',order:{column:'updated_at',ascending:false}}).then(function(r){aI=r||[];rT();rTa();uc();}).catch(function(e){console.error('Dashboard load failed:',e);document.getElementById('card-total-sub').textContent='Load failed';});}
document.getElementById('page-prev').onclick=function(){if(cP>1){cP--;rTa();}};document.getElementById('page-next').onclick=function(){cP++;rTa();};ld();
var lb=document.getElementById('admin-logout-btn');if(lb)lb.addEventListener('click',function(e){e.preventDefault();SamjhoAuth.logout();});
})();
