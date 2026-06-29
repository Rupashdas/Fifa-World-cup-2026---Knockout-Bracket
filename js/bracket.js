/* ============================================================
   bracket.js — state, rendering, interaction, persistence,
                share-link, PNG export
   ============================================================ */

/* ---------------- state ---------------- */
const state = {};
MATCHES.forEach(m=>{ state[m.id] = m.round===0 ? [m.slots[0],m.slots[1]] : [null,null]; });
let champion = null;
let bronze = null;
let dragTeam = null;
let prevChampion = null;

const resolved = (m,i)=> m.round===0 ? m.slots[i] : (state[m.id][i]||null);
const winnerOf = id => { const d=downstream[id]; return d ? (state[d.mid][d.sidx]||null) : null; };

function validFor(m,i){
  const ph = m.slots[i];
  if(/^RU\d+$/.test(ph)){
    const src = byId['M'+ph.slice(2)];
    return [resolved(src,0),resolved(src,1)].filter(Boolean);
  }
  const src = byId['M'+ph.replace(/\D/g,'')];
  return [resolved(src,0),resolved(src,1)].filter(Boolean);
}

/* auto-populate the third-place play-off from the two semi LOSERS */
function syncThirdPlace(){
  ['M101','M102'].forEach(sf=>{
    const ls = loserstream[sf]; if(!ls) return;
    const finalists = [resolved(byId[sf],0), resolved(byId[sf],1)].filter(Boolean);
    const w = winnerOf(sf);
    if(finalists.length===2 && w){
      const loser = finalists.find(t=>t!==w);
      state[ls.mid][ls.sidx] = loser || null;
    } else {
      state[ls.mid][ls.sidx] = null;
    }
  });
}

function revalidate(){
  let changed=true;
  while(changed){
    changed=false;
    MATCHES.forEach(m=>{
      if(m.round===0 || m.round===5) return;
      [0,1].forEach(i=>{
        const v=state[m.id][i];
        if(v!=null && !validFor(m,i).includes(v)){ state[m.id][i]=null; changed=true; }
      });
    });
    if(champion){
      const fin=byId['M104'];
      const fs=[resolved(fin,0),resolved(fin,1)].filter(Boolean);
      if(!fs.includes(champion)){ champion=null; changed=true; }
    }
  }
  syncThirdPlace();
  if(bronze){
    const third=byId['M103'];
    const ps=[resolved(third,0),resolved(third,1)].filter(Boolean);
    if(!ps.includes(bronze)) bronze=null;
  }
}

/* ---------------- persistence ---------------- */
const KEY = 'wc2026_bracket_v2';
function snapshot(){
  const picks={};
  MATCHES.forEach(m=>{ if(m.round>0 && m.round!==5) picks[m.id]=state[m.id].slice(); });
  return {v:2, picks, champion, bronze};
}
let savedTimer=null;
function markSaved(txt){
  const n=document.getElementById('savedNote'); if(!n) return;
  n.textContent = txt||'Saved ✓';
  clearTimeout(savedTimer);
  savedTimer=setTimeout(()=>{ if(n) n.textContent=''; }, 1700);
}
function save(){
  try{ localStorage.setItem(KEY, JSON.stringify(snapshot())); markSaved(); }
  catch(e){ markSaved('Auto-save off — use Export'); }
}
function applySnapshot(d){
  if(!d || !d.picks) return;
  MATCHES.forEach(m=>{
    if(m.round>0 && m.round!==5) state[m.id] = d.picks[m.id] ? d.picks[m.id].slice() : [null,null];
  });
  champion = d.champion || null;
  bronze = d.bronze || null;
  revalidate();
}
function loadStored(){
  try{
    const raw=localStorage.getItem(KEY); if(!raw) return false;
    applySnapshot(JSON.parse(raw)); return true;
  }catch(e){ return false; }
}

/* ============================================================
   SHARE LINK  — encode the whole prediction into the URL.
   No backend needed: the bracket travels inside the link.
   ============================================================ */

/* Order of the 15 advancing picks we need to capture.
   Everything else (R16..Final slots, 3rd-place) is derived. */
