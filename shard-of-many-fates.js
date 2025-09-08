/* === Shards of Many Fates minimal module === */
/* === CONFIG you can tweak === */
const SOMF_CAMPAIGN_ID = "ccampaign-001";   // set per table/campaign
// After your Firebase init, call: SOMF.setFirebase(firebase.database());

/* === Shard data (player-facing: name, visual, effect summary) === */
const SOMF_PLATES = [
  {id:'TRIBUNAL',     name:'The Tribunal',        visual:'A halo of alien law glyphs inverts.', effect:['Shift one step on Moral or Discipline axis','Immediate faction reaction','1-time alignment perk for 3 sessions']},
  {id:'METEOR',       name:'The Meteor',          visual:'A burning shard fractures into your nemesis sigil.', effect:['Solo-next major enemy to ascend one Hero Tier','Fail: lose 1 rep tier with a watching faction']},
  {id:'NULL_VAULT',   name:'The Null Vault',      visual:'The floor tears like static; a doorframe with no door opens.', effect:['You vanish to Morvox’s Echo Pit','Team must mount a rescue']},
  {id:'SHEPHERDS_MASK',name:'The Shepherd’s Mask',visual:'A porcelain mask melts into black tracer lines.', effect:['Curse: −2 on all saves; nat 20 rolls twice, keep lower','Lift via Herald duel or Conclave starlight']},
  {id:'REDACTION',    name:'The Redaction',       visual:'Frames of your past appear; a black bar erases one.', effect:['Erase one event or outcome; rewrite one consequence','Another thread becomes harder']},
  {id:'BROADCAST',    name:'The Broadcast',       visual:'Billboards flip to your face marked TRAITOR or MONSTER.', effect:['Gain a powerful pursuing enemy']},
  {id:'FRAGMENT',     name:'The Fragment',        visual:'A cracked shard refracts you into a caricature.', effect:['Lose 1d4 CAP this arc','Must draw one extra shard']},
  {id:'CACHE',        name:'The Catalyst Cache',  visual:'A humming shard-case phases in.', effect:['Gain 1d6 Fragments + one Rare item','Cache is watermarked (tracker)']},
  {id:'STATIC',       name:'The Static',          visual:'Vision pixelates; thoughts stutter.', effect:['Permanent −1d4 INT','Lose a language/tech specialty until retrained']},
  {id:'TRICKSTER',    name:'The Trickster Signal',visual:'Confetti of system alerts rains down.', effect:['Choose 10,000 credits OR draw two more','If drawn twice ever: a contact is an O.M.N.I. sleeper']},
  {id:'HELIX_CODE',   name:'The Helix Code',      visual:'A living circuitry key slots into your kit.', effect:['Gain Legendary class item','Backdoor ping reveals location on first combat use']},
  {id:'ECHO_OPERATIVE',name:'The Echo Operative', visual:'A soldier steps out of your shadow in inverted colors.', effect:['Gain a loyal Tier 3 ally mirroring one tactic']},
  {id:'DREAM',        name:'The Dream',           visual:'A shardlight crescent drips motes into your hands.', effect:['Gain 1d3 Resonance Point wishes (each use adds Heat)']},
  {id:'DEFECTOR',     name:'The Defector',        visual:'Your team appears; one face shatters.', effect:['One ally/contact will betray you at a pivotal moment']},
  {id:'COLLAPSE',     name:'The Collapse',        visual:'Homes, lockers, and accounts implode into cubes.', effect:['Lose civilian assets','Gain one-scene Renegade surge (+1d6)']},
  {id:'WRAITH',       name:'The Wraith',          visual:'A skeletal silhouette with shardlight eyes exhales frost.', effect:['A relentless hunter pursues you until slain']},
  {id:'ASCENDANT',    name:'The Ascendant',       visual:'A seven-point star embeds in your sternum.', effect:['+2 to one ability','+1d4 free once in each of next two encounters']},
  {id:'HALO',         name:'The Halo',            visual:'A rotating shard halo casts your emblem.', effect:['Gain Elite/Legendary artifact','+1d4 CAP this arc']},
  {id:'SILENCE_BLOOM',name:'The Silence Bloom',   visual:'Your gear dissolves into black petals.', effect:['All carried gear erased except bonded artifacts and fragments']},
  {id:'VIGIL',        name:'The Vigil',           visual:'A city district lifts into your palm as a sigil.', effect:['Gain district/safehouse/post; set one team policy there']},
  {id:'ORACLE',       name:'The Oracle',          visual:'A sphere of light shows a single truth.', effect:['Ask one specific campaign question']},
  {id:'SHEPHERDS_THREAD', name:'The Shepherd’s Thread', visual:'A black filament tethers your chest to darkness.', effect:['Soul tether to Morvox; periodic WIS save or lose action','Sever via Null Vault or Conclave Rite']},
];

