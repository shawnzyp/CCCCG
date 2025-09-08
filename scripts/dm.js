const DM_PIN = '1231';
const RECOVERY_ANSWER = 'August 29 2022';

const dmBtn = document.getElementById('dm-login');
const dmLink = document.getElementById('dm-login-link');
const dmToast = document.getElementById('dm-toast');
const baseToast = document.getElementById('toast');
const shardCard = document.getElementById('ccShard-player');

const resolveTitle = document.getElementById('shard-resolve-title');
const resolveCard = document.getElementById('shard-resolve-card');
const resolveNPCs = document.getElementById('shard-resolve-npcs');
const resolveTips = document.getElementById('shard-resolve-tips');
const resolveCompleteBtn = document.getElementById('shard-resolve-complete');
const resolveResetBtn = document.getElementById('shard-resolve-reset');
const resetConfirmBtn = document.getElementById('shard-reset-confirm');
const shardToggle = document.getElementById('dm-shard-toggle');
const shardToggleLabel = document.getElementById('dm-shard-label');
const resolveTabBtns = document.querySelectorAll('#modal-shard-resolve .cc-tabs__nav button');

const SHARD_KEY = 'ccShardEnabled';
const NOTIFY_KEY = 'dmNotifications';
const DRAW_COUNT_KEY = 'ccShardPlayerDraws';
const DRAW_LOCK_KEY = 'ccShardPlayerLocked';
const CLOUD_SHARD_URL = 'https://ccccg-7d6b6-default-rtdb.firebaseio.com/shardEnabled.json';

// Shards default to off until explicitly enabled by the DM
localStorage.removeItem(SHARD_KEY);
if(shardToggle) shardToggle.checked = false;
if(shardToggleLabel) shardToggleLabel.textContent = 'Off';
setShardCardVisibility();

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
  shardToggle.addEventListener('change', async e=>{
    if(e.target.checked) {
      localStorage.setItem(SHARD_KEY,'1');
    } else {
      localStorage.removeItem(SHARD_KEY);
      if(shardCard) shardCard.hidden = true;
    }
    if(shardToggleLabel) shardToggleLabel.textContent = e.target.checked ? 'On' : 'Off';
    setShardCardVisibility(true);
    try {
      await fetch(CLOUD_SHARD_URL, { method:'PUT', headers:{'Content-Type':'application/json'}, body: e.target.checked ? '1' : '0' });
    } catch(err) {}
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
    shardCard.setAttribute('aria-hidden', String(!enabled));
    if(enabled && showToast){
      baseMessage('The Shards reveal themselves to you.');
      shardCard.scrollIntoView({ behavior: 'smooth' });
    } else if(!enabled){
      const results = document.getElementById('ccShard-player-results');
      if(results) results.innerHTML = '';
    }
  }
}

async function initShardSync(){
  try {
    const res = await fetch(CLOUD_SHARD_URL);
    const val = await res.json();
    const enabled = val === '1' || val === 1;
    if(enabled) {
      localStorage.setItem(SHARD_KEY,'1');
    } else {
      localStorage.removeItem(SHARD_KEY);
    }
    if(shardToggle) shardToggle.checked = enabled;
    if(shardToggleLabel) shardToggleLabel.textContent = enabled ? 'On' : 'Off';
  } catch(e) {}
  setShardCardVisibility();
  if(typeof EventSource !== 'undefined'){
    try {
      const src = new EventSource(CLOUD_SHARD_URL);
      src.addEventListener('put', ev=>{
        try {
          const data = JSON.parse(ev.data);
          if('data' in data){
            const enabled = data.data === '1' || data.data === 1;
            if(enabled){
              localStorage.setItem(SHARD_KEY,'1');
            } else {
              localStorage.removeItem(SHARD_KEY);
            }
            if(shardToggle) shardToggle.checked = enabled;
            if(shardToggleLabel) shardToggleLabel.textContent = enabled ? 'On' : 'Off';
            setShardCardVisibility(true);
            window.dispatchEvent(new StorageEvent('storage',{ key: SHARD_KEY }));
          }
        } catch(err){}
      });
    } catch(err){}
  }
}

