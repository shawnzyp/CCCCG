import { listCharacters, currentCharacter, setCurrentCharacter, loadCharacter } from './characters.js';
import { DM_PIN } from './dm-pin.js';
const notifications = [];

function initDMLogin(){
  const dmBtn = document.getElementById('dm-login');
  const menu = document.getElementById('dm-tools-menu');
  const tsomfBtn = document.getElementById('dm-tools-tsomf');
  const notifyBtn = document.getElementById('dm-tools-notifications');
  const charBtn = document.getElementById('dm-tools-characters');
  const wizardBtn = document.getElementById('dm-tools-wizard');
  const logoutBtn = document.getElementById('dm-tools-logout');
  const loginModal = document.getElementById('dm-login-modal');
  const loginPin = document.getElementById('dm-login-pin');
  const loginSubmit = document.getElementById('dm-login-submit');
  const loginClose = document.getElementById('dm-login-close');
  const notifyModal = document.getElementById('dm-notifications-modal');
  const notifyList = document.getElementById('dm-notifications-list');
  const notifyClose = document.getElementById('dm-notifications-close');
  const charModal = document.getElementById('dm-characters-modal');
  const charList = document.getElementById('dm-characters-list');
  const charClose = document.getElementById('dm-characters-close');
  const charViewModal = document.getElementById('dm-character-modal');
  const charViewClose = document.getElementById('dm-character-close');
  const charView = document.getElementById('dm-character-sheet');

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
    if (currentCharacter() === 'The DM') {
      setCurrentCharacter(null);
    }
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

    async function openCharacters(){
      if(!charModal || !charList) return;
      closeCharacterView();
      charModal.style.display = 'flex';
      charModal.classList.remove('hidden');
      charModal.setAttribute('aria-hidden','false');
      let names = [];
      try { names = await listCharacters(); }
      catch(e){ console.error('Failed to list characters', e); }
      charList.innerHTML = names
        .map(n => `<li><button type="button">${n}</button></li>`)
        .join('');
    }

  function closeCharacters(){
    if(!charModal) return;
    charModal.classList.add('hidden');
    charModal.setAttribute('aria-hidden','true');
    charModal.style.display = 'none';
  }

  function openCharacterView(){
    if(!charViewModal) return;
    charViewModal.style.display='flex';
    charViewModal.classList.remove('hidden');
    charViewModal.setAttribute('aria-hidden','false');
  }

  function closeCharacterView(){
    if(!charViewModal) return;
    charViewModal.classList.add('hidden');
    charViewModal.setAttribute('aria-hidden','true');
    charViewModal.style.display='none';
  }

    function characterCard(data, name){
      const card=document.createElement('div');
      card.style.cssText='border:1px solid #1b2532;border-radius:8px;background:#0c1017;padding:8px';
      const abilityGrid=['STR','DEX','CON','INT','WIS','CHA']
        .map(k=>`<div><span style="opacity:.8;font-size:12px">${k}</span><div>${data[k.toLowerCase()]||''}</div></div>`)
        .join('');
      card.innerHTML=`
        <div><strong>${name}</strong></div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:6px">
          <div><span style="opacity:.8;font-size:12px">HP</span><div>${data['hp-bar']||''}</div></div>
          <div><span style="opacity:.8;font-size:12px">TC</span><div>${data.tc||''}</div></div>
          <div><span style="opacity:.8;font-size:12px">SP</span><div>${data['sp-bar']||''}</div></div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:6px">${abilityGrid}</div>
      `;
      if(data.powers?.length){
        card.innerHTML+=`<div style="margin-top:6px"><span style=\"opacity:.8;font-size:12px\">Powers</span><ul style=\"margin:4px 0 0 18px;padding:0\">${data.powers.map(p=>`<li>${p.name}${p.sp?` (${p.sp} SP)`:''}${p.range?`, ${p.range}`:''}${p.effect?`, ${p.effect}`:''}${p.save?`, ${p.save}`:''}</li>`).join('')}</ul></div>`;
      }
      if(data.signatures?.length){
        card.innerHTML+=`<div style="margin-top:6px"><span style=\"opacity:.8;font-size:12px\">Signatures</span><ul style=\"margin:4px 0 0 18px;padding:0\">${data.signatures.map(s=>`<li>${s.name}${s.sp?` (${s.sp} SP)`:''}${s.save?`, ${s.save}`:''}${s.special?`, ${s.special}`:''}${s.desc?`, ${s.desc}`:''}</li>`).join('')}</ul></div>`;
      }
      if(data.weapons?.length){
        card.innerHTML+=`<div style="margin-top:6px"><span style=\"opacity:.8;font-size:12px\">Weapons</span><div>${data.weapons.map(w=>`${w.name}${w.damage?` dmg ${w.damage}`:''}${w.range?` (${w.range})`:''}`).join('; ')}</div></div>`;
      }
      const gear=[];
      (data.armor||[]).forEach(a=> gear.push(`${a.name}${a.slot?` (${a.slot})`:''}${a.bonus?` +${a.bonus}`:''}${a.equipped?` [Equipped]`:''}`));
      (data.items||[]).forEach(i=> gear.push(`${i.name}${i.qty?` x${i.qty}`:''}${i.notes?` (${i.notes})`:''}`));
      if(gear.length){
        card.innerHTML+=`<div style="margin-top:6px"><span style=\"opacity:.8;font-size:12px\">Gear</span><ul style=\"margin:4px 0 0 18px;padding:0\">${gear.map(g=>`<li>${g}</li>`).join('')}</ul></div>`;
      }
      return card;
    }

    charList?.addEventListener('click', async e => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const name = btn.textContent?.trim();
      if (!name || !charView) return;
      try {
        const data = await loadCharacter(name);
        charView.innerHTML='';
        charView.appendChild(characterCard(data, name));
        openCharacterView();
      } catch (err) {
        console.error('Failed to load character', err);
      }
    });

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

    if (charBtn) {
      charBtn.addEventListener('click', () => {
        if (menu) menu.hidden = true;
        openCharacters();
      });
    }

    function openWizard(){
      const el=document.getElementById('wizard-tool');
      const input=document.getElementById('wizard-input');
      el?.scrollIntoView({behavior:'smooth'});
      input?.focus();
    }

    if (wizardBtn) {
      wizardBtn.addEventListener('click', () => {
        if (menu) menu.hidden = true;
        openWizard();
      });
    }

  notifyModal?.addEventListener('click', e => { if(e.target===notifyModal) closeNotifications(); });
  notifyClose?.addEventListener('click', closeNotifications);
  charModal?.addEventListener('click', e => { if(e.target===charModal) closeCharacters(); });
  charClose?.addEventListener('click', closeCharacters);
  charViewModal?.addEventListener('click', e => { if(e.target===charViewModal) closeCharacterView(); });
  charViewClose?.addEventListener('click', closeCharacterView);

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
