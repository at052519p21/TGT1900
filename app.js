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
  return `<tr><td class="wd"><span class="mkHead"><div class="w">${esc(x.w)}</div><div class="sub pr">${esc(x.pr)}</div></span><div class="nr"><span class="sub no">${x.no}</span><span class="tags">${tagBtns(x.no)}</span></div></td>`
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
  const t=$('tbl').classList, S2=viewState&&viewState.plain?{}:S;   // 範囲選択の結果画面には赤シートなし
  t.toggle('hHead',!!S2.head); t.toggle('hMean',!!S2.mean); t.toggle('hMain',!S2.mean&&!!S2.main);
  t.toggle('hEx',!!S2.ex); t.toggle('hBlank',!S2.ex&&!!S2.blank); t.toggle('hJa',!!S2.ja);
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
  const o=document.createElement('div'); o.className='ov'; o.innerHTML=`<div class="card">${html}</div>`;
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
function openView(title,nos,plain){ viewState={title,nos,plain:!!plain}; location.hash=plain?'#rl':'#v'; }
function toast(m){ const t=document.createElement('div'); t.id='toast'; t.textContent=m; document.body.append(t); setTimeout(()=>t.remove(),1800); }
const SCR={'#toc':'toc','#ml':'ml','#rs':'rs','#rs1':'rs','#rs2':'rs','#fc':'fc','#ts':'ts'};
function route(){
  const h=location.hash;
  let next=SCR[h]||'home';
  if(h==='#all'||((h==='#v'||h==='#rl')&&viewState)) next='view';
  if(h==='#fcp'&&FC) next='fcp';
  if(h==='#tsp'&&TS) next='tsp';
  if(cur==='toc'||cur==='ml'||cur==='fc'||cur==='ts') sc[cur]=scrollY;
  if(next==='view'){
    if(h==='#all') viewState={title:'1900',nos:range(1,words.length),plain:false};
    if(cur!=='view'){ q.value=''; $('clr').hidden=true; pop.hidden=true; }
  } else { q.blur(); pop.hidden=true; }
  cur=next; document.body.className='scr-'+next;
  if(next==='view'){ $('view').classList.toggle('plain',!!viewState.plain); $('ttl').textContent=viewState.title; renderView(); scrollTo(0,0); }
  else { if(next==='ml') renderMl(); if(next==='fc') renderFc(); if(next==='ts') renderTs(); if(next==='tsp') tsShow(); if(next==='fcp') fcShow(); if(next==='rs') showRs(h); scrollTo(0,sc[next]||0); }
}
addEventListener('hashchange',()=>{ if(words.length) route(); });
document.querySelectorAll('.back').forEach(b=>b.onclick=()=>history.back());
document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{
  const g=b.dataset.go;
  const to={all:'#all',toc:'#toc',range:'#rs',mylist:'#ml',card:'#fc',test:'#ts'}[g];
  if(to) location.hash=to; else toast('この機能は次の段階で追加します');
});
$('sheetBtn').onclick=sheetMenu;
q.oninput=()=>{ $('clr').hidden=!q.value; clearTimeout(tm); tm=setTimeout(applySearch,300); };
q.onkeydown=e=>{ if(e.key==='Enter'){ applySearch(); q.blur(); } };
$('clr').onclick=()=>{ q.value=''; applySearch(); };

/* ---------- 保存データ（3つの印・マイリスト・フラッシュカード/テストの一覧）。スマホ内の保存領域に自動保存 ---------- */
const KEY='target1900.v1', BIT={bm:1,mem:2,rev:4}, LBL={bm:'ブックマーク',mem:'暗記済み',rev:'要復習'};
const IC={
  bm:'<svg viewBox="0 0 24 24"><path d="M6 3h12v18l-6-4-6 4z" fill="currentColor"/></svg>',
  mem:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M7 12.5l3.5 3.5L17 9" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  rev:'<svg viewBox="0 0 24 24"><path d="M12 2.5L22.5 21h-21z" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 9v5.5" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="17.6" r="1.3" fill="#fff"/></svg>'
};
const FIXED=[['bm','ブックマーク'],['mem','暗記済み'],['rev','要復習']];
let D={tags:{},lists:[],fc:[],ts:[],pref:{}};
function load(){ try{ const j=JSON.parse(localStorage.getItem(KEY)||'null'); if(j) D=Object.assign(D,j); }catch(e){} D.pref=D.pref||{}; }
function save(){ try{ localStorage.setItem(KEY,JSON.stringify(D)); }catch(e){ toast('保存できませんでした'); } }
const has=(n,k)=>((D.tags[n]||0)&BIT[k])>0;
function toggleTag(n,k){   // 暗記済みと要復習は、どちらか一方だけ
  let v=D.tags[n]||0;
  if(v&BIT[k]) v&=~BIT[k]; else { v|=BIT[k]; if(k==='mem') v&=~BIT.rev; if(k==='rev') v&=~BIT.mem; }
  if(v) D.tags[n]=v; else delete D.tags[n];
  save();
}
const tagNos=k=>Object.keys(D.tags).filter(n=>D.tags[n]&BIT[k]).map(Number).sort((a,b)=>a-b);
const tagBtns=n=>['bm','mem','rev'].map(k=>`<button class="t3 t-${k}${has(n,k)?' on':''}" data-t="${k}" data-n="${n}" aria-label="${LBL[k]}">${IC[k]}</button>`).join('');
$('body').addEventListener('click',e=>{
  const b=e.target.closest('.t3'); if(!b) return;
  toggleTag(+b.dataset.n,b.dataset.t);   // 表は作り直さず、印の色だけ更新（マイリスト画面でも、その画面を出るまで単語は消えない）
  b.parentNode.querySelectorAll('.t3').forEach(x=>x.classList.toggle('on',has(+x.dataset.n,x.dataset.t)));
});

