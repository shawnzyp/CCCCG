import { listCharacters, currentCharacter, setCurrentCharacter, loadCharacter } from './characters.js';
import { DM_PIN } from './dm-pin.js';
import { show, hide } from './modal.js';
const notifications = [];

function initDMLogin(){
  const dmBtn = document.getElementById('dm-login');
  const menu = document.getElementById('dm-tools-menu');
  const tsomfBtn = document.getElementById('dm-tools-tsomf');
  const notifyBtn = document.getElementById('dm-tools-notifications');
  const charBtn = document.getElementById('dm-tools-characters');
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
    if (!loggedIn && menu) menu.hidden = true;
    if (dmBtn){
      dmBtn.style.opacity = loggedIn ? '1' : '0';
      dmBtn.style.left = loggedIn ? '18px' : '50%';
      dmBtn.style.bottom = loggedIn ? '18px' : '0';
      dmBtn.style.transform = loggedIn ? 'none' : 'translateX(-50%)';
    }
  }

  function initTools(){
    try {
      if (window.initSomfDM) window.initSomfDM();
    } catch (e) {
      console.error('Failed to init DM tools', e);
    }
  }

  function openLogin(){
    if(!loginModal || !loginPin) return;
    show('dm-login-modal');
    loginPin.value='';
    loginPin.focus();
  }

  function closeLogin(){
    if(!loginModal) return;
    hide('dm-login-modal');
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
        (async () => {
          const entered = window.pinPrompt ? await window.pinPrompt('Enter DM PIN') : (typeof prompt === 'function' ? prompt('Enter DM PIN') : null);
          if (entered === DM_PIN) {
            setLoggedIn();
            updateButtons();
            initTools();
            if (typeof dismissToast === 'function') dismissToast();
            if (typeof toast === 'function') toast('DM tools unlocked','success');
            resolve(true);
          } else {
            if (typeof toast === 'function') toast('Invalid PIN','error');
            reject(new Error('Invalid PIN'));
          }
        })();
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
          initTools();
          closeLogin();
          if (typeof dismissToast === 'function') dismissToast();
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
        .map(n => `<li><a href="#">${n}</a></li>`)
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
      const labeled=(l,v)=>v?`<div><span style="opacity:.8;font-size:12px">${l}</span><div>${v}</div></div>`:'';
      const abilityGrid=['STR','DEX','CON','INT','WIS','CHA']
        .map(k=>labeled(k,data[k.toLowerCase()]||''))
        .join('');
      const perkGrid=[
        ['Alignment', data.alignment],
        ['Classification', data.classification],
        ['Power Style', data['power-style']],
        ['Origin', data.origin],
        ['Tier', data.tier]
      ]
        .filter(([,v])=>v)
        .map(([l,v])=>labeled(l,v))
        .join('');
      const statsGrid=[
        ['Init', data.initiative],
        ['Speed', data.speed],
        ['PP', data.pp]
      ]
        .filter(([,v])=>v)
        .map(([l,v])=>labeled(l,v))
        .join('');
      card.innerHTML=`
        <div><strong>${name}</strong></div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:6px">
          ${labeled('HP', data['hp-bar']||'')}
          ${labeled('TC', data.tc||'')}
          ${labeled('SP', data['sp-bar']||'')}
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:6px">${abilityGrid}</div>
        ${perkGrid?`<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px;margin-top:6px">${perkGrid}</div>`:''}
        ${statsGrid?`<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:6px">${statsGrid}</div>`:''}
      `;
      const renderList=(title, items)=>`<div style="margin-top:6px"><span style=\"opacity:.8;font-size:12px\">${title}</span><ul style=\"margin:4px 0 0 18px;padding:0\">${items.join('')}</ul></div>`;
      if(data.powers?.length){
        const powers=data.powers.map(p=>`<li>${labeled('Name',p.name)}${labeled('SP',p.sp)}${labeled('Range',p.range)}${labeled('Effect',p.effect)}${labeled('Save',p.save)}</li>`);
        card.innerHTML+=renderList('Powers',powers);
      }
      if(data.signatures?.length){
        const sigs=data.signatures.map(s=>`<li>${labeled('Name',s.name)}${labeled('SP',s.sp)}${labeled('Save',s.save)}${labeled('Special',s.special)}${labeled('Description',s.desc)}</li>`);
        card.innerHTML+=renderList('Signatures',sigs);
      }
      if(data.weapons?.length){
        const weapons=data.weapons.map(w=>`<li>${labeled('Name',w.name)}${labeled('Damage',w.damage)}${labeled('Range',w.range)}</li>`);
        card.innerHTML+=renderList('Weapons',weapons);
      }
      if(data.armor?.length){
        const armor=data.armor.map(a=>`<li>${labeled('Name',a.name)}${labeled('Slot',a.slot)}${a.bonus?labeled('Bonus',`+${a.bonus}`):''}${a.equipped?labeled('Equipped','Yes'):''}</li>`);
        card.innerHTML+=renderList('Armor',armor);
      }
      if(data.items?.length){
        const items=data.items.map(i=>`<li>${labeled('Name',i.name)}${labeled('Qty',i.qty)}${labeled('Notes',i.notes)}</li>`);
        card.innerHTML+=renderList('Items',items);
      }
      if(data['story-notes']){
        card.innerHTML+=`<div style="margin-top:6px"><span style=\"opacity:.8;font-size:12px\">Backstory / Notes</span><div>${data['story-notes']}</div></div>`;
      }
      const qMap={
        'q-mask':'Who are you behind the mask?',
        'q-justice':'What does justice mean to you?',
        'q-fear':'What is your biggest fear or unresolved trauma?',
        'q-first-power':'What moment first defined your sense of power—was it thrilling, terrifying, or tragic?',
        'q-origin-meaning':'What does your Origin Story mean to you now?',
        'q-before-powers':'What was your life like before you had powers or before you remembered having them?',
        'q-power-scare':'What is one way your powers scare even you?',
        'q-signature-move':'What is your signature move or ability, and how does it reflect who you are?',
        'q-emotional':'What happens to your powers when you are emotionally compromised?',
        'q-no-line':'What line will you never cross even if the world burns around you?'
      };
      const qList=Object.entries(qMap)
        .filter(([k])=>data[k])
        .map(([k,q])=>`<li><strong>${q}</strong> ${data[k]}</li>`)
        .join('');
      if(qList){
        card.innerHTML+=`<div style="margin-top:6px"><span style=\"opacity:.8;font-size:12px\">Character Questions</span><ul style=\"margin:4px 0 0 18px;padding:0\">${qList}</ul></div>`;
      }
      return card;
    }

    charList?.addEventListener('click', async e => {
      const link = e.target.closest('a');
      if (!link) return;
      const name = link.textContent?.trim();
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

  if (dmBtn) dmBtn.addEventListener('click', () => {
    if (isLoggedIn()) {
      toggleMenu();
    } else {
      requireLogin().catch(() => {});
    }
  });

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
  if (isLoggedIn()) initTools();

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
