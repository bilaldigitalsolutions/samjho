#!/usr/bin/env node
// MICRO 19 — PIB RAW → DeepSeek → DRAFT (batch refinement)
// Usage: node build/scripts/pib-daily-refine.js [--dry-run] [--limit=N] [--verbose]
"use strict";
const fs=require("fs"),path=require("path");
const ROOT=path.join(__dirname,"..","..");
const serverBridge=require(path.join(ROOT,"admin","ai","server-bridge.js"));
const INBOX_PATH=path.join(ROOT,"build","data","pib-inbox.json");
const LOG_DIR=path.join(ROOT,"build","data","pib-logs");
const args=process.argv.slice(2);
const DRY_RUN=args.indexOf("--dry-run")!==-1;
const VERBOSE=args.indexOf("--verbose")!==-1;
const limArg=args.find(function(a){return a.indexOf("--limit=")===0;});
const REFINE_LIMIT=limArg?parseInt(limArg.split("=")[1],10):20;
function readInbox(){try{if(!fs.existsSync(INBOX_PATH))return[];var r=fs.readFileSync(INBOX_PATH,"utf8").trim();if(!r)return[];var p=JSON.parse(r);return Array.isArray(p)?p:[];}catch(e){return[];}}
function writeInbox(items){var d=path.dirname(INBOX_PATH);if(!fs.existsSync(d))fs.mkdirSync(d,{recursive:true});fs.writeFileSync(INBOX_PATH,JSON.stringify(items,null,2)+"\n","utf8");}
function writeLog(entry){if(!fs.existsSync(LOG_DIR))fs.mkdirSync(LOG_DIR,{recursive:true});var f="pib-refine-"+entry.run_date+".json";var p=path.join(LOG_DIR,f);fs.writeFileSync(p,JSON.stringify(entry,null,2)+"\n","utf8");return p;}
function toServerBridgeInput(item){return{title:item.title||"",raw_content:item.raw_content||"",source_name:item.source_name||"",source_url:item.source_url||"",source_published_date:item.source_published_date||"",categorization:{content_type:"Press Release",category:item.primary_category||"",sub_category:"",user_group:"",categorization_status:item.categorization_status||"categorized"}};}
function findUnrefined(inbox,limit){var r=[];for(var i=0;i<inbox.length&&r.length<limit;i++){var it=inbox[i];if(it.refined_guide||it.refined_content||it.refinement_status==="failed")continue;if(it.categorization_status!=="categorized")continue;r.push({index:i,item:it});}return r;}
function refineItem(item){var input=toServerBridgeInput(item);return serverBridge.refineWithDeepSeek(input,{model:"deepseek-flash",timeoutMs:60000}).then(function(result){if(result.ok)return{ok:true,guide:result.guide,model:result.model,provider:result.provider};return{ok:false,code:result.code||"REFINEMENT_FAILED",message:result.message||"Unknown error"};}).catch(function(err){return{ok:false,code:"REFINEMENT_ERROR",message:err&&err.message?err.message:String(err)};});}
function run(){var runDate=new Date().toISOString().slice(0,10),runTs=new Date().toISOString();
console.log("=== PIB DeepSeek Refinement — "+runDate+" ===");
console.log("Mode: "+(DRY_RUN?"DRY RUN":"LIVE")+" | Limit: "+REFINE_LIMIT);
if(!serverBridge.isProviderConfigured()){console.error("\nFATAL: DEEPSEEK_API_KEY not configured.");process.exit(1);}
console.log("DeepSeek: configured (model: "+(process.env.DEEPSEEK_MODEL||"deepseek-flash")+")");
var inbox=readInbox();console.log("Inbox: "+inbox.length+" items");
var candidates=findUnrefined(inbox,REFINE_LIMIT);console.log("Unrefined categorized: "+candidates.length);
if(candidates.length===0){console.log("\nNo items to refine.");var log={run_date:runDate,run_timestamp:runTs,mode:DRY_RUN?"dry_run":"live",status:"complete",inbox_total:inbox.length,candidates:0,refined:0,failed:0};writeLog(log);console.log("=== Done ===");process.exit(0);}
var chain=Promise.resolve(),refined=0,failed=0,failures=[];
candidates.forEach(function(c){chain=chain.then(function(){var item=c.item,idx=c.index;
console.log("\n["+(refined+failed+1)+"/"+candidates.length+"] "+item.title.substring(0,70));
console.log("  Cat: "+item.primary_category+" | PRID: "+(item.release_id||"N/A"));
return refineItem(item).then(function(result){
if(result.ok){refined++;console.log("  ✓ OK — draft ("+result.model+")");
if(VERBOSE&&result.guide){console.log("    title: "+(result.guide.title||""));console.log("    slug: "+(result.guide.slug||""));}
if(!DRY_RUN){inbox[idx].refined_guide=result.guide;inbox[idx].refined_content=result.guide?(result.guide.summary||""):"";inbox[idx].refinement_status="completed";inbox[idx].refinement_model=result.model;inbox[idx].refined_at=new Date().toISOString();}
}else{failed++;failures.push({title:item.title,prid:item.release_id,code:result.code,message:result.message});console.log("  ✗ FAIL — "+result.code+": "+result.message);
if(!DRY_RUN){inbox[idx].refinement_status="failed";inbox[idx].refinement_error=result.code+": "+result.message;inbox[idx].refined_at=new Date().toISOString();}
}});});});
chain.then(function(){console.log("\n--- Summary ---");console.log("Refined: "+refined+" | Failed: "+failed+" | Candidates: "+candidates.length);
if(!DRY_RUN&&(refined>0||failed>0)){writeInbox(inbox);console.log("Inbox updated ("+inbox.length+" items)");}
else if(DRY_RUN){console.log("(Dry run)");}
var log={run_date:runDate,run_timestamp:runTs,mode:DRY_RUN?"dry_run":"live",status:"complete",inbox_total:inbox.length,candidates:candidates.length,refined:refined,failed:failed,failures:failures};
writeLog(log);console.log("=== Done ===");process.exit(0);
}).catch(function(err){console.error("FATAL: "+(err&&err.message?err.message:String(err)));process.exit(1);});}
run();
