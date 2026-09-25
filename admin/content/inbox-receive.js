// Admin Content Inbox — receive API (MICRO 21: Supabase + localStorage fallback)
(function(){
  "use strict";
  var QUEUE_KEY="samjho_inbox_queue";
  function readQueue(){try{var r=localStorage.getItem(QUEUE_KEY);if(!r)return[];var p=JSON.parse(r);return Array.isArray(p)?p:[];}catch(e){return[];}}
  function writeQueue(items){try{localStorage.setItem(QUEUE_KEY,JSON.stringify(items));}catch(e){}}
  function isValidRaw(item){return Boolean(item&&typeof item.title==="string"&&item.title.trim()&&typeof item.raw_content==="string"&&item.raw_content.trim()&&typeof item.source_url==="string"&&item.source_url.trim());}
  function isDuplicate(sourceUrl,queue){var u=String(sourceUrl||"").trim();if(!u)return false;for(var i=0;i<queue.length;i++){if(String(queue[i].source_url||"").trim()===u)return true;}return false;}
  function receiveRaw(item){
    if(!isValidRaw(item))return{ok:false,code:"INVALID_RAW_ITEM",message:"Refused: missing title, raw_content or source_url."};
    var q=readQueue();
    if(isDuplicate(item.source_url,q))return{ok:false,code:"DUPLICATE_RELEASE",message:"Skipped: already in inbox ("+item.source_url+")."};
    var id="fetched-"+Date.now()+"-"+(q.length+1);
    var stored={id:id,title:String(item.title).trim(),category:item.category||"government",raw_content:String(item.raw_content),raw_html:item.raw_html||"",refined_content:"",source_id:item.source_id||"",source_name:String(item.source_name||"").trim(),source_url:String(item.source_url).trim(),release_url:String(item.release_url||item.source_url||"").trim(),release_id:String(item.release_id||"").trim(),ministry:String(item.ministry||"").trim(),source_published_date:String(item.source_published_date||"").trim(),published_time:String(item.published_time||"").trim(),primary_category:String(item.primary_category||"").trim(),categorization_status:String(item.categorization_status||"uncategorized").trim(),fetched_at:item.fetched_at||new Date().toISOString(),fetch_status:item.fetch_status||"success",admin_notes:item.admin_notes||"Fetched from official source.",status:"draft",added_at:item.added_at||new Date().toISOString().slice(0,10)};
    q.push(stored);writeQueue(q);
    var cdb=window.SamjhoContentDB;
    if(cdb&&typeof cdb.insert==="function"){
      cdb.insert({release_id:stored.release_id||null,release_url:stored.release_url||null,source_name:stored.source_name,source_url:stored.source_url,title:stored.title,ministry:stored.ministry,raw_content:stored.raw_content,raw_html:stored.raw_html,source_published_date:stored.source_published_date,published_time:stored.published_time,primary_category:stored.primary_category,categorization_status:stored.categorization_status,content_type:"Press Release",fetch_status:stored.fetch_status,refinement_status:"pending",status:"draft",verification_status:"not_verified",review_status:"pending_review",approval_status:"not_approved",admin_notes:stored.admin_notes}).then(function(){console.log("[Inbox] Saved to Supabase: "+stored.title);}).catch(function(e){console.error("[Inbox] Supabase insert failed:",e.message||e);});
    }
    try{window.dispatchEvent(new CustomEvent("samjho:inbox-updated",{detail:stored}));}catch(e){}
    return{ok:true,code:"OK",message:"RAW announcement added.",item:stored};
  }
  function listQueued(){return readQueue();}
  function isItemDuplicate(sourceUrl){return isDuplicate(sourceUrl,readQueue());}
  window.SamjhoInbox=window.SamjhoInbox||{};
  window.SamjhoInbox.receiveRaw=receiveRaw;
  window.SamjhoInbox.listQueued=listQueued;
  window.SamjhoInbox.isValidRaw=isValidRaw;
  window.SamjhoInbox.isItemDuplicate=isItemDuplicate;
})();