/* ---------- ダイアログ・保存 ---------- */
function confirmBox(msg,ok,onOk,danger){
  modal(`<p style="margin:4px 0 16px;font-size:15px">${esc(msg)}</p><div class="btns2"><button class="sb" data-x>キャンセル</button><button class="sb ${danger?'dg':'pri'}" data-ok>${ok}</button></div>`,o=>{
    o.querySelector('[data-x]').onclick=()=>o.remove();
    o.querySelector('[data-ok]').onclick=()=>{ o.remove(); onOk(); };
  });
}
function saveTo(kind,name,nos,done){
  name=name.trim();
  if(!name){ toast('名前を入力してください'); return; }
  if(FIXED.some(f=>f[1]===name)){ toast('その名前は使えません'); return; }
  const arr=D[kind], i=arr.findIndex(l=>l.name===name);
  const doit=()=>{ if(i>=0) arr[i].nos=nos.slice(); else arr.push({name,nos:nos.slice(),at:Date.now(),viewed:0}); save(); toast('保存しました'); done&&done(); };
  if(i>=0) confirmBox(`同じ名前のリスト「${name}」があります。上書き保存しますか？`,'上書き保存',doit); else doit();
}
function saveDlg(title,nos,kinds){
  const lb={lists:'マイリストに保存',fc:'フラッシュカードを作成',ts:'テストを作成'};
  modal('<h3>名前をつけて保存する</h3><input class="txt">'+kinds.map(k=>`<button class="sb wide" data-k="${k}">${kinds.length>1?lb[k]:'保存'}</button>`).join(''),o=>{
    const t=o.querySelector('.txt'); t.value=title;
    o.querySelectorAll('[data-k]').forEach(b=>b.onclick=()=>saveTo(b.dataset.k,t.value,nos,()=>o.remove()));
  });
}
$('addBtn').onclick=()=>saveDlg(viewState.title,viewState.nos,['lists','fc','ts']);

/* ---------- マイリスト ---------- */
function renderMl(){
  const fx=FIXED.map(([k,n])=>`<div class="li" data-f="${k}"><span class="lic t-${k} on">${IC[k]}</span><span class="ln">${n}</span><span class="lc">${tagNos(k).length}語</span></div>`).join('');
  // 閲覧したリストが上（新しい順）、未閲覧は作成順
  const us=D.lists.map((l,i)=>({l,i})).sort((a,b)=>(b.l.viewed||0)-(a.l.viewed||0)||a.l.at-b.l.at)
    .map(({l,i})=>`<div class="li" data-i="${i}"><span class="lic"></span><span class="ln">${esc(l.name)}</span><span class="lc">${l.nos.length}語</span><button class="mm" data-i="${i}" aria-label="メニュー"><svg class="ico" viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="19" r="1.6" fill="currentColor"/></svg></button></div>`).join('');
  $('mlList').innerHTML=fx+us;
}
function closeMenus(){ document.querySelectorAll('.popm').forEach(m=>m.remove()); }
function listMenu(btn,kind,i){
  closeMenus();
  const arr=D[kind], l=arr[i], m=document.createElement('div'); m.className='popm';
  const again=()=>kind==='lists'?renderMl():kind==='fc'?renderFc():renderTs();
  m.innerHTML=(kind==='lists'?'<div class="pi" data-a="fc">フラッシュカードを作成</div><div class="pi" data-a="ts">テストを作成</div>':'')+'<div class="pi" data-a="rn">名前を変更</div><div class="pi dg" data-a="del">削除</div>';
  const r=btn.getBoundingClientRect(); m.style.top=(r.bottom+4)+'px'; m.style.left=Math.max(8,Math.min(r.right-230,innerWidth-238))+'px';
  m.onclick=e=>{
    const a=e.target.closest('.pi'); if(!a) return; closeMenus();
    if(a.dataset.a==='fc'||a.dataset.a==='ts') saveDlg(l.name,l.nos,[a.dataset.a]);
    else if(a.dataset.a==='del') confirmBox(`「${l.name}」を削除しますか？`,'削除',()=>{ arr.splice(i,1); save(); again(); },true);
    else modal('<h3>名前を変更</h3><input class="txt"><button class="sb wide pri">保存</button>',o=>{
      const t=o.querySelector('.txt'); t.value=l.name;
      o.querySelector('.sb').onclick=()=>{
        const nm=t.value.trim();
        if(!nm){ toast('名前を入力してください'); return; }
        if(nm!==l.name&&(arr.some(x=>x.name===nm)||FIXED.some(f=>f[1]===nm))){ toast('同じ名前のリストがあります'); return; }
        l.name=nm; save(); o.remove(); again();
      };
    });
  };
  document.body.append(m);
}
$('mlList').addEventListener('click',e=>{
  const mm=e.target.closest('.mm'); if(mm){ listMenu(mm,'lists',+mm.dataset.i); return; }
  const el=e.target.closest('.li'); if(!el) return;
  if(el.dataset.f){ const f=FIXED.find(x=>x[0]===el.dataset.f); openView(f[1],tagNos(f[0])); }
  else { const l=D.lists[+el.dataset.i]; l.viewed=Date.now(); save(); openView(l.name,l.nos); }
});
document.addEventListener('click',e=>{ if(!e.target.closest('.popm')&&!e.target.closest('.mm')) closeMenus(); });

