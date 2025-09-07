const DM_PIN = '1231';
const RECOVERY_ANSWER = 'August 29 2022';

const dmBtn = document.getElementById('dm-login');
const dmLink = document.getElementById('dm-login-link');
const dmToast = document.getElementById('dm-toast');
const baseToast = document.getElementById('toast');
const shardCard = document.getElementById('ccShard-player');
const shardDraw = document.getElementById('ccShard-player-draw');
const shardCount = document.getElementById('ccShard-player-count');
const shardResults = document.getElementById('ccShard-player-results');
const shardRevealName = document.getElementById('shard-reveal-name');
const shardRevealVisual = document.getElementById('shard-reveal-visual');
const shardRevealBtn = document.getElementById('shard-reveal-next');

const resolveTitle = document.getElementById('shard-resolve-title');
const resolveCard = document.getElementById('shard-resolve-card');
const resolveNPCs = document.getElementById('shard-resolve-npcs');
const resolveTips = document.getElementById('shard-resolve-tips');
const resolveAddBtn = document.getElementById('shard-resolve-addnpc');
const resolveCompleteBtn = document.getElementById('shard-resolve-complete');
const resolveResetBtn = document.getElementById('shard-resolve-reset');
const resetConfirmBtn = document.getElementById('shard-reset-confirm');
const shardToggle = document.getElementById('dm-shard-toggle');
const resolveTabBtns = document.querySelectorAll('#modal-shard-resolve .cc-tabs__nav button');

const SHARD_KEY = 'ccShardEnabled';
const NOTIFY_KEY = 'dmNotifications';
const DRAW_COUNT_KEY = 'ccShardPlayerDraws';
const DRAW_LOCK_KEY = 'ccShardPlayerLocked';

function setResolveTab(tab){
  resolveTabBtns.forEach(btn=>{
    btn.classList.toggle('active', btn.dataset.tab===tab);
  });
  resolveCard.classList.toggle('active', tab==='card');
  resolveNPCs.classList.toggle('active', tab==='npcs');
  resolveTips.classList.toggle('active', tab==='tips');
}
resolveTabBtns.forEach(btn=> btn.addEventListener('click', ()=> setResolveTab(btn.dataset.tab)));
if(shardToggle){
  shardToggle.addEventListener('change', e=>{
    if(e.target.checked) {
      localStorage.setItem(SHARD_KEY,'1');
    } else {
      localStorage.removeItem(SHARD_KEY);
      if(shardCard) shardCard.hidden = true;
    }
    setShardCardVisibility(true);
    window.dispatchEvent(new StorageEvent('storage',{ key: SHARD_KEY }));
    if(!e.target.checked) baseMessage('Shards disabled');
  });
}

if(resolveResetBtn){
  resolveResetBtn.addEventListener('click', ()=>{
    window.dispatchEvent(new CustomEvent('dm:showModal',{ detail:'modal-shard-reset' }));
  });
}

if(resetConfirmBtn){
  resetConfirmBtn.addEventListener('click', ()=>{
    localStorage.removeItem(DRAW_COUNT_KEY);
    localStorage.removeItem(DRAW_LOCK_KEY);
    const btn = document.getElementById('ccShard-player-draw');
    if(btn) btn.disabled = false;
    if(window.CCShard && typeof window.CCShard.resetDeck === 'function'){
      window.CCShard.resetDeck();
    }
    logDMAction('Shard deck reset');
    baseMessage('Shard deck reset');
    window.dispatchEvent(new CustomEvent('dm:hideModal',{ detail:'modal-shard-reset' }));
  });
}

function setShardCardVisibility(showToast=false){
  if(shardCard){
    const enabled = localStorage.getItem(SHARD_KEY) === '1';
    shardCard.hidden = !enabled;
    if(enabled && showToast){
      baseMessage("The Shard's have shown them selves to you.");
      shardCard.scrollIntoView({ behavior: 'smooth' });
    }
  }
}

function baseMessage(msg){
  baseToast.textContent = msg;
  baseToast.className = 'toast show';
  setTimeout(()=> baseToast.classList.remove('show'), 3000);
}

async function revealShards(cards){
  if(!shardRevealName || !shardRevealVisual || !shardRevealBtn) return;
  for(let i=0;i<cards.length;i++){
    const card = cards[i];
    shardRevealName.textContent = card.name;
    shardRevealVisual.textContent = card.visual || '';
    shardRevealBtn.textContent = i < cards.length - 1 ? 'Next' : 'Close';
    await new Promise(resolve=>{
      shardRevealBtn.onclick = () => {
        window.dispatchEvent(new CustomEvent('dm:hideModal',{ detail:'modal-shard-reveal' }));
        resolve();
      };
      window.dispatchEvent(new CustomEvent('dm:showModal',{ detail:'modal-shard-reveal' }));
    });
  }
}

