// MICRO 19 — PIB DeepSeek Refinement Tests
"use strict";const path=require("path"),fs=require("fs");const root=path.resolve(__dirname,"..");
var P=0,F=0,asyncRes=[];
function assert(c,n,d){if(c){P++;console.log("  PASS: "+n);}else{F++;console.log("  FAIL: "+n+(d?" — "+d:""));} }
function sec(t){console.log("\n--- "+t+" ---");}
var sb=require(path.join(root,"admin","ai","server-bridge.js"));
var gs=require(path.join(root,"admin","schemas","guide.js"));
var refineScript=path.join(root,"build","scripts","pib-daily-refine.js");

sec("1. Scripts exist");assert(fs.existsSync(refineScript),"refine.js exists");assert(fs.existsSync(path.join(root,"build","scripts","pib-daily-fetch.js")),"fetch.js exists");
sec("2. Transform passes category");var inp={title:"T",raw_content:"C",source_name:"PIB",source_url:"https://pib.gov.in/PR?PRID=123",source_published_date:"2024-01-15",primary_category:"Government",categorization_status:"categorized"};
var toInput=function(it){return{title:it.title||"",raw_content:it.raw_content||"",source_name:it.source_name||"",source_url:it.source_url||"",source_published_date:it.source_published_date||"",categorization:{content_type:"Press Release",category:it.primary_category||"",sub_category:"",user_group:"",categorization_status:it.categorization_status||"categorized"}};};
var ti=toInput(inp);assert(ti.categorization.category==="Government","Category passed");assert(ti.categorization.categorization_status==="categorized","Status passed");
sec("3. Source preserved");assert(ti.source_url==="https://pib.gov.in/PR?PRID=123","URL preserved");assert(ti.source_name==="PIB","Name preserved");assert(ti.source_published_date==="2024-01-15","Date preserved");
sec("4. RAW not mutated");var orig={title:"T",raw_content:"Content",source_url:"https://x.com",source_name:"X"};var oc=JSON.stringify(orig);toInput(orig);assert(JSON.stringify(orig)===oc,"RAW unchanged");
sec("5. Bridge validates input");assert(sb.validateRawInput({title:"T",raw_content:"C",source_url:"https://x.com",source_name:"X"}).ok,"Valid passes");assert(!sb.validateRawInput({}).ok,"Empty fails");
sec("6. Schema validation");assert(gs.validateGuide({title:"T",slug:"t",category:"G",summary:"S",content:"C",status:"draft",source_ids:["https://x.com"]}).valid,"Valid guide");assert(!gs.validateGuide({}).valid,"Empty fails");
sec("7. Draft-only");assert(gs.validateGuide({title:"T",slug:"t",category:"G",summary:"S",content:"C",status:"draft",source_ids:["https://x.com"]}).valid,"Draft ok");
sec("8. Manual not auto-refined");var mi={title:"M",raw_content:"C",source_url:"https://x.com",source_name:"X",primary_category:"needs_manual_categorization",categorization_status:"needs_manual_categorization"};assert(toInput(mi).categorization.categorization_status==="needs_manual_categorization","Manual preserved");
sec("9. Helpers active");var h=require(path.join(root,"admin","ai","deepseek","helpers.js"));var ws=h.buildWordSet("PM-KISAN scheme provides six thousand rupees");assert(h.isGroundedText(ws,"Six Thousand Rupees"),"Grounded passes");assert(!h.isGroundedText(ws,"xyz invented claim"),"Ungrounded fails");
sec("10. Bridge functions exist");assert(typeof sb.refineWithDeepSeek==="function","refineWithDeepSeek");assert(typeof sb.validateRawInput==="function","validateRawInput");assert(typeof sb.validateGuideAgainstSchema==="function","validateGuideAgainstSchema");assert(typeof sb.isProviderConfigured==="function","isProviderConfigured");
sec("11. Config check");assert(sb.isProviderConfigured()===false,"Not configured (no key in test env)");
sec("12. Mock refinement succeeds");
process.env.DEEPSEEK_API_KEY="test-key-not-a-real-secret";
var fakeGuide={title:"Refined",slug:"refined",category:"Government",summary:"Sum",content:"Con",eligibility:["N/A"],benefits:["N/A"],required_documents:["N/A"],application_process:["N/A"],important_dates:["N/A"],common_mistakes:["N/A"],faqs:[],source_ids:["https://pib.gov.in/PR?PRID=123"],status:"draft",last_updated:"2024-01-15"};
var comp={id:"c1",model:"deepseek-flash",choices:[{message:{content:JSON.stringify(fakeGuide)},finish_reason:"stop"}]};
var ff=function(){return Promise.resolve({ok:true,json:function(){return Promise.resolve(comp);}});};
var raw={title:"T",raw_content:"Content about government scheme for farmers",source_url:"https://pib.gov.in/PR?PRID=123",source_name:"PIB",categorization:{content_type:"Press Release",category:"Government",sub_category:"",user_group:"",categorization_status:"categorized"}};
asyncRes.push(sb.refineWithDeepSeek(raw,{fetchImpl:ff,timeoutMs:5000}).then(function(r){
assert(r.ok,"Refinement ok");assert(r.guide,"Guide returned");assert(r.guide.status==="draft","Status draft");assert(r.guide.category==="Government","Category preserved");assert(r.guide.source_ids[0]==="https://pib.gov.in/PR?PRID=123","Source URL in guide");assert(r.provider==="deepseek","Provider");assert(r.model==="deepseek-flash","Model");
assert(gs.validateGuide(r.guide).valid,"Guide passes schema");
}));
sec("13. Sneaky published → rejected by parser");
var sg={title:"T",slug:"t",category:"G",summary:"S",content:"C",status:"published",last_updated:"2024-01-15",source_ids:["https://x.com"]};
var sc={id:"c1",choices:[{message:{content:JSON.stringify(sg)},finish_reason:"stop"}]};
var sf=function(){return Promise.resolve({ok:true,json:function(){return Promise.resolve(sc);}});};
var sr={title:"T",raw_content:"Content",source_url:"https://x.com",source_name:"X",categorization:{content_type:"Press Release",category:"Government",sub_category:"",user_group:"",categorization_status:"categorized"}};
asyncRes.push(sb.refineWithDeepSeek(sr,{fetchImpl:sf,timeoutMs:5000}).then(function(r){
assert(!r.ok,"Sneaky published rejected (parser safety)");assert(r.guide===null,"No draft created");assert(r.raw,"RAW preserved in error");
}));
sec("14. Failure preserves RAW");
var ff2=function(){return Promise.reject(new Error("API down"));};
asyncRes.push(sb.refineWithDeepSeek(Object.assign({},sr),{fetchImpl:ff2,timeoutMs:5000}).then(function(r){
assert(!r.ok,"Failure ok=false");assert(r.raw,"RAW returned");assert(r.guide===null,"No guide");
}));
sec("15. Invalid JSON");
var bjf=function(){return Promise.resolve({ok:true,json:function(){return Promise.resolve({choices:[{message:{content:"not json"},finish_reason:"stop"}]});}});};
asyncRes.push(sb.refineWithDeepSeek(Object.assign({},sr),{fetchImpl:bjf,timeoutMs:5000}).then(function(r){
assert(!r.ok,"Invalid JSON fails");assert(r.guide===null,"No guide");
}));
sec("16. Unchanged");assert(fs.existsSync(path.join(root,"dist")),"dist/");assert(fs.existsSync(path.join(root,"build","build.js")),"build.js");
delete process.env.DEEPSEEK_API_KEY;

function finish(){console.log("\n========================================\nMICRO 19 TEST SUMMARY\n========================================\nPassed: "+P+"\nFailed: "+F+"\n========================================");process.exit(F>0?1:0);}
if(asyncRes.length>0){Promise.all(asyncRes.map(function(p){return p.catch(function(e){F++;console.log("  FAIL: async — "+(e&&e.message?e.message:e));});})).then(finish).catch(finish);}else{finish();}