const PICK_ORDER = [
  // R32 winners -> fill R16 (8 left + 8 right) handled via downstream of round-0 matches
  'M74','M77','M73','M75','M83','M84','M81','M82',
  'M76','M78','M79','M80','M86','M88','M85','M87',
  // R16 winners -> QF
  'M89','M90','M93','M94','M91','M92','M95','M96',
  // QF winners -> SF
  'M97','M98','M99','M100',
  // SF winners -> Final
  'M101','M102'
];
const TEAM_CODES = Object.keys(TEAMS);

/* Build a compact, URL-safe payload string.
   For each source match in PICK_ORDER store the winner's index in TEAM_CODES
   (or 63 for "no pick"), packed two-chars-per-byte into base64url. */
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
function encodeShare(){
  const vals = PICK_ORDER.map(src=>{
    const w = winnerOf(src);
    return w==null ? 63 : TEAM_CODES.indexOf(w);
  });
  const champIdx = champion==null ? 63 : TEAM_CODES.indexOf(champion);
  const bronzeIdx = bronze==null ? 63 : TEAM_CODES.indexOf(bronze);
  vals.push(champIdx, bronzeIdx);
  // each value 0..63 -> one base64url char
  let s = "1"; // version marker
  vals.forEach(v=>{ s += B64[v & 63]; });
  return s;
}
function decodeShare(str){
  if(!str || str[0] !== '1') return false;
  const body = str.slice(1);
  const expected = PICK_ORDER.length + 2;
  if(body.length < expected) return false;
  const vals = [];
  for(let i=0;i<body.length;i++){
    const idx = B64.indexOf(body[i]);
    if(idx<0) return false;
    vals.push(idx);
  }
  // reset to empty before applying
  MATCHES.forEach(m=>{ if(m.round>0 && m.round!==5) state[m.id]=[null,null]; });
  champion=null; bronze=null;

  // apply winners level by level so downstream targets exist
  PICK_ORDER.forEach((src,k)=>{
    const v = vals[k];
    if(v===63) return;
    const team = TEAM_CODES[v];
    if(!team) return;
    const d = downstream[src];
    if(d) state[d.mid][d.sidx] = team;
  });
  const champV = vals[PICK_ORDER.length];
  const bronzeV = vals[PICK_ORDER.length+1];
  champion = champV===63 ? null : (TEAM_CODES[champV]||null);
  bronze   = bronzeV===63 ? null : (TEAM_CODES[bronzeV]||null);
  revalidate();
  return true;
}

function buildShareURL(){
  const base = location.origin + location.pathname;
  return base + '#p=' + encodeShare();
}

