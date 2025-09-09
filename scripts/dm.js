const DM_PIN = '1231';

function initDMLogin(){
  const linkBtn = document.getElementById('dm-login-link');
  const dmBtn = document.getElementById('dm-login');
  const menu = document.getElementById('dm-tools-menu');
  const tsomfBtn = document.getElementById('dm-tools-tsomf');
  const logoutBtn = document.getElementById('dm-tools-logout');
  const loginModal = document.getElementById('dm-login-modal');
  const loginPin = document.getElementById('dm-login-pin');
  const loginSubmit = document.getElementById('dm-login-submit');

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
    if (linkBtn) linkBtn.hidden = loggedIn;
    if (!loggedIn && menu) menu.hidden = true;
  }

  function openLogin(){
    if(!loginModal || !loginPin) return;
    loginModal.classList.remove('hidden');
    loginModal.setAttribute('aria-hidden','false');
    loginPin.value='';
    loginPin.focus();
  }

  function closeLogin(){
    if(!loginModal) return;
    loginModal.classList.add('hidden');
    loginModal.setAttribute('aria-hidden','true');
  }

  function attemptLogin(){
    if(loginPin.value === DM_PIN){
      setLoggedIn();
      updateButtons();
      if (window.initSomfDM) window.initSomfDM();
      closeLogin();
      if (typeof toast === 'function') toast('DM tools unlocked','success');
    } else {
      loginPin.value='';
      loginPin.focus();
      if (typeof toast === 'function') toast('Invalid PIN','error');
    }
  }

  function logout(){
    clearLoggedIn();
    updateButtons();
    if (typeof toast === 'function') toast('Logged out','info');
  }

  function toggleMenu(){
    if(menu) menu.hidden = !menu.hidden;
  }

  if (linkBtn) linkBtn.addEventListener('click', openLogin);
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

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      if (menu) menu.hidden = true;
      logout();
    });
  }

  if (loginSubmit) loginSubmit.addEventListener('click', attemptLogin);
  if (loginPin) loginPin.addEventListener('keydown', e=>{ if(e.key==='Enter') attemptLogin(); });
  if (loginModal) loginModal.addEventListener('click', e=>{ if(e.target===loginModal) closeLogin(); });

  updateButtons();
  if (isLoggedIn() && window.initSomfDM){
    window.initSomfDM();
  }
}
if (document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', initDMLogin);
} else {
  initDMLogin();
}
