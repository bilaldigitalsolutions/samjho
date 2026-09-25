#!/usr/bin/env node
// MICRO 20 — Daily PIB Fetch with Persistent DB (replaces JSON file storage)
// Usage: node build/scripts/pib-daily-fetch-db.js [--limit=N] [--dry-run]
// Requires: SUPABASE_SERVICE_ROLE_KEY in environment
"use strict";
const fs=require("fs"),path=require("path"),https=require("https"),http=require("http");
const ROOT=path.join(__dirname,"..","..");
const pibFetcher=require(path.join(ROOT,"admin","sources","pib-fetcher.js"));
const db=require(path.join(ROOT,"build","db-content.js"));
const MAX_PER_CAT=4,MAX_DAILY_TOTAL=20,CATS=["Government","Documents","Business","Money","Education"];
const LOG_DIR=path.join(ROOT,"build","data","pib-logs");
const LISTING_URL="https://pib.gov.in/allRel.aspx?reg=48&lang=1";
const args=process.argv.slice(2);
const DRY_RUN=args.indexOf("--dry-run")!==-1;
const limArg=args.find(function(a){return a.indexOf("--limit=")===0;});
const FETCH_LIMIT=limArg?parseInt(limArg.split("=")[1],10):30;
function httpGet(url){return new Promise(function(resolve,reject){var mod=url.indexOf("https")===0?https:http;var opts={headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}};function go(u){mod.get(u,opts,function(res){if(res.statusCode===301||res.statusCode===302){var loc=res.headers.location;if(!loc)return reject(new Error("No Location"));go(loc.indexOf("http")===0?loc:"https://pib.gov.in"+loc);return;}var d="";res.on("data",function(c){d+=c;});res.on("end",function(){resolve(d);});}).on("error",reject);}go(url);});}
function applyCategoryLimits(items,mc,mt){var counts={};CATS.forEach(function(c){counts[c]=0;});counts["needs_manual_categorization"]=0;var ta=0,acc=[],rej=[];for(var i=0;i<items.length;i++){var it=items[i],cat=it.primary_category||"needs_manual_categorization";if(counts[cat]===undefined)counts[cat]=0;if(ta>=mt){rej.push({title:it.title,prid:it.release_id,category:cat,reason:"Daily limit ("+mt+")"});continue;}if(cat!=="needs_manual_categorization"&&counts[cat]>=mc){rej.push({title:it.title,prid:it.release_id,category:cat,reason:"Cat limit ("+mc+")"});continue;}counts[cat]++;ta++;acc.push(it);}return{accepted:acc,rejected:rej,counts:counts,totalAccepted:ta};}
function writeLog(entry){if(!fs.existsSync(LOG_DIR))fs.mkdirSync(LOG_DIR,{recursive:true});var f="pib-daily-db-"+entry.run_date+".json";var p=path.join(LOG_DIR,f);fs.writeFileSync(p,JSON.stringify(entry,null,2)+"\n","utf8");return p;}
function getExistingUrls(rows){var u=[];for(var i=0;i<rows.length;i++){if(rows[i].source_url)u.push(rows[i].source_url);}return u;}
function run(){var runDate=new Date().toISOString().slice(0,10),runTs=new Date().toISOString();
console.log("=== PIB Daily Fetch (DB) — "+runDate+" ===");
console.log("Mode: "+(DRY_RUN?"DRY RUN":"LIVE")+" | Limit: "+FETCH_LIMIT+" | Cat: "+MAX_PER_CAT+" | Total: "+MAX_DAILY_TOTAL);
db.select("select=source_url&limit=10000").then(function(existing){
var existingUrls=getExistingUrls(existing);
console.log("DB: "+existing.length+" records | Known URLs: "+existingUrls.length);
return pibFetcher.fetchPibReleases(httpGet,{limit:FETCH_LIMIT,existingUrls:existingUrls,source:{source_name:"Press Information Bureau (PIB)",source_url:"https://pib.gov.in/",feed_url:LISTING_URL}});
}).then(function(result){
console.log("\nFetch: "+result.code+" — "+result.results.length+" fetched, "+result.failures.length+" failed");
result.failures.forEach(function(f){console.log("  FAIL: ["+f.code+"] "+(f.title||"")+" — "+f.message);});
var limited=applyCategoryLimits(result.results,MAX_PER_CAT,MAX_DAILY_TOTAL);
console.log("\nLimits: "+limited.accepted.length+" accepted, "+limited.rejected.length+" rejected");
CATS.forEach(function(c){console.log("  "+c+": "+(limited.counts[c]||0)+"/"+MAX_PER_CAT);});
console.log("  needs_manual: "+(limited.counts["needs_manual_categorization"]||0)+"/"+MAX_DAILY_TOTAL);
limited.rejected.forEach(function(r){console.log("  REJECTED: ["+r.category+"] "+r.title+" — "+r.reason);});
if(DRY_RUN||limited.accepted.length===0){if(DRY_RUN)console.log("\n(Dry run)");else console.log("\nNo new items.");
var log={run_date:runDate,run_timestamp:runTs,mode:DRY_RUN?"dry_run":"live",listing_result:result.code,releases_fetched:result.results.length,releases_failed:result.failures.length,after_limits:{accepted:limited.accepted.length,rejected:limited.rejected.length,counts:limited.counts},status:"complete"};
writeLog(log);console.log("=== Done ===");process.exit(0);}
var chain=Promise.resolve(),ins=0,dup=0,fail=[];
limited.accepted.forEach(function(item){chain=chain.then(function(){
var record={release_id:item.release_id||null,release_url:item.release_url||item.source_url||null,source_name:item.source_name||"",source_url:item.source_url||"",title:item.title||"",ministry:item.ministry||"",raw_content:item.raw_content||"",raw_html:item.raw_html||"",source_published_date:item.source_published_date||"",published_time:item.published_time||"",primary_category:item.primary_category||"needs_manual_categorization",categorization_status:item.categorization_status||"uncategorized",content_type:"Press Release",fetch_status:"success",refinement_status:"pending",status:"draft",verification_status:"not_verified",review_status:"pending_review",approval_status:"not_approved",admin_notes:"Fetched from PIB. RAW unchanged."};
return db.insert(record).then(function(){ins++;}).catch(function(err){
var msg=String(err.message||"");
if(msg.indexOf("duplicate")>-1||msg.indexOf("unique")>-1){dup++;console.log("  SKIP DUP: "+item.title);}
else{fail.push({title:item.title,error:msg});console.log("  INSERT FAIL: "+item.title+" — "+msg);}
});});});
chain.then(function(){console.log("\nDB: "+ins+" inserted, "+dup+" dup skipped, "+fail.length+" failures");
var log={run_date:runDate,run_timestamp:runTs,mode:"live",listing_result:result.code,releases_fetched:result.results.length,releases_failed:result.failures.length,after_limits:{accepted:limited.accepted.length,rejected:limited.rejected.length,counts:limited.counts},db_inserted:ins,db_duplicates:dup,db_insert_failures:fail,status:"complete"};
writeLog(log);console.log("=== Done ===");process.exit(0);
}).catch(function(err){console.error("FATAL: "+(err&&err.message?err.message:String(err)));process.exit(1);});
}).catch(function(err){console.error("FATAL: "+(err&&err.message?err.message:String(err)));process.exit(1);});}
run();
