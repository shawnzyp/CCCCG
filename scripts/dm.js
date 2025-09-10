const DM_PIN = '123123';
const notifications = [];

function initDMLogin(){
  const dmBtn = document.getElementById('dm-login');
  const menu = document.getElementById('dm-tools-menu');
  const tsomfBtn = document.getElementById('dm-tools-tsomf');
  const notifyBtn = document.getElementById('dm-tools-notifications');
  const logoutBtn = document.getElementById('dm-tools-logout');
  const loginModal = document.getElementById('dm-login-modal');
  const loginPin = document.getElementById('dm-login-pin');
  const loginSubmit = document.getElementById('dm-login-submit');
  const loginClose = document.getElementById('dm-login-close');
  const notifyModal = document.getElementById('dm-notifications-modal');
  const notifyList = document.getElementById('dm-notifications-list');
  const notifyClose = document.getElementById('dm-notifications-close');

  if (loginPin) {
    loginPin.type = 'password';
    loginPin.autocomplete = 'one-time-code';
    loginPin.inputMode = 'numeric';
    loginPin.pattern = '[0-9]*';
  }

  window.dmNotify = function(detail){
    const entry = {
      ts: new Date().toLocaleString(),
      char: (()=>{ try { return localStorage.getItem('last-save') || ''; } catch { return ''; } })(),
      detail
    };
    notifications.push(entry);
    if(notifyList){
      const li = document.createElement('li');
      li.textContent = `[${entry.ts}] ${entry.char}: ${detail}`;
      notifyList.prepend(li);
    }
  };

  function isLoggedIn(){
    try {
      return sessionStorage.getItem('dmLoggedIn') === '1';
    } catch {
      return false;
    }
  }

  function setLoggedIn(){
    try {
      sessionStorage.setItem('dmLoggedIn','1');
    } catch {
      /* ignore */
    }
  }

  function clearLoggedIn(){
    try {
      sessionStorage.removeItem('dmLoggedIn');
    } catch {
      /* ignore */
    }
  }

  function updateButtons(){
    const loggedIn = isLoggedIn();
    if (dmBtn) dmBtn.hidden = !loggedIn;
    if (!loggedIn && menu) menu.hidden = true;
  }

  function openLogin(){
    if(!loginModal || !loginPin) return;
    loginModal.style.display = 'flex';
    loginModal.classList.remove('hidden');
    loginModal.setAttribute('aria-hidden','false');
    loginPin.value='';
    loginPin.focus();
  }

  function closeLogin(){
    if(!loginModal) return;
    loginModal.classList.add('hidden');
    loginModal.setAttribute('aria-hidden','true');
    loginModal.style.display = 'none';
  }

  function requireLogin(){
    return new Promise((resolve, reject) => {
      if (isLoggedIn()) {
        updateButtons();
        resolve(true);
        return;
      }

      // If the modal elements are missing, fall back to a simple prompt so
      // the promise always resolves and loading doesn't hang.
      if (!loginModal || !loginPin || !loginSubmit) {
        const entered = typeof prompt === 'function' ? prompt('Enter DM PIN') : null;
        if (entered === DM_PIN) {
          setLoggedIn();
          updateButtons();
          if (window.initSomfDM) window.initSomfDM();
          if (typeof toast === 'function') toast('DM tools unlocked','success');
          resolve(true);
        } else {
          if (typeof toast === 'function') toast('Invalid PIN','error');
          reject(new Error('Invalid PIN'));
        }
        return;
      }

      openLogin();
      if (typeof toast === 'function') toast('Enter DM PIN','info');
      function cleanup(){
        loginSubmit?.removeEventListener('click', onSubmit);
        loginPin?.removeEventListener('keydown', onKey);
        loginModal?.removeEventListener('click', onOverlay);
        loginClose?.removeEventListener('click', onCancel);
      }
      function onSubmit(){
        if(loginPin.value === DM_PIN){
          setLoggedIn();
          updateButtons();
          if (window.initSomfDM) window.initSomfDM();
          closeLogin();
          if (typeof toast === 'function') toast('DM tools unlocked','success');
          cleanup();
          resolve(true);
        } else {
          loginPin.value='';
          loginPin.focus();
          if (typeof toast === 'function') toast('Invalid PIN','error');
        }
      }
      function onKey(e){ if(e.key==='Enter') onSubmit(); }
      function onCancel(){ closeLogin(); cleanup(); reject(new Error('cancel')); }
      function onOverlay(e){ if(e.target===loginModal) onCancel(); }
      loginSubmit?.addEventListener('click', onSubmit);
      loginPin?.addEventListener('keydown', onKey);
      loginModal?.addEventListener('click', onOverlay);
      loginClose?.addEventListener('click', onCancel);
    });
  }

  function logout(){
    clearLoggedIn();
    updateButtons();
    if (typeof toast === 'function') toast('Logged out','info');
  }

  function toggleMenu(){
    if(menu) menu.hidden = !menu.hidden;
  }

  function openNotifications(){
    if(!notifyModal) return;
    notifyModal.style.display = 'flex';
    notifyModal.classList.remove('hidden');
    notifyModal.setAttribute('aria-hidden','false');
  }

  function closeNotifications(){
    if(!notifyModal) return;
    notifyModal.classList.add('hidden');
    notifyModal.setAttribute('aria-hidden','true');
    notifyModal.style.display = 'none';
  }

  if (dmBtn) dmBtn.addEventListener('click', toggleMenu);

  document.addEventListener('click', e => {
    if(menu && !menu.hidden && !menu.contains(e.target) && e.target !== dmBtn){
      menu.hidden = true;
    }
  });

  if (tsomfBtn) {
    tsomfBtn.addEventListener('click', () => {
      if (menu) menu.hidden = true;
      if (window.openSomfDM) window.openSomfDM();
    });
  }

  if (notifyBtn) {
    notifyBtn.addEventListener('click', () => {
      if (menu) menu.hidden = true;
      openNotifications();
    });
  }

  notifyModal?.addEventListener('click', e => { if(e.target===notifyModal) closeNotifications(); });
  notifyClose?.addEventListener('click', closeNotifications);

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      if (menu) menu.hidden = true;
      logout();
    });
  }

  updateButtons();
  if (isLoggedIn() && window.initSomfDM){
    window.initSomfDM();
  }

  document.addEventListener('click', e => {
    const t = e.target.closest('button,a');
    if(!t) return;
    const id = t.id || t.textContent?.trim() || 'interaction';
    window.dmNotify?.(`Clicked ${id}`);
  });

  window.dmRequireLogin = requireLogin;
}
if (document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', initDMLogin);
} else {
  initDMLogin();
}
