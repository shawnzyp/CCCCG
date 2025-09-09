/* =========================================================================
   SHARED MINIMAL RUNTIME
   - Optional Firebase RTDB for shared deck + notices
   - LocalStorage fallback for solo/offline testing
   ========================================================================= */
(function(){
  const $ = s=>document.querySelector(s);
  const $$ = s=>Array.from(document.querySelectorAll(s));

  // Public hook for your app:
  window.SOMF_MIN = {
    setFirebase: (db)=> { window._somf_db = db || null; },
    setCampaignId: (id)=> { window._somf_cid = id || 'ccampaign-001'; }
  };

  const PLATES = [
    {id:'TRIBUNAL',name:'The Tribunal',visual:'Alien law glyphs invert.',effect:['Shift alignment axis','Faction reaction','1-time perk (3 sessions)']},
    {id:'METEOR',name:'The Meteor',visual:'Burning shard becomes nemesis sigil.',effect:['Solo next major foe to ascend','Fail: -1 rep with a watcher']},
    {id:'NULL_VAULT',name:'The Null Vault',visual:'Floor tears as static; door with no door.',effect:['You vanish to Echo Pit','Team must rescue']},
    {id:'SHEPHERDS_MASK',name:'The Shepherd’s Mask',visual:'Porcelain mask melts to black lines.',effect:['Curse: −2 all saves; nat20 rolls twice (lower)']},
    {id:'REDACTION',name:'The Redaction',visual:'A memory frame is black-barred.',effect:['Erase 1 event/outcome; rewrite 1 consequence','Another thread gets harder']},
    {id:'BROADCAST',name:'The Broadcast',visual:'Billboards: TRAITOR / MONSTER.',effect:['Gain a powerful pursuing enemy']},
    {id:'FRAGMENT',name:'The Fragment',visual:'Cracked shard; clumsy caricatures.',effect:['Lose 1d4 SP this arc','Must draw one extra shard']},
    {id:'CACHE',name:'The Catalyst Cache',visual:'Humming case phases in.',effect:['+1d6 Fragments + 1 Rare item','Watermarked tracker']},
    {id:'STATIC',name:'The Static',visual:'Vision pixelates.',effect:['Permanent −1d4 INT','Lose a language/specialty until retrained']},
    {id:'TRICKSTER',name:'The Trickster Signal',visual:'Confetti of alerts.',effect:['10,000 cr OR draw two more','If drawn twice: sleeper agent reveal']},
    {id:'HELIX_CODE',name:'The Helix Code',visual:'Living key slots into gear.',effect:['Legendary item','Backdoor ping on first use']},
    {id:'ECHO_OPERATIVE',name:'The Echo Operative',visual:'A soldier steps out of your shadow.',effect:['Loyal Tier 3 ally (mirrors a tactic)']},
    {id:'DREAM',name:'The Dream',visual:'Shardlight crescent drips motes.',effect:['1d3 RP wishes (each use adds Heat)']},
    {id:'DEFECTOR',name:'The Defector',visual:'Team shown; one face shatters.',effect:['An ally/contact betrays at a key moment']},
    {id:'COLLAPSE',name:'The Collapse',visual:'Homes & accounts implode.',effect:['Lose civilian assets','Gain one-scene Renegade surge (+1d6)']},
    {id:'WRAITH',name:'The Wraith',visual:'Skeletal silhouette, frosted breath.',effect:['Relentless hunter pursues until slain']},
    {id:'ASCENDANT',name:'The Ascendant',visual:'Seven-point star in sternum.',effect:['+2 to one ability','+1d4 once in each of next two encounters']},
    {id:'HALO',name:'The Halo',visual:'Rotating shard halo.',effect:['Elite/Legendary artifact','+1d4 SP this arc']},
    {id:'SILENCE_BLOOM',name:'The Silence Bloom',visual:'Gear dissolves into black petals.',effect:['All carried gear erased except bonded & fragments']},
    {id:'VIGIL',name:'The Vigil',visual:'District sigil in your palm.',effect:['Claim a district/post; set one policy there']},
    {id:'ORACLE',name:'The Oracle',visual:'A sphere reveals one truth.',effect:['Ask one specific campaign question']},
    {id:'SHEPHERDS_THREAD',name:'The Shepherd’s Thread',visual:'Black filament tethers you.',effect:['Soul tether to Morvox; periodic WIS save or lose action']},
  ];
  const plateById = Object.fromEntries(PLATES.map(p=>[p.id,p]));

  /* ---------- Helpers ---------- */
  const db = ()=> window._somf_db || null;
  const CID = ()=> window._somf_cid || 'ccampaign-001';
  const path = {
    deck: cid=>`somf/${cid}/deck`,
    audits: cid=>`somf/${cid}/audits`,
    notices: cid=>`somf/${cid}/notices`,
    resolutions: cid=>`somf/${cid}/resolutions`,
    npcs: cid=>`somf/${cid}/active_npcs`,
    hidden: cid=>`somf/${cid}/hidden`,
  };
  const LSK = {
    deck: cid=>`somf_deck__${cid}`,
    audits: cid=>`somf_audit__${cid}`,
    notices: cid=>`somf_notices__${cid}`,
    resolutions: cid=>`somf_resolutions__${cid}`,
    npcs: cid=>`somf_active_npcs__${cid}`,
    lastNotice: cid=>`somf_last_notice__${cid}`,
    hidden: cid=>`somf_hidden__${cid}`,
  };
  const getLocal = k => { const r=localStorage.getItem(k); return r? JSON.parse(r): null; };
  const setLocal = (k,v)=> localStorage.setItem(k, JSON.stringify(v));

  function cryptoInt(max){
    if (crypto?.getRandomValues){
      const a=new Uint32Array(1); crypto.getRandomValues(a);
      return Math.floor((a[0]/2**32)*max);
    }
    return Math.floor(Math.random()*max);
  }
  function ensureLocalDeck(){
    const cid = CID(); let d = getLocal(LSK.deck(cid));
    if (!Array.isArray(d) || !d.length){ d = PLATES.map(p=>p.id); setLocal(LSK.deck(cid), d); }
    return d;
  }
  function localDrawOne(){
    const cid = CID(); const d = ensureLocalDeck();
    const idx = cryptoInt(d.length);
    const [id] = d.splice(idx,1);
    setLocal(LSK.deck(cid), d);
    const a = getLocal(LSK.audits(cid))||[];
    a.unshift({id, name: plateById[id]?.name || id, ts:Date.now()});
    setLocal(LSK.audits(cid), a);
    return id;
  }

  async function rtdbInitDeckIfMissing(){
    const deckRef = db().ref(path.deck(CID()));
    const snap = await deckRef.get();
    if (!snap.exists()) await deckRef.set(PLATES.map(p=>p.id));
  }
  async function rtdbDrawOne(){
    const deckRef = db().ref(path.deck(CID()));
    let out = null;
    await deckRef.transaction(cur=>{
      let arr = Array.isArray(cur)? cur.slice(): [];
      if (!arr.length) arr = PLATES.map(p=>p.id);
      const idx = cryptoInt(arr.length);
      out = arr[idx]; arr.splice(idx,1);
      return arr;
    });
    await db().ref(path.audits(CID())).push({ id: out, name: plateById[out]?.name || out, ts: db().ServerValue.TIMESTAMP });
    return out;
  }

  /* ======================================================================
     PLAYER FLOW (draw, double confirm, reveal one-by-one, resolved gate)
     ====================================================================== */
  const PUI = {
    count: $('#somf-min-count'),
    drawBtn: $('#somf-min-draw'),
    modal: $('#somf-min-modal'),
    close: $('#somf-min-close'),
    name: $('#somf-min-name'),
    visual: $('#somf-min-visual'),
    effect: $('#somf-min-effect'),
    idx: $('#somf-min-idx'),
    total: $('#somf-min-total'),
    resolved: $('#somf-min-resolved'),
    next: $('#somf-min-next'),
  };
  let queue = []; let qi = 0;

  function openPlayerModal(){ PUI.modal.hidden=false; }
  function closePlayerModal(){ PUI.modal.hidden=true; }

  async function playShardAnimation(){
    const flash=document.getElementById('draw-flash');
    const lightning=document.getElementById('draw-lightning');
    if(!flash) return;
    flash.hidden=false;
    if(lightning){
      lightning.hidden=false;
      lightning.innerHTML='';
      for(let i=0;i<3;i++){
        const b=document.createElement('div');
        b.className='bolt';
        b.style.left=`${10+Math.random()*80}%`;
        b.style.top=`${Math.random()*60}%`;
        b.style.transform=`rotate(${Math.random()*30-15}deg)`;
        b.style.animationDelay=`${i*0.1}s`;
        lightning.appendChild(b);
      }
    }
    await new Promise(res=>{
      flash.classList.add('show');
      const done=()=>{
        flash.classList.remove('show');
        flash.hidden=true;
        if(lightning){ lightning.hidden=true; lightning.innerHTML=''; }
        flash.removeEventListener('animationend', done);
        res();
      };
      flash.addEventListener('animationend', done);
    });
  }

  function renderCurrent(){
    const p = queue[qi];
    PUI.name.textContent = p.name;
    PUI.visual.textContent = p.visual;
    PUI.effect.innerHTML = p.effect.map(e=>`<li>${e}</li>`).join('');
    PUI.idx.textContent = String(qi+1);
    PUI.total.textContent = String(queue.length);
    PUI.resolved.checked = false;
    PUI.next.disabled = true;
  }

  PUI.resolved?.addEventListener('change', ()=> PUI.next.disabled = !PUI.resolved.checked);
  PUI.next?.addEventListener('click', async ()=>{
    if (!PUI.resolved.checked) return;
    if (qi < queue.length-1){ qi++; await playShardAnimation(); renderCurrent(); } else { closePlayerModal(); }
  });
  PUI.close?.addEventListener('click', closePlayerModal);

  async function doDraw(){
    const n = Math.max(1, Math.min(22, +PUI.count.value||1));
    if (!confirm('The Fates are fickle, are you sure you wish to draw from the Shards?')) return;
    if (!confirm('This cannot be undone, do you really wish to tempt Fate?')) return;

    const ids = [];
    if (db()){
      await rtdbInitDeckIfMissing();
      for (let i=0;i<n;i++) ids.push(await rtdbDrawOne());
      const names = ids.map(id=> plateById[id]?.name || id);
      // batch notice (for DM): count + ids + names
      await db().ref(path.notices(CID())).push({ ts: db().ServerValue.TIMESTAMP, count:n, ids, names });
    } else {
      for (let i=0;i<n;i++) ids.push(localDrawOne());
      const notices = getLocal(LSK.notices(CID()))||[];
      const names = ids.map(id=> plateById[id]?.name || id);
      notices.unshift({ ts: Date.now(), count:n, ids, names });
      setLocal(LSK.notices(CID()), notices);
      window.dispatchEvent(new CustomEvent('somf-local-notice', { detail: notices[0] }));
    }

    queue = ids.map(id=> plateById[id]);
    qi = 0;
    await playShardAnimation();
    openPlayerModal(); renderCurrent();
  }
  PUI.drawBtn?.addEventListener('click', ()=> doDraw());

  const playerCard = $('#somf-min');
  let _lastHidden = true;
  async function applyHiddenState(h){
    if(!playerCard) return;
    if(_lastHidden && !h){
      await playShardAnimation();
      toast('The Shards of Many Fates have reveled themselves to you.',6000);
      playerCard.hidden = false;
    }else{
      playerCard.hidden = h;
    }
    if(h) closePlayerModal();
    _lastHidden = h;
  }
  async function initPlayerHidden(){
    if(db()){
      const ref = db().ref(path.hidden(CID()));
      const snap = await ref.get();
      await applyHiddenState(snap.exists()? !!snap.val(): false);
      ref.on('value', s=> applyHiddenState(!!s.val()));
    }else{
      await applyHiddenState(!!getLocal(LSK.hidden(CID())));
      window.addEventListener('somf-local-hidden', e=> applyHiddenState(!!e.detail));
      window.addEventListener('storage', e=>{ if(e.key===LSK.hidden(CID())) applyHiddenState(!!JSON.parse(e.newValue)); });
    }
  }

  /* ======================================================================
     DM TOOL (notifications, resolve, npcs)
     ====================================================================== */
  const D = {
    root: $('#modal-somf-dm'),
    close: $('#somfDM-close'),
    tabs: $$('.somf-dm-tabbtn'),
    cardTab: $('#somfDM-tab-cards'),
    resTab: $('#somfDM-tab-resolve'),
    npcsTab: $('#somfDM-tab-npcs'),
    reset: $('#somfDM-reset'),
    campaign: $('#somfDM-campaign'),
    total: $('#somfDM-total'),
    remaining: $('#somfDM-remaining'),
    cardCount: $('#somfDM-cardCount'),
    incoming: $('#somfDM-incoming'),
    resolvedList: $('#somfDM-resolved'),
    noticeView: $('#somfDM-noticeView'),
    markResolved: $('#somfDM-markResolved'),
    spawnNPC: $('#somfDM-spawnNPC'),
    npcList: $('#somfDM-npcList'),
    npcModal: $('#somfDM-npcModal'),
    npcModalCard: $('#somfDM-npcModalCard'),
    toasts: $('#somfDM-toasts'),
    ping: $('#somfDM-ping'),
    playerCardToggle: $('#somfDM-playerCard'),
    playerCardState: $('#somfDM-playerCard-state'),
  };
  function preventTouch(e){ e.preventDefault(); }
  function openDM(){
    if(!D.root) return;
    D.root.style.display='flex';
    D.root.classList.remove('hidden');
    D.root.setAttribute('aria-hidden','false');
    document.body.classList.add('modal-open');
    document.addEventListener('touchmove', preventTouch, { passive: false });
    initDMOnce();
  }
  function closeDM(){
    if(!D.root) return;
    D.root.classList.add('hidden');
    D.root.setAttribute('aria-hidden','true');
    D.root.style.display='none';
    document.body.classList.remove('modal-open');
    document.removeEventListener('touchmove', preventTouch);
  }
  D.root?.addEventListener('click', e=>{ if(e.target===D.root) closeDM(); });
  D.root?.addEventListener('touchstart', e=>{ if(e.target===D.root) closeDM(); });
  D.close?.addEventListener('click', closeDM);
  window.openSomfDM = openDM;

  // Tabs
  D.tabs.forEach(b=>{
    b.addEventListener('click', ()=>{
      D.tabs.forEach(x=>{ x.classList.remove('somf-dm-active'); x.style.background='#0d141c'; });
      b.classList.add('somf-dm-active'); b.style.background='#0b2a3a';
      const t = b.dataset.tab;
      [D.cardTab,D.resTab,D.npcsTab].forEach(el=> el.hidden=true);
      if (t==='cards') D.cardTab.hidden=false;
      if (t==='resolve') D.resTab.hidden=false;
      if (t==='npcs') D.npcsTab.hidden=false;
    });
  });

  // Toasts
  function toast(msg, ttl=6000){
    const t=document.createElement('div');
    t.style.cssText='background:#0b1119;color:#e6f1ff;border:1px solid #1b2532;border-radius:8px;padding:10px 12px;min-width:260px;box-shadow:0 8px 24px #0008';
    t.innerHTML = msg;
    D.toasts.appendChild(t);
    try{ D.ping.currentTime=0; D.ping.play(); }catch{}
    setTimeout(()=> t.remove(), ttl);
    if ('Notification' in window && Notification.permission==='granted'){
      new Notification('Shards Drawn', { body: msg.replace(/<[^>]+>/g,'') });
    }
  }

  D.playerCardToggle?.addEventListener('change', async ()=>{
    const hidden = !D.playerCardToggle.checked;
    if(D.playerCardState) D.playerCardState.textContent = D.playerCardToggle.checked ? 'On' : 'Off';
    if(db()){
      await db().ref(path.hidden(CID())).set(hidden);
    }else{
      setLocal(LSK.hidden(CID()), hidden);
      window.dispatchEvent(new CustomEvent('somf-local-hidden',{detail:hidden}));
    }
  });

  async function refreshHiddenToggle(){
    let hidden=false;
    if(db()){
      const snap = await db().ref(path.hidden(CID())).get();
      hidden = snap.exists()? !!snap.val() : false;
    } else {
      hidden = !!getLocal(LSK.hidden(CID()));
    }
    if(D.playerCardToggle) {
      D.playerCardToggle.checked = !hidden;
      if(D.playerCardState) D.playerCardState.textContent = D.playerCardToggle.checked ? 'On' : 'Off';
    }
  }
  // request notification permission up front
  if('Notification' in window && Notification.permission!=='granted'){
    Notification.requestPermission().catch(()=>{});
  }

  // Dice (for NPC buttons)
  function roll(expr){
    const m = String(expr).replace(/\s+/g,'').match(/^(\d*)d(\d+)([+-]\d+)?$/i);
    if (!m) return {total:NaN, rolls:[], mod:0};
    const n=Math.max(1,parseInt(m[1]||'1',10)), faces=parseInt(m[2],10), mod=parseInt(m[3]||'0',10);
    const rolls=Array.from({length:n},()=>1+Math.floor(Math.random()*faces));
    return { total: rolls.reduce((a,b)=>a+b,0)+mod, rolls, mod };
  }
  function rollBtn(label, expr){
    const b=document.createElement('button');
    b.textContent=`${label} (${expr})`;
    b.style.cssText='padding:6px 10px;border:1px solid #253247;background:#121821;color:#e6f1ff;border-radius:6px;cursor:pointer';
    b.addEventListener('click', ()=>{
      const r=roll(expr);
      toast(`<strong>${label}</strong> ${r.total} <span style="opacity:.85;font-family:monospace">[${r.rolls.join(', ')}${r.mod? (r.mod>0?` + ${r.mod}`:` - ${Math.abs(r.mod)}`):''}]</span>`);
    });
    return b;
  }

  // Simple NPC set (compact but complete enough)
  const NPCS = [
    {id:'H1',name:'Herald of Morvox',type:'Enemy • Elite Controller (T3)',ability:{STR:10,DEX:14,CON:14,INT:12,WIS:16,CHA:12},hp:58,tc:16,sp:7,
     weapons:[{n:'Echo Lash', atk:'+6', dmg:'2d8'}], saves:'WIS+3 DEX+2 CON+2',
     skills:'Perception+5 Insight+5 Stealth+4', traits:['Silence Bloom 10 ft','Fragment Glide'],
     powers:['Broadcast Scramble (2 SP)','Shepherd’s Mark (3 SP)'],
     actions:[{label:'Echo Lash Attack', expr:'1d20+6'},{label:'Echo Lash Damage', expr:'2d8'}]},
    {id:'G1',name:'Greyline Assault Cell',type:'Enemy • Fireteam (T3)',ability:{STR:14,DEX:16,CON:14,INT:12,WIS:12,CHA:10},hp:64,tc:15,sp:6,
     weapons:[{n:'SMG Burst', atk:'+5', dmg:'2d6+2'}], saves:'DEX+3 CON+2',
     skills:'Athletics+4 Stealth+5 Perception+3', traits:['Coordinated Fire','Kill-Switch Smoke (1/enc)'],
     powers:['Suppression Volley (1 SP)','Netline Taser (2 SP)'],
     actions:[{label:'Burst Attack', expr:'1d20+5'},{label:'Burst Damage', expr:'2d6+2'}]},
    {id:'C1',name:'Conclave Trial Agent',type:'Enemy • Duelist (T4)',ability:{STR:12,DEX:18,CON:14,INT:14,WIS:16,CHA:14},hp:72,tc:17,sp:8,
     weapons:[{n:'Prism Edge', atk:'+7', dmg:'2d10'}], saves:'DEX+4 WIS+3 CHA+2',
     skills:'Acrobatics+6 Insight+5', traits:['Astral Parry 5','Immune charm/fear'],
     powers:['Accession Step (2 SP)','Starlight Decree (3 SP)'],
     actions:[{label:'Prism Attack', expr:'1d20+7'},{label:'Prism Damage', expr:'2d10'}]},
    {id:'E1',name:'Echo Operative',type:'Ally • T3',ability:{STR:12,DEX:16,CON:14,INT:12,WIS:12,CHA:12},hp:50,tc:15,sp:6,
     weapons:[{n:'Rifle', atk:'+5', dmg:'1d10+2'}], saves:'DEX+3 CON+2',
     skills:'Stealth+5 Perception+3', traits:['Mirrors one tactic of summoner'],
     powers:['Covering Fire (1 SP)','Drive Forward (2 SP)'],
     actions:[{label:'Rifle Attack', expr:'1d20+5'},{label:'Rifle Damage', expr:'1d10+2'}]},
    {id:'B1',name:'Betrayer (Template)',type:'Template',template:true,traits:['Hidden Blade +2d6 once/scene','False Flag (1 SP): nearby ally WIS DC14 or loses reaction'], actions:[]},
  ];
  const spawnFor = (id)=> {
    if (id==='BROADCAST'||id==='HELIX_CODE') return 'G1';
    if (id==='NULL_VAULT'||id==='SHEPHERDS_MASK'||id==='SHEPHERDS_THREAD') return 'H1';
    if (id==='WRAITH') return 'C1';
    if (id==='ECHO_OPERATIVE') return 'E1';
    if (id==='DEFECTOR') return 'B1';
    return null;
  };

  function npcCard(n, attachRolls=true){
    const card=document.createElement('div');
    card.style.cssText='border:1px solid #1b2532;border-radius:8px;background:#0c1017;padding:8px';
    card.innerHTML = `
      <div><strong>${n.name}</strong> <span style="opacity:.8">• ${n.type||''}</span></div>
      ${n.template? '<div style="margin-top:4px" class="mono">Template</div>' : `
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:6px">
        <div><span style="opacity:.8;font-size:12px">HP</span><div>${n.hp}</div></div>
        <div><span style="opacity:.8;font-size:12px">TC</span><div>${n.tc}</div></div>
        <div><span style="opacity:.8;font-size:12px">SP</span><div>${n.sp}</div></div>
      </div>`}
      ${n.weapons? `<div style="margin-top:6px"><span style="opacity:.8;font-size:12px">Weapons</span><div>${n.weapons.map(w=>`${w.n} (atk ${w.atk}, dmg ${w.dmg})`).join('; ')}</div></div>`:``}
      ${n.traits? `<div style="margin-top:6px"><span style="opacity:.8;font-size:12px">Traits</span><ul style="margin:4px 0 0 18px;padding:0">${n.traits.map(t=>`<li>${t}</li>`).join('')}</ul></div>`:``}
      ${attachRolls && n.actions?.length ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px"></div>`:``}
    `;
    const host = card.lastElementChild;
    if (host && n.actions){
      n.actions.forEach(a=> host.appendChild(rollBtn(a.label, a.expr)));
    }
    return card;
  }

  // Render: Card List
  function renderCardList(){
    D.cardTab.innerHTML='';
    PLATES.forEach(p=>{
      const d=document.createElement('div');
      d.style.cssText='border:1px solid #1b2532;border-radius:8px;background:#0c1017;padding:8px';
      d.innerHTML = `<div><strong>${p.name}</strong></div>
        <div style="opacity:.8;font-size:12px">ID: ${p.id}</div>
        <div style="margin-top:4px;opacity:.8;font-size:12px">${p.visual}</div>
        <ul style="margin:6px 0 0 18px;padding:0">${p.effect.map(e=>`<li>${e}</li>`).join('')}</ul>`;
      D.cardTab.appendChild(d);
    });
  }

  function openNPCModal(n){
    if(!D.npcModal || !D.npcModalCard) return;
    D.npcModalCard.innerHTML='';
    const card=npcCard(n);
    const close=document.createElement('button');
    close.textContent='Close';
    close.className='somf-btn somf-ghost';
    close.style.marginTop='8px';
    close.addEventListener('click', closeNPCModal);
    D.npcModalCard.appendChild(card);
    D.npcModalCard.appendChild(close);
    D.npcModal.classList.remove('hidden');
    D.npcModal.setAttribute('aria-hidden','false');
  }
  function closeNPCModal(){
    if(!D.npcModal) return;
    D.npcModal.classList.add('hidden');
    D.npcModal.setAttribute('aria-hidden','true');
  }
  D.npcModal?.addEventListener('click', e=>{ if(e.target===D.npcModal) closeNPCModal(); });

  function renderNPCList(){
    if(!D.npcList) return;
    D.npcList.innerHTML='';
    NPCS.forEach(n=>{
      const li=document.createElement('li');
      li.style.cssText='border-top:1px solid #1b2532;padding:8px 10px;cursor:pointer';
      if(D.npcList.children.length===0) li.style.borderTop='none';
      li.innerHTML=`<strong>${n.name}</strong><div style="opacity:.8">${n.type||''}</div>`;
      li.addEventListener('click', ()=> openNPCModal(n));
      D.npcList.appendChild(li);
    });
  }

  // Counts + incoming
  async function refreshCounts(){
    D.campaign.textContent = CID();
    let deckLen=22, total=0;
    if (db()){
      const deckSnap = await db().ref(path.deck(CID())).get();
      const deck = deckSnap.exists()? deckSnap.val(): [];
      deckLen = Array.isArray(deck)? deck.length : 22;
      const auditsSnap = await db().ref(path.audits(CID())).get();
      total = auditsSnap.exists()? Object.keys(auditsSnap.val()).length : 0;
    } else {
      const deck = getLocal(LSK.deck(CID()))||[];
      deckLen = Array.isArray(deck)? deck.length : 22;
      const audits = getLocal(LSK.audits(CID()))||[];
      total = audits.length;
    }
    D.total.textContent = String(total);
    D.remaining.textContent = String(deckLen);
    if(D.cardCount) D.cardCount.textContent = `${deckLen}/${PLATES.length}`;
  }

  function renderIncoming(notices){
    D.incoming.innerHTML='';
    notices.forEach((n,ix)=>{
      const li=document.createElement('li');
      li.style.cssText='border-top:1px solid #1b2532;padding:8px 10px;cursor:pointer';
      if (ix===0) li.style.borderTop='none';
      const names = n.names || n.ids.map(id=> plateById[id]?.name || id);
      li.innerHTML = `<strong>${names.length} shard(s)</strong><div style="opacity:.8">${names.join(', ')}</div>`;
      li.addEventListener('click', ()=>{
        $$('#somfDM-incoming li').forEach(x=> x.style.background='');
        li.style.background='#0b2a3a';
        D.noticeView.innerHTML = `<div><strong>Batch</strong> • ${new Date(n.ts||Date.now()).toLocaleString()}</div>
          <ul style="margin:6px 0 0 18px;padding:0">${names.map(x=>`<li>${x}</li>`).join('')}</ul>`;
        // enable spawn if exactly one shard and it maps to a NPC
        const spawnCode = (n.ids.length===1)? (spawnFor(n.ids[0])||null) : null;
        D.spawnNPC.disabled = !spawnCode;
        D.spawnNPC.onclick = ()=>{
          if (!spawnCode) return;
          const tpl = NPCS.find(x=>x.id===spawnCode);
          openNPCModal(tpl);
          toast(`<strong>NPC</strong> ${tpl.name}`);
        };
        D.markResolved.disabled = false;
        D.markResolved.onclick = async ()=>{
          await pushResolutionBatch(n);
          toast(`<strong>Resolved</strong> ${names.length} shard(s)`);
          loadAndRender(); // refresh list
        };
      });
      D.incoming.appendChild(li);
    });
  }

  async function loadNotices(limit=30){
    if (db()){
      const snap = await db().ref(path.notices(CID())).limitToLast(limit).get();
      if (!snap.exists()) return [];
      const arr = Object.values(snap.val()).sort((a,b)=> (b.ts||0)-(a.ts||0));
      return arr;
    } else {
      const arr = getLocal(LSK.notices(CID()))||[];
      return arr.slice(0,limit);
    }
  }

  async function loadResolutions(limit=50){
    if(db()){
      const snap = await db().ref(path.resolutions(CID())).limitToLast(limit).get();
      if(!snap.exists()) return [];
      const arr = Object.values(snap.val()).sort((a,b)=> (b.ts||0)-(a.ts||0));
      return arr;
    } else {
      const arr = getLocal(LSK.resolutions(CID()))||[];
      return arr.slice(0,limit);
    }
  }

  function renderResolved(list){
    D.resolvedList.innerHTML='';
    const resolvedSet = new Set();
    list.forEach(r=> (r.ids||[]).forEach(id=> resolvedSet.add(id)) );
    PLATES.forEach(p=>{
      const li=document.createElement('li');
      li.innerHTML = `<strong>${p.name}</strong><div style="opacity:.8">${resolvedSet.has(p.id)?'Resolved':'Unresolved'}</div>`;
      D.resolvedList.appendChild(li);
    });
  }

  async function pushResolutionBatch(n){
    if (db()){
      await db().ref(path.resolutions(CID())).push({ ts: db().ServerValue.TIMESTAMP, ids:n.ids });
    } else {
      const rs = getLocal(LSK.resolutions(CID()))||[];
      rs.unshift({ ts: Date.now(), ids: n.ids }); setLocal(LSK.resolutions(CID()), rs);
    }
  }

  async function loadAndRender(){
    await refreshCounts();
    renderCardList();
    renderNPCList();
    const notices = await loadNotices();
    renderIncoming(notices);
    const resolved = await loadResolutions();
    renderResolved(resolved);
    await refreshHiddenToggle();
  }

  // Live listeners
  function enableLive(){
    if (db()){
      const ref = db().ref(path.notices(CID())).limitToLast(1);
      ref.on('child_added', snap=>{
        const v=snap.val(); if (!v) return;
        const names = v.names || (v.ids||[]).map(id=> plateById[id]?.name || id);
        toast(`<strong>New Draw</strong> ${v.count} shard(s): ${names.join(', ')}`);
        loadAndRender();
      });
      const hRef = db().ref(path.hidden(CID()));
      hRef.on('value', s=>{ if(D.playerCardToggle) D.playerCardToggle.checked = !s.val(); });
    } else {
      window.addEventListener('somf-local-notice', (e)=>{
        const v=e.detail; const names = v.names || (v.ids||[]).map(id=> plateById[id]?.name || id);
        toast(`<strong>New Draw</strong> ${v.count} shard(s): ${names.join(', ')}`);
        loadAndRender();
      });
      window.addEventListener('somf-local-hidden', e=>{ if(D.playerCardToggle) D.playerCardToggle.checked = !e.detail; });
    }
  }

  D.reset?.addEventListener('click', loadAndRender);

  let _inited=false;
  function initDMOnce(){
    if (_inited) return; _inited=true;
    loadAndRender();
    enableLive();
  }

  initPlayerHidden();

})();