function showDmToast(html){
  dmToast.innerHTML = `${html}<button id="dm-toast-close" class="btn-sm">Close</button>`;
  dmToast.classList.add('show');
  if(dmBtn) dmBtn.hidden = true;
  if(dmLink) dmLink.hidden = true;
  document.getElementById('dm-toast-close').addEventListener('click', hideDmToast);
}
function hideDmToast(){
  dmToast.classList.remove('show');
  updateDmButton();
}

function updateDmButton(){
  const loggedIn = sessionStorage.getItem('dmLoggedIn') === '1';
  if(dmBtn) dmBtn.hidden = !loggedIn;
  if(dmLink) dmLink.hidden = loggedIn;
}

function logDMAction(text){
  const arr = JSON.parse(localStorage.getItem(NOTIFY_KEY) || '[]');
  arr.push({ time: Date.now(), text });
  localStorage.setItem(NOTIFY_KEY, JSON.stringify(arr));
}
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m]));
}
window.logDMAction = logDMAction;

function openLogin(){
  openDmTools();
}

function openDmTools(){
  if(!sessionStorage.getItem('dmLoggedIn')){
    showDmToast(`
      <input id="dm-pin" type="password" inputmode="numeric" maxlength="4" pattern="\\d{4}" placeholder="PIN" />
      <div class="inline">
        <button id="dm-login-btn" class="btn-sm">Log In</button>
      </div>
      <button id="dm-recover-btn" class="btn-sm">Recover PIN</button>
    `);
    document.getElementById('dm-login-btn').addEventListener('click', handleLogin);
    document.getElementById('dm-recover-btn').addEventListener('click', openRecovery);
    return;
  }
  const notes = JSON.parse(localStorage.getItem(NOTIFY_KEY) || '[]');
  showDmToast(`
    <div class="inline">
      <button id="ccShard-open" class="btn-sm">Shard of Many Fates</button>
      <button id="dm-view-notes" class="btn-sm">Notifications (${notes.length})</button>
      <button id="dm-logout-btn" class="btn-sm">Log Out</button>
    </div>
  `);
  const shardBtn = document.getElementById('ccShard-open');
  if(shardBtn){
    shardBtn.addEventListener('click', openShardResolver);
  }
  document.getElementById('dm-view-notes').addEventListener('click', openNotifications);
  document.getElementById('dm-logout-btn').addEventListener('click', handleLogout);
}

function openNotifications(){
  const notes = JSON.parse(localStorage.getItem(NOTIFY_KEY) || '[]');
  showDmToast(`
    <h3>Notifications</h3>
    <ol class="cc-list">${notes.map(n=>`<li><span class="muted">${new Date(n.time).toLocaleString()}</span> ${escapeHtml(n.text)}</li>`).reverse().join('')}</ol>
    <div class="inline">
      <button id="dm-clear-notes" class="btn-sm">Clear</button>
      <button id="dm-back-btn" class="btn-sm">Back</button>
    </div>
  `);
  document.getElementById('dm-clear-notes').addEventListener('click', ()=>{
    localStorage.removeItem(NOTIFY_KEY);
    openNotifications();
  });
  document.getElementById('dm-back-btn').addEventListener('click', openDmTools);
}

function openShardResolver(){
  const card = window.CCShard && typeof window.CCShard.getActiveCard === 'function'
    ? window.CCShard.getActiveCard()
    : null;
  if(shardToggle){
    shardToggle.checked = localStorage.getItem(SHARD_KEY) === '1';
  }
  if(card){
    resolveTitle.textContent = card.name;
    const eff = card.effect ? card.effect.map(r=>`<li>${escapeHtml(r)}</li>`).join('') : '<li>None</li>';
    const hooks = card.hooks ? card.hooks.map(r=>`<li>${escapeHtml(r)}</li>`).join('') : '<li>None</li>';
    const res = card.resolution ? card.resolution.map(r=>`<li>${escapeHtml(r)}</li>`).join('') : '<li>None</li>';
    resolveCard.innerHTML = `<h4>Effect</h4><ul>${eff}</ul><h4>Hooks</h4><ul>${hooks}</ul><h4>Resolution</h4><ul>${res}</ul>`;
    const npcIds = [];
    if(card.enemy){
      card.enemy.split('|').forEach(id=> npcIds.push({ id:id.trim(), type:'enemy' }));
    }
    const ally = card.rewards && card.rewards.find(r=>/ally\s+(\w+)/i.test(r));
    if(ally){
      const m = ally.match(/ally\s+(\w+)/i);
      resolveAddBtn.dataset.npcId = m ? m[1] : '';
      resolveAddBtn.hidden = !resolveAddBtn.dataset.npcId;
      if(resolveAddBtn.dataset.npcId){
        npcIds.push({ id: resolveAddBtn.dataset.npcId, type:'ally' });
      }
    } else {
      resolveAddBtn.hidden = true;
    }
    if(npcIds.length){
      resolveNPCs.innerHTML = `<ul class="cc-list">${npcIds.map(n=>{
        const npc = window.CCShard && window.CCShard.getNPC ? window.CCShard.getNPC(n.id) : null;
        const name = npc ? npc.name : n.id;
        const label = n.type==='ally'?` (Ally)`:'';
        const stats = npc ? ` <span class="muted">(HP ${npc.hp}, SP ${npc.sp})</span>` : '';
        return `<li><button class="btn-sm" data-npc="${n.id}">${escapeHtml(name+label)}</button>${stats}</li>`;
      }).join('')}</ul>`;
    } else {
      resolveNPCs.innerHTML = '<p><em>No NPCs</em></p>';
    }
    resolveTips.innerHTML = '<p>Work with your players to weave shard effects into the story.</p>';
    resolveCompleteBtn.disabled = false;
  } else {
    resolveTitle.textContent = 'Resolve Shard';
    resolveCard.innerHTML = '<p>No active shard.</p>';
    resolveNPCs.innerHTML = '<p><em>No NPCs</em></p>';
    resolveTips.innerHTML = '';
    resolveAddBtn.hidden = true;
    resolveCompleteBtn.disabled = true;
  }
  setResolveTab('card');
  document.querySelectorAll('#shard-resolve-npcs button[data-npc]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.dataset.npc;
      if(window.CCShard && typeof window.CCShard.openNPC === 'function'){
        window.CCShard.openNPC(id);
      }
    });
  });
  window.dispatchEvent(new CustomEvent('dm:showModal',{ detail: 'modal-shard-resolve' }));
}