/* ---------- 範囲選択（パート・セクション・品詞 ／ 単語番号。どちらか一方だけ） ---------- */
const F={sec:new Set(),pos:new Set(),lo:1,hi:1900}; let POS=[];
const secNo=s=>(s.from-1)/100+1;
function secLabel(){
  const a=[...F.sec].sort((x,y)=>x-y);
  if(a.length===words.length/100) return 'All Sections';
  if(!a.length) return 'Sectionなし';
  const r=[]; for(let i=0;i<a.length;){let j=i; while(a[j+1]===a[j]+1)j++; r.push(i===j?`Section ${a[i]}`:`Section ${a[i]}~${a[j]}`); i=j+1}
  return r.join(', ');
}
function numRange(){ return F.lo<=F.hi?[F.lo,F.hi]:[F.hi,F.lo]; }
function rsList(kind){ const [a,b]=numRange(); return kind==='num'?words.filter(w=>w.no>=a&&w.no<=b):words.filter(w=>F.sec.has(w.sec)&&F.pos.has(w.pos)); }
function rsTitle(kind){
  if(kind==='num'){ const [a,b]=numRange(); return `番号 ${a}~${b}`; }
  const kn=F.pos.size===POS.length?'単語':(POS.filter(p=>F.pos.has(p)).join('・')||'品詞なし');
  return `${kn}（${secLabel()}）`;
}
function syncRs(){
  const N=words.length/100, c=rsList('sec').length, d=rsList('num').length;
  document.querySelectorAll('#rs1c [data-s]').forEach(x=>x.checked=F.sec.has(+x.dataset.s));
  document.querySelectorAll('#rs1c [data-pos]').forEach(x=>x.checked=F.pos.has(x.dataset.pos));
  document.querySelectorAll('#rs1c [data-p]').forEach(x=>{
    const ns=tree[x.dataset.p].children.map(secNo), k=ns.filter(n=>F.sec.has(n)).length;
    x.checked=k===ns.length; x.indeterminate=k>0&&k<ns.length;
  });
  document.querySelector('#rs1c [data-all=sec]').textContent=F.sec.size===N?'すべて解除':'すべて選択';
  document.querySelector('#rs1c [data-all=pos]').textContent=F.pos.size===POS.length?'すべて解除':'すべて選択';
  $('cnt1').textContent=`該当 ${c}語`; $('go1').disabled=c===0;
  $('cnt2').textContent=`該当 ${d}語`; $('go2').disabled=d===0;
}
function buildRs(){
  let h='<div class="gt">パート・セクション<button class="all" data-all="sec"></button></div>';
  tree.forEach((p,i)=>{
    h+=`<label><input type="checkbox" data-p="${i}"><b>${p.label.split('　')[0]}</b>&nbsp;${rng(p.from,p.to)}</label><div class="grid">`
      +p.children.map(s=>`<label><input type="checkbox" data-s="${secNo(s)}">${s.label}</label>`).join('')+'</div>';
  });
  h+='<div class="gt">品詞<button class="all" data-all="pos"></button></div><div class="grid g0">'+POS.map(p=>`<label><input type="checkbox" data-pos="${p}">${p}</label>`).join('')+'</div>';
  const box=$('rs1c'); box.innerHTML=h;
  box.onchange=e=>{
    const c=e.target, on=c.checked, d=c.dataset;
    if(d.s) on?F.sec.add(+d.s):F.sec.delete(+d.s);
    else if(d.pos) on?F.pos.add(d.pos):F.pos.delete(d.pos);
    else tree[d.p].children.forEach(s=>on?F.sec.add(secNo(s)):F.sec.delete(secNo(s)));
    syncRs();
  };
  box.onclick=e=>{
    const b=e.target.closest('.all'); if(!b) return;
    if(b.dataset.all==='sec') F.sec=F.sec.size===words.length/100?new Set():new Set(range(1,words.length/100));
    else F.pos=F.pos.size===POS.length?new Set():new Set(POS);
    syncRs();
  };
  const num=(el,def)=>{ const v=parseInt(el.value,10); return isNaN(v)?def:Math.min(words.length,Math.max(1,v)); };
  $('lo').oninput=e=>{ F.lo=num(e.target,1); syncRs(); };
  $('hi').oninput=e=>{ F.hi=num(e.target,words.length); syncRs(); };
}
function showRs(h){
  ['rs0','rs1','rs2'].forEach((id,i)=>{ $(id).hidden=!((h==='#rs'&&i===0)||(h==='#rs1'&&i===1)||(h==='#rs2'&&i===2)); });
  if(h!=='#rs') syncRs();
}
$('b1').onclick=()=>{ location.hash='#rs1'; };
$('b2').onclick=()=>{ location.hash='#rs2'; };
$('go1').onclick=()=>openView(rsTitle('sec'),rsList('sec').map(w=>w.no),true);
$('go2').onclick=()=>openView(rsTitle('num'),rsList('num').map(w=>w.no),true);

