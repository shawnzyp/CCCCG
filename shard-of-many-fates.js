/* Shard of Many Fates • Catalyst Core Add-on */
(function () {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const ui = {
    root: $('#cc-shard'),
    openBtn: $('#ccShard-open'),
    closeBtn: $('#ccShard-close'),
    capCancelBtn: $('#ccShard-capCancel'),
    completeBtn: $('#ccShard-complete'),
    showAllBtn: $('#ccShard-showAll'),
    cardList: $('#ccShard-cardList'),
    cardListClose: $('#ccShard-cardList-close'),
    cardListOl: $('#ccShard-cardList-ol'),
    cardName: $('#ccShard-cardName'),
    cardVisual: $('#ccShard-cardVisual'),
    tabBtns: $$('#cc-shard .cc-tabs__nav button'),
    tabPanes: {
      effect: $('#ccShard-tab-effect'),
      hooks: $('#ccShard-tab-hooks'),
      resolution: $('#ccShard-tab-resolution'),
      enemy: $('#ccShard-tab-enemy'),
      rewards: $('#ccShard-tab-rewards')
    },
    log: $('#ccShard-log'),
    statSelect: $('#ccShard-statSelect'),
    openNPCBtn: $('#ccShard-openNPC'),
    statView: $('#ccShard-statView'),
    npcModal: $('#ccShard-npcModal'),
    npcName: $('#ccShard-npcName'),
    npcHP: $('#ccShard-npcHP'),
    npcSP: $('#ccShard-npcSP'),
    npcActions: $('#ccShard-npcActions'),
    npcLog: $('#ccShard-npcLog'),
    npcClose: $('#ccShard-npcClose'),
    flash: $('#ccShard-flash'),
  };

  const state = {
    deck: [],
    archive: [],
    activeCard: null,
    lastReset: null,
    drawnCount: 0,
  };

  const STORAGE_KEY = 'ccShard_v1';

  const DM_SHARD_KEY = 'ccShardEnabled';
  const DECK_LOCK_KEY = 'ccShardDeckLock';
  const CLOUD_STATE_URL = 'https://ccccg-7d6b6-default-rtdb.firebaseio.com/shardDeck.json';
  const CLOUD_LOCK_URL = 'https://ccccg-7d6b6-default-rtdb.firebaseio.com/shardDeckLock.json';
  const logDM = window.logDMAction || function(text){
    const arr = JSON.parse(localStorage.getItem('dmNotifications') || '[]');
    arr.push({ time: Date.now(), text });
    localStorage.setItem('dmNotifications', JSON.stringify(arr));
  };

  function toast(msg){
    const el = document.getElementById('toast');
    if(el){
      el.textContent = msg;
      el.className = 'toast show';
      setTimeout(()=> el.classList.remove('show'),3000);
    }
  }

  // All 22 plates
  const PLATES = [
    { id:'TRIBUNAL', name:'The Tribunal', src:'Balance',
      visual:'A rotating hex of alien law glyphs surrounds the drawer then inverts.',
      effect:[
        'Shift one step on Moral or Discipline axis.',
        'Adjust reputation with O.M.N.I. or PFV by one tier.',
        'Gain a one-time perk aligned to the new axis for 3 sessions.'
      ],
      hooks:[
        'O.M.N.I. audit team arrives.',
        'PFV ethics board demands a mediation stream.',
        'Conclave tags you with a luminal sigil.'
      ],
      resolution:[
        'Three acts supporting prior alignment or argue a Conclave Trial.',
        'Contrition or conviction scene clears the sigil and restores one rep.'
      ],
      enemy:null, rewards:null, heatDelta:1, capsAllowed:true },

    { id:'METEOR', name:'The Meteor', src:'Comet',
      visual:'A burning shard streaks overhead and fractures into the next nemesis sigil.',
      effect:[
        'Defeat the next significant enemy solo to ascend one Hero Tier and gain a Legendary class item.',
        'If you fail, lose one reputation tier with a faction that was watching.'
      ],
      hooks:[
        'PFV broadcasts a solo trial.',
        'O.M.N.I. restricts backup to force narrative.'
      ],
      resolution:[
        'Win the duel or repair failure with a public challenge or expose manipulation.'
      ],
      enemy:null, rewards:['Legendary class item on success'], heatDelta:1, capsAllowed:true },

    { id:'NULL_VAULT', name:'The Null Vault', src:'Donjon',
      visual:'The floor tears like video static. A doorframe with no door opens.',
      effect:[
        'Drawer is pulled into Morvox’s Echo Pit. Team must mount a rescue.'
      ],
      hooks:[
        'O.M.N.I. flags a Null Fragment.',
        'Acquire a Shepherd Pulse to phase in.'
      ],
      resolution:[
        'Stage 1. Retrieve Shepherd Pulse. Skill challenge DC 14.',
        'Stage 2. Shard sync DC 15. Inside, defeat a Herald (H1) or sever the Shard Choir.'
      ],
      enemy:'H1', rewards:null, heatDelta:2, capsAllowed:false },

    { id:'SHEPHERDS_MASK', name:'The Shepherd’s Mask', src:'Euryale',
      visual:'A smooth porcelain mask phases over the face then melts into tracer lines.',
      effect:['Curse. −2 on all saves. On natural 20, roll twice and keep the lower.'],
      hooks:['Voice sometimes routes through nearby speakers.','PFV healers refuse treatment without tribunal.'],
      resolution:['Defeat a Herald (H1) in single combat or bathe mask in Conclave starlight at an Envoy Spire.'],
      enemy:'H1', rewards:null, heatDelta:1, capsAllowed:true },

    { id:'REDACTION', name:'The Redaction', src:'Fates',
      visual:'Frames of your past hang in air. A black bar erases one.',
      effect:[
        'Once, erase an event in your past or a current outcome and rewrite one consequence in your favor.',
        'Choose another thread that becomes one step harder.'
      ],
      hooks:['O.M.N.I. reconstructs from surveillance gaps.','A loved one remembers both versions and has nightmares.'],
      resolution:['Accept the complication and play it out or stabilize at an Oracle node.'],
      enemy:null, rewards:null, heatDelta:1, capsAllowed:true },

    { id:'BROADCAST', name:'The Broadcast', src:'Flames',
      visual:'Holo-billboards flip to your face stamped TRAITOR or MONSTER.',
      effect:['Gain a powerful enemy who commits resources against you. Heat +2 on reveal.'],
      hooks:['Greyline assault cell raids your safehouse.','O.M.N.I. issues a sealed detention order.'],
      resolution:['Clear your name publicly or defeat the enemy live.'],
      enemy:'G1', rewards:null, heatDelta:2, capsAllowed:true },

    { id:'FRAGMENT', name:'The Fragment', src:'Fool',
      visual:'A cracked shard refracts everyone into clumsy caricatures.',
      effect:['Lose 1d4 CAP this arc. You must draw one extra plate immediately.'],
      hooks:['Conclave junior emissary tries to pocket the fragment.','Memes cause mild hostility penalties for 24h.'],
      resolution:['Redeem by a public rescue or destroy the fragment at a shard kiln.'],
      enemy:null, rewards:null, heatDelta:0, capsAllowed:true },

    { id:'CACHE', name:'The Catalyst Cache', src:'Gem',
      visual:'A carbon case phases in, humming with shardlight.',
      effect:['Gain 1d6 Catalyst Fragments and one Rare class item. Watermarked tracker included.'],
      hooks:['Greyline attempts a theft in transit.','PFV asks for one fragment donation.'],
      resolution:['Scrub watermark with Conclave key or sacrifice 1 fragment to lower heat.'],
      enemy:null, rewards:['+1d6 fragments','1 Rare class item'], heatDelta:1, capsAllowed:true },

    { id:'STATIC', name:'The Static', src:'Idiot',
      visual:'Your vision pixelates. Thoughts stutter.',
      effect:['Permanent −1d4 INT. Lose a language or technical specialty until retrained.'],
      hooks:['Old passphrases fail and strand allies.','A former student offers help for a price.'],
      resolution:['Two downtime Research actions + mnemonic imprint or attach Neural Sync with a side effect.'],
      enemy:null, rewards:null, heatDelta:0, capsAllowed:true },

    { id:'TRICKSTER', name:'The Trickster Signal', src:'Jester',
      visual:'Confetti of system alerts rains from nowhere.',
      effect:['Choose 10,000 credits or draw two additional plates. If drawn twice, a contact is an O.M.N.I. sleeper.'],
      hooks:['Funds are laundered through an enemy shell.','Sleeper reveal hits at a critical moment.'],
      resolution:['Expose laundering source or reveal the sleeper cleanly.'],
      enemy:null, rewards:['10,000 credits or 2 extra draws'], heatDelta:0, capsAllowed:true },

    { id:'HELIX_CODE', name:'The Helix Code', src:'Key',
      visual:'A living circuitry key slides into your palm and links to your kit.',
      effect:['Gain a Legendary class item with a Greyline backdoor ping. First combat use pings location.'],
      hooks:['Greyline issues an extraction contract.','PFV pleads for quarantine and offers alternative.'],
      resolution:['Purge backdoor via O.M.N.I. or Conclave, or bait Greyline and win.'],
      enemy:'G1', rewards:['Legendary class item'], heatDelta:2, capsAllowed:true },

    { id:'ECHO_OPERATIVE', name:'The Echo Operative', src:'Knight',
      visual:'A soldier steps out of your shadow with inverted colors.',
      effect:['Gain a loyal Tier 3 NPC ally that mirrors one of your tactics. If they die you gain a scar or phobia.'],
      hooks:['They may be your alt-timeline self.','O.M.N.I. tries to draft them.'],
      resolution:['Roleplay the bond. Protect or release them to their arc.'],
      enemy:null, rewards:['Ally E1'], heatDelta:0, capsAllowed:true },

    { id:'DREAM', name:'The Dream', src:'Moon',
      visual:'A shardlight crescent drips motes into your hands.',
      effect:['Gain 1d3 Resonance Point wishes. Each use adds Heat +1.'],
      hooks:['Conclave auditors observe every use.','O.M.N.I. moves to confiscate you.'],
      resolution:['RP are consumed on use. Live with the heat.'],
      enemy:null, rewards:['+1d3 RP wishes'], heatDelta:0, capsAllowed:true },

    { id:'DEFECTOR', name:'The Defector', src:'Rogue',
      visual:'Your team appears. One face shatters.',
      effect:['One ally or contact betrays you at a pivotal moment.'],
      hooks:['Breadcrumb sabotage culminates during a high-stakes op.'],
      resolution:['Confront, convert, or cut them loose. Clean resolution restores 1 rep.'],
      enemy:'B1', rewards:null, heatDelta:1, capsAllowed:true },

    { id:'COLLAPSE', name:'The Collapse', src:'Ruin',
      visual:'Apartments and accounts collapse like hollow cubes.',
      effect:['All civilian assets are seized or destroyed. Gain a one-scene Renegade surge of +1d6 to an aggressive action.'],
      hooks:['HelixDyne shell corp executed the move.','PFV relief if you do public service.'],
      resolution:['Expose the paper trail or steal your life back in a heist.'],
      enemy:null, rewards:['Renegade surge x1 scene'], heatDelta:1, capsAllowed:true },

    { id:'WRAITH', name:'The Wraith', src:'Skull',
      visual:'Skeletal silhouette with shardlight eyes. Breath frosts.',
      effect:['A relentless hunter spawns and pursues until slain, growing stronger if ignored.'],
      hooks:['It wears the face of someone the drawer failed to save.','It gains strength each night you avoid it.'],
      resolution:['Hunt and defeat it.'],
      enemy:'C1|H1', rewards:null, heatDelta:1, capsAllowed:true },

    { id:'ASCENDANT', name:'The Ascendant', src:'Star',
      visual:'A seven-point star embeds in your sternum and dims.',
      effect:['Increase one ability score by +2. For the next two encounters, once per encounter add +1d4 to any roll without SP.'],
      hooks:['Conclave offers a test.','O.M.N.I. tempts with higher clearance.'],
      resolution:['None.'],
      enemy:null, rewards:['+2 to one ability'], heatDelta:0, capsAllowed:true },

    { id:'HALO', name:'The Halo', src:'Sun',
      visual:'A rotating shard halo casts your emblem across the scene.',
      effect:['Gain an Elite or Legendary artifact. Gain +1d4 CAP for this campaign arc.'],
      hooks:['Null Silence ripple briefly disrupts enemy comms for one fight.'],
      resolution:['None.'],
      enemy:null, rewards:['Elite or Legendary artifact','+1d4 CAP'], heatDelta:1, capsAllowed:true },

    { id:'SILENCE_BLOOM', name:'The Silence Bloom', src:'Talons',
      visual:'Gear dissolves into black petals and vanishes.',
      effect:['All carried gear erased except bonded artifacts and Catalyst Fragments. Powers remain.'],
      hooks:['PFV will re-outfit you after a televised mission.','Greyline offers a predatory loan.'],
      resolution:['Regain gear via patronage, heist, or Conclave trial of merit to restore one item.'],
      enemy:null, rewards:null, heatDelta:1, capsAllowed:true },

    { id:'VIGIL', name:'The Vigil', src:'Throne',
      visual:'A city district lifts from the map and stamps into your palm.',
      effect:['Gain leadership of a district, safehouse, or O.M.N.I. post. Set one team policy when operating there.'],
      hooks:['Rivals challenge your claim.','Conclave declares it a micro-trial zone.'],
      resolution:['Maintain public trust and win a public duel or court case to keep it.'],
      enemy:null, rewards:['Territory with policy perk'], heatDelta:1, capsAllowed:true },

    { id:'ORACLE', name:'The Oracle', src:'Vizier',
      visual:'A sphere of light reveals one actionable truth.',
      effect:['Ask the GM one campaign question. The answer is specific and actionable.'],
      hooks:['The truth angers someone who needed it buried.'],
      resolution:['None.'],
      enemy:null, rewards:['One true answer'], heatDelta:0, capsAllowed:true },

    { id:'SHEPHERDS_THREAD', name:'The Shepherd’s Thread', src:'Void',
      visual:'A black filament tethers your chest to darkness.',
      effect:[
        'Your soul is bound to Morvox. You cannot benefit from inspires.',
        'Once per encounter WIS save DC 15 or lose your action to "listen." On failure Morvox speaks one sentence through you.'
      ],
      hooks:['O.M.N.I. seeks to weaponize your tether.','Your voice echoes from radios, mirrors, and glass.'],
      resolution:['Enter the Null Vault and sever at the Shard Choir or perform a Conclave Rite with starlight, two fragments, and a personal sacrifice.'],
      enemy:'H1', rewards:null, heatDelta:2, capsAllowed:false },
  ];

  const STATS = {
    H1: `H1. Herald of Morvox, Echo Warden
Tier 3 elite controller
HP 58  |  TC 16  |  Speed 30 ft  |  SP 7
Saves WIS +3, DEX +2, CON +2
Traits: Silence Bloom aura 10 ft; Fragment Glide
Actions:
• Echo Lash (1 SP): +6 to hit, 2d8 psychic. WIS DC 15 or Disoriented 1 round.
• Broadcast Scramble (2 SP): 20 ft radius. Foes lose reactions and have disadvantage on next attack. WIS DC 15 halves.
• Shepard’s Mark (3 SP): If marked target attacks Herald they are stunned; if they attack others they deal +1d6 that turn. WIS DC 16 negates.
Reaction:
• Memory Tear: When crit, attacker WIS DC 15 or stunned 1 round.`,
    G1: `G1. Greyline Assault Cell
Tier 3 fireteam | HP 64 | TC 15 | SP 6 | Speed 30 ft
Saves DEX +3, CON +2
Traits: Coordinated Fire; Kill-Switch Smoke 1/enc
Actions:
• Suppression Volley (1 SP): 15 ft cone. DEX DC 14 or 2d6 ballistic and lose reaction.
• Breach Charge (2 SP): Destroy cover. Within 10 ft DEX DC 14 or 2d8 force, knocked prone.
• Netline Taser (2 SP): 30 ft. On hit Restrained until end of next turn.
Reaction: Drag Out.`,
    C1: `C1. Conclave Trial Agent, Blade of Accession
Tier 4 duelist | HP 72 | TC 17 | Speed 35 ft (hover 10) | SP 8
Traits: Astral Parry; Starlit Code
Actions:
• Prism Edge (1 SP): +7 to hit, 2d10 radiant; WIS DC 15 or disadvantage on next attack.
• Accession Step (2 SP): Teleport 20 ft, free Prism Edge at +2 to hit.
• Starlight Decree (3 SP): 15 ft pulse. WIS DC 16 or lose reactions and movement.`,
    E1: `E1. Echo Operative (Ally)
Tier 3 | HP 50 | TC 15 | SP 6
Perk: Copies one signature tactic
Actions:
• Covering Fire (1 SP): Ally +2 TC, 10 ft reposition.
• Drive Forward (2 SP): You and an ally move 20 ft; the ally has advantage on next attack.
• Last Stand (3 SP): Stay at 1 HP and grant allies within 10 ft +1d6 temp HP.`,
    B1: `B1. Betrayer Template
Add to an existing sheet on reveal
+ Hidden Blade: once/scene +2d6 if target surprised
+ False Flag (1 SP): Nearby ally WIS DC 14 or loses reaction
Weakness: Disadvantage on Deception vs party after reveal.`,
  };

  const NPCS = {
    H1: {
      name: 'Herald of Morvox, Echo Warden',
      hp: 58,
      sp: 7,
      actions: [
        { name: 'Echo Lash', attack: 6, damage: '2d8', sp: 1, effect: 'WIS DC 15 or Disoriented 1 round.' },
        { name: 'Broadcast Scramble', sp: 2, effect: 'Foes lose reactions and have disadvantage on next attack. WIS DC 15 halves.' },
        { name: 'Shepard\u2019s Mark', sp: 3, effect: 'If marked target attacks Herald they are stunned; if they attack others they deal +1d6 that turn. WIS DC 16 negates.' }
      ]
    },
    G1: {
      name: 'Greyline Assault Cell',
      hp: 64,
      sp: 6,
      actions: [
        { name: 'Suppression Volley', damage: '2d6', sp: 1, effect: 'DEX DC 14 or lose reaction.' },
        { name: 'Breach Charge', damage: '2d8', sp: 2, effect: 'DEX DC 14 or knocked prone.' },
        { name: 'Netline Taser', sp: 2, effect: 'On hit Restrained until end of next turn.' }
      ]
    },
    C1: {
      name: 'Conclave Trial Agent, Blade of Accession',
      hp: 72,
      sp: 8,
      actions: [
        { name: 'Prism Edge', attack: 7, damage: '2d10', sp: 1, effect: 'WIS DC 15 or disadvantage on next attack.' },
        { name: 'Accession Step', attack: 9, damage: '2d10', sp: 2, effect: 'Teleport 20 ft, free Prism Edge at +2 to hit.' },
        { name: 'Starlight Decree', sp: 3, effect: '15 ft pulse. WIS DC 16 or lose reactions and movement.' }
      ]
    },
    E1: {
      name: 'Echo Operative',
      hp: 50,
      sp: 6,
      actions: [
        { name: 'Covering Fire', sp: 1, effect: 'Ally +2 TC, 10 ft reposition.' },
        { name: 'Drive Forward', sp: 2, effect: 'You and an ally move 20 ft; the ally has advantage on next attack.' },
        { name: 'Last Stand', sp: 3, effect: 'Stay at 1 HP and grant allies within 10 ft +1d6 temp HP.' }
      ]
    },
    B1: {
      name: 'Betrayer Template',
      hp: 0,
      sp: 0,
      actions: [
        { name: 'Hidden Blade', damage: '2d6', effect: 'Once/scene +2d6 if target surprised.' },
        { name: 'False Flag', sp: 1, effect: 'Nearby ally WIS DC 14 or loses reaction.' }
      ]
    }
  };


  function rnd(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
  function roll(expr){
    const m = /^([0-9]+)d([0-9]+)$/i.exec(expr.trim());
    if(!m) return 0;
    const cnt = parseInt(m[1],10); const sides = parseInt(m[2],10);
    let total = 0; for(let i=0;i<cnt;i++) total += Math.floor(Math.random()*sides)+1;
    return total;
  }

  function init(){
    wireUI(); load(); buildFreshDeckIfNeeded(); render();
  }

  function wireUI(){
    if(ui.openBtn){
        ui.openBtn.addEventListener('click', ()=> ui.root.classList.remove('hidden'));
    }
    ui.closeBtn.addEventListener('click', ()=> ui.root.classList.add('hidden'));

    ui.capCancelBtn.addEventListener('click', capCancel);
    ui.completeBtn.addEventListener('click', completePlate);

    ui.showAllBtn.addEventListener('click', ()=>{ renderCardList(); ui.cardList.classList.remove('hidden'); });
    ui.cardListClose.addEventListener('click', ()=> ui.cardList.classList.add('hidden'));

    ui.tabBtns.forEach(btn=> btn.addEventListener('click', ()=>{
        ui.tabBtns.forEach(b=> b.classList.remove('active'));
        btn.classList.add('active');
        const t = btn.dataset.tab;
        ui.tabPanes.effect.classList.toggle('active', t==='effect');
        ui.tabPanes.hooks.classList.toggle('active', t==='hooks');
        ui.tabPanes.resolution.classList.toggle('active', t==='resolution');
        ui.tabPanes.enemy.classList.toggle('active', t==='enemy');
        ui.tabPanes.rewards.classList.toggle('active', t==='rewards');
    }));

    ui.statSelect.addEventListener('change', ()=>{
        const key = ui.statSelect.value; ui.statView.textContent = STATS[key] || '';
        ui.openNPCBtn.disabled = !NPCS[key];
    });
    ui.openNPCBtn.addEventListener('click', ()=> openNPC(ui.statSelect.value));
    ui.npcClose.addEventListener('click', ()=> ui.npcModal.classList.add('hidden'));
  }

  function buildFreshDeckIfNeeded(force=false){
  const now = Date.now();
  const reshuffle = true;
  if (force || !state.lastReset || (reshuffle && now - state.lastReset > 24*60*60*1000)) {
    state.deck = PLATES.map(p=>p.id);
    state.archive = [];
    state.activeCard = null;
    state.drawnCount = 0;
    state.lastReset = now;
    persist();
  } else if (!Array.isArray(state.deck) || state.deck.length===0) {
    state.deck = PLATES.map(p=>p.id).filter(id => !state.archive.includes(id));
  }
}

function capCancel(){
  if (!state.activeCard) return;
  logLine(`CAP used. Canceled plate: ${state.activeCard.name}`);
  logDM(`CAP canceled: ${state.activeCard.name}`);
  state.activeCard = null;
  ui.capCancelBtn.disabled = true;
  renderPlate(); persist();
}
function completePlate(){
  if (!state.activeCard) return;
  logDM(`Resolved plate: ${state.activeCard.name}`);
  state.archive.push(state.activeCard.id);
  markResolved(state.activeCard);
  state.activeCard = null;
  persist();
  render();
}



  function playDrawAnimation(){
    return new Promise(res=>{
      ui.flash.classList.add('active');
      ui.flash.addEventListener('animationend', ()=>{
        ui.flash.classList.remove('active');
        res();
      }, { once:true });
    });
  }

  function renderPlate(){
    const c = state.activeCard;
    ui.cardName.textContent = c ? `${c.name} (${c.src})` : 'No plate drawn';
    ui.cardVisual.textContent = c ? c.visual : 'Draw to reveal a fate.';
    ui.tabPanes.effect.innerHTML = c ? bullets(c.effect) : '';
    ui.tabPanes.hooks.innerHTML = c ? bullets(c.hooks) : '';
    ui.tabPanes.resolution.innerHTML = c ? bullets(c.resolution) : '';
    ui.tabPanes.rewards.innerHTML = c && c.rewards ? bullets(c.rewards) : '<em>None specified</em>';
    if (c && c.enemy){
      const keys = c.enemy.split('|');
      ui.tabPanes.enemy.innerHTML = keys.map(k => `<strong>${k}</strong><pre class="cc-code">${escapeHtml(STATS[k]||'Unknown')}</pre>`).join('');
    } else ui.tabPanes.enemy.innerHTML = '<em>None</em>';
    renderActions();
  }

  function renderActions(){
  const active = !!state.activeCard;
  ui.completeBtn.disabled = !active;
  ui.capCancelBtn.disabled = !(active && state.activeCard.capsAllowed);
}

  function logDraw(c){
    const li = document.createElement('li');
    const time = new Date(c.drawnAt).toLocaleString();
    li.dataset.key = `${c.id}_${c.drawnAt}`;
    li.innerHTML = `<strong>${c.name}</strong> <span class="muted">(${time})</span>`;
    ui.log.append(li);
  }
  function markResolved(c){
    const li = ui.log.querySelector(`li[data-key="${c.id}_${c.drawnAt}"]`);
    if (li){
      li.classList.add('muted');
      li.append(' — resolved');
    }
  }
  function logLine(t){
    const li = document.createElement('li'); li.textContent = t; ui.log.append(li);
  }
  function bullets(arr){
    if (!arr || !arr.length) return '<em>None</em>';
    return `<ul>${arr.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul>`;
  }

  function renderCardList(){
    ui.cardListOl.innerHTML = '';
    PLATES.forEach(p=>{
      const li = document.createElement('li');
      li.innerHTML = `<strong>${p.name}</strong><p class="muted">${escapeHtml(p.visual)}</p><div><strong>Effect:</strong>${bullets(p.effect)}</div><div><strong>Hooks:</strong>${bullets(p.hooks)}</div><div><strong>Resolution:</strong>${bullets(p.resolution)}</div>`;
      ui.cardListOl.append(li);
    });
  }

  function openNPC(id){
    const npc = NPCS[id]; if(!npc) return;
    ui.npcName.textContent = npc.name;
    ui.npcHP.max = npc.hp; ui.npcHP.value = npc.hp;
    ui.npcSP.max = npc.sp; ui.npcSP.value = npc.sp;
    ui.npcActions.innerHTML = '';
    ui.npcLog.textContent = '';
    npc.actions.forEach(act=>{
      const btn = document.createElement('button');
      btn.textContent = act.name;
      btn.className = 'cc-btn';
      btn.addEventListener('click', ()=> handleNpcAction(act));
      ui.npcActions.append(btn);
    });
    ui.npcModal.classList.remove('hidden');
  }

  function handleNpcAction(action){
    const parts = [];
    if(typeof action.attack === 'number'){
      const d20 = roll('1d20');
      const total = d20 + action.attack;
      parts.push(`attack ${total} (d20 ${d20}+${action.attack})`);
    }
    if(action.damage){
      const dmg = roll(action.damage);
      parts.push(`damage ${dmg}`);
    }
    if(action.effect) parts.push(action.effect);
    if(action.sp){
      ui.npcSP.value = Math.max(0, (Number(ui.npcSP.value)||0) - action.sp);
    }
    ui.npcLog.textContent = `${action.name}: ${parts.join('; ')}\n` + ui.npcLog.textContent;
  }

  
function render(){
  renderPlate();
}

async function persist(){
  const payload = { state, savedAt: Date.now() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  if (typeof fetch === 'function') {
    try {
      await fetch(CLOUD_STATE_URL, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch(e){ console.error('Cloud save failed', e); }
  }
}

async function load(){
  if (typeof fetch === 'function') {
    try {
      const res = await fetch(CLOUD_STATE_URL);
      if (res.ok) {
        const data = await res.json();
        if (data && data.state) { Object.assign(state, data.state); return; }
      }
    } catch(e){}
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY); if (!raw) return;
    const data = JSON.parse(raw); if (data && data.state) Object.assign(state, data.state);
  } catch {}
}

function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m])); }

async function acquireCloudLock(id){
  if (typeof fetch !== 'function') return;
  while(true){
    try {
      const res = await fetch(CLOUD_LOCK_URL, { headers: { 'X-Firebase-ETag': 'true' } });
      const etag = res.headers.get('etag');
      const val = await res.json();
      if (val === null || val === id){
        const putRes = await fetch(CLOUD_LOCK_URL, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'If-Match': etag },
          body: JSON.stringify(id)
        });
        if (putRes.status === 412) continue;
        if (putRes.ok) return;
      }
    } catch (e) {}
    await new Promise(r=>setTimeout(r,200));
  }
}

