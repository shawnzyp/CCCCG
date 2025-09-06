const DM_PIN = '1231';
const RECOVERY_ANSWER = 'August 29 2022';

const dmBtn = document.getElementById('dm-login');
const dmToast = document.getElementById('dm-toast');
const baseToast = document.getElementById('toast');
const dmMenu = document.getElementById('btn-dm-tools');

function setDmMenuVisibility(){
  if(dmMenu){
    dmMenu.hidden = !sessionStorage.getItem('dmLoggedIn');
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

function openLogin(){
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

function handleLogin(){
  const val = document.getElementById('dm-pin').value.trim();
  if(val === DM_PIN){
    hideDmToast();
    baseMessage('Logged in');
    sessionStorage.setItem('dmLoggedIn', '1');
    setDmMenuVisibility();
  } else {
    baseMessage('Wrong PIN');
  }
}

function handleLogout(){
  hideDmToast();
  baseMessage('Logged out');
  sessionStorage.removeItem('dmLoggedIn');
  setDmMenuVisibility();
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

if(dmMenu){
  dmMenu.addEventListener('click', () => baseMessage('DM menu option'));
  setDmMenuVisibility();
  window.addEventListener('pageshow', setDmMenuVisibility);
}