/* ---------- フラッシュカード ---------- */
const FCM={hm:['見出し語','意味',1],hmain:['見出し語','主要な意味',1],exja:['例文','日本語訳',1],blank:['例文穴埋め',0,0],blankh:['例文穴埋め(頭文字ヒントつき)',0,0]};
const FCK={hm:['head','mean'],hmain:['head','main'],exja:['ex','ja'],blank:['blank','ans'],blankh:['blankh','ans']};
let FC=null, fcBusy=false;
const shuffle=a=>{ for(let i=a.length-1;i>0;i--){const k=Math.floor(Math.random()*(i+1));[a[i],a[k]]=[a[k],a[i]];} return a; };
const exMap=(s,fn)=>s.split(/\(([^()]*)\)/).map((t,i)=>i%2?fn(t):esc(t)).join('');
function facePart(w,k){
  const i=w.mean.indexOf('；'), red=i<0?w.mean:w.mean.slice(0,i), rest=i<0?'':w.mean.slice(i);
  if(k==='head') return `<div class="fw">${esc(w.w)}</div><div class="fp">${esc(w.pr)}</div>`;
  if(k==='mean') return `<div class="fm"><span class="r">${lat(red)}</span><span class="sm">${lat(rest)}</span></div>`;
  if(k==='main') return `<div class="fm"><span class="r">${lat(red)}</span></div>`;
  if(k==='ex') return `<div class="fe">${exMap(w.ex,t=>`<span class="r">${esc(t)}</span>`)}</div>`;
  if(k==='ja') return `<div class="fj">${esc(w.ja)}</div>`;
  if(k==='ans') return `<div class="fe">${w.ex.split(/\(([^()]*)\)/).filter((t,i)=>i%2).map(t=>`<span class="r">${esc(t)}</span>`).join('、')}</div>`;
  const hint=k==='blankh';   // blank / blankh: （ ）を空欄にした例文＋日本語訳。ヒント付きは頭文字だけ表示
  return `<div class="fe">${exMap(w.ex,t=>`<span class="bl">${hint?esc(t[0])+'…':'&nbsp;'}</span>`)}</div><div class="fj">${esc(w.ja)}</div>`;
}
function fcShowCard(){
  const w=words[FC.deck[FC.i]-1], ks=FCK[FC.o.mode], sw=FC.o.swap&&FCM[FC.o.mode][2];
  const k=(sw?[ks[1],ks[0]]:ks)[FC.flip?1:0];
  $('fcFace').innerHTML=facePart(w,k);
}
function fcShow(){
  const c=$('fcCard'); c.style.transition='none'; c.style.transform='';
  document.querySelectorAll('.hint').forEach(x=>x.style.opacity=0);
  const done=FC.i>=FC.deck.length;
  c.hidden=done; $('fcEnd').hidden=!done;
  $('fcProg').textContent=`${Math.min(FC.i+1,FC.deck.length)} / ${FC.deck.length}`;
  if(!done) document.querySelector('.hint.r').textContent=has(FC.deck[FC.i],'rev')?'要復習を解除':'暗記済み';   // 要復習の単語は右スライド＝解除
  if(done) fcEnd(); else fcShowCard();
}
function startFc(getNos,o,rec,deckNos){
  let pool=deckNos||getNos().filter(n=>!(o.ex&&has(n,'mem')));
  if(!pool.length){ toast('出題できる単語がありません'); return; }
  const deck=shuffle(pool.slice()).slice(0,deckNos?pool.length:Math.min(o.n,pool.length));
  FC={getNos,o,rec,deck,i:0,flip:false,hist:[],cnt:{rev:0,mem:0,rel:0,skip:0},revNos:[]};
  if(rec){ rec.viewed=Date.now(); save(); }
  if(location.hash==='#fcp') route(); else location.hash='#fcp';
}
function setTagOn(n,k){ let v=(D.tags[n]||0)|BIT[k]; v&=~(k==='mem'?BIT.rev:BIT.mem); D.tags[n]=v; save(); }
function fcAct(act,dx,dy){
  if(fcBusy||!FC||FC.i>=FC.deck.length) return; fcBusy=true;
  const c=$('fcCard'), n=FC.deck[FC.i];
  c.style.transition='transform .18s'; c.style.transform=`translate(${dx*520}px,${dy*520}px) rotate(${dx*18}deg)`;
  setTimeout(()=>{
    const pv=D.tags[n]||0;
    if(act==='mem'&&(pv&BIT.rev)) act='rel';   // 要復習の単語を右へ → 暗記済みにはせず、要復習を解除するだけ
    FC.hist.push({n,prev:pv,act});
    if(act==='rel'){ const v=pv&~BIT.rev; if(v) D.tags[n]=v; else delete D.tags[n]; save(); }
    else if(act!=='skip') setTagOn(n,act);
    FC.cnt[act]++; if(act==='rev') FC.revNos.push(n);
    FC.i++; FC.flip=false; fcBusy=false; fcShow();
  },180);
}
function fcUndo(){
  if(fcBusy||!FC||!FC.hist.length) return;
  const h=FC.hist.pop();
  if(h.prev) D.tags[h.n]=h.prev; else delete D.tags[h.n];   // 先の分類を取り消す
  save(); FC.cnt[h.act]--; if(h.act==='rev') FC.revNos.pop();
  FC.i--; FC.flip=false; fcShow();
}
function fcEnd(){
  const e=$('fcEnd'), c=FC.cnt;
  e.innerHTML=`<h2>おつかれさまでした</h2><p>要復習 ${c.rev}語／暗記済み ${c.mem}語／要復習を解除 ${c.rel}語／スキップ ${c.skip}語</p>`
    +(FC.revNos.length?'<button class="sb wide pri" data-a="rv">要復習になった単語でもう一度</button>':'')
    +'<button class="sb wide" data-a="again">同じ設定でもう一度</button><button class="sb wide" data-a="back">一覧に戻る</button>';
  e.onclick=ev=>{
    const a=ev.target.dataset.a; if(!a) return;
    if(a==='back') history.back();
    else if(a==='again') startFc(FC.getNos,FC.o,FC.rec);
    else startFc(FC.getNos,FC.o,FC.rec,FC.revNos.slice());
  };
}
// カードの操作: タップでめくる／左=要復習／右=暗記済み／上=スキップ（キーボードの矢印・スペースも可）
(function(){
  const c=$('fcCard'); let d=null; const T=90;
  const hint=(dx,dy)=>{ const [l,r,u]=document.querySelectorAll('.hint'); l.style.opacity=Math.min(1,Math.max(0,-dx/T)); r.style.opacity=Math.min(1,Math.max(0,dx/T)); u.style.opacity=Math.abs(dy)>Math.abs(dx)?Math.min(1,Math.max(0,-dy/T)):0; };
  c.addEventListener('pointerdown',e=>{ if(fcBusy) return; d={x:e.clientX,y:e.clientY,dx:0,dy:0}; c.setPointerCapture(e.pointerId); c.style.transition='none'; });
  c.addEventListener('pointermove',e=>{ if(!d) return; d.dx=e.clientX-d.x; d.dy=e.clientY-d.y;
    c.style.transform=`translate(${d.dx}px,${Math.min(0,d.dy)}px) rotate(${d.dx/20}deg)`; hint(d.dx,d.dy); });
  const end=e=>{ if(!d) return; const {dx,dy}=d; d=null; c.style.transition='transform .15s';
    if(Math.abs(dx)<8&&Math.abs(dy)<8){ c.style.transform=''; if(e.type==='pointerup'){ FC.flip=!FC.flip; fcShowCard(); } return; }
    if(Math.abs(dx)>=Math.abs(dy)&&dx<-T) fcAct('rev',-1,0);
    else if(Math.abs(dx)>=Math.abs(dy)&&dx>T) fcAct('mem',1,0);
    else if(dy<-T&&Math.abs(dy)>Math.abs(dx)) fcAct('skip',0,-1);
    else { c.style.transform=''; hint(0,0); } };
  c.addEventListener('pointerup',end); c.addEventListener('pointercancel',end);
  addEventListener('keydown',e=>{ if(cur!=='fcp') return;
    if(e.key==='ArrowLeft') fcAct('rev',-1,0); else if(e.key==='ArrowRight') fcAct('mem',1,0); else if(e.key==='ArrowUp') fcAct('skip',0,-1);
    else if(e.key===' '||e.key==='Enter'){ e.preventDefault(); if(FC&&FC.i<FC.deck.length){ FC.flip=!FC.flip; fcShowCard(); } }
    else if(e.key==='z'||e.key==='Backspace') fcUndo(); });
  $('fcUndo').onclick=fcUndo;
})();

