#!/usr/bin/env node
// MICRO 18 — Daily PIB Fetch + Strict 20/day limit (4/category + absolute cap)
// Usage: node build/scripts/pib-daily-fetch.js [--limit=N] [--dry-run]
"use strict";
const fs=require("fs"),path=require("path"),https=require("https"),http=require("http");
const ROOT=path.join(__dirname,"..","..");
const pibFetcher=require(path.join(ROOT,"admin","sources","pib-fetcher.js"));
const MAX_PER_CAT=4,MAX_DAILY_TOTAL=20,CATS=["Government","Documents","Business","Money","Education"];
const INBOX_PATH=path.join(ROOT,"build","data","pib-inbox.json");
const LOG_DIR=path.join(ROOT,"build","data","pib-logs");
const LISTING_URL="https://pib.gov.in/allRel.aspx?reg=48&lang=1";
const args=process.argv.slice(2);
const DRY_RUN=args.indexOf("--dry-run")!==-1;
const limArg=args.find(function(a){return a.indexOf("--limit=")===0;});
const FETCH_LIMIT=limArg?parseInt(limArg.split("=")[1],10):30;
function readInbox(){try{if(!fs.existsSync(INBOX_PATH))return[];var r=fs.readFileSync(INBOX_PATH,"utf8").trim();if(!r)return[];var p=JSON.parse(r);return Array.isArray(p)?p:[];}catch(e){return[];}}
function writeInbox(items){var d=path.dirname(INBOX_PATH);if(!fs.existsSync(d))fs.mkdirSync(d,{recursive:true});fs.writeFileSync(INBOX_PATH,JSON.stringify(items,null,2)+"\n","utf8");}
function getExistingUrls(ib){var u=[];for(var i=0;i<ib.length;i++){if(ib[i].source_url)u.push(ib[i].source_url);}return u;}
function httpGet(url){return new Promise(function(resolve,reject){var mod=url.indexOf("https")===0?https:http;var opts={headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}};function go(u){mod.get(u,opts,function(res){if(res.statusCode===301||res.statusCode===302){var loc=res.headers.location;if(!loc)return reject(new Error("Redirect no Location"));go(loc.indexOf("http")===0?loc:"https://pib.gov.in"+loc);return;}var d="";res.on("data",function(c){d+=c;});res.on("end",function(){resolve(d);});}).on("error",reject);}go(url);});}
function applyCategoryLimits(items,maxPerCat,maxTotal){var counts={};CATS.forEach(function(c){counts[c]=0;});counts["needs_manual_categorization"]=0;var totalAccepted=0,accepted=[],rejected=[];for(var i=0;i<items.length;i++){var item=items[i],cat=item.primary_category||"needs_manual_categorization";if(counts[cat]===undefined)counts[cat]=0;if(totalAccepted>=maxTotal){rejected.push({title:item.title,prid:item.release_id,category:cat,reason:"Absolute daily limit reached ("+maxTotal+")"});continue;}if(cat!=="needs_manual_categorization"&&counts[cat]>=maxPerCat){rejected.push({title:item.title,prid:item.release_id,category:cat,reason:"Category limit reached ("+maxPerCat+")"});continue;}counts[cat]++;totalAccepted++;accepted.push(item);}return{accepted:accepted,rejected:rejected,counts:counts,totalAccepted:totalAccepted};}
function writeLog(entry){if(!fs.existsSync(LOG_DIR))fs.mkdirSync(LOG_DIR,{recursive:true});var f="pib-daily-"+entry.run_date+".json";var p=path.join(LOG_DIR,f);fs.writeFileSync(p,JSON.stringify(entry,null,2)+"\n","utf8");return p;}
function run(){var runDate=new Date().toISOString().slice(0,10),runTs=new Date().toISOString();
console.log("=== PIB Daily Fetch — "+runDate+" ===");
console.log("Mode: "+(DRY_RUN?"DRY RUN":"LIVE")+" | Fetch limit: "+FETCH_LIMIT+" | Cat limit: "+MAX_PER_CAT+"/category | Daily total cap: "+MAX_DAILY_TOTAL);
var inbox=readInbox(),existingUrls=getExistingUrls(inbox);
console.log("Inbox: "+inbox.length+" items | Known URLs: "+existingUrls.length);
pibFetcher.fetchPibReleases(httpGet,{limit:FETCH_LIMIT,existingUrls:existingUrls,source:{source_name:"Press Information Bureau (PIB)",source_url:"https://pib.gov.in/",feed_url:LISTING_URL}}).then(function(result){
console.log("\nFetch: "+result.code+" — "+result.results.length+" fetched, "+result.failures.length+" failed");
result.failures.forEach(function(f){console.log("  FAIL: ["+f.code+"] "+(f.title||"")+" — "+f.message);});
var limited=applyCategoryLimits(result.results,MAX_PER_CAT,MAX_DAILY_TOTAL);
console.log("\nLimits: "+limited.accepted.length+" accepted, "+limited.rejected.length+" rejected (daily cap: "+MAX_DAILY_TOTAL+")");
CATS.forEach(function(c){console.log("  "+c+": "+(limited.counts[c]||0)+"/"+MAX_PER_CAT);});
console.log("  needs_manual: "+(limited.counts["needs_manual_categorization"]||0)+"/"+MAX_DAILY_TOTAL+" (daily cap)");
limited.rejected.forEach(function(r){console.log("  REJECTED: ["+r.category+"] "+r.title+" — "+r.reason);});
if(!DRY_RUN&&limited.accepted.length>0){var ni=inbox.slice();limited.accepted.forEach(function(item){ni.push({id:"pib-daily-"+Date.now()+"-"+(ni.length+1),title:item.title,source_name:item.source_name,source_url:item.source_url,release_url:item.release_url,release_id:item.release_id,ministry:item.ministry,raw_content:item.raw_content,raw_html:item.raw_html,source_published_date:item.source_published_date,published_time:item.published_time,primary_category:item.primary_category,categorization_status:item.categorization_status,fetched_at:item.fetched_at,fetch_status:item.fetch_status,admin_notes:item.admin_notes,status:"draft",added_at:new Date().toISOString().slice(0,10)});});writeInbox(ni);console.log("\nInbox: "+inbox.length+" → "+ni.length+" items");}
else if(DRY_RUN){console.log("\n(Dry run — nothing stored)");}
else{console.log("\nNo new items.");}
var log={run_date:runDate,run_timestamp:runTs,mode:DRY_RUN?"dry_run":"live",fetch_limit:FETCH_LIMIT,max_per_category:MAX_PER_CAT,max_daily_total:MAX_DAILY_TOTAL,listing_result:result.code,listing_message:result.message,releases_detected:result.results.length+result.failures.length,releases_fetched:result.results.length,releases_failed:result.failures.length,failures:result.failures,after_limits:{accepted:limited.accepted.length,rejected:limited.rejected.length,total_accepted:limited.totalAccepted,counts:limited.counts},inbox_before:inbox.length,inbox_after:DRY_RUN?inbox.length:inbox.length+limited.accepted.length,status:"complete"};
var lp=writeLog(log);console.log("Log: "+lp+"\n=== Done ===");process.exit(0);
}).catch(function(err){console.error("FATAL: "+(err&&err.message?err.message:String(err)));try{writeLog({run_date:runDate,run_timestamp:runTs,mode:DRY_RUN?"dry_run":"live",status:"error",error:err&&err.message?err.message:String(err),listing_result:"ERROR",releases_detected:0,releases_fetched:0,releases_failed:0});}catch(e){}process.exit(1);});}
run();