/* read a shared prediction out of the URL on load */
function loadFromURL(){
  const h = location.hash || '';
  const m = h.match(/[#&]p=([^&]+)/);
  if(!m) return false;
  try{ return decodeShare(decodeURIComponent(m[1])); }
  catch(e){ return false; }
}

/* ---------------- build DOM ---------------- */
const bracket = document.getElementById('bracket');
const el = (tag,cls)=>{ const e=document.createElement(tag); if(cls) e.className=cls; return e; };

function makeSlot(m,i){
  const s = el('div','slot');
  s.id = `slot-${m.id}-${i}`;
  s.addEventListener('dragstart', onDragStart);
  s.addEventListener('dragend', onDragEnd);
  s.addEventListener('dragover', onDragOver);
  s.addEventListener('dragleave', onDragLeave);
  s.addEventListener('drop', onDrop);
  return s;
}

let svgEl;
function buildConnectors(){
  const seg=[];
  const line=(x1,y1,x2,y2,key)=>{ seg.push({x1,y1,x2,y2,key}); };
  MATCHES.forEach(m=>{
    if(m.round>=1 && m.round<=3){
      const a=matchAt(m.side,m.round-1,m.idx*2), b=matchAt(m.side,m.round-1,m.idx*2+1);
      const aY=cardY(a), bY=cardY(b), tY=cardY(m);
      if(m.side==='L'){
        const fR=cardX(a)+CARD_W, tL=cardX(m), midX=(fR+tL)/2;
        line(fR,aY,midX,aY,a.id); line(fR,bY,midX,bY,b.id);
        line(midX,aY,midX,bY,m.id+'_v'); line(midX,tY,tL,tY,m.id+'_in');
      }else{
        const fL=cardX(a), tR=cardX(m)+CARD_W, midX=(fL+tR)/2;
        line(fL,aY,midX,aY,a.id); line(fL,bY,midX,bY,b.id);
        line(midX,aY,midX,bY,m.id+'_v'); line(midX,tY,tR,tY,m.id+'_in');
      }
    }
  });
  const fin=byId['M104'], finY=cardY(fin), finBottom=finY+54, finCx=cardX(fin)+CARD_W/2;
  const sfL=byId['M101'], sfR=byId['M102'];
  const sfTop=cardY(sfL)-28, sfLcx=cardX(sfL)+CARD_W/2, sfRcx=cardX(sfR)+CARD_W/2;
  const midY=(finBottom+sfTop)/2;
  line(finCx,finBottom,finCx,midY,'M101');
  line(sfLcx,midY,finCx,midY,'M101');
  line(sfRcx,midY,finCx,midY,'M102');
  line(sfLcx,midY,sfLcx,sfTop,'M101');
  line(sfRcx,midY,sfRcx,sfTop,'M102');

  const html = seg.map(s=>`<line data-key="${s.key}" x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}"/>`).join('');
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('class','connectors');
  svg.setAttribute('width','1130'); svg.setAttribute('height','800');
  svg.innerHTML=`<defs><linearGradient id="litgrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#3c5cff"/><stop offset="1" stop-color="#ffb627"/>
    </linearGradient></defs>`+html;
  bracket.appendChild(svg);
  svgEl = svg;
}
function litConnectors(){
  if(!svgEl) return;
  svgEl.querySelectorAll('line').forEach(ln=>{
    const key = ln.getAttribute('data-key');
    if(!key) return;
    const base = key.replace(/_.*$/,'');
    const m = byId[base];
    const lit = m && winnerOf(base);
    ln.classList.toggle('lit', !!lit);
  });
}

function buildHeads(){
  const heads=[
    ['Round of 32','L',0],['Round of 16','L',1],['Quarter-final','L',2],['Semi-final','L',3],
    ['Semi-final','R',3],['Quarter-final','R',2],['Round of 16','R',1],['Round of 32','R',0]
  ];
  heads.forEach(([txt,side,round])=>{
    const h=el('div','colhead');
    h.style.left=headX(side,round)+'px'; h.style.top='16px';
    h.style.width=CARD_W+'px'; h.innerHTML=`<span class="ch-dot"></span>${txt}`;
    bracket.appendChild(h);
  });
}

function buildCards(){
  MATCHES.forEach(m=>{
    const x=cardX(m), y=cardY(m);
    if(m.round<=3){
      const card=el('div','match');
      card.id='card-'+m.id;
      card.style.left=x+'px'; card.style.top=(y-27)+'px'; card.style.width=CARD_W+'px';
      card.appendChild(makeSlot(m,0));
      card.appendChild(makeSlot(m,1));
      bracket.appendChild(card);

      const dl=el('div','date');
      dl.style.left=x+'px'; dl.style.top=(y-27-13)+'px';
      dl.innerHTML=`${m.date}&nbsp;&nbsp;${m.time}`;
      bracket.appendChild(dl);

      const id=el('span','mid'); id.textContent=m.id; id.style.top=(y-7)+'px';
      if(m.side==='L') id.style.left=(x-28)+'px'; else id.style.left=(x+CARD_W+4)+'px';
      bracket.appendChild(id);
    }else{
      const H=110;
      const box=el('div','centerbox'+(m.round===4?' final':''));
      box.id='card-'+m.id;
      box.style.left=x+'px'; box.style.top=(y-H/2)+'px'; box.style.width=CARD_W+'px';

      const hd=el('div','centerhead'+(m.round===5?' small':''));
      hd.style.left=x+'px'; hd.style.top=(y-H/2-(m.round===4?40:20))+'px'; hd.style.width=CARD_W+'px';
      hd.textContent = m.round===4?'THE FINAL':'3rd place play-off';
      bracket.appendChild(hd);

      const dl=el('div','cdate'); dl.innerHTML=`${m.date}&nbsp;&nbsp;${m.time}`;
      box.appendChild(dl);
      box.appendChild(makeSlot(m,0));
      box.appendChild(makeSlot(m,1));
      const id=el('span','cmid'); id.textContent=m.id; box.appendChild(id);
      bracket.appendChild(box);

      if(m.round===4){
        const stage=el('div','trophy-stage');
        stage.style.left=x+'px'; stage.style.top=(y-H/2-118)+'px'; stage.style.width=CARD_W+'px';
        stage.innerHTML=`<div class="trophy-svg dim" id="bigTrophy">${TROPHY_SVG}</div><div class="champ-name" id="champName"></div>`;
        bracket.appendChild(stage);
      }
    }
  });
}

/* ---------------- render ---------------- */
function flagImg(code,cls){
  const iso=TEAMS[code][1];
  return `<img class="${cls||'flag'}" src="https://flagcdn.com/w40/${iso}.png" alt="" crossorigin="anonymous">`;
}
let lastState = {};
function render(){
  MATCHES.forEach(m=>{
    [0,1].forEach(i=>{
      const s=document.getElementById(`slot-${m.id}-${i}`);
      const team=resolved(m,i);
      const key = m.id+'-'+i;
      const changed = lastState[key] !== team;
      lastState[key] = team;

      s.classList.toggle('resolved',!!team);
      s.draggable = !!team && m.round!==5;
      s.classList.remove('is-winner','is-loser','is-champion','is-bronze','just-set');
      if(team){
        let extra='';
        if(m.round<=3){
          const w=winnerOf(m.id);
          if(w){ s.classList.add(team===w?'is-winner':'is-loser'); }
        }else if(m.round===4){
          if(champion && team===champion){ s.classList.add('is-champion'); extra=`<span class="trophy-inline">${TROPHY_SVG}</span>`; }
        }else if(m.round===5){
          if(bronze){
            if(team===bronze){ s.classList.add('is-bronze'); extra=`<span class="medal-inline">🥉</span>`; }
            else s.classList.add('is-loser');
          }
        }
        const clr = (m.round>0) ? `<button class="clr" data-mid="${m.id}" data-i="${i}" title="clear">×</button>` : '';
        s.innerHTML = flagImg(team)+`<span class="code">${team}</span>`+clr+extra;
        if(changed && m.round>0) s.classList.add('just-set');
      }else{
        s.innerHTML = `<span class="ph">${m.slots[i]}</span>`;
      }
    });
  });
  litConnectors();
  updateTrophy();
  updateProgress();
  updateSummary();
}
function tname(c){ return TEAMS[c][0]; }

function updateTrophy(){
  const t=document.getElementById('bigTrophy');
  const nm=document.getElementById('champName');
  if(!t) return;
  if(champion){
    t.classList.remove('dim'); t.classList.add('lit');
    nm.textContent = tname(champion).toUpperCase();
  }else{
    t.classList.add('dim'); t.classList.remove('lit');
    nm.textContent = '';
  }
}

function totalPicks(){ return MATCHES.filter(m=>m.round>0 && m.round!==5).reduce((a,m)=>a+2,0)+1; }
function madePicks(){
  let n=0;
  MATCHES.forEach(m=>{ if(m.round>0 && m.round!==5){ if(resolved(m,0))n++; if(resolved(m,1))n++; } });
  if(champion) n++;
  return n;
}
function updateProgress(){
  const pct = Math.round(madePicks()/totalPicks()*100);
  document.getElementById('progFill').style.width = pct+'%';
  document.getElementById('progPct').textContent = pct+'%';
}

function pill(code,champ){
  if(!code) return `<span class="pill" style="opacity:.5">—</span>`;
  return `<span class="pill${champ?' champ':''}">${flagImg(code,'')}${code}</span>`;
}
function updateSummary(){
  const fin=byId['M104'];
  const f1=resolved(fin,0), f2=resolved(fin,1);
  const third=byId['M103'];
  const t1=resolved(third,0), t2=resolved(third,1);
  document.getElementById('summary').innerHTML =
    `<span class="lbl">Final:</span> ${pill(f1)} <span style="color:var(--muted)">vs</span> ${pill(f2)}<br>`+
    `<span class="lbl">Champion:</span> ${champion?pill(champion,true):'<span class="pill" style="opacity:.5">not crowned yet</span>'}<br>`+
    `<span class="lbl">3rd place:</span> ${bronze?pill(bronze):'<span class="pill" style="opacity:.5">—</span>'} `+
    `<span style="color:var(--muted);font-size:12px">(play-off: ${t1||'?'} vs ${t2||'?'})</span>`;
}

/* ---------------- celebration ---------------- */
const COLORS=['#ffd86b','#3c5cff','#ff5b74','#46c47e','#ff9e2c','#a06bff','#ffffff'];
function confettiBurst(){
  const host=document.getElementById('confetti');
  for(let i=0;i<140;i++){
    const c=el('div','conf');
    const x=Math.random()*100;
    c.style.left=x+'vw';
    c.style.top='-20px';
    c.style.background=COLORS[i%COLORS.length];
    c.style.opacity=String(.7+Math.random()*.3);
    const dur=2.6+Math.random()*1.8;
    const drift=(Math.random()*2-1)*120;
    const rot=Math.random()*720;
    c.animate([
      {transform:`translate(0,0) rotate(0deg)`},
      {transform:`translate(${drift}px,${window.innerHeight+60}px) rotate(${rot}deg)`}
    ],{duration:dur*1000,easing:'cubic-bezier(.25,.6,.4,1)'});
    host.appendChild(c);
    setTimeout(()=>c.remove(),dur*1000);
  }
}
function showToast(team){
  const t=document.getElementById('toast');
  t.innerHTML=`<span style="width:20px;height:20px;display:inline-block">${TROPHY_SVG}</span> ${tname(team)} are World Champions!`;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer=setTimeout(()=>t.classList.remove('show'),3200);
}
function maybeCelebrate(){
  if(champion && champion!==prevChampion){
    confettiBurst(); showToast(champion);
  }
  prevChampion=champion;
}

/* ---------------- interaction ---------------- */
function onDragStart(e){
  const s=e.currentTarget; const [,mid,i]=s.id.split('-'); const m=byId[mid];
  const team=resolved(m,+i);
  if(!team){ e.preventDefault(); return; }
  dragTeam=team; e.dataTransfer.setData('text/plain',team); e.dataTransfer.effectAllowed='copy';
  s.classList.add('dragging');
}
function onDragEnd(e){ dragTeam=null; e.currentTarget.classList.remove('dragging'); clearHi(); }
function onDragOver(e){
  const s=e.currentTarget; const [,mid,i]=s.id.split('-'); const m=byId[mid];
  if(m.round===0 || m.round===5 || !dragTeam) return;
  if(validFor(m,+i).includes(dragTeam)){ e.preventDefault(); s.classList.add('drop-ok'); }
}
function onDragLeave(e){ e.currentTarget.classList.remove('drop-ok'); }
function onDrop(e){
  const s=e.currentTarget; s.classList.remove('drop-ok');
  const [,mid,i]=s.id.split('-'); const m=byId[mid];
  if(m.round===0 || m.round===5) return;
  e.preventDefault();
  const team=dragTeam||e.dataTransfer.getData('text/plain');
  if(validFor(m,+i).includes(team)){ state[mid][+i]=team; revalidate(); render(); maybeCelebrate(); save(); }
}
function clearHi(){ document.querySelectorAll('.drop-ok').forEach(x=>x.classList.remove('drop-ok')); }

bracket.addEventListener('click',e=>{
  const clr=e.target.closest('.clr');
  if(clr){
    const m=byId[clr.dataset.mid];
    if(m.round===5){ bronze=null; render(); save(); return; }
    state[clr.dataset.mid][+clr.dataset.i]=null; revalidate(); render(); save(); return;
  }
  const s=e.target.closest('.slot'); if(!s) return;
  const [,mid,i]=s.id.split('-'); const m=byId[mid];
  const team=resolved(m,+i); if(!team) return;
  if(m.round<=3){
    const d=downstream[mid]; if(!d) return;
    state[d.mid][d.sidx] = (state[d.mid][d.sidx]===team) ? null : team;
    revalidate(); render(); maybeCelebrate(); save();
  }else if(m.round===4){
    champion = (champion===team)?null:team; render(); maybeCelebrate(); save();
  }else if(m.round===5){
    bronze = (bronze===team)?null:team; render(); save();
  }
});

/* auto-fill + reset */
function simulate(){
  MATCHES.forEach(m=>{ if(m.round>0 && m.round!==5) state[m.id]=[null,null]; });
  champion=null; bronze=null; prevChampion=null;
  [0,1,2,3].forEach(r=>{
    MATCHES.filter(m=>m.round===r).forEach(m=>{
      const t=[resolved(m,0),resolved(m,1)];
      if(t[0]&&t[1]){
        const w=t[Math.floor(Math.random()*2)];
        const d=downstream[m.id]; if(d) state[d.mid][d.sidx]=w;
      }
    });
  });
  const fin=byId['M104']; const fs=[resolved(fin,0),resolved(fin,1)].filter(Boolean);
  if(fs.length===2) champion=fs[Math.floor(Math.random()*2)];
  revalidate();
  const third=byId['M103']; const bs=[resolved(third,0),resolved(third,1)].filter(Boolean);
  if(bs.length===2) bronze=bs[Math.floor(Math.random()*2)];
  render(); maybeCelebrate(); save();
}
function resetAll(){
  MATCHES.forEach(m=>{ if(m.round>0 && m.round!==5) state[m.id]=[null,null]; });
  champion=null; bronze=null; prevChampion=null; revalidate(); render(); save();
  if(history.replaceState) history.replaceState(null,'',location.pathname);
  markSaved('Cleared ✓');
}
document.getElementById('simBtn').addEventListener('click',simulate);
document.getElementById('resetBtn').addEventListener('click',resetAll);

/* export / import JSON */
function exportJSON(){
  const data=JSON.stringify(snapshot(),null,2);
  const blob=new Blob([data],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download='bracket-data.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  markSaved('Exported ✓');
}
function importJSON(file){
  const r=new FileReader();
  r.onload=()=>{
    try{ applySnapshot(JSON.parse(r.result)); prevChampion=champion; render(); save(); markSaved('Imported ✓'); }
    catch(e){ alert('That file is not a valid bracket-data.json.'); }
  };
  r.readAsText(file);
}
document.getElementById('exportBtn').addEventListener('click',exportJSON);
document.getElementById('importBtn').addEventListener('click',()=>document.getElementById('importFile').click());
document.getElementById('importFile').addEventListener('change',e=>{
  if(e.target.files[0]) importJSON(e.target.files[0]);
  e.target.value='';
});

/* ============================================================
   SHARE MODAL
   ============================================================ */
const shareModal = document.getElementById('shareModal');
const shareLinkInput = document.getElementById('shareLink');
const shareNote = document.getElementById('shareNote');

function shareText(){
  if(champion) return `My FIFA World Cup 26 winner: ${tname(champion)} 🏆 — see my full bracket:`;
  return `Check out my FIFA World Cup 26 bracket prediction:`;
}
function openShare(){
  const url = buildShareURL();
  shareLinkInput.value = url;
  shareNote.textContent = '';
  const txt = encodeURIComponent(shareText());
  const enc = encodeURIComponent(url);
  document.getElementById('shareTwitter').href = `https://twitter.com/intent/tweet?text=${txt}&url=${enc}`;
  document.getElementById('shareWhatsApp').href = `https://wa.me/?text=${txt}%20${enc}`;
  // also reflect it in the address bar so a refresh keeps the shared state
  if(history.replaceState) history.replaceState(null,'', '#p='+encodeShare());
  shareModal.classList.add('show');
  shareModal.setAttribute('aria-hidden','false');
}
function closeShare(){
  shareModal.classList.remove('show');
  shareModal.setAttribute('aria-hidden','true');
}
document.getElementById('shareBtn').addEventListener('click',openShare);
document.getElementById('shareClose').addEventListener('click',closeShare);
shareModal.addEventListener('click',e=>{ if(e.target===shareModal) closeShare(); });

document.getElementById('copyLink').addEventListener('click',async()=>{
  const url = shareLinkInput.value;
  try{
    await navigator.clipboard.writeText(url);
    shareNote.textContent = 'Link copied to clipboard ✓';
  }catch(e){
    shareLinkInput.select();
    document.execCommand('copy');
    shareNote.textContent = 'Link copied ✓';
  }
});

document.getElementById('shareNative').addEventListener('click',async()=>{
  const url = shareLinkInput.value;
  if(navigator.share){
    try{ await navigator.share({title:'My World Cup 26 bracket', text:shareText(), url}); }
    catch(e){ /* user cancelled */ }
  }else{
    shareLinkInput.select(); document.execCommand('copy');
    shareNote.textContent = 'Sharing not supported here — link copied instead ✓';
  }
});

/* ============================================================
   PNG EXPORT  — rasterise the bracket via SVG <foreignObject>.
   Inlines flag images as data URLs so the canvas isn't tainted.
   ============================================================ */
async function fetchAsDataURL(url){
  const resp = await fetch(url, {mode:'cors'});
  const blob = await resp.blob();
  return await new Promise((res,rej)=>{
    const fr=new FileReader();
    fr.onload=()=>res(fr.result); fr.onerror=rej;
    fr.readAsDataURL(blob);
  });
}

async function exportPNG(){
  const btn=document.getElementById('pngBtn');
  const old=btn.textContent; btn.textContent='Rendering…'; btn.style.pointerEvents='none';
  try{
    const node = bracket;
    const W = node.scrollWidth, H = node.scrollHeight;

    // clone and inline every flag image as a data URL
    const clone = node.cloneNode(true);
    const origImgs = node.querySelectorAll('img');
    const cloneImgs = clone.querySelectorAll('img');
    await Promise.all(Array.from(origImgs).map(async(img,k)=>{
      try{
        const data = await fetchAsDataURL(img.src);
        cloneImgs[k].setAttribute('src', data);
        cloneImgs[k].removeAttribute('crossorigin');
      }catch(e){ /* leave as-is */ }
    }));

    // pull the page stylesheet text so the clone is styled inside the SVG
    let cssText='';
    for(const sheet of document.styleSheets){
      try{ for(const rule of sheet.cssRules) cssText += rule.cssText+'\n'; }catch(e){}
    }

    const xml = new XMLSerializer().serializeToString(clone);
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`+
      `<foreignObject width="100%" height="100%">`+
      `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${W}px;height:${H}px;background:#f4f6fb;position:relative;">`+
      `<style>${cssText}</style>${xml}</div>`+
      `</foreignObject></svg>`;

    const svgBlob = new Blob([svg],{type:'image/svg+xml;charset=utf-8'});
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.crossOrigin='anonymous';
    await new Promise((res,rej)=>{ img.onload=res; img.onerror=rej; img.src=url; });

    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = W*scale; canvas.height = H*scale;
    const ctx = canvas.getContext('2d');
    ctx.scale(scale,scale);
    ctx.fillStyle='#f4f6fb'; ctx.fillRect(0,0,W,H);
    ctx.drawImage(img,0,0);
    URL.revokeObjectURL(url);

    canvas.toBlob(b=>{
      const a=document.createElement('a');
      a.href=URL.createObjectURL(b);
      const champ = champion ? tname(champion).replace(/\s+/g,'-') : 'bracket';
      a.download=`wc2026-${champ}.png`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(a.href),1000);
      markSaved('PNG exported ✓');
    },'image/png');
  }catch(err){
    console.error(err);
    alert('Could not generate the PNG in this browser. Try the screenshot tool, or use Chrome/Edge/Firefox.');
  }finally{
    btn.textContent=old; btn.style.pointerEvents='';
  }
}
document.getElementById('pngBtn').addEventListener('click',exportPNG);

/* ---------------- init ---------------- */
buildConnectors();
buildHeads();
buildCards();

/* priority: a shared link in the URL wins over local storage */
if(!loadFromURL()){
  loadStored();
}
prevChampion=champion;
render();
