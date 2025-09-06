const DM_PIN = '1231';
const RECOVERY_ANSWER = 'August 29 2022';

const dmBtn = document.getElementById('dm-login');
const dmToast = document.getElementById('dm-toast');
const baseToast = document.getElementById('toast');
const shardBtn = document.getElementById('ccShard-open');
const shardCard = document.getElementById('ccShard-player');
const shardDraw = document.getElementById('ccShard-player-draw');
const shardResults = document.getElementById('ccShard-player-results');

const SHARD_KEY = 'ccShardEnabled';
const NOTIFY_KEY = 'dmNotifications';

function setShardBtnVisibility(){
  if(shardBtn){
    const dm = sessionStorage.getItem('dmLoggedIn');
    const enabled = localStorage.getItem(SHARD_KEY) === '1';
    shardBtn.hidden = !dm && !enabled;
  }
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

function showDmToast(html){
  dmToast.innerHTML = html;
  dmToast.classList.add('show');
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
  if(sessionStorage.getItem('dmLoggedIn')){
    openDmTools();
    return;
  }
  showDmToast(`
    <input id="dm-pin" type="password" inputmode="numeric" maxlength="4" pattern="\\d{4}" placeholder="PIN" />
    <div class="inline">
      <button id="dm-login-btn" class="btn-sm">Log In</button>
      <button id="dm-logout-btn" class="btn-sm">Log Out</button>
    </div>
    <button id="dm-recover-btn" class="btn-sm">Recover PIN</button>
  `);
  document.getElementById('dm-login-btn').addEventListener('click', handleLogin);
  document.getElementById('dm-logout-btn').addEventListener('click', handleLogout);
  document.getElementById('dm-recover-btn').addEventListener('click', openRecovery);
}

function openDmTools(){
  const enabled = localStorage.getItem(SHARD_KEY) === '1';
  const notes = JSON.parse(localStorage.getItem(NOTIFY_KEY) || '[]');
  showDmToast(`
    <label class="cc-switch"><input id="dm-shard-toggle" type="checkbox" ${enabled? 'checked' : ''}><span>Allow Shards</span></label>
    <button id="dm-view-notes" class="btn-sm">Notifications (${notes.length})</button>
    <button id="dm-logout-btn" class="btn-sm">Log Out</button>
  `);
  document.getElementById('dm-shard-toggle').addEventListener('change', e=>{
    if(e.target.checked) localStorage.setItem(SHARD_KEY,'1');
    else localStorage.removeItem(SHARD_KEY);
    setShardBtnVisibility();
    setShardCardVisibility(true);
    if(!e.target.checked) baseMessage('Shards disabled');
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

function handleLogin(){
  const val = document.getElementById('dm-pin').value.trim();
  if(val === DM_PIN){
    sessionStorage.setItem('dmLoggedIn', '1');
    setShardBtnVisibility();
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
  setShardBtnVisibility();
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

if(shardBtn){
  setShardBtnVisibility();
  window.addEventListener('pageshow', setShardBtnVisibility);
}

setShardCardVisibility();
window.addEventListener('storage', e=>{
  if(e.key === SHARD_KEY) setShardCardVisibility(true);
});

if(shardDraw){
  shardDraw.addEventListener('click', async ()=>{
    const cards = window.CCShard && typeof window.CCShard.draw === 'function'
      ? await window.CCShard.draw(1)
      : [];
    shardResults.innerHTML = cards.map(c=>`<li>${c.name}</li>`).join('');
  });
}