function handleLogin(){
  const val = document.getElementById('dm-pin').value.trim();
  if(val === DM_PIN){
    sessionStorage.setItem('dmLoggedIn', '1');
    updateDmButton();
    openDmTools();
    baseMessage('Logged in');
  } else {
    baseMessage('Wrong PIN');
  }
}

function handleLogout(){
  sessionStorage.removeItem('dmLoggedIn');
  hideDmToast();
  baseMessage('Logged out');
}

function openRecovery(){
  showDmToast(`
    <label for="dm-answer">Your First Date Anniversary</label>
    <input id="dm-answer" type="text" placeholder="Answer" />
    <div class="inline">
      <button id="dm-answer-btn" class="btn-sm">Submit</button>
    </div>
  `);
  document.getElementById('dm-answer-btn').addEventListener('click', handleRecovery);
}

function handleRecovery(){
  const ans = document.getElementById('dm-answer').value.trim();
  if(ans === RECOVERY_ANSWER){
    hideDmToast();
    baseMessage('PIN: ' + DM_PIN);
  } else {
    baseMessage('Incorrect');
  }
}

if(dmBtn){
  dmBtn.addEventListener('click', openLogin);
}
if(dmLink){
  dmLink.addEventListener('click', openLogin);
}
updateDmButton();

setShardCardVisibility();
window.addEventListener('storage', e=>{
  if(e.key === SHARD_KEY) setShardCardVisibility(true);
});

if(shardDraw){
  if(localStorage.getItem(DRAW_LOCK_KEY) === '1') shardDraw.disabled = true;
  shardDraw.addEventListener('click', async ()=>{
    if(localStorage.getItem(DRAW_LOCK_KEY) === '1'){
      baseMessage('Shard draws exhausted');
      return;
    }
    if(!confirm("Are you sure you wish to draw Shard's?")) return;
    if(!confirm('This cannot be undone, are you sure?')) return;
    const count = Math.max(1, parseInt(shardCount.value,10)||1);
    const cards = window.CCShard && typeof window.CCShard.draw === 'function'
      ? await window.CCShard.draw(count)
      : [];
    if(cards.length){
      shardResults.innerHTML = cards.map(c=>`<li>${c.name}</li>`).join('');
      await revealShards(cards);
      const draws = parseInt(localStorage.getItem(DRAW_COUNT_KEY) || '0',10) + 1;
      localStorage.setItem(DRAW_COUNT_KEY, draws.toString());
      if(draws >= 2){
        localStorage.setItem(DRAW_LOCK_KEY, '1');
        shardDraw.disabled = true;
        baseMessage('Shard draws exhausted');
        logDMAction('Player exhausted shard draws');
      }
    }
  });
}

if(resolveAddBtn){
  resolveAddBtn.addEventListener('click', ()=>{
    const id = resolveAddBtn.dataset.npcId;
    if(id){
      window.dispatchEvent(new CustomEvent('dm:addNpc',{ detail:{ id }}));
    }
    window.dispatchEvent(new CustomEvent('dm:hideModal',{ detail:'modal-shard-resolve' }));
  });
}
if(resolveCompleteBtn){
  resolveCompleteBtn.addEventListener('click', ()=>{
    if(window.CCShard && typeof window.CCShard.resolveActive === 'function'){
      window.CCShard.resolveActive();
      baseMessage('Shard resolved');
    }
    window.dispatchEvent(new CustomEvent('dm:hideModal',{ detail:'modal-shard-resolve' }));
  });
}