/* === Internals === */
const $ = sel => document.querySelector(sel);
const SOMF_KEYS = {
  localDeck: (cid)=>`somf_deck__${cid}`,
  localAudit: (cid)=>`somf_audit__${cid}`
};
let RTDB = null; // set via SOMF.setFirebase()
const DECK_PATH = (cid)=>`somf/${cid}/deck`;
const AUDIT_PATH = (cid)=>`somf/${cid}/audits`;

// cryptographically strong [0, max)
function cryptoInt(max){
  if (window.crypto?.getRandomValues) {
    const arr = new Uint32Array(1);
    window.crypto.getRandomValues(arr);
    return Math.floor((arr[0] / 2**32) * max);
  }
  return Math.floor(Math.random()*max);
}

// Local deck helpers (fallback if no RTDB)
function getLocalDeck(cid){
  const raw = localStorage.getItem(SOMF_KEYS.localDeck(cid));
  return raw ? JSON.parse(raw) : null;
}
function setLocalDeck(cid, deck){
  localStorage.setItem(SOMF_KEYS.localDeck(cid), JSON.stringify(deck));
}
function ensureLocalDeck(cid){
  let deck = getLocalDeck(cid);
  if (!deck || !Array.isArray(deck) || deck.length===0){
    deck = SOMF_PLATES.map(p=>p.id);
    setLocalDeck(cid, deck);
  }
  return deck;
}
function localDrawOne(cid){
  const deck = ensureLocalDeck(cid);
  const idx = cryptoInt(deck.length);
  const [id] = deck.splice(idx,1);
  setLocalDeck(cid, deck);
  auditLocal(cid, id);
  return id;
}
function auditLocal(cid, id){
  const key = SOMF_KEYS.localAudit(cid);
  const raw = localStorage.getItem(key);
  const arr = raw ? JSON.parse(raw) : [];
  arr.unshift({id, ts: Date.now()});
  localStorage.setItem(key, JSON.stringify(arr));
}

// RTDB helpers
async function rtdbInitDeckIfMissing(cid){
  const ref = RTDB.ref(DECK_PATH(cid));
  const snap = await ref.get();
  if (!snap.exists()) {
    const all = SOMF_PLATES.map(p=>p.id);
    await ref.set(all);
    return all;
  }
  return snap.val();
}
async function rtdbDrawOne(cid){
  const deckRef = RTDB.ref(DECK_PATH(cid));
  let drawnId = null;
  await deckRef.transaction(current => {
    let cur = current;
    if (!Array.isArray(cur) || cur.length===0){
      cur = SOMF_PLATES.map(p=>p.id); // auto-reshuffle when empty
    }
    const idx = cryptoInt(cur.length);
    drawnId = cur[idx];
    const next = cur.slice(0, idx).concat(cur.slice(idx+1));
    return next;
  }, undefined, false);
  // audit
  await RTDB.ref(AUDIT_PATH(cid)).push({ id: drawnId, ts: RTDB.ServerValue.TIMESTAMP });
  return drawnId;
}

