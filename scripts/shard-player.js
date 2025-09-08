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
    shardDraw.disabled = !enabled || locked;
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

async function drawShards(){
  if(localStorage.getItem(DRAW_LOCK_KEY) === '1'){
    message('Shard draws exhausted');
    return;
  }
  const count = Math.max(1, parseInt(shardCount.value,10)||1);
  const names = [];
  for(let i=0;i<count;i++){
    const res = window.CCShard && typeof window.CCShard.draw === 'function'
      ? await window.CCShard.draw(1)
      : [];
    if(!res.length){
      message('No shards drawn');
      break;
    }
    const card = res[0];
    names.push(card.name);
    const li = document.createElement('li');
    const effect = card.effect ? `<ul>${card.effect.map(e=>`<li>${e}</li>`).join('')}</ul>` : '';
    li.innerHTML = `<strong>${card.name}</strong><p>${card.visual || ''}</p>${effect}`;
    shardResults.appendChild(li);
  }
  if(!names.length) return;
  if(typeof window.logDMAction === 'function'){
    window.logDMAction(`Player drew shard${names.length>1?'s':''}: ${names.join(', ')}`);
  }
  const draws = parseInt(localStorage.getItem(DRAW_COUNT_KEY) || '0',10) + 1;
  localStorage.setItem(DRAW_COUNT_KEY, draws.toString());
  if(draws >= 2){
    localStorage.setItem(DRAW_LOCK_KEY,'1');
    updateVisibility();
    message('Shard draws exhausted');
    if(typeof window.logDMAction === 'function'){
      window.logDMAction('Player exhausted shard draws');
    }
  }
}

if(shardDraw){
  shardDraw.addEventListener('click', drawShards);
}