// 一覧
function renderFc(){
  const fx=[['bm','ブックマーク'],['rev','要復習']].map(([k,n])=>`<div class="li" data-f="${k}"><span class="lic t-${k} on">${IC[k]}</span><span class="ln">${n}</span><span class="lc">${tagNos(k).length}語</span></div>`).join('');
  const us=D.fc.map((l,i)=>({l,i})).sort((a,b)=>(b.l.viewed||0)-(a.l.viewed||0)||a.l.at-b.l.at)   // プレイしたリストが上
    .map(({l,i})=>`<div class="li" data-i="${i}"><span class="lic"></span><span class="ln">${esc(l.name)}</span><span class="lc">${l.nos.length}語</span><button class="mm" data-i="${i}" aria-label="メニュー"><svg class="ico" viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="19" r="1.6" fill="currentColor"/></svg></button></div>`).join('');
  $('fcList').innerHTML=fx+us;
}
$('fcList').addEventListener('click',e=>{
  const mm=e.target.closest('.mm'); if(mm){ listMenu(mm,'fc',+mm.dataset.i); return; }
  const el=e.target.closest('.li'); if(!el) return;
  if(el.dataset.f){ const k=el.dataset.f; fcDlg(FIXED.find(x=>x[0]===k)[1],()=>tagNos(k),null,k==='rev'); }
  else { const l=D.fc[+el.dataset.i]; fcDlg(l.name,()=>l.nos,l,false); }
});
// 設定ウィンドウ
function fcDlg(name,getNos,rec,noExclude){
  const P=Object.assign({mode:'hm',swap:0,ex:1},D.pref.fc||{});
  if(noExclude) P.ex=0;
  const modes=Object.keys(FCM);
  modal(`<h3>${esc(name)}</h3>`+(noExclude?'':'<label><input type="checkbox" id="fx">暗記済みは除外</label>')
    +'<div class="rg" style="margin-top:6px"><input class="num" id="fn" type="number" inputmode="numeric" min="1"> 語 / <span id="fX"></span>語</div>'
    +'<div class="fh"><span>表</span><button id="fsw" aria-label="表と裏を入れ替える">⇄</button><span>裏</span></div>'
    +modes.map(m=>`<label><input type="radio" name="fm" value="${m}"><span data-m="${m}"></span></label>`).join('')
    +'<button class="sb wide pri" id="fgo">フラッシュカードを開始</button>',o=>{
    const fx=o.querySelector('#fx'), fn=o.querySelector('#fn'), go=o.querySelector('#fgo'), sw=o.querySelector('#fsw');
    const avail=()=>getNos().filter(n=>!(P.ex&&has(n,'mem'))).length;
    const clamp=()=>{ const X=avail(); o.querySelector('#fX').textContent=X; let v=parseInt(fn.value,10);
      if(!isNaN(v)&&v>X) fn.value=X; if(!isNaN(v)&&v<1&&X>0) fn.value=1; go.disabled=X===0; };
    const labels=()=>{ modes.forEach(m=>{ const d=FCM[m], s=P.swap&&d[2]; o.querySelector(`[data-m=${m}]`).textContent=d[1]?(s?`${d[1]} → ${d[0]}`:`${d[0]} → ${d[1]}`):d[0];
      o.querySelector(`input[value=${m}]`).checked=P.mode===m; }); sw.disabled=!FCM[P.mode][2]; };
    if(fx){ fx.checked=!!P.ex; fx.onchange=()=>{ P.ex=fx.checked?1:0; fn.value=avail(); clamp(); }; }
    fn.value=avail(); clamp(); labels();
    o.querySelectorAll('input[name=fm]').forEach(r=>r.onchange=()=>{ P.mode=r.value; labels(); });
    sw.onclick=()=>{ P.swap=P.swap?0:1; labels(); };
    fn.oninput=clamp;
    go.onclick=()=>{ const X=avail(); let n=parseInt(fn.value,10); if(isNaN(n)||n>X) n=X; if(n<1) n=1;
      D.pref.fc={mode:P.mode,swap:P.swap,ex:P.ex}; save(); o.remove();
      startFc(getNos,{mode:P.mode,swap:P.swap,ex:P.ex,n},rec); };
  });
}

