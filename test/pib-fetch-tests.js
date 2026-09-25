// MICRO 16 — PIB Fetch + Categorization Tests
"use strict"; const path=require("path"),fs=require("fs"),http=require("https");
const root=path.resolve(__dirname,".."); var P=0,F=0,AR=[];
function assert(c,n,d){if(c){P++;console.log("  PASS: "+n);}else{F++;console.log("  FAIL: "+n+(d?" — "+d:""));} }function sec(t){console.log("\n--- "+t+" ---");}
var pib=require(path.join(root,"admin","sources","pib-fetcher.js"));
var reg=require(path.join(root,"admin","sources","registry.js"));
// inbox-receive.js uses window — set up globals before requiring it
var ms={}; global.localStorage={getItem:function(k){return ms[k]||null;},setItem:function(k,v){ms[k]=v;}};
global.window=global; global.CustomEvent=function(){};
require(path.join(root,"admin","content","inbox-receive.js"));
var inboxMod=global.SamjhoInbox;

sec("1. Module+Registry"); assert(typeof pib.fetchPibReleases==="function","exports"); assert(pib.CAT_RULES.length===5,"5 rules");
var src=reg.getSource("pib"); assert(src&&src.feed_url.indexOf("allRel.aspx")>-1,"feed URL");

sec("2. Categories"); assert(pib.classifyCategory("Cabinet approves governance policy","Union Cabinet approved new governance policy for government administration districts state").primary_category==="Government","Gov"); assert(pib.classifyCategory("Aadhaar card update online","UIDAI new online process for Aadhaar card update and identity proof document verification").primary_category==="Documents","Doc"); assert(pib.classifyCategory("MSME registration","Udyam portal crore MSMEs startup manufacturing industry").primary_category==="Business","Biz"); assert(pib.classifyCategory("RBI interest","Reserve Bank repo rate savings loan EMI fiscal budget finance").primary_category==="Money","Mon"); assert(pib.classifyCategory("CBSE board exam","Class 12 results students college school university education").primary_category==="Education","Edu"); assert(pib.classifyCategory("Weather","IMD predicted rainfall").primary_category==="needs_manual_categorization","Low conf");

sec("3. Listing"); var ls='<h3 class="font104">MoE</h3><a title="T1" href="/PressReleaseDetail.aspx?PRID=111" target="_blank">T1</a><h3 class="font104">MoF</h3><a title="T2" href="/PressReleaseDetail.aspx?PRID=222" target="_blank">T2</a>'; var pp=pib.parseListingPage(ls); assert(pp.ok,"ok"); assert(pp.releases.length===2,"2 found"); assert(pp.releases[0].ministry==="MoE","ministry"); assert(pp.releases[1].prid==="222","prid");

sec("4. Extraction"); var pg='<div id="MinistryName">MoA</div><input id="hydpermid" value="999"/><div id="PrDateTime">Posted On: 18 Sep 2024 10:00 IST</div><div id="frst_t"><p>PM-KISAN provides Rs 6000 per year to farmers. Launched Feb 2019. Register pmkisan.gov.in. Aadhaar card needed.</p></div>'; var ex=pib.extractPibRelease(pg,"https://pib.gov.in/PR?PRID=999"); assert(ex.ok,"ok"); assert(ex.prid==="999","prid"); assert(ex.published_date==="2024-09-18","date");

sec("5. Duplicates");
var r1=inboxMod.receiveRaw({title:"T1",raw_content:"Content for first item with enough chars for validation.",source_url:"https://pib.gov.in/PR?PRID=1"}); assert(r1.ok,"1st ok");
var r2=inboxMod.receiveRaw({title:"T2",raw_content:"Duplicate content.",source_url:"https://pib.gov.in/PR?PRID=1"}); assert(!r2.ok&&r2.code==="DUPLICATE_RELEASE","dup rejected");

sec("6. Live Fetch"); function lf(u){return new Promise(function(res,rej){var o={headers:{"User-Agent":"Mozilla/5.0"}};function go(url){http.get(url,o,function(r){if(r.statusCode===301||r.statusCode===302){var l=r.headers.location;go(l.indexOf("http")===0?l:"https://pib.gov.in"+l);return;}var d="";r.on("data",function(c){d+=c;});r.on("end",function(){res(d);});}).on("error",rej);}go(u);});}
AR.push(pib.fetchPibReleases(lf,{limit:3}).then(function(r){assert(r.ok,r.results.length+" releases");var f=r.results[0]; assert(f.title.length>5,"title"); assert(f.raw_content.length>100,"content "+f.raw_content.length); assert(f.source_url.indexOf("pib.gov.in")>-1,"url"); assert(f.release_id,"prid "+f.release_id); assert(["Government","Documents","Business","Money","Education","needs_manual_categorization"].indexOf(f.primary_category)!==-1,"cat "+f.primary_category); console.log("\n  #1: "+f.title.substring(0,70)+"\n  PRID:"+f.release_id+" Min:"+(f.ministry||"N/A")+" Date:"+(f.published_date||"N/A")+" Cat:"+f.primary_category);}));

sec("7. Failures"); AR.push(pib.fetchPibReleases(function(){return Promise.reject(new Error("x"));},{limit:1}).then(function(r){assert(!r.ok,"net fail");})); AR.push(pib.fetchPibReleases(function(){return"";},{source:{feed_url:""}}).then(function(r){assert(!r.ok,"empty feed");}));

sec("8. Unchanged"); assert(fs.existsSync(path.join(root,"dist")),"dist/");

function finish(){console.log("\n========================================\nMICRO 16 SUMMARY\nPassed:"+P+" Failed:"+F+"\n========================================");process.exit(F>0?1:0);}
if(AR.length>0){Promise.all(AR.map(function(p){return p.catch(function(e){F++;console.log("  FAIL: "+(e&&e.message?e.message:e));});})).then(finish).catch(finish);}else{finish();}