/* === UI logic === */
const ui = {
  count: $('#somf-count'),
  drawBtn: $('#somf-draw'),
  modal: $('#somf-modal'),
  close: $('#somf-close'),
  resolved: $('#somf-resolved'),
  next: $('#somf-next'),
  curName: $('#somf-cur-name'),
  curVisual: $('#somf-cur-visual'),
  curEffect: $('#somf-cur-effect'),
  idx: $('#somf-idx'),
  total: $('#somf-total'),
};

let session = { queue: [], index: 0, campaignId: SOMF_CAMPAIGN_ID };

function openModal(){ ui.modal.hidden = false; ui.resolved.checked = false; ui.next.disabled = true; }
function closeModal(){ ui.modal.hidden = true; }

function renderCurrent(){
  const i = session.index;
  const total = session.queue.length;
  ui.idx.textContent = String(i+1);
  ui.total.textContent = String(total);
  const plate = session.queue[i];
  ui.curName.textContent = plate.name;
  ui.curVisual.textContent = plate.visual;
  ui.curEffect.innerHTML = plate.effect.map(e=>`<li>${escapeHtml(e)}</li>`).join('');
  ui.resolved.checked = false;
  ui.next.disabled = true;
}

function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m])); }

/* === Draw flow === */
async function drawFlow(){
  const n = Math.max(1, Math.min(22, +ui.count.value || 1));

  if (!confirm('The Fates are fickle, are you sure you wish to draw from the Shards?')) return;
  if (!confirm('This cannot be undone, do you really wish to tempt Fate?')) return;

  // Build queue of N unique shard objects via cloud (preferred) or local fallback
  const ids = [];
  for (let k=0; k<n; k++){
    const id = RTDB ? await rtdbDrawOne(session.campaignId) : localDrawOne(session.campaignId);
    ids.push(id);
  }
  session.queue = ids.map(id => SOMF_PLATES.find(p=>p.id===id));
  session.index = 0;

  openModal();
  renderCurrent();
}

/* === Wire events === */
ui.drawBtn.addEventListener('click', async () => {
  try {
    if (RTDB) await rtdbInitDeckIfMissing(session.campaignId);
    await drawFlow();
  } catch (e) {
    alert('Error drawing shards. Check your connection and Firebase configuration.');
    console.error(e);
  }
});
ui.close.addEventListener('click', closeModal);
ui.resolved.addEventListener('change', ()=> { ui.next.disabled = !ui.resolved.checked; });
ui.next.addEventListener('click', ()=>{
  if (!ui.resolved.checked) return;
  if (session.index < session.queue.length - 1){
    session.index += 1; renderCurrent();
  } else {
    closeModal();
  }
});

/* === Public API === */
window.SOMF = {
  setCampaignId: (id)=> { session.campaignId = id || SOMF_CAMPAIGN_ID; },
  setFirebase: (db)=> { RTDB = db || null; },
};

