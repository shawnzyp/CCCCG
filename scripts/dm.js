const DM_PIN = '1231';
const RECOVERY_ANSWER = 'August 29 2022';

const dmBtn = document.getElementById('dm-login');
const dmToast = document.getElementById('dm-toast');
const baseToast = document.getElementById('toast');
const shardCard = document.getElementById('ccShard-player');
const shardDraw = document.getElementById('ccShard-player-draw');
const shardCount = document.getElementById('ccShard-player-count');
const shardResults = document.getElementById('ccShard-player-results');

const resolveTitle = document.getElementById('shard-resolve-title');
const resolveBody = document.getElementById('shard-resolve-body');
const resolveAddBtn = document.getElementById('shard-resolve-addnpc');
const resolveCompleteBtn = document.getElementById('shard-resolve-complete');

const SHARD_KEY = 'ccShardEnabled';
const NOTIFY_KEY = 'dmNotifications';
const DRAW_COUNT_KEY = 'ccShardPlayerDraws';
const DRAW_LOCK_KEY = 'ccShardPlayerLocked';

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

function showDmToast(html){
  dmToast.innerHTML = `${html}<button id="dm-toast-close" class="btn-sm">Close</button>`;
  dmToast.classList.add('show');
  document.getElementById('dm-toast-close').addEventListener('click', hideDmToast);
}
function hideDmToast(){
  dmToast.classList.remove('show');
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
  const enabled = localStorage.getItem(SHARD_KEY) === '1';
  const notes = JSON.parse(localStorage.getItem(NOTIFY_KEY) || '[]');
  showDmToast(`
    <label class="cc-switch"><input id="dm-shard-toggle" type="checkbox" ${enabled? 'checked' : ''}><span>Allow Shards</span></label>
    <div class="inline">
      <button id="ccShard-open" class="btn-sm">Shard of Many Fates</button>
      <button id="dm-resolve-shard" class="btn-sm">Resolve Shards</button>
      <button id="dm-reset-draws" class="btn-sm">Reset Draws</button>
      <button id="dm-view-notes" class="btn-sm">Notifications (${notes.length})</button>
      <button id="dm-logout-btn" class="btn-sm">Log Out</button>
    </div>
  `);
  document.getElementById('dm-shard-toggle').addEventListener('change', e=>{
    if(e.target.checked) localStorage.setItem(SHARD_KEY,'1');
    else localStorage.removeItem(SHARD_KEY);
    setShardCardVisibility(true);
    if(!e.target.checked) baseMessage('Shards disabled');
  });
  const shardBtn = document.getElementById('ccShard-open');
  if(shardBtn){
    shardBtn.addEventListener('click', ()=>{
      if(window.CCShard && typeof window.CCShard.open === 'function'){
        window.CCShard.open();
      }
    });
  }
  const resolveBtn = document.getElementById('dm-resolve-shard');
  if(resolveBtn){
    resolveBtn.addEventListener('click', openShardResolver);
  }
  document.getElementById('dm-reset-draws').addEventListener('click', ()=>{
    localStorage.removeItem(DRAW_COUNT_KEY);
    localStorage.removeItem(DRAW_LOCK_KEY);
    const btn = document.getElementById('ccShard-player-draw');
    if(btn) btn.disabled = false;
    baseMessage('Players may draw again');
  });
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
  if(card){
    resolveTitle.textContent = card.name;
    const res = card.resolution ? card.resolution.map(r=>`<li>${escapeHtml(r)}</li>`).join('') : '<li>None</li>';
    let enemyHtml = '<p><em>No enemy</em></p>';
    if(card.enemy){
      const stats = (window.CCShard && window.CCShard.stats) || {};
      enemyHtml = card.enemy.split('|').map(k=>`<strong>${k}</strong><pre class="cc-code">${escapeHtml(stats[k]||'Unknown')}</pre>`).join('');
    }
    resolveBody.innerHTML = `<h4>Resolution</h4><ul>${res}</ul><h4>Enemy</h4>${enemyHtml}`;
    const ally = card.rewards && card.rewards.find(r=>/ally\s+(\w+)/i.test(r));
    if(ally){
      const m = ally.match(/ally\s+(\w+)/i);
      resolveAddBtn.dataset.npcId = m ? m[1] : '';
      resolveAddBtn.hidden = !resolveAddBtn.dataset.npcId;
    } else {
      resolveAddBtn.hidden = true;
    }
    resolveCompleteBtn.disabled = false;
  } else {
    resolveTitle.textContent = 'Resolve Shard';
    resolveBody.innerHTML = '<p>No active shard.</p>';
    resolveAddBtn.hidden = true;
    resolveCompleteBtn.disabled = true;
  }
  window.dispatchEvent(new CustomEvent('dm:showModal',{ detail: 'modal-shard-resolve' }));
}

function handleLogin(){
  const val = document.getElementById('dm-pin').value.trim();
  if(val === DM_PIN){
    sessionStorage.setItem('dmLoggedIn', '1');
    openDmTools();
    baseMessage('Logged in');
  } else {
    baseMessage('Wrong PIN');
  }
}

function handleLogout(){
  hideDmToast();
  baseMessage('Logged out');
  sessionStorage.removeItem('dmLoggedIn');
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
