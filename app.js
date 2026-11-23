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
const SCR={'#toc':'toc','#ml':'ml','#rs':'rs','#rs1':'rs','#rs2':'rs'};
function route(){
  const h=location.hash;
  let next=SCR[h]||'home';
  if(h==='#all'||((h==='#v'||h==='#rl')&&viewState)) next='view';
  if(cur==='toc'||cur==='ml') sc[cur]=scrollY;
  if(next==='view'){
    if(h==='#all') viewState={title:'1900',nos:range(1,words.length),plain:false};
    if(cur!=='view'){ q.value=''; $('clr').hidden=true; pop.hidden=true; }
  } else { q.blur(); pop.hidden=true; }
  cur=next; document.body.className='scr-'+next;
  if(next==='view'){ $('view').classList.toggle('plain',!!viewState.plain); $('ttl').textContent=viewState.title; renderView(); scrollTo(0,0); }
  else { if(next==='ml') renderMl(); if(next==='rs') showRs(h); scrollTo(0,sc[next]||0); }
}
addEventListener('hashchange',()=>{ if(words.length) route(); });
document.querySelectorAll('.back').forEach(b=>b.onclick=()=>history.back());
document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{
  const g=b.dataset.go;
  const to={all:'#all',toc:'#toc',range:'#rs',mylist:'#ml'}[g];
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
let D={tags:{},lists:[],fc:[],ts:[]};
function load(){ try{ const j=JSON.parse(localStorage.getItem(KEY)||'null'); if(j) D=Object.assign(D,j); }catch(e){} }
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
  if(kind==='lists'&&FIXED.some(f=>f[1]===name)){ toast('その名前は使えません'); return; }
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
function listMenu(btn,i){
  closeMenus();
  const l=D.lists[i], m=document.createElement('div'); m.className='popm';
  m.innerHTML='<div class="pi" data-a="fc">フラッシュカードを作成</div><div class="pi" data-a="ts">テストを作成</div><div class="pi" data-a="rn">名前を変更</div><div class="pi dg" data-a="del">削除</div>';
  const r=btn.getBoundingClientRect(); m.style.top=(r.bottom+4)+'px'; m.style.left=Math.max(8,Math.min(r.right-230,innerWidth-238))+'px';
  m.onclick=e=>{
    const a=e.target.closest('.pi'); if(!a) return; closeMenus();
    if(a.dataset.a==='fc'||a.dataset.a==='ts') saveDlg(l.name,l.nos,[a.dataset.a]);
    else if(a.dataset.a==='del') confirmBox(`「${l.name}」を削除しますか？`,'削除',()=>{ D.lists.splice(i,1); save(); renderMl(); },true);
    else modal('<h3>名前を変更</h3><input class="txt"><button class="sb wide pri">保存</button>',o=>{
      const t=o.querySelector('.txt'); t.value=l.name;
      o.querySelector('.sb').onclick=()=>{
        const nm=t.value.trim();
        if(!nm){ toast('名前を入力してください'); return; }
        if(nm!==l.name&&(D.lists.some(x=>x.name===nm)||FIXED.some(f=>f[1]===nm))){ toast('同じ名前のリストがあります'); return; }
        l.name=nm; save(); o.remove(); renderMl();
      };
    });
  };
  document.body.append(m);
}
$('mlList').addEventListener('click',e=>{
  const mm=e.target.closest('.mm'); if(mm){ listMenu(mm,+mm.dataset.i); return; }
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
      confirmBox('現在のデータを、読み込んだデータで置き換えます。よろしいですか？','置き換える',()=>{ D=Object.assign({tags:{},lists:[],fc:[],ts:[]},j.data); save(); o.remove(); toast('読み込みました'); });
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