function baseMessage(msg){
  baseToast.textContent = msg;
  baseToast.className = 'toast show';
  setTimeout(()=> baseToast.classList.remove('show'), 3000);
}


function showDmToast(html){
  dmToast.innerHTML = html;
  if(!dmToast.querySelector('#dm-toast-close')){
    const closeBtn = document.createElement('button');
    closeBtn.id = 'dm-toast-close';
    closeBtn.className = 'btn-sm';
    closeBtn.textContent = 'Close';
    dmToast.appendChild(closeBtn);
  }
  dmToast.hidden = false;
  dmToast.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => dmToast.classList.add('show'));
  if(dmLink) dmLink.hidden = true;
  dmToast.querySelector('#dm-toast-close').addEventListener('click', hideDmToast);
}
function hideDmToast(){
  dmToast.classList.remove('show');
  dmToast.addEventListener('transitionend', () => {
    dmToast.hidden = true;
    dmToast.setAttribute('aria-hidden', 'true');
  }, { once: true });
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

function renderLoginForm(){
  showDmToast(`
      <input id="dm-pin" type="password" inputmode="numeric" maxlength="4" pattern="\\d{4}" placeholder="PIN" />
      <div class="dm-toast-buttons">
        <button id="dm-login-btn" class="btn-sm">Log In</button>
        <button id="dm-recover-btn" class="btn-sm">Recover PIN</button>
        <button id="dm-toast-close" class="btn-sm">Close</button>
      </div>
  `);
  document.getElementById('dm-login-btn').addEventListener('click', handleLogin);
  document.getElementById('dm-recover-btn').addEventListener('click', openRecovery);
}

function openLogin(e){
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  renderLoginForm();
}

function toggleDmTools(e){
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  if(dmToast.classList.contains('show')){
    hideDmToast();
  } else {
    openDmTools();
  }
}

function openDmTools(){
  if(!sessionStorage.getItem('dmLoggedIn')){
    openLogin();
    return;
  }
  const notes = JSON.parse(localStorage.getItem(NOTIFY_KEY) || '[]');
  showDmToast(`
    <div class="dm-toast-buttons dm-tools-menu">
      <button id="ccShard-open" class="btn-sm">The Shards of Many Fates</button>
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
  hideDmToast();
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
      const id = m ? m[1] : '';
      if(id){
        npcIds.push({ id, type:'ally' });
      }
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
    hideDmToast();
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
    <div class="dm-toast-buttons">
      <button id="dm-answer-btn" class="btn-sm">Submit</button>
      <button id="dm-back-btn" class="btn-sm">Back</button>
      <button id="dm-toast-close" class="btn-sm">Close</button>
    </div>
  `);
  document.getElementById('dm-answer-btn').addEventListener('click', handleRecovery);
  document.getElementById('dm-back-btn').addEventListener('click', renderLoginForm);
}

function handleRecovery(){
  const ans = document.getElementById('dm-answer').value.trim();
  if(ans === RECOVERY_ANSWER){
    baseMessage('PIN: ' + DM_PIN);
  } else {
    baseMessage('Incorrect');
  }
  renderLoginForm();
}

if(dmBtn){
  dmBtn.addEventListener('click', e=>{
    if(e){
      e.preventDefault();
      e.stopPropagation();
    }
    if(sessionStorage.getItem('dmLoggedIn') === '1'){
      toggleDmTools();
    } else {
      openLogin();
    }
  });
}
if(dmLink){
  dmLink.addEventListener('click', openLogin);
}
updateDmButton();

setShardCardVisibility();
initShardSync();
window.addEventListener('storage', e=>{
  if(e.key === SHARD_KEY) setShardCardVisibility(true);
});

if(resolveCompleteBtn){
  resolveCompleteBtn.addEventListener('click', ()=>{
    if(window.CCShard && typeof window.CCShard.resolveActive === 'function'){
      window.CCShard.resolveActive();
      baseMessage('Shard resolved');
    }
    window.dispatchEvent(new CustomEvent('dm:hideModal',{ detail:'modal-shard-resolve' }));
  });
}