/* === History viewer (No spoilers) === */
(function(){
  const $ = (s)=>document.querySelector(s);
  const SOMF_HISTORY_MAX = 100;

  // Reuse campaign & RTDB from SOMF public API if present
  function getCampaignId(){ return (window.SOMF?._getCampaignId?.() || window.SOMF_CAMPAIGN_ID); }
  function getRTDB(){ return window.SOMF?._getFirebase?.() || null; }

  // LocalStorage keys (same scheme as the main module)
  const keys = {
    deck: (cid)=>`somf_deck__${cid}`,
    audit: (cid)=>`somf_audit__${cid}`
  };

  // Hash an internal id to a short, non-reversible token (no spoilers)
  async function tokenize(str){
    // Use subtle crypto if available; fallback to a quick non-crypto hash
    if (crypto?.subtle) {
      const enc = new TextEncoder().encode(str);
      const buf = await crypto.subtle.digest('SHA-256', enc);
      const bytes = Array.from(new Uint8Array(buf));
      return bytes.slice(0,6).map(b=>b.toString(16).padStart(2,'0')).join('').toUpperCase(); // 12 hex chars
    } else {
      let h=2166136261>>>0;
      for (let i=0;i<str.length;i++){ h^=str.charCodeAt(i); h=Math.imul(h,16777619); }
      return (h>>>0).toString(16).toUpperCase().padStart(8,'0');
    }
  }

  function fmtWhen(ts){
    const d = new Date(ts);
    const now = Date.now();
    const diff = Math.max(0, now - d.getTime());
    const mins = Math.floor(diff/60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins/60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs/24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleString();
  }

  async function loadDeckCounts(cid, rtdb){
    if (rtdb){
      const deckSnap = await rtdb.ref(`somf/${cid}/deck`).get();
      const deck = deckSnap.exists() ? deckSnap.val() : null;
      const auditsSnap = await rtdb.ref(`somf/${cid}/audits`).get();
      const audits = auditsSnap.exists() ? auditsSnap.size || Object.keys(auditsSnap.val()).length : 0;
      const remaining = Array.isArray(deck) ? deck.length : 22;
      return { total: audits, remaining };
    } else {
      const deckRaw = localStorage.getItem(keys.deck(cid));
      const deck = deckRaw ? JSON.parse(deckRaw) : null;
      const auditRaw = localStorage.getItem(keys.audit(cid));
      const audits = auditRaw ? JSON.parse(auditRaw) : [];
      const remaining = Array.isArray(deck) ? deck.length : 22;
      return { total: audits.length, remaining };
    }
  }

  async function loadAuditFeed(cid, rtdb){
    if (rtdb){
      // newest first
      const ref = rtdb.ref(`somf/${cid}/audits`).limitToLast(SOMF_HISTORY_MAX);
      const snap = await ref.get();
      if (!snap.exists()) return [];
      const entries = Object.entries(snap.val()).map(([k,v])=>({ id:v.id, ts:v.ts || Date.now() }));
      entries.sort((a,b)=> b.ts - a.ts);
      return entries;
    } else {
      const raw = localStorage.getItem(keys.audit(cid));
      const arr = raw ? JSON.parse(raw) : [];
      return arr.slice(0,SOMF_HISTORY_MAX);
    }
  }

  async function refreshHistory(){
    const cid = getCampaignId();
    const rtdb = getRTDB();

    $('#somf-hist-campaign').textContent = cid;

    const { total, remaining } = await loadDeckCounts(cid, rtdb);
    $('#somf-hist-total').textContent = String(total);
    $('#somf-hist-remaining').textContent = String(remaining);

    const feed = await loadAuditFeed(cid, rtdb);
    const ol = $('#somf-history-feed');
    ol.innerHTML = '';
    let index = total; // descending numbering
    for (const entry of feed){
      const li = document.createElement('li');
      const tok = await tokenize(`${entry.id}|${entry.ts}|${cid}`); // anonymized per-campaign
      li.innerHTML = `
        <span>${index--}</span>
        <span>${fmtWhen(entry.ts)}</span>
        <span class="somf-hash">#${tok}</span>
      `;
      ol.appendChild(li);
    }
  }

  // Wire
  $('#somf-history-refresh').addEventListener('click', refreshHistory);

  // Expose tiny helpers to main SOMF (optional)
  if (window.SOMF){
    // These are read by this history module to avoid global vars in your app
    if (!window.SOMF._getCampaignId) window.SOMF._getCampaignId = ()=> window._somf_campaignId || SOMF_CAMPAIGN_ID;
    if (!window.SOMF._getFirebase) window.SOMF._getFirebase = ()=> window._somf_rtdb || null;
    // Let main module set them when you call setFirebase / setCampaignId
    const _origSetFirebase = window.SOMF.setFirebase;
    window.SOMF.setFirebase = (db)=>{ window._somf_rtdb = db || null; if (_origSetFirebase) _origSetFirebase(db); };
    const _origSetCampaignId = window.SOMF.setCampaignId;
    window.SOMF.setCampaignId = (id)=>{ window._somf_campaignId = id || SOMF_CAMPAIGN_ID; if (_origSetCampaignId) _origSetCampaignId(id); };
  }

  // Auto-initialize on page load
  document.addEventListener('DOMContentLoaded', refreshHistory);
})();
