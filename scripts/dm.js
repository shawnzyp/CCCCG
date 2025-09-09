const DM_PIN = '1231';

document.addEventListener('DOMContentLoaded', () => {
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
    if(dmBtn) dmBtn.hidden = !loggedIn;
    if(linkBtn) linkBtn.hidden = loggedIn;
    if(!loggedIn && menu) menu.hidden = true;
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
      window.initSomfDM?.();
      closeLogin();
    } else {
      loginPin.value='';
      loginPin.focus();
    }
  }

  function logout(){
    clearLoggedIn();
    updateButtons();
  }

  function toggleMenu(){
    if(menu) menu.hidden = !menu.hidden;
  }

  linkBtn?.addEventListener('click', openLogin);
  dmBtn?.addEventListener('click', toggleMenu);

  document.addEventListener('click', e => {
    if(menu && !menu.hidden && !menu.contains(e.target) && e.target !== dmBtn){
      menu.hidden = true;
    }
  });

  tsomfBtn?.addEventListener('click', () => {
    menu.hidden = true;
    window.openSomfDM?.();
  });

  logoutBtn?.addEventListener('click', () => {
    menu.hidden = true;
    logout();
  });

  loginSubmit?.addEventListener('click', attemptLogin);
  loginPin?.addEventListener('keydown', e=>{ if(e.key==='Enter') attemptLogin(); });
  loginModal?.addEventListener('click', e=>{ if(e.target===loginModal) closeLogin(); });

  updateButtons();
  if(isLoggedIn()){
    window.initSomfDM?.();
  }
});