async function releaseCloudLock(id){
  if (typeof fetch !== 'function') return;
  try {
    const res = await fetch(CLOUD_LOCK_URL, { headers: { 'X-Firebase-ETag': 'true' } });
    const etag = res.headers.get('etag');
    const val = await res.json();
    if (val === id){
      await fetch(CLOUD_LOCK_URL, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'If-Match': etag },
        body: 'null'
      });
    }
  } catch (e) {}
}

async function drawCardsSimple(count){
    if (localStorage.getItem(DM_SHARD_KEY) !== '1') {
      toast('The Shards reject your call');
      logDM('Blocked draw: shards disabled');
      return [];
    }
    if (state.activeCard) return [state.activeCard];
    const lockId = Date.now().toString(36) + Math.random().toString(36).slice(2);
    while(localStorage.getItem(DECK_LOCK_KEY) && localStorage.getItem(DECK_LOCK_KEY) !== lockId){
      await new Promise(r=>setTimeout(r,50));
    }
    localStorage.setItem(DECK_LOCK_KEY, lockId);
    await acquireCloudLock(lockId);
    try {
      await load();
      buildFreshDeckIfNeeded();
      if (!state.deck.length) return [];
      const results = [];
      for(let i=0;i<count && state.deck.length;i++){
        const id = state.deck.splice(Math.floor(Math.random() * state.deck.length), 1)[0];
        const plate = PLATES.find(p => p.id === id);
        results.push(plate);
        state.activeCard = { ...plate, drawnAt: Date.now() };
        state.drawnCount++;
        logDraw(state.activeCard);
        logDM(`Draw: ${plate.name}`);
      }
      await persist();
      await playDrawAnimation();
      renderPlate();
      return results;
    } finally {
      await releaseCloudLock(lockId);
      if(localStorage.getItem(DECK_LOCK_KEY) === lockId) localStorage.removeItem(DECK_LOCK_KEY);
    }
}

  window.CCShard = {
    open: ()=> ui.root.classList.remove('hidden'),
    plates: PLATES,
    stats: STATS,
    draw: drawCardsSimple,
    getActiveCard: ()=> state.activeCard,
    getNPC: id => NPCS[id],
    resolveActive: completePlate
  };

  async function init(){
    wireUI();
    await load();
    buildFreshDeckIfNeeded();
    render();
  }

  init();
})();
