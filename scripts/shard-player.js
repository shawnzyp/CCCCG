const shardCard = document.getElementById('ccShard-player');
const shardDraw = document.getElementById('ccShard-player-draw');
const shardCount = document.getElementById('ccShard-player-count');
const shardResults = document.getElementById('ccShard-player-results');
const toast = document.getElementById('toast');

const SHARD_KEY = 'ccShardEnabled';
const DRAW_COUNT_KEY = 'ccShardPlayerDraws';
const DRAW_LOCK_KEY = 'ccShardPlayerLocked';

function message(msg){
  if(!toast) return;
  toast.textContent = msg;
  toast.className = 'toast show';
  setTimeout(()=> toast.classList.remove('show'),3000);
}

function updateVisibility(){
  const enabled = localStorage.getItem(SHARD_KEY) === '1';
  if(shardCard){
    shardCard.hidden = !enabled;
    shardCard.setAttribute('aria-hidden', String(!enabled));
  }
  if(shardDraw){
    const locked = localStorage.getItem(DRAW_LOCK_KEY) === '1';
    const disabled = !enabled || locked;
    shardDraw.disabled = disabled;
    // ensure attribute mirrors property so the button can be re-enabled
    shardDraw.toggleAttribute('disabled', disabled);
  }
  if(!enabled && shardResults){
    shardResults.innerHTML = '';
  }
}

updateVisibility();
window.addEventListener('storage', e=>{
  if(e.key === SHARD_KEY || e.key === DRAW_LOCK_KEY){
    updateVisibility();
  }
});

function logDM(text){
  window.dispatchEvent(new CustomEvent('dm:notify', { detail: text }));
}

async function drawShards(){
  if(localStorage.getItem(DRAW_LOCK_KEY) === '1'){
    message('Shard draws exhausted');
    return;
  }
  const count = Math.max(1, parseInt(shardCount.value,10)||1);
  // warning pop-ups to confirm draw
  if(!window.confirm(`Draw ${count} Shard${count>1?'s':''}?`)) return;
  if(!window.confirm('This action cannot be undone. Proceed?')) return;

  // clear previous results so new draws are resolved in order
  if(shardResults) shardResults.innerHTML = '';

  let res = [];
  try {
    res = window.CCShard && typeof window.CCShard.draw === 'function'
      ? await window.CCShard.draw(count)
      : [];
  } catch(err){
    message('Shard draw failed');
    logDM('Shard draw failed');
    return;
  }
  if(!Array.isArray(res) || !res.length){
    message('No shards drawn');
    return;
  }

  const names = [];
  res.forEach(card => {
    names.push(card.name);
    const li = document.createElement('li');
    const effect = card.effect ? `<ul>${card.effect.map(e=>`<li>${e}</li>`).join('')}</ul>` : '';
    li.innerHTML = `<strong>${card.name}</strong><p>${card.visual || ''}</p>${effect}`;
    shardResults.appendChild(li);
  });

  if(window.CCShard && typeof window.CCShard.open === 'function'){
    window.CCShard.open();
  }

  logDM(`Player drew shard${names.length>1?'s':''}: ${names.join(', ')}`);
  const draws = parseInt(localStorage.getItem(DRAW_COUNT_KEY) || '0',10) + 1;
  localStorage.setItem(DRAW_COUNT_KEY, draws.toString());
  if(draws >= 2){
    localStorage.setItem(DRAW_LOCK_KEY,'1');
    updateVisibility();
    message('Shard draws exhausted');
    logDM('Player exhausted shard draws');
  }
}

if(shardDraw){
  shardDraw.addEventListener('click', drawShards);
}
