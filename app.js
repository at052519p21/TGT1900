/* CSVファイル名（index.html と同じフォルダに置く）。名前を変えたらここも変える */
const CSV_FILE='ターゲット1900_例文付き.csv';
const $=id=>document.getElementById(id);
const esc=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
// 意味の中のアルファベット部分だけ別フォントにするため、<span class="lat"> で囲む
const lat=s=>s.split(/([A-Za-z]+(?:[ '’\-][A-Za-z]+)*)/).map((t,i)=>i%2?`<span class="lat">${esc(t)}</span>`:esc(t)).join('');
function parseCSV(t){
  const rows=[];let row=[],f='',q=false;
  for(let i=0;i<t.length;i++){
    const c=t[i];
    if(q){ if(c=='"'){ if(t[i+1]=='"'){f+='"';i++} else q=false } else f+=c }
    else if(c=='"') q=true;
    else if(c==','){row.push(f);f=''}
    else if(c=='\n'||c=='\r'){ if(c=='\r'&&t[i+1]=='\n')i++; row.push(f);rows.push(row);row=[];f='' }
    else f+=c;
  }
  if(f!==''||row.length){row.push(f);rows.push(row)}
  return rows;
}
let words=[],tree=[],viewState=null,cur='home',rv=null,tm=null;
let sTarget='head', sMode='prefix';                 // 検索の対象（見出し語/意味）と一致方法
const S={head:0,mean:0,main:0,ex:0,blank:0,ja:0};   // 赤シート（1=隠す）
const q=$('q'), sc={toc:0};
const rng=(a,b)=>a==b?`(${a})`:`(${a}~${b})`;
const range=(a,b)=>Array.from({length:b-a+1},(_,i)=>a+i);

/* ---------- 目次の構造（CSVの品詞列が同じ範囲ごとに「〇〇編」） ---------- */
function groupsOf(s){
  const base=s*100, ws=words.slice(base,base+100), g=[];
  for(let i=0;i<ws.length;){
    let j=i; while(j<ws.length&&ws[j].pos==ws[i].pos)j++;
    g.push({label:ws[i].pos+'編',from:base+i+1,to:base+j}); i=j;
  }
  return g;
}
const PARTS=[['Part 1　常に試験に出る基本単語800語',1,800],['Part 2　常に試験に出る重要単語700語',801,1500],['Part 3　ここで差がつく難単語400語',1501,1900]];
function buildTree(){
  tree=PARTS.map(([title,a,b])=>({label:title,from:a,to:b,
    children:Array.from({length:(b-a+1)/100},(_,k)=>{const s=(a-1)/100+k;
      return {label:`Section ${s+1}`,from:s*100+1,to:s*100+100,children:groupsOf(s)};})}));
}
// 閲覧画面のタイトル: Part 1 / Section 1 / Section 1 動詞編
function build(n,depth,parent){
  const li=document.createElement('li'), row=document.createElement('div'); row.className='row';
  const has=n.children&&n.children.length;
  const tg=document.createElement(has?'button':'span'); tg.className='tg'+(has?'':' sp');
  if(has){ tg.setAttribute('aria-label','開閉'); tg.onclick=()=>li.classList.toggle('open'); }
  const a=document.createElement('a'); a.className='lab d'+depth; a.href='#v';
  a.textContent=`${n.label} ${rng(n.from,n.to)}`;
  const title=depth==0?n.label.split('　')[0]:depth==1?n.label:`${parent} ${n.label}`;
  a.onclick=e=>{e.preventDefault();openView(title,range(n.from,n.to))};
  row.append(tg,a); li.append(row);
  if(has){ const ul=document.createElement('ul'); n.children.forEach(c=>ul.append(build(c,depth+1,n.label))); li.append(ul); }
  return li;
}
function buildTOC(){ const ul=document.createElement('ul'); tree.forEach(n=>ul.append(build(n,0))); $('toc').replaceChildren(ul); } // 最初は全て閉じた状態

/* ---------- 閲覧画面の検索（条件に合わない単語をリストから消すだけ） ---------- */
function shown(){
  const k=q.value.trim().normalize('NFKC'), l=viewState.nos.map(n=>words[n-1]);
  if(!k) return l;
  if(/^\d+$/.test(k)) return l.filter(w=>w.no===+k);
  const lk=k.toLowerCase();
  const t=s=>sMode==='prefix'?s.startsWith(lk):sMode==='suffix'?s.endsWith(lk):s.includes(lk);
  return sTarget==='head'?l.filter(w=>t(w.nw)):l.filter(w=>w.ns.some(t));   // 意味は「；」で区切った各部分を調べる
}
function rowHTML(x){
  const i=x.mean.indexOf('；'), red=i<0?x.mean:x.mean.slice(0,i), rest=i<0?'':x.mean.slice(i);
  const ex=esc(x.ex).replace(/\(([^()]*)\)/g,'<span class="r mkBlank">$1</span>');
  return `<tr><td class="wd"><span class="mkHead"><div class="w">${esc(x.w)}</div><div class="sub pr">${esc(x.pr)}</div></span><div class="sub no">${x.no}</div></td>`
    +`<td class="mn"><span class="mkMean"><span class="r mkMain">${lat(red)}</span><span class="sm">${lat(rest)}</span></span></td>`
    +`<td class="ex"><span class="mkEx">${ex}</span></td><td class="ja"><span class="mkJa">${esc(x.ja)}</span></td></tr>`;
}
function renderView(){
  const l=shown();
  $('body').innerHTML=l.length?l.map(rowHTML).join(''):'<tr><td colspan="4">該当する単語がありません</td></tr>';
  applyFlags();
}
function applySearch(){ clearTimeout(tm); $('clr').hidden=!q.value; renderView(); scrollTo(0,0); }

/* ---------- 赤シート ---------- */
function applyFlags(){
  const t=$('tbl').classList;
  t.toggle('hHead',!!S.head); t.toggle('hMean',!!S.mean); t.toggle('hMain',!S.mean&&!!S.main);
  t.toggle('hEx',!!S.ex); t.toggle('hBlank',!S.ex&&!!S.blank); t.toggle('hJa',!!S.ja);
  $('tbl').querySelectorAll('.rv').forEach(e=>e.classList.remove('rv')); rv=null;
}
const MK='.hHead .mkHead,.hMean .mkMean,.hMain .mkMain,.hEx .mkEx,.hBlank .mkBlank,.hJa .mkJa';
document.head.insertAdjacentHTML('beforeend',`<style>
:is(${MK}){background:var(--mk);border-radius:3px;padding:0 2px;cursor:pointer;user-select:none;-webkit-user-select:none;transition:background .15s;box-decoration-break:clone;-webkit-box-decoration-break:clone}
:is(${MK}):not(.rv),:is(${MK}):not(.rv) *{color:transparent}
:is(${MK}).rv{background:rgba(255,51,51,.15)}</style>`);
// マーカーをタップ→薄くなって見える。もう一度タップ、または別の場所をタップ→元に戻る
document.addEventListener('click',e=>{
  if(cur!=='view') return;
  const m=e.target.closest(MK);
  if(rv&&rv!==m){rv.classList.remove('rv');rv=null}
  if(m){m.classList.toggle('rv');rv=m.classList.contains('rv')?m:null}
});

/* ---------- 中央メニュー（外側のグレー部分をタップで閉じる。変更は「閉じた瞬間」に反映） ---------- */
function modal(html,bind,onClose){
  const o=document.createElement('div'); o.id='ov'; o.innerHTML=`<div class="card">${html}</div>`;
  o.onclick=e=>{ if(e.target===o){ o.remove(); onClose&&onClose(); } };
  document.body.append(o); bind(o);
}
function sheetMenu(){
  const items=[['head','見出し語'],['mean','意味'],['main','主要な意味',1],['ex','例文'],['blank','例文穴埋め',1],['ja','和訳']];
  modal('<h3>赤シート+</h3>'+items.map(([k,t,s])=>`<label class="${s?'sub':''}"><input type="checkbox" data-k="${k}">${t}</label>`).join(''),o=>{
    const sync=()=>o.querySelectorAll('[data-k]').forEach(c=>{
      const k=c.dataset.k, par={main:'mean',blank:'ex'}[k];
      c.checked=!!S[k]||!!(par&&S[par]); c.disabled=!!(par&&S[par]);   // 親が選ばれていたらチェック固定
    });
    o.onchange=e=>{S[e.target.dataset.k]=e.target.checked?1:0; sync()};
    sync();
  },()=>applyFlags());
}

/* ---------- 虫眼鏡のプルダウン（閉じた瞬間に検索へ反映） ---------- */
const pop=$('pop');
function syncPop(){
  pop.querySelectorAll('[data-t]').forEach(e=>e.firstChild.textContent=e.dataset.t===sTarget?'✓':'');
  pop.querySelectorAll('[data-m]').forEach(e=>e.firstChild.textContent=e.dataset.m===sMode?'✓':'');
}
function openPop(){
  syncPop(); pop.hidden=false;
  const r=$('mg').getBoundingClientRect();
  pop.style.top=(r.bottom+6)+'px'; pop.style.left=Math.max(8,Math.min(r.left,innerWidth-218))+'px';
}
function closePop(){ if(pop.hidden) return; pop.hidden=true; applySearch(); }
$('mg').onclick=()=>pop.hidden?openPop():closePop();
pop.onclick=e=>{
  const it=e.target.closest('.pi'); if(!it) return;
  if(it.dataset.t) sTarget=it.dataset.t;
  else if(it.dataset.m) sMode=it.dataset.m;
  else { $('sub').hidden=!$('sub').hidden; it.classList.toggle('open'); }
  syncPop();
};
document.addEventListener('click',e=>{ if(!pop.hidden&&!pop.contains(e.target)&&!$('mg').contains(e.target)) closePop(); });

/* ---------- 画面切り替え（#なし=ホーム / #toc=目次 / #all=1900 / #v=目次から選んだ範囲） ---------- */
function openView(title,nos){ viewState={title,nos}; location.hash='#v'; }
function toast(m){ const t=document.createElement('div'); t.id='toast'; t.textContent=m; document.body.append(t); setTimeout(()=>t.remove(),1800); }
function route(){
  const h=location.hash;
  const next=h==='#toc'?'toc':(h==='#all'||(h==='#v'&&viewState))?'view':'home';
  if(cur==='toc') sc.toc=scrollY;
  if(next==='view'){
    if(h==='#all') viewState={title:'1900',nos:range(1,words.length)};
    if(cur!=='view'){ q.value=''; $('clr').hidden=true; pop.hidden=true; }
  } else { q.blur(); pop.hidden=true; }
  cur=next; document.body.className='scr-'+next;
  if(next==='view'){ $('ttl').textContent=viewState.title; renderView(); scrollTo(0,0); }
  else scrollTo(0,next==='toc'?sc.toc:0);
}
addEventListener('hashchange',()=>{ if(words.length) route(); });
document.querySelectorAll('.back').forEach(b=>b.onclick=()=>history.back());
document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{
  const g=b.dataset.go;
  if(g==='all') location.hash='#all'; else if(g==='toc') location.hash='#toc'; else toast('この機能は次の段階で追加します');
});
$('sheetBtn').onclick=sheetMenu;
q.oninput=()=>{ $('clr').hidden=!q.value; clearTimeout(tm); tm=setTimeout(applySearch,300); };
q.onkeydown=e=>{ if(e.key==='Enter'){ applySearch(); q.blur(); } };
$('clr').onclick=()=>{ q.value=''; applySearch(); };

/* ---------- CSVの読み込み ---------- */
const msg=$('msg');
function init(text){
  words=parseCSV(text.replace(/^\uFEFF/,'').trim()).slice(1).filter(r=>r.length>=7)
    .map(r=>({no:+r[0],pos:r[1],w:r[2],pr:r[3],mean:r[4],ex:r[5],ja:r[6]}));
  if(words.length!==1900 || words.some((x,i)=>x.no!==i+1)){
    words=[]; msg.hidden=false;
    msg.textContent='CSVの形式が想定と違います（1900語・番号が1から順に並んでいる必要があります）。';
    return;
  }
  words.forEach(w=>{ w.nw=w.w.toLowerCase(); w.ns=w.mean.normalize('NFKC').toLowerCase().split(';'); });
  msg.hidden=true; buildTree(); buildTOC();
  if(location.hash) history.replaceState(null,'',location.pathname+location.search);  // 再読み込みはホームから
  route();
}
function showPicker(){
  msg.hidden=false;
  msg.innerHTML='CSVを自動で読み込めませんでした（index.html をダブルクリックで開いた場合は、ブラウザの制限でこうなります）。'
    +'<br>下のボタンから <code>'+CSV_FILE+'</code> を選んでください。<br><br><input type="file" id="pick" accept=".csv,text/csv">';
  $('pick').onchange=e=>{const f=e.target.files[0]; if(f) f.text().then(init);};
}
fetch(encodeURI(CSV_FILE),{cache:'no-cache'}).then(r=>{ if(!r.ok) throw new Error(r.status); return r.text(); }).then(init,showPicker);
