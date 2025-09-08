/* =============================================================================
   DM TOOL RUNTIME
   Depends on: (optional) SOMF.setFirebase(firebase.database()); SOMF.setCampaignId("id")
   If not set, uses localStorage fallback.
============================================================================= */
(function(){
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  /* Campaign + RTDB hooks from the player module, if present */
  const getCampaignId = ()=> (window.SOMF?._getCampaignId?.() || window.SOMF_CAMPAIGN_ID || 'ccampaign-001');
  const getRTDB      = ()=> (window.SOMF?._getFirebase?.()   || null);

  /* PLATES (ID-> name, heat, seeds) */
  const PLATES = [
    {id:'TRIBUNAL', name:'The Tribunal', heat:1, seeds:[
      {title:'Conclave Trial Skill Challenge', text:'Argue precedent; 5 successes before 2 failures.', dc:'Mixed DC 14 (Deception, Insight, Oratory, Law)'},
      {title:'Audit Interview', text:'O.M.N.I. tries to trap contradictions.', dc:'WIS/CHA DC 14 to maintain message'}
    ]},
    {id:'METEOR', name:'The Meteor', heat:1, seeds:[
      {title:'Solo Duel Format', text:'First to 3 meaningful wins (bloodied/retreat/concession).', dc:'Attack/Defense as normal; Social stakes CHA DC 14'}
    ]},
    {id:'NULL_VAULT', name:'The Null Vault', heat:2, seeds:[
      {title:'Phase Entry', text:'Synchronize shards to locate Echo Pit.', dc:'Tech/Perception/Stealth DC 14 (3 successes)'},
      {title:'Gravity Loop', text:'Every third round positions repeat unless anchored (1 SP).', dc:'WIS DC 14 to anticipate loop'}
    ]},
    {id:'SHEPHERDS_MASK', name:'The Shepherd’s Mask', heat:1, seeds:[
      {title:'Mirrored Gallery Duel', text:'Faces distort; ally targeting is risky.', dc:'WIS DC 14 each round to avoid mis-ID'}
    ]},
    {id:'REDACTION', name:'The Redaction', heat:1, seeds:[
      {title:'Oracle Node Stabilization', text:'Fix the rewritten timeline rings.', dc:'INT DC 14 per ring or pay 1 Fragment per fail'}
    ]},
    {id:'BROADCAST', name:'The Broadcast', heat:2, seeds:[
      {title:'Evidence Stream', text:'Collect 3 tags and force a live airing.', dc:'Tech DC 14 (metadata), Persuasion DC 14 (journalist)'}
    ]},
    {id:'FRAGMENT', name:'The Fragment', heat:0, seeds:[
      {title:'Public Redemption', text:'Stage a rescue to flip the meme.', dc:'DEX/STR/CHA DC 14 beats escalating hazards'}
    ]},
    {id:'CACHE', name:'The Catalyst Cache', heat:1, seeds:[
      {title:'Rooftop Chase', text:'Keep the case while Greyline pursues.', dc:'DEX/STR DC 14; failure drops 1d3 fragments en route'}
    ]},
    {id:'STATIC', name:'The Static', heat:0, seeds:[
      {title:'Mnemonic Relearn', text:'VR retraining in a Conclave pod.', dc:'3 checks at DC 13 across INT/WIS/CON'}
    ]},
    {id:'TRICKSTER', name:'The Trickster Signal', heat:0, seeds:[
      {title:'Social Heist', text:'Flip two mid-level managers; reconstruct ledger.', dc:'CHA DC 14 (flip), INT DC 14 (rebuild)'}
    ]},
    {id:'HELIX_CODE', name:'The Helix Code', heat:2, seeds:[
      {title:'Loading Dock Ambush', text:'Trap Greyline under cranes and arcs.', dc:'Tactics DC 14 to bait; environment checks vary'}
    ]},
    {id:'ECHO_OPERATIVE', name:'The Echo Operative', heat:0, seeds:[
      {title:'Bond Flashback', text:'Define mirrored tactic; grant both 1 temp CAP next session.', dc:'Story beat (no roll)'}
    ]},
    {id:'DREAM', name:'The Dream', heat:0, seeds:[
      {title:'Auditor Cutaways', text:'Conclave records each RP use.', dc:'None; adds Heat +1 per spend'}
    ]},
    {id:'DEFECTOR', name:'The Defector', heat:1, seeds:[
      {title:'Breadcrumb Reveal', text:'Missing gear, false logs, lethal radio cue.', dc:'Investigation DC 14 per clue'}
    ]},
    {id:'COLLAPSE', name:'The Collapse', heat:1, seeds:[
      {title:'Paper Trail Break', text:'Crack shell entities to reclaim life.', dc:'INT/CHA DC 15 vs each shell (need 2)'}
    ]},
    {id:'WRAITH', name:'The Wraith', heat:1, seeds:[
      {title:'Relentless Hunt', text:'If it escapes it gains +10 HP each time.', dc:'Hunt scenes; contested checks DC 14'}
    ]},
    {id:'ASCENDANT', name:'The Ascendant', heat:0, seeds:[
      {title:'Ethical Trial', text:'Conclave tempts; GM-posed dilemma.', dc:'Player choice; optional CHA/WIS DC 14 to sway observers'}
    ]},
    {id:'HALO', name:'The Halo', heat:1, seeds:[
      {title:'Media Circuit', text:'Interview raises Public Trust by 1; declining avoids smear.', dc:'Persuasion DC 13 for bonus'}
    ]},
    {id:'SILENCE_BLOOM', name:'The Silence Bloom', heat:1, seeds:[
      {title:'Trial of Merit', text:'Three timed rescues back-to-back.', dc:'DEX/INT/CHA DC 14 each under time'}
    ]},
    {id:'VIGIL', name:'The Vigil', heat:1, seeds:[
      {title:'District Rival Duel', text:'Public trial by duel or court.', dc:'Combat as normal or Law/Oratory DC 15'}
    ]},
    {id:'ORACLE', name:'The Oracle', heat:0, seeds:[
      {title:'Truth Fallout', text:'Who is angered by the revealed fact?', dc:'Social fallout checks DC 14'}
    ]},
    {id:'SHEPHERDS_THREAD', name:'The Shepherd’s Thread', heat:2, seeds:[
      {title:'Rite of Unbinding', text:'Three vows by allies to sever.', dc:'Two successes: CHA/WIS DC 14 (cost on fail)'}
    ]},
  ];
  const plateById = Object.fromEntries(PLATES.map(p=>[p.id,p]));

  /* ===== Dice & rolls ===== */
  function rollDice(expr){
    const m = String(expr).replace(/\s+/g,'').match(/^(\d*)d(\d+)([+-]\d+)?$/i);
    if (!m) return { total: NaN, rolls:[], mod:0, expr };
    const n = Math.max(1, parseInt(m[1]||'1',10));
    const faces = parseInt(m[2],10);
    const mod = parseInt(m[3]||'0',10);
    const rolls = Array.from({length:n}, ()=> 1+Math.floor(Math.random()*faces));
    const total = rolls.reduce((a,b)=>a+b,0) + mod;
    return { total, rolls, mod, faces, n, expr };
  }
  function rollBtn(label, expr){
    const b = document.createElement('button');
    b.className = 'somf-btn somf-ghost';
    b.textContent = `${label} (${expr})`;
    b.addEventListener('click', ()=>{
      const r = rollDice(expr);
      toast(`${label}: ${r.total}  <span class="somf-muted somf-mono">[${r.rolls.join(', ')}${r.mod? (r.mod>0?` + ${r.mod}`:` - ${Math.abs(r.mod)}`):''}]</span>`);
    });
    return b;
  }

  /* ===== NPC TEMPLATES (complete) ===== */
  const NPC_TEMPLATES = [
    {
      id:'H1', name:'Herald of Morvox, Echo Warden', type:'Enemy • Elite Controller (Tier 3)',
      ability:{STR:10, DEX:14, CON:14, INT:12, WIS:16, CHA:12},
      hp:58, tc:16, speed:'30 ft', sp:7,
      saves:{WIS:+3, DEX:+2, CON:+2},
      skills:{Perception:+5, Insight:+5, Stealth:+4, Arcana:+3, Intimidation:+3},
      armor:{name:'Null-Weave Mantle', bonus:+2, notes:'Light armor; adv vs sonic'},
      weapons:[{name:'Echo Lash', type:'melee', attack:'+6', damage:'2d8 psychic'}],
      items:['Shard Talisman (focus)','Null Resonator (1/enc: Silence 10 ft, 1 rnd)'],
      traits:['Silence Bloom aura 10 ft (verbal powers at disadv)','Fragment Glide (move through 5 ft solid as difficult terrain)'],
      powers:[
        {name:'Broadcast Scramble', cost:2, text:'20 ft radius; foes lose reactions & have disadv on next attack (WIS DC 15 halves)'},
        {name:'Shepard’s Mark', cost:3, text:'Mark 1 target; if they attack Herald → stunned; if others → +1d6 dmg (WIS DC 16 negates)'},
      ],
      actions:[
        {name:'Echo Lash', rollAttack:'+6', rollDamage:'2d8', notes:'Psychic; on hit WIS DC 15 or Disoriented 1 rnd'},
        {name:'Broadcast Scramble', rollSave:'WIS DC 15', notes:'AOE control (2 SP)'},
        {name:'Shepard’s Mark', rollSave:'WIS DC 16', notes:'Punishing mark (3 SP)'},
      ],
      reactions:['Memory Tear: when crit, attacker WIS DC 15 or stunned 1 rnd'],
    },
    {
      id:'G1', name:'Greyline Assault Cell', type:'Enemy • Fireteam (Tier 3, shared pool)',
      ability:{STR:14, DEX:16, CON:14, INT:12, WIS:12, CHA:10},
      hp:64, tc:15, speed:'30 ft', sp:6,
      saves:{DEX:+3, CON:+2},
      skills:{Athletics:+4, Stealth:+5, Perception:+3, Hacking:+3, Tactics:+3},
      armor:{name:'Composite Tactical Armor', bonus:+3, notes:'Ceramic plates; integrated comms'},
      weapons:[
        {name:'SMG Burst', type:'ranged', attack:'+5', damage:'2d6+2 ballistic'},
        {name:'Netline Taser', type:'ranged', attack:'+5', damage:'1d4+2 lightning'},
      ],
      items:['Kill-Switch Smoke (1/enc, 20 ft; +1 TC inside)','Grapnels','Tac-Visors'],
      traits:['Coordinated Fire (+2 to hit if ally already hit target)','Kill-Switch Smoke once/enc'],
      powers:[
        {name:'Suppression Volley', cost:1, text:'15 ft cone. DEX DC 14 or 2d6 ballistic & lose reaction'},
        {name:'Breach Charge', cost:2, text:'Destroy cover/object; within 10 ft DEX DC 14 or 2d8 force, prone'},
        {name:'Netline Taser', cost:2, text:'30 ft; on hit Restrained until end of next turn'},
      ],
      actions:[
        {name:'Burst Fire', rollAttack:'+5', rollDamage:'2d6+2', notes:'Ballistic; +2 to hit if ally hit target'},
        {name:'Suppression Volley', rollSave:'DEX DC 14', notes:'Cone control (1 SP)'},
        {name:'Netline Taser', rollAttack:'+5', rollDamage:'1d4+2', notes:'On hit: Restrained (2 SP)'},
      ],
      reactions:['Drag Out: when ally drops to 0, move 15 ft & restore 5 HP behind cover'],
    },
    {
      id:'C1', name:'Conclave Trial Agent, Blade of Accession', type:'Enemy • Duelist (Tier 4)',
      ability:{STR:12, DEX:18, CON:14, INT:14, WIS:16, CHA:14},
      hp:72, tc:17, speed:'35 ft (hover 10)', sp:8,
      saves:{DEX:+4, WIS:+3, CHA:+2},
      skills:{Acrobatics:+6, Insight:+5, Perception:+5, Diplomacy:+4, Arcana:+4},
      armor:{name:'Starlit Aegis', bonus:+4, notes:'Immune charm/fear'},
      weapons:[{name:'Prism Edge', type:'melee', attack:'+7', damage:'2d10 radiant'}],
      items:['Ascension Seal','Astral Beacon'],
      traits:['Astral Parry (reduce incoming 5 once/round)','Starlit Code (immune to charm & fear)'],
      powers:[
        {name:'Accession Step', cost:2, text:'Teleport 20 ft; free Prism Edge at +2 to hit'},
        {name:'Starlight Decree', cost:3, text:'15 ft pulse; WIS DC 16 or lose reactions & movement until end of next turn'},
      ],
      actions:[
        {name:'Prism Edge', rollAttack:'+7', rollDamage:'2d10', notes:'On hit: WIS DC 15 or target has disadv on next attack'},
        {name:'Accession Step', rollAttack:'+9', rollDamage:'2d10', notes:'Teleport + bonus strike (2 SP)'},
        {name:'Starlight Decree', rollSave:'WIS DC 16', notes:'AOE control (3 SP)'},
      ],
      reactions:['Code Reversal: when hit by a power, force attacker to reroll once'],
    },
    {
      id:'E1', name:'Echo Operative', type:'Ally • Tier 3',
      ability:{STR:12, DEX:16, CON:14, INT:12, WIS:12, CHA:12},
      hp:50, tc:15, speed:'30 ft', sp:6,
      saves:{DEX:+3, CON:+2},
      skills:{Stealth:+5, Perception:+3, Athletics:+3, Tactics:+3, Medicine:+2},
      armor:{name:'Adaptive Vest', bonus:+2, notes:'Light armor; silent motor'},
      weapons:[
        {name:'Marksman Rifle', type:'ranged', attack:'+5', damage:'1d10+2 ballistic'},
        {name:'Sidearm', type:'ranged', attack:'+5', damage:'1d6+2 ballistic'},
        {name:'Combat Knife', type:'melee', attack:'+5', damage:'1d4+2 kinetic'},
      ],
      items:['Signal Beacon','Med-Gel x2','Smoke x1'],
      traits:['Mirrors one tactic of summoner (pick on spawn)'],
      powers:[
        {name:'Covering Fire', cost:1, text:'Ally +2 TC until your next turn; that ally may reposition 10 ft'},
        {name:'Drive Forward', cost:2, text:'You + ally move 20 ft; ally gains advantage on next attack'},
        {name:'Last Stand', cost:3, text:'On drop to 0, stay at 1; allies within 10 ft gain +1d6 temp HP'},
      ],
      actions:[
        {name:'Rifle Shot', rollAttack:'+5', rollDamage:'1d10+2', notes:'Ballistic'},
        {name:'Covering Fire', rollText:'Buff (1 SP)', notes:'+2 TC & 10 ft reposition to ally'},
      ],
      reactions:['Bodyguard: take a hit for summoner once/encounter'],
    },
    {
      id:'B1', name:'Betrayer (Template)', type:'Template • Apply to NPC/PC',
      template:true,
      add:[
        'Hidden Blade: once/scene +2d6 if target surprised',
        'False Flag (1 SP): on hit, nearby ally WIS DC 14 or loses reaction',
      ],
      weakness:'After reveal: disadvantage on Deception vs party.',
    },
  ];

  /* ===== UI binding ===== */
  const ui = {
    root: $('#somf-dm'),
    open: $('#somfDM-open'),
    close: $('#somfDM-close'),
    tabs: $$('#somf-dm .somf-dm__tabs button'),
    tabCards: $('#somfDM-tab-cards'),
    tabResolve: $('#somfDM-tab-resolve'),
    tabNPCs: $('#somfDM-tab-npcs'),
    cardsGrid: $('#somfDM-cards'),
    liveChk: $('#somfDM-live'),
    sfxChk: $('#somfDM-sfx'),
    desktopChk: $('#somfDM-desktop'),
    refresh: $('#somfDM-refresh'),
    total: $('#somfDM-total'),
    remaining: $('#somfDM-remaining'),
    campaign: $('#somfDM-campaign'),
    incoming: $('#somfDM-incoming'),
    drawView: $('#somfDM-drawView'),
    seedsBox: $('#somfDM-seedsBox'),
    seeds: $('#somfDM-seeds'),
    notes: $('#somfDM-notes'),
    markResolved: $('#somfDM-markResolved'),
    spawnNPC: $('#somfDM-spawnNPC'),
    applyHeat: $('#somfDM-applyHeat'),
    npcTemplates: $('#somfDM-npcTemplates'),
    activeNPCs: $('#somfDM-activeNPCs'),
    toasts: $('#somfDM-toasts'),
    ping: $('#somfDM-ping'),
  };

  ui.open.addEventListener('click', ()=> ui.root.classList.remove('hidden'));
  ui.close.addEventListener('click', ()=> ui.root.classList.add('hidden'));
  ui.tabs.forEach(b=> b.addEventListener('click', ()=>{
    ui.tabs.forEach(x=>x.classList.remove('active')); b.classList.add('active');
    const t = b.dataset.tab;
    [ui.tabCards, ui.tabResolve, ui.tabNPCs].forEach(el=>el.classList.remove('active'));
    if (t==='cards') ui.tabCards.classList.add('active');
    if (t==='resolve') ui.tabResolve.classList.add('active');
    if (t==='npcs') ui.tabNPCs.classList.add('active');
  }));
  ui.desktopChk.addEventListener('change', async ()=>{
    if (ui.desktopChk.checked && 'Notification' in window){
      if (Notification.permission !== 'granted') await Notification.requestPermission();
    }
  });

  /* ===== Toasts ===== */
  function toast(html, ttl=6000){
    const t = document.createElement('div');
    t.className = 'somf-toast';
    t.innerHTML = html;
    ui.toasts.appendChild(t);
    if (ui.sfxChk.checked) try{ ui.ping.currentTime = 0; ui.ping.play(); }catch{}
    setTimeout(()=> t.remove(), ttl);
    if (ui.desktopChk.checked && 'Notification' in window && Notification.permission==='granted'){
      const clean = html.replace(/<[^>]+>/g, '');
      new Notification('Shards Drawn', { body: clean });
    }
  }

  /* ===== Cloud/local storage ===== */
  const KEYS = {
    deck: cid => `somf_deck__${cid}`,
    audit: cid => `somf_audit__${cid}`,
    resolutions: cid => `somf_resolutions__${cid}`,
    npcs: cid => `somf_active_npcs__${cid}`,
    lastSeen: cid => `somf_lastSeenAudit__${cid}`,
  };
  const getLocal = k => { const r = localStorage.getItem(k); return r? JSON.parse(r) : null; };
  const setLocal = (k,v) => localStorage.setItem(k, JSON.stringify(v));

  async function fetchDeckInfo(){
    const cid = getCampaignId(); const db = getRTDB();
    ui.campaign.textContent = cid;
    if (db){
      const deckSnap = await db.ref(`somf/${cid}/deck`).get();
      const deck = deckSnap.exists()? deckSnap.val() : [];
      const auditsSnap = await db.ref(`somf/${cid}/audits`).get();
      const total = auditsSnap.exists()? Object.keys(auditsSnap.val()).length : 0;
      ui.total.textContent = String(total);
      ui.remaining.textContent = String(Array.isArray(deck)? deck.length : 22);
      return { total, remaining: Array.isArray(deck)? deck.length : 22 };
    } else {
      const deck = getLocal(KEYS.deck(cid)) || [];
      const audits = getLocal(KEYS.audit(cid)) || [];
      ui.total.textContent = String(audits.length);
      ui.remaining.textContent = String(Array.isArray(deck)? deck.length : 22);
      return { total: audits.length, remaining: Array.isArray(deck)? deck.length : 22 };
    }
  }
  async function fetchAudits(limit=100){
    const cid = getCampaignId(); const db = getRTDB();
    if (db){
      const snap = await db.ref(`somf/${cid}/audits`).limitToLast(limit).get();
      if (!snap.exists()) return [];
      const entries = Object.values(snap.val()).map(v=>({ id:v.id, ts:v.ts || Date.now() }));
      entries.sort((a,b)=> b.ts - a.ts);
      return entries;
    } else {
      const arr = getLocal(KEYS.audit(cid)) || [];
      return arr.slice(0,limit);
    }
  }
  async function pushResolution(entry, note){
    const cid = getCampaignId(); const db = getRTDB();
    const payload = { id:entry.id, name:plateById[entry.id]?.name||entry.id, ts:entry.ts, resolvedAt:Date.now(), note };
    if (db){ await db.ref(`somf/${cid}/resolutions`).push(payload); }
    else { const arr = getLocal(KEYS.resolutions(cid))||[]; arr.unshift(payload); setLocal(KEYS.resolutions(cid), arr); }
  }
  async function pushActiveNPC(npc){
    const cid = getCampaignId(); const db = getRTDB();
    const payload = { ...npc, spawnedAt: Date.now() };
    if (db){ await db.ref(`somf/${cid}/active_npcs`).push(payload); }
    else { const arr = getLocal(KEYS.npcs(cid))||[]; arr.unshift(payload); setLocal(KEYS.npcs(cid), arr); }
  }
  async function fetchActiveNPCs(){
    const cid = getCampaignId(); const db = getRTDB();
    if (db){
      const snap = await db.ref(`somf/${cid}/active_npcs`).get();
      if (!snap.exists()) return [];
      return Object.values(snap.val()).sort((a,b)=> b.spawnedAt - a.spawnedAt);
    } else {
      return getLocal(KEYS.npcs(cid)) || [];
    }
  }

  /* ===== Live listener ===== */
  let liveOff = null;
  function enableLive(){
    const db = getRTDB(); const cid = getCampaignId();
    if (!db) return;
    const ref = db.ref(`somf/${cid}/audits`);
    liveOff && ref.off('child_added', liveOff);
    liveOff = ref.limitToLast(4).on('child_added', snap=>{
      if (!ui.liveChk.checked) return;
      const v = snap.val(); if (!v) return;
      const last = getLocal(KEYS.lastSeen(cid)) || 0;
      if ((v.ts||0) <= last) return;
      setLocal(KEYS.lastSeen(cid), v.ts||Date.now());
      const name = plateById[v.id]?.name || v.id;
      toast(`<strong>New Shard Drawn</strong>${name}`);
      refreshResolve();
    });
  }

  /* ===== Render: Cards ===== */
  function renderCards(){
    ui.cardsGrid.innerHTML = '';
    PLATES.forEach(p=>{
      const d = document.createElement('div');
      d.className = 'somf-card';
      d.innerHTML = `<h5>${p.name}</h5><div class="somf-badges"><span class="somf-badge">${p.id}</span><span class="somf-badge">Heat ${p.heat}</span></div>`;
      ui.cardsGrid.appendChild(d);
    });
  }

  /* ===== Resolve ===== */
  let selectedEntry = null;
  function fmtTime(ts){ const d = new Date(ts); return d.toLocaleString(); }

  async function refreshResolve(){
    await fetchDeckInfo();
    const entries = await fetchAudits(200);
    ui.incoming.innerHTML = '';
    entries.forEach((e,i)=>{
      const li = document.createElement('li');
      li.dataset.idx=i; li.dataset.id=e.id;
      li.innerHTML = `<strong>${plateById[e.id]?.name || e.id}</strong><div class="somf-muted">${fmtTime(e.ts)}</div>`;
      li.addEventListener('click', ()=>{
        $$('#somfDM-incoming li').forEach(x=>x.classList.remove('active'));
        li.classList.add('active'); selectedEntry=e; showDraw(e);
      });
      ui.incoming.appendChild(li);
    });
    if (entries[0]) ui.incoming.firstChild.click();
  }

  function showDraw(e){
    const p = plateById[e.id];
    ui.drawView.innerHTML = `
      <div class="somf-grid2">
        <div><strong>Shard</strong><div>${p?.name || e.id}</div></div>
        <div><strong>Drawn</strong><div>${fmtTime(e.ts)}</div></div>
      </div>
      <div class="somf-badges" style="margin-top:8px">
        <span class="somf-badge">ID: ${e.id}</span>
        <span class="somf-badge">Heat ${p?.heat ?? 0}</span>
      </div>
    `;
    renderSeeds(e.id);
    ui.notes.value = '';
    ui.markResolved.disabled = false;
    ui.applyHeat.disabled = !((p?.heat||0) > 0);
    ui.spawnNPC.disabled = !spawnableFor(e.id);
  }

  function renderSeeds(id){
    const p = plateById[id]; const box = ui.seeds; box.innerHTML = '';
    (p?.seeds || []).forEach(s=>{
      const el = document.createElement('div');
      el.className = 'somf-seed';
      el.innerHTML = `<h6>${s.title}</h6><div>${s.text}</div><div class="somf-tag">${s.dc}</div>`;
      box.appendChild(el);
    });
    ui.seedsBox.style.display = (p?.seeds?.length ? 'block' : 'none');
  }

  function spawnableFor(id){
    if (id==='BROADCAST' || id==='HELIX_CODE') return 'G1';
    if (id==='NULL_VAULT' || id==='SHEPHERDS_MASK' || id==='SHEPHERDS_THREAD') return 'H1';
    if (id==='WRAITH') return 'C1';
    if (id==='ECHO_OPERATIVE') return 'E1';
    if (id==='DEFECTOR') return 'B1';
    return null;
  }

  ui.applyHeat.addEventListener('click', ()=>{
    if (!selectedEntry) return;
    const p = plateById[selectedEntry.id]; const delta = p?.heat || 0; if (!delta) return;
    try { window.CCShard?.bumpHeat?.(delta); } catch {}
    toast(`<strong>Heat +${delta}</strong>${p?.name || selectedEntry.id}`);
  });

  ui.spawnNPC.addEventListener('click', async ()=>{
    const code = spawnableFor(selectedEntry?.id || '');
    if (!code){ toast('No immediate NPC for this shard.'); return; }
    const tpl = NPC_TEMPLATES.find(x=>x.id===code);
    await pushActiveNPC({ ...tpl, template:false, sourceShard:selectedEntry.id });
    toast(`<strong>NPC Spawned</strong>${tpl.name}`);
    renderActiveNPCs();
  });

  ui.markResolved.addEventListener('click', async ()=>{
    if (!selectedEntry) return;
    await pushResolution(selectedEntry, ui.notes.value.trim());
    toast(`<strong>Resolved</strong>${plateById[selectedEntry.id]?.name || selectedEntry.id}`);
    refreshResolve();
  });

  /* ===== NPCs view ===== */
  function renderNPCTemplates(){
    ui.npcTemplates.innerHTML = '';
    NPC_TEMPLATES.forEach(n=>{
      const li = document.createElement('li');
      li.innerHTML = `<strong>${n.name}</strong><div class="somf-muted">${n.type}</div>`;
      li.addEventListener('click', ()=> showNPCCard(n, true));
      ui.npcTemplates.appendChild(li);
    });
  }
  async function renderActiveNPCs(){
    const list = await fetchActiveNPCs();
    ui.activeNPCs.innerHTML = '';
    list.forEach(n=>{
      const node = showNPCCard(n, false, true);
      ui.activeNPCs.appendChild(node);
    });
  }
  function abilityMods(ability){ const m={}; for(const[k,v] of Object.entries(ability||{})) m[k]=Math.floor((v-10)/2); return m; }

  function showNPCCard(npc, preview=false, returnNode=false){
    const node = document.createElement('article');
    node.className = 'somf-sheet';
    const mods = abilityMods(npc.ability);
    node.innerHTML = `
      <h5>${npc.name}</h5><div class="somf-muted">${npc.type||''}</div>
      ${npc.template ? `<div class="somf-tag">TEMPLATE</div>` : ''}
      ${npc.hp ? `<div class="somf-grid3" style="margin-top:6px">
        <div><strong>HP</strong><div>${npc.hp}</div></div>
        <div><strong>TC</strong><div>${npc.tc}</div></div>
        <div><strong>SP</strong><div>${npc.sp}</div></div>
      </div>`:''}
      ${npc.ability ? `<div class="somf-grid3" style="margin-top:6px">
        <div><strong>STR</strong><div>${npc.ability.STR} (${mods.STR>=0?'+':''}${mods.STR||0})</div></div>
        <div><strong>DEX</strong><div>${npc.ability.DEX} (${mods.DEX>=0?'+':''}${mods.DEX||0})</div></div>
        <div><strong>CON</strong><div>${npc.ability.CON} (${mods.CON>=0?'+':''}${mods.CON||0})</div></div>`:''}
      ${npc.ability ? `<div class="somf-grid3">
        <div><strong>INT</strong><div>${npc.ability.INT} (${mods.INT>=0?'+':''}${mods.INT||0})</div></div>
        <div><strong>WIS</strong><div>${npc.ability.WIS} (${mods.WIS>=0?'+':''}${mods.WIS||0})</div></div>
        <div><strong>CHA</strong><div>${npc.ability.CHA} (${mods.CHA>=0?'+':''}${mods.CHA||0})</div></div>`:''}
      ${npc.saves ? `<div class="somf-grid3" style="margin-top:6px">
        <div><strong>Saves</strong><div class="somf-mono">${Object.entries(npc.saves).map(([k,v])=>`${k} ${v>=0?'+':''}${v}`).join(', ')}</div></div>
        <div><strong>Speed</strong><div>${npc.speed||'—'}</div></div>
        <div><strong>Armor</strong><div>${npc.armor?.name||'—'} ${npc.armor?`(+${npc.armor.bonus})`:''}</div></div>
      </div>`:''}
      ${npc.skills ? `<div style="margin-top:6px"><strong>Skills</strong><div class="somf-mono">${Object.entries(npc.skills).map(([k,v])=>`${k} ${v>=0?'+':''}${v}`).join(', ')}</div></div>`:''}
      ${npc.traits?.length ? `<div style="margin-top:6px"><strong>Traits</strong><ul>${npc.traits.map(t=>`<li>${t}</li>`).join('')}</ul></div>`:''}
      ${npc.items?.length ? `<div style="margin-top:6px"><strong>Items</strong><div>${npc.items.join(', ')}</div></div>`:''}
      ${npc.weapons?.length ? `<div style="margin-top:6px"><strong>Weapons</strong><ul>${npc.weapons.map(w=>`<li><span class="somf-mono">${w.name}</span> — ${w.type}, atk ${w.attack||'—'}, dmg ${w.damage||'—'}</li>`).join('')}</ul></div>`:''}
      ${npc.powers?.length ? `<div style="margin-top:6px"><strong>Powers</strong><ul>${npc.powers.map(p=>`<li><span class="somf-mono">${p.name}</span> [${p.cost} SP] — ${p.text}</li>`).join('')}</ul></div>`:''}
      ${npc.actions?.length ? `<div style="margin-top:6px"><strong>Actions</strong><div class="somf-rolls"></div></div>`:''}
    `;
    const rollsHost = node.querySelector('.somf-rolls');
    if (rollsHost && npc.actions){
      npc.actions.forEach(a=>{
        if (a.rollAttack && a.rollDamage){
          rollsHost.appendChild(rollBtn(`${a.name} Attack`, a.rollAttack.replace('+','1d20+')));
          rollsHost.appendChild(rollBtn(`${a.name} Damage`, a.rollDamage));
        } else if (a.rollSave){
          const tag = document.createElement('span'); tag.className='somf-tag'; tag.textContent = a.rollSave; rollsHost.appendChild(tag);
          rollsHost.appendChild(rollBtn(`${a.name} Check`, `1d20+0`));
        } else if (a.rollText){
          const tag = document.createElement('span'); tag.className='somf-tag'; tag.textContent = a.rollText; rollsHost.appendChild(tag);
        }
        if (a.notes){ const note=document.createElement('span'); note.className='somf-tag somf-muted'; note.textContent=a.notes; rollsHost.appendChild(note); }
      });
    }
    if (preview){ toast(`<strong>${npc.name}</strong> ${npc.type||''}`); }
    if (returnNode) return node;
    ui.activeNPCs.appendChild(node); return node;
  }

  /* ===== Init ===== */
  function renderNPCTemplates(){ ui.npcTemplates.innerHTML=''; NPC_TEMPLATES.forEach(n=>{ const li=document.createElement('li'); li.innerHTML=`<strong>${n.name}</strong><div class="somf-muted">${n.type}</div>`; li.addEventListener('click',()=>showNPCCard(n,true)); ui.npcTemplates.appendChild(li); }); }
  async function renderActiveNPCs(){ const list=await fetchActiveNPCs(); ui.activeNPCs.innerHTML=''; list.forEach(n=> ui.activeNPCs.appendChild(showNPCCard(n,false,true))); }

  async function initDM(){
    renderCards(); renderNPCTemplates(); await renderActiveNPCs(); await refreshResolve(); enableLive();
  }

  /* Controls */
  ui.refresh.addEventListener('click', ()=> { renderCards(); refreshResolve(); renderNPCTemplates(); renderActiveNPCs(); });
  ui.liveChk.addEventListener('change', enableLive);
  document.getElementById('somfDM-open').addEventListener('click', initDM, { once:true });

})();