/* ---------- テスト ---------- */
const TSM={hm:['見出し語','意味',1],hmain:['見出し語','主要な意味',1],blank:['例文穴埋め',0,0],blankh:['例文穴埋め(頭文字ヒントつき)',0,0]};
let TS=null;
const blanks=w=>w.ex.split(/\(([^()]*)\)/).filter((t,i)=>i%2);
const tnorm=s=>s.normalize('NFKC').toLowerCase().replace(/[,、]/g,' ').replace(/\s+/g,' ').trim();
const tsKinds=o=>{ if(o.mode==='hm'||o.mode==='hmain'){ const B=o.mode==='hm'?'mean':'main'; return o.swap?{q:B,a:'head'}:{q:'head',a:B}; } return {q:o.mode,a:'ans'}; };
const tsFmt=o=>((o.mode==='hm'||o.mode==='hmain')&&!o.swap)?'choice':o.fmt;   // 答えが意味のときは選択問題に固定
function chHTML(x,k){   // 答え（選択肢）の表示
  if(k==='head') return `<span class="lw">${esc(x.w)}</span>`;
  if(k==='ans') return `<span class="lw">${esc(blanks(x).join(' '))}</span>`;
  const i=x.mean.indexOf('；'), red=i<0?x.mean:x.mean.slice(0,i), rest=i<0?'':x.mean.slice(i);
  return `<span class="r">${lat(red)}</span>`+(k==='mean'?`<span class="sm">${lat(rest)}</span>`:'');
}
const chPlain=(x,k)=>k==='head'?x.w:k==='ans'?blanks(x).join(' '):(k==='main'?x.mean.split('；')[0]:x.mean);
function distractors(w,k){   // 同じ品詞の他の単語（1900語全体から）4つ
  const pool=shuffle(words.filter(x=>x.pos===w.pos&&x.no!==w.no)), seen=new Set([chPlain(w,k)]), out=[];
  for(const x of pool){ const t=chPlain(x,k); if(!seen.has(t)){ seen.add(t); out.push(x); if(out.length===4) break; } }
  return out;
}
function startTs(getNos,o,rec,deckNos){
  const pool=deckNos||getNos().filter(n=>!(o.ex&&has(n,'mem')));
  if(!pool.length){ toast('出題できる単語がありません'); return; }
  const qs=shuffle(pool.slice()).slice(0,deckNos?pool.length:Math.min(o.n,pool.length));
  TS={getNos,o,rec,qs,i:0,ok:0,wrong:[],ans:false,ch:[]};
  if(rec){ rec.viewed=Date.now(); save(); }
  if(location.hash==='#tsp') route(); else location.hash='#tsp';
}
function tsShow(){ if(TS.i>=TS.qs.length) tsEnd(); else tsQuestion(); }
function tsQuestion(){
  const w=words[TS.qs[TS.i]-1], o=TS.o, K=tsKinds(o), fmt=tsFmt(o);
  TS.ans=false; $('tsEnd').hidden=true; $('tsBody').hidden=false; $('tsFb').innerHTML='';
  $('tsProg').textContent=`${TS.i+1} / ${TS.qs.length}`;
  $('tsQ').innerHTML=facePart(w,K.q);
  const A=$('tsA');
  if(fmt==='choice'){
    TS.ch=shuffle([{x:w,ok:1},...distractors(w,K.a).map(x=>({x,ok:0}))]);
    A.innerHTML=TS.ch.map((c,i)=>`<button class="ch" data-i="${i}">${chHTML(c.x,K.a)}</button>`).join('');
    A.onclick=e=>{ const b=e.target.closest('.ch'); if(b&&!TS.ans) tsAnswer(!!TS.ch[+b.dataset.i].ok,+b.dataset.i); };
  } else {
    A.innerHTML='<input class="txt" id="tsIn" autocomplete="off" autocapitalize="off" spellcheck="false"><button class="sb wide pri" id="tsGo">回答</button>';
    const inp=$('tsIn'); if(o.mode==='blankh') inp.value=blanks(w)[0][0];   // 頭文字ヒント付きは最初の1文字が入った状態
    const submit=()=>{ if(TS.ans) return; const exp=K.a==='head'?w.w:blanks(w).join(' '); tsAnswer(tnorm(inp.value)===tnorm(exp),-1); };
    $('tsGo').onclick=submit; inp.onkeydown=e=>{ if(e.key==='Enter') submit(); };
    A.onclick=null; inp.focus();
  }
}
function tsAnswer(ok,idx){
  TS.ans=true;
  const n=TS.qs[TS.i], w=words[n-1], o=TS.o, K=tsKinds(o), last=TS.i===TS.qs.length-1;
  document.querySelectorAll('#tsA .ch').forEach((b,i)=>{ b.disabled=true; if(TS.ch[i].ok) b.classList.add('ok'); else if(i===idx) b.classList.add('ng'); });
  if($('tsIn')){ $('tsIn').disabled=true; $('tsGo').disabled=true; }
  if(ok) TS.ok++; else { TS.wrong.push(n); setTagOn(n,'rev'); }   // 不正解は自動で要復習（暗記済みだった場合は外れる）
  const v=D.tags[n]||0;
  let f=`<div class="fb ${ok?'ok':'ng'}">${ok?'正解！':'不正解'}</div>`;
  if(!ok||tsFmt(o)==='write') f+=`<div class="ansl">正解: ${chHTML(w,K.a)}</div>`;
  if(K.a==='ans') f+=`<div class="fe">${exMap(w.ex,t=>`<span class="r">${esc(t)}</span>`)}</div>`;
  if(!ok) f+='<div class="tsnote">要復習に入りました</div>';
  else if(!(v&BIT.mem)&&!(v&BIT.rev)) f+='<button class="sb" data-tg="mem">暗記済みにする</button>';
  else if(v&BIT.rev) f+='<button class="sb" data-tg="rel">要復習を外す</button>';
  f+=`<button class="sb wide pri" data-nx>${last?'結果を見る':'次へ'}</button>`;
  $('tsFb').innerHTML=f;
  $('tsFb').onclick=e=>{
    const t=e.target.closest('[data-tg]'), nx=e.target.closest('[data-nx]');
    if(t){ if(t.dataset.tg==='mem'){ setTagOn(n,'mem'); t.textContent='暗記済みにしました'; } else { const x=(D.tags[n]||0)&~BIT.rev; if(x) D.tags[n]=x; else delete D.tags[n]; save(); t.textContent='要復習を外しました'; } t.disabled=true; }
    else if(nx){ TS.i++; tsShow(); }
  };
}
function tsEnd(){
  const t=TS.qs.length, e=$('tsEnd');
  $('tsBody').hidden=true; e.hidden=false; $('tsProg').textContent=`${t} / ${t}`;
  e.innerHTML=`<h2>${t}問中 ${TS.ok}問正解</h2>`
    +(TS.wrong.length?'<div class="gt" style="text-align:left;font-size:12px;color:#777">間違えた問題</div>'+TS.wrong.map(n=>`<div class="wr"><b>${esc(words[n-1].w)}</b><span>${chHTML(words[n-1],'main')}</span></div>`).join(''):'<p>全問正解です！</p>')
    +(TS.wrong.length?'<button class="sb wide pri" data-a="wr">間違えた問題だけもう一度</button>':'')
    +'<button class="sb wide" data-a="again">同じ設定でもう一度</button><button class="sb wide" data-a="back">一覧に戻る</button>';
  e.onclick=ev=>{ const a=ev.target.dataset.a; if(!a) return;
    if(a==='back') history.back();
    else if(a==='again') startTs(TS.getNos,TS.o,TS.rec);
    else startTs(TS.getNos,TS.o,TS.rec,TS.wrong.slice()); };
}
// 一覧
function renderTs(){
  const fx=[['bm','ブックマーク'],['rev','要復習']].map(([k,n])=>`<div class="li" data-f="${k}"><span class="lic t-${k} on">${IC[k]}</span><span class="ln">${n}</span><span class="lc">${tagNos(k).length}語</span></div>`).join('');
  const us=D.ts.map((l,i)=>({l,i})).sort((a,b)=>(b.l.viewed||0)-(a.l.viewed||0)||a.l.at-b.l.at)   // プレイしたリストが上
    .map(({l,i})=>`<div class="li" data-i="${i}"><span class="lic"></span><span class="ln">${esc(l.name)}</span><span class="lc">${l.nos.length}語</span><button class="mm" data-i="${i}" aria-label="メニュー"><svg class="ico" viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="19" r="1.6" fill="currentColor"/></svg></button></div>`).join('');
  $('tsList').innerHTML=fx+us;
}
$('tsList').addEventListener('click',e=>{
  const mm=e.target.closest('.mm'); if(mm){ listMenu(mm,'ts',+mm.dataset.i); return; }
  const el=e.target.closest('.li'); if(!el) return;
  if(el.dataset.f){ const k=el.dataset.f; tsDlg(FIXED.find(x=>x[0]===k)[1],()=>tagNos(k),null,k==='rev'); }
  else { const l=D.ts[+el.dataset.i]; tsDlg(l.name,()=>l.nos,l,false); }
});
function tsDlg(name,getNos,rec,noExclude){
  const P=Object.assign({mode:'hm',swap:0,fmt:'choice',ex:1},D.pref.ts||{});
  if(noExclude) P.ex=0;
  const modes=Object.keys(TSM);
  modal(`<h3>${esc(name)}</h3>`+(noExclude?'':'<label><input type="checkbox" id="fx">暗記済みは除外</label>')
    +'<div class="rg" style="margin-top:6px"><input class="num" id="fn" type="number" inputmode="numeric" min="1"> 語 / <span id="fX"></span>語</div>'
    +'<div class="fh"><span>問い</span><button id="fsw" aria-label="問いと答えを入れ替える">⇄</button><span>答え</span></div>'
    +modes.map(m=>`<label><input type="radio" name="tm" value="${m}"><span data-q="${m}"></span></label>`).join('')
    +'<div class="gt" style="display:block">出題形式</div><label><input type="radio" name="tf" value="choice">選択問題</label><label><input type="radio" name="tf" value="write">筆記問題</label>'
    +'<button class="sb wide pri" id="tgo">テストを開始</button>',o=>{
    const fx=o.querySelector('#fx'), fn=o.querySelector('#fn'), go=o.querySelector('#tgo'), sw=o.querySelector('#fsw');
    const avail=()=>getNos().filter(n=>!(P.ex&&has(n,'mem'))).length;
    const clamp=()=>{ const X=avail(); o.querySelector('#fX').textContent=X; const v=parseInt(fn.value,10);
      if(!isNaN(v)&&v>X) fn.value=X; if(!isNaN(v)&&v<1&&X>0) fn.value=1; go.disabled=X===0; };
    const labels=()=>{ modes.forEach(m=>{ const d=TSM[m], s=P.swap&&d[2]; o.querySelector(`[data-q=${m}]`).textContent=d[1]?(s?`${d[1]} → ${d[0]}`:`${d[0]} → ${d[1]}`):d[0];
        o.querySelector(`input[name=tm][value=${m}]`).checked=P.mode===m; });
      sw.disabled=!TSM[P.mode][2];
      const forced=(P.mode==='hm'||P.mode==='hmain')&&!P.swap, f=forced?'choice':P.fmt;   // 答えが意味のときは選択問題に固定
      o.querySelector('input[name=tf][value=write]').disabled=forced;
      o.querySelectorAll('input[name=tf]').forEach(r=>r.checked=r.value===f); };
    if(fx){ fx.checked=!!P.ex; fx.onchange=()=>{ P.ex=fx.checked?1:0; fn.value=avail(); clamp(); }; }
    fn.value=avail(); clamp(); labels();
    o.querySelectorAll('input[name=tm]').forEach(r=>r.onchange=()=>{ P.mode=r.value; labels(); });
    o.querySelectorAll('input[name=tf]').forEach(r=>r.onchange=()=>{ P.fmt=r.value; labels(); });
    sw.onclick=()=>{ P.swap=P.swap?0:1; labels(); };
    fn.oninput=clamp;
    go.onclick=()=>{ const X=avail(); let n=parseInt(fn.value,10); if(isNaN(n)||n>X) n=X; if(n<1) n=1;
      D.pref.ts={mode:P.mode,swap:P.swap,fmt:P.fmt,ex:P.ex}; save(); o.remove();
      startTs(getNos,{mode:P.mode,swap:P.swap,fmt:P.fmt,ex:P.ex,n},rec); };
  });
}

