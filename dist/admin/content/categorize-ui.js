// MICRO 10+21 UI — categorization: reads from Supabase, writes back to DB.
(function(){
  "use strict";
  var STORE_KEY="samjho_categorization_store";
  function esc(v){return String(v==null?"":v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
  function readStore(){try{var r=localStorage.getItem(STORE_KEY);var p=r?JSON.parse(r):{};return p&&typeof p==="object"?p:{};}catch(e){return{};}}
  function writeStore(s){try{localStorage.setItem(STORE_KEY,JSON.stringify(s));}catch(e){}}
  function collectRawItems(){return new Promise(function(resolve){
    var cdb=window.SamjhoContentDB;
    if(cdb&&typeof cdb.select==="function"){
      cdb.select({columns:"id,title,source_name,source_url,primary_category,categorization_status,content_type,raw_content",filter:{fetch_status:"success"},order:{column:"added_at",ascending:false},limit:200}).then(function(rows){
        resolve(rows.map(function(r){return{id:r.id,title:r.title||"",source_name:r.source_name||"",source_url:r.source_url||"",primary_category:r.primary_category||"",categorization_status:r.categorization_status||"uncategorized",content_type:r.content_type||"Press Release",raw_content:r.raw_content||""};}));
      }).catch(function(){var items=[];try{if(window.SamjhoInbox&&typeof window.SamjhoInbox.listQueued==="function")items=window.SamjhoInbox.listQueued();}catch(e){}resolve(items);});
    }else{var items=[];try{if(window.SamjhoInbox&&typeof window.SamjhoInbox.listQueued==="function")items=window.SamjhoInbox.listQueued();}catch(e){}resolve(items);}
  });}
  function statusBadge(s){var c="inbox-badge";if(s==="categorized")c+=" inbox-badge--approved";else if(s==="needs_manual_categorization")c+=" inbox-badge--review";return '<span class="'+c+'">'+esc(s||"uncategorized")+'</span>';}
  function render(items,store){var tbody=document.getElementById("categorize-tbody");if(!tbody)return;var empty=document.getElementById("categorize-empty");
    tbody.innerHTML=items.map(function(item){var cat=store[item.id]||{};return "<tr><td class='inbox-table__title'>"+esc(item.title)+"</td><td>"+(item.source_url?'<a href="'+esc(item.source_url)+'" target="_blank" rel="noopener">'+esc(item.source_name||item.source_url)+"</a>":esc(item.source_name||"—"))+"</td><td>"+(cat.content_type?esc(cat.content_type):(item.content_type||"—"))+"</td><td>"+esc(cat.category||item.primary_category||"—")+"</td><td>"+(cat.sub_category?esc(cat.sub_category):"—")+"</td><td>"+(cat.user_group?esc(cat.user_group):"—")+"</td><td>"+statusBadge(cat.categorization_status||item.categorization_status)+"</td></tr>";}).join("");
    if(empty)empty.hidden=items.length>0;}
  function runAll(){var msg=document.getElementById("categorize-msg");if(!window.SamjhoCategorizer){if(msg)msg.textContent="Categorizer not loaded.";return;}
    collectRawItems().then(function(items){var store=readStore();var done=0,manual=0,updates=[];
      items.forEach(function(item){var r=window.SamjhoCategorizer.categorizeRaw(item,{provider:"mock"});if(!r.ok)return;
        var key=r.categorization.raw_ref||item.id||"";store[key]=Object.assign({title:item.title},r.categorization);done++;
        if(r.categorization.categorization_status!=="categorized")manual++;
        var cdb=window.SamjhoContentDB;
        if(cdb&&typeof cdb.update==="function"&&item.id){updates.push(cdb.update(item.id,{primary_category:r.categorization.category||"",categorization_status:r.categorization.categorization_status||"uncategorized",content_type:r.categorization.content_type||"Press Release"}).catch(function(e){console.error("[Categorize] DB update failed:",e.message||e);}));}
      });writeStore(store);render(items,store);
      if(msg)msg.textContent=items.length?(done+" categorized ("+manual+" manual). RAW unchanged."):("No items to categorize.");
      if(updates.length>0)Promise.all(updates).then(function(){console.log("[Categorize] "+updates.length+" records updated in Supabase.");}).catch(function(){});});}
  window.SamjhoCategorization={readStore:readStore,runAll:runAll,render:function(){collectRawItems().then(function(items){render(items,readStore());});}};
  function init(){window.SamjhoCategorization.render();var btn=document.getElementById("categorize-run");if(btn)btn.addEventListener("click",runAll);
    try{window.addEventListener("samjho:inbox-updated",function(){window.SamjhoCategorization.render();});}catch(e){}
    try{window.addEventListener("storage",function(e){if(e.key==="samjho_inbox_queue"||e.key===STORE_KEY)window.SamjhoCategorization.render();});}catch(e2){}}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();