const DM_PIN = '1231';

const linkBtn = document.getElementById('dm-login-link');
const dmBtn = document.getElementById('dm-login');
const menu = document.getElementById('dm-tools-menu');
const tsomfBtn = document.getElementById('dm-tools-tsomf');

function updateButtons(){
  const loggedIn = sessionStorage.getItem('dmLoggedIn') === '1';
  if(dmBtn) dmBtn.hidden = !loggedIn;
  if(linkBtn) linkBtn.hidden = loggedIn;
  if(!loggedIn && menu) menu.hidden = true;
}

function login(){
  const pin = prompt('DM PIN');
  if(pin === DM_PIN){
    sessionStorage.setItem('dmLoggedIn','1');
    updateButtons();
  }
}

function toggleMenu(){
  if(menu) menu.hidden = !menu.hidden;
}

linkBtn?.addEventListener('click', login);
dmBtn?.addEventListener('click', toggleMenu);

document.addEventListener('click', e => {
  if(menu && !menu.hidden && !menu.contains(e.target) && e.target !== dmBtn){
    menu.hidden = true;
  }
});

tsomfBtn?.addEventListener('click', () => {
  menu.hidden = true;
  document.getElementById('somfDM-open')?.click();
});

updateButtons();