/* ---------- バックアップ（保険。普段は使わない） ---------- */
$('bkBtn').onclick=()=>modal('<h3>バックアップ</h3><p class="note">印・マイリストなどのデータを、ファイルに書き出す／読み込みます。</p><button class="sb wide" data-e>書き出す</button><button class="sb wide" data-i>読み込む</button><input type="file" accept=".json,application/json" hidden>',o=>{
  const fi=o.querySelector('input');
  o.querySelector('[data-e]').onclick=()=>{
    const b=new Blob([JSON.stringify({app:'target1900',v:1,data:D})],{type:'application/json'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download=`target1900-backup-${new Date().toISOString().slice(0,10)}.json`; a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),2000);
  };
  o.querySelector('[data-i]').onclick=()=>fi.click();
  fi.onchange=()=>{ const f=fi.files[0]; if(!f) return;
    f.text().then(t=>{ let j; try{ j=JSON.parse(t); }catch(e){}
      if(!j||j.app!=='target1900'||!j.data){ toast('このファイルは読み込めません'); return; }
      confirmBox('現在のデータを、読み込んだデータで置き換えます。よろしいですか？','置き換える',()=>{ D=Object.assign({tags:{},lists:[],fc:[],ts:[],pref:{}},j.data); save(); o.remove(); toast('読み込みました'); });
    });
  };
});

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
  const order=['動詞','名詞','形容詞','副詞','前置詞','接続詞'];
  POS=[...new Set(words.map(w=>w.pos))].sort((a,b)=>(order.indexOf(a)+99)%99-(order.indexOf(b)+99)%99);
  words.forEach(w=>w.sec=Math.ceil(w.no/100));
  F.sec=new Set(range(1,words.length/100)); F.pos=new Set(POS); F.lo=1; F.hi=words.length;
  load(); if(navigator.storage&&navigator.storage.persist) navigator.storage.persist();
  msg.hidden=true; buildTree(); buildTOC(); buildRs();
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
