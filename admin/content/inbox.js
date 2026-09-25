/**
 * Content Inbox — Professional Redesign + One-Click Refine Workflow
 * Card-style table with pagination, filtering, sorting.
 * Refine: DeepSeek → Categorize → Preview → Publish
 */
(function() {
  "use strict";
  var PAGE_SIZE = 12, currentPage = 1, allItems = [];
  var CAT_ICONS = {Government:'\uD83C\uDFDB\uFE0F',Documents:'\uD83D\uDCC4',Business:'\uD83D\uDCBC',Money:'\uD83D\uDCB0',Education:'\uD83C\uDF93'};
  function getCatClass(c){return(c||'government').toLowerCase().replace(/[^a-z]/g,'');}
  function cap(s){return s?s.charAt(0).toUpperCase()+s.slice(1):'';}
  function trunc(s,n){return s&&s.length>n?s.substring(0,n)+'...':s||'';}
  function renderRow(item){
    var cat=item.primary_category||'Government',st=item.status||'draft',ref=item.refinement_status||'pending';
    var cc=getCatClass(cat),src=item.source_name||'Unknown',sid=String(item.id).substring(0,8);
    return '<tr data-id="'+item.id+'">' +
      '<td><div class="ci-table__title-cell"><div class="ci-table__icon">'+(CAT_ICONS[cat]||'\uD83D\uDCCB')+'</div><div><div class="ci-table__title">'+trunc(item.title,80)+'</div><div class="ci-table__meta">'+src+' &middot; ID #'+sid+'</div></div></div></td>' +
      '<td><span class="ci-badge ci-badge--'+cc+'"><span class="ci-badge__dot"></span>'+cat+'</span></td>' +
      '<td><span class="ci-badge ci-badge--draft"><span class="ci-badge__dot"></span>'+cap(st)+'</span></td>' +
      '<td><span class="ci-badge ci-badge--'+(ref==='completed'?'completed':'pending')+'"><span class="ci-badge__dot"></span>'+cap(ref)+'</span></td>' +
      '<td><div class="ci-actions"><button class="ci-btn-open" onclick="window._ciOpen(\''+item.id+'\')">&#8599; Open</button>' +
      (ref!=='completed'?'<button class="ci-btn-refine" onclick="window._ciRefine(\''+item.id+'\')">&#10024; Refine</button>':'') +
      '</div></td></tr>';
  }
  function getFiltered(){
    var q=((document.getElementById('ci-search')||{}).value||'').toLowerCase();
    var sf=(document.getElementById('ci-filter-status')||{}).value||'';
    var cf=(document.getElementById('ci-filter-category')||{}).value||'';
    var sort=(document.getElementById('ci-sort')||{}).value||'newest';
    var f=allItems.filter(function(it){
      var t=((it.title||'')+' '+(it.primary_category||'')+' '+(it.source_name||'')).toLowerCase();
      return(!q||t.indexOf(q)!==-1)&&(!sf||(it.status||'draft')===sf)&&(!cf||(it.primary_category||'')===cf);
    });
    if(sort==='newest')f.sort(function(a,b){return new Date(b.created_at||0)-new Date(a.created_at||0);});
    else if(sort==='oldest')f.sort(function(a,b){return new Date(a.created_at||0)-new Date(b.created_at||0);});
    else f.sort(function(a,b){return(a.title||'').localeCompare(b.title||'');});
    return f;
  }
  function renderPagination(total){
    var tp=Math.ceil(total/PAGE_SIZE);
    var el=document.getElementById('ci-page-showing');if(el)el.textContent=Math.min(currentPage*PAGE_SIZE,total);
    var te=document.getElementById('ci-page-total');if(te)te.textContent=total;
    var pg=document.getElementById('ci-pagination-pages');if(!pg)return;
    var h='<button class="ci-pagination__btn" onclick="window._ciPrev()"'+(currentPage<=1?' disabled':'')+'>&#8592;</button>';
    for(var i=1;i<=tp;i++){h+='<button class="ci-pagination__btn'+(i===currentPage?' ci-pagination__btn--active':'')+'" onclick="window._ciGo('+i+')">'+i+'</button>';}
    h+='<button class="ci-pagination__btn" onclick="window._ciNext()"'+(currentPage>=tp?' disabled':'')+'>&#8594;</button>';
    pg.innerHTML=h;
  }
  function updateCounts(v,t){
    var pending=allItems.filter(function(i){return(i.refinement_status||'pending')!=='completed';}).length;
    [['inbox-count-badge',v],['nav-inbox-count',t],['header-count',t],['header-refine-count',pending],['refine-badge-count',pending],['ci-pending-count',pending]]
    .forEach(function(p){var e=document.getElementById(p[0]);if(e)e.textContent=p[1];});
  }
  function renderTable(){
    var tbody=document.getElementById('ci-inbox-tbody');if(!tbody)return;
    var f=getFiltered(),start=(currentPage-1)*PAGE_SIZE;
    tbody.innerHTML=f.slice(start,start+PAGE_SIZE).map(renderRow).join('');
    var empty=document.getElementById('ci-inbox-empty');if(empty)empty.hidden=f.length>0;
    renderPagination(f.length);updateCounts(f.length,allItems.length);
  }
  // ========================================================================
  // MODAL + HANDLERS — defined after all helpers
  // ========================================================================
  var modal = {
    el: null, loading: null, error: null, preview: null, footer: null, status: null,
    currentItem: null, refinedGuide: null,
    init: function () {
      var self = this;
      this.el = document.getElementById('ci-refine-modal');
      this.loading = document.getElementById('ci-modal-loading');
      this.error = document.getElementById('ci-modal-error');
      this.preview = document.getElementById('ci-modal-preview');
      this.footer = document.getElementById('ci-modal-footer');
      this.status = document.getElementById('ci-modal-status');
      if (!this.el) return;
      document.getElementById('ci-modal-close').addEventListener('click', function () { self.close(); });
      var bd = this.el.querySelector('.ci-modal__backdrop');
      if (bd) bd.addEventListener('click', function () { self.close(); });
      document.getElementById('ci-modal-retry').addEventListener('click', function () { self.close(); self.runRefine(self.currentItem); });
      document.getElementById('ci-modal-publish').addEventListener('click', function () { self.publish(); });
      document.getElementById('ci-modal-edit').addEventListener('click', function () { self.openReview(); });
    },
    show: function () { this.el.hidden = false; document.body.style.overflow = 'hidden'; },
    close: function () { this.el.hidden = true; document.body.style.overflow = ''; this.resetSteps(); },
    resetSteps: function () {
      this.loading.hidden = true; this.error.hidden = true; this.preview.hidden = true; this.footer.hidden = true;
      ['ci-step-categorize', 'ci-step-refine', 'ci-step-preview'].forEach(function (id) {
        var el = document.getElementById(id); if (el) el.className = 'ci-modal__step';
      });
    },
    showLoading: function (msg) { this.resetSteps(); this.loading.hidden = false; if (this.status) this.status.textContent = msg || 'Starting...'; },
    setStep: function (id, st) {
      var el = document.getElementById(id); if (!el) return;
      el.className = 'ci-modal__step' + (st === 'active' ? ' ci-modal__step--active' : st === 'done' ? ' ci-modal__step--done' : st === 'error' ? ' ci-modal__step--error' : '');
    },
    showError: function (msg) { this.resetSteps(); this.error.hidden = false; document.getElementById('ci-modal-error-msg').textContent = msg; },
    showPreview: function (guide) {
      this.resetSteps(); this.preview.hidden = false; this.footer.hidden = false; this.refinedGuide = guide;
      var pb = document.getElementById('ci-modal-preview-body');
      if (pb && window.MasterGuideTemplate && typeof window.MasterGuideTemplate.renderMasterGuide === 'function') {
        try { pb.innerHTML = window.MasterGuideTemplate.renderMasterGuide(guide).html; }
        catch (e) { pb.innerHTML = '<pre>' + esc(JSON.stringify(guide, null, 2)).substring(0, 5000) + '</pre>'; }
      } else {
        pb.innerHTML = '<pre>' + esc(JSON.stringify(guide, null, 2)).substring(0, 5000) + '</pre>';
      }
    },
    runRefine: function (item) {
      if (!item || !item.id) return;
      this.currentItem = item; this.show(); this.showLoading('Starting refinement...');
      var self = this;
      var sc = window.SamjhoAuth && typeof window.SamjhoAuth.getClient === 'function' ? window.SamjhoAuth.getClient() : null;
      self.setStep('ci-step-categorize', 'active');
      if (self.status) self.status.textContent = 'Categorizing content...';
      var catResult;
      try {
        var C = window.SamjhoCategorizer;
        if (!C || typeof C.categorizeRaw !== 'function') throw new Error('Categorizer not loaded');
        catResult = C.categorizeRaw(item);
      } catch (e) { self.setStep('ci-step-categorize', 'error'); self.showError('Categorization failed: ' + e.message); return; }
      if (!catResult || !catResult.ok) { self.setStep('ci-step-categorize', 'error'); self.showError((catResult && catResult.message) || 'Categorization failed.'); return; }
      self.setStep('ci-step-categorize', 'done');
      self.setStep('ci-step-refine', 'active');
      if (self.status) self.status.textContent = 'Refining with DeepSeek AI (10-30 seconds)...';
      var EP = window.SamjhoSupabaseEndpoint;
      if (!EP || typeof EP.refineViaSupabase !== 'function') { self.setStep('ci-step-refine', 'error'); self.showError('DeepSeek endpoint not available.'); return; }
      EP.refineViaSupabase(item, catResult.categorization).then(function (result) {
        if (!result || !result.ok) { self.setStep('ci-step-refine', 'error'); self.showError(((result && result.code) || 'FAILED') + ': ' + ((result && result.message) || 'Refinement failed.')); return; }
        self.setStep('ci-step-refine', 'done');
        var guide = result.guide;
        self.setStep('ci-step-preview', 'active');
        if (self.status) self.status.textContent = 'Saving refined guide...';
        if (!sc || typeof sc.from !== 'function') { self.setStep('ci-step-preview', 'done'); self.showPreview(guide); return; }
        sc.from('content_items').update({ refined_guide: guide, refinement_status: 'completed', status: 'review', updated_at: new Date().toISOString() }).eq('id', item.id).then(function () {
          self.setStep('ci-step-preview', 'done'); self.showPreview(guide);
          for (var i = 0; i < allItems.length; i++) { if (allItems[i].id === item.id) { allItems[i].refinement_status = 'completed'; allItems[i].status = 'review'; allItems[i].refined_guide = guide; break; } }
          renderTable();
        }).catch(function () { self.setStep('ci-step-preview', 'done'); self.showPreview(guide); });
      }).catch(function (err) { self.setStep('ci-step-refine', 'error'); self.showError('DeepSeek call failed: ' + (err && err.message ? err.message : String(err))); });
    },
    publish: function () {
      var guide = this.refinedGuide, item = this.currentItem;
      if (!guide || !item) return;
      var sc = window.SamjhoAuth && typeof window.SamjhoAuth.getClient === 'function' ? window.SamjhoAuth.getClient() : null;
      if (!sc || typeof sc.from !== 'function') { alert('Cannot publish: Supabase client not available.'); return; }
      if (!guide.slug) { alert('Cannot publish: Guide has no slug.'); return; }
      if (!confirm('Publish "' + (guide.title || item.title) + '" to live site?')) return;
      var btn = document.getElementById('ci-modal-publish');
      if (btn) { btn.disabled = true; btn.textContent = 'Publishing...'; }
      sc.from('content_items').update({ status: 'pending_publish', verification_status: 'verified', approval_status: 'approved', updated_at: new Date().toISOString() }).eq('id', item.id).then(function () {
        alert('Staged for publishing!\n\nRun on server: node build/scripts/deploy-published.js');
        for (var i = 0; i < allItems.length; i++) { if (allItems[i].id === item.id) { allItems[i].status = 'pending_publish'; break; } }
        renderTable(); modal.close();
      }).catch(function (err) { alert('Publish failed: ' + (err.message || err)); if (btn) { btn.disabled = false; btn.textContent = 'Publish to Live'; } });
    },
    openReview: function () { if (this.currentItem) window.location.href = '/admin/content/review.html#' + this.currentItem.id; }
  };

  // Public handlers
  window._ciOpen = function (id) { window.location.href = '/admin/content/review.html#' + id; };
  window._ciRefine = function (id) {
    var it = allItems.find(function (i) { return i.id === id; });
    if (!it) return;
    var btn = document.querySelector('tr[data-id="' + id + '"] .ci-btn-refine');
    if (btn) { btn.disabled = true; btn.textContent = 'Refining...'; }
    modal.runRefine(it);
  };
  window._ciGo = function (p) { currentPage = p; renderTable(); };
  window._ciPrev = function () { if (currentPage > 1) { currentPage--; renderTable(); } };
  window._ciNext = function () { var tp = Math.ceil(getFiltered().length / PAGE_SIZE); if (currentPage < tp) { currentPage++; renderTable(); } };
  ['ci-search', 'ci-filter-status', 'ci-filter-category', 'ci-sort'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) { el.addEventListener('input', function () { currentPage = 1; renderTable(); }); el.addEventListener('change', function () { currentPage = 1; renderTable(); }); }
  });
  async function loadItems(){
    try{
      var sc=window.SamjhoAuth&&typeof window.SamjhoAuth.getClient==='function'?window.SamjhoAuth.getClient():null;
      if(!sc){console.error('Content Inbox: Supabase client not available — SamjhoAuth.getClient() returned null. Check auth.js loaded before inbox.js.');allItems=[];renderTable();return;}
      var resp=await sc.from('content_items').select('*').order('created_at',{ascending:false});
      allItems=(resp.data||[]).filter(function(i){return i.status!=='published';});
      renderTable();
    }
    catch(e){console.error('Failed to load inbox items:',e);allItems=[];renderTable();}
  }
  // Initialize modal + load data
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { modal.init(); doLoad(); });
  } else {
    modal.init(); doLoad();
  }
  function doLoad() {
    if (window.SamjhoAuth && typeof window.SamjhoAuth.getClient === 'function' && window.SamjhoAuth.getClient()) { loadItems(); }
    else { setTimeout(loadItems, 500); }
  }
})();
