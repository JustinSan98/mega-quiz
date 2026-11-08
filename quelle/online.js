/* ================= Online-Modus ================= */
var FB_CONFIG=__FBCONFIG__;
var FB_VER='10.12.2';
var MODE='local',NET=null,G=null,ME=null,GAME=null,PIDS=[],curRoundId=null,revealedRoundId=null,scoringRound=null,gameUnsub=null,connUnsub=null,hostQueue=[],hostLastCat=null;
var MOCK=/[?&]mock=1/.test(location.search);
function online(){return MODE==='online'}
function pidStore(){return MOCK?sessionStorage:localStorage}
function getPid(code){try{return pidStore().getItem('sq_pid_'+code)}catch(e){return null}}
function setPid(code,id){try{pidStore().setItem('sq_pid_'+code,id)}catch(e){}}
function rid(n){var c='abcdefghijkmnpqrstuvwxyz23456789',s='';for(var i=0;i<n;i++)s+=c[Math.floor(Math.random()*c.length)];return s}
function newCode(){var c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',s='';for(var i=0;i<4;i++)s+=c[Math.floor(Math.random()*c.length)];return s}

function MockNet(){
  var KEY='mockdb',L=[];
  function load(){try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch(e){return {}}}
  function segs(p){return p.split('/').filter(Boolean)}
  function getP(o,p){var a=segs(p);for(var i=0;i<a.length;i++){if(o==null||typeof o!=='object')return null;o=o[a[i]]}return o===undefined?null:o}
  function setP(o,p,v){var a=segs(p),c=o;for(var i=0;i<a.length-1;i++){if(typeof c[a[i]]!=='object'||c[a[i]]===null)c[a[i]]={};c=c[a[i]]}
    if(v===null||v===undefined)delete c[a[a.length-1]];else c[a[a.length-1]]=JSON.parse(JSON.stringify(v))}
  function fire(){var o=load();L.slice().forEach(function(l){var v=getP(o,l.p),s=JSON.stringify(v);if(s!==l.last){l.last=s;l.cb(v==null?null:JSON.parse(s))}})}
  function save(o){localStorage.setItem(KEY,JSON.stringify(o));setTimeout(fire,0)}
  window.addEventListener('storage',function(e){if(e.key===KEY)fire()});
  return {
    on:function(p,cb){var l={p:p,cb:cb,last:undefined};L.push(l);setTimeout(fire,0);return function(){var i=L.indexOf(l);if(i>-1)L.splice(i,1)}},
    get:function(p){return Promise.resolve(getP(load(),p))},
    set:function(p,v){var o=load();setP(o,p,v);save(o);return Promise.resolve()},
    update:function(p,obj){var o=load();Object.keys(obj).forEach(function(k){setP(o,p+'/'+k,obj[k])});save(o);return Promise.resolve()},
    remove:function(p){var o=load();setP(o,p,null);save(o);return Promise.resolve()},
    onDisc:function(){return Promise.resolve()},
    txn:function(p,fn){var o=load(),v=fn(getP(o,p));if(v!==undefined){setP(o,p,v);save(o)}return Promise.resolve({committed:v!==undefined})},
    now:function(){return Date.now()},
    connected:function(cb){setTimeout(function(){cb(true)},0);return function(){}}
  };
}
async function FireNet(){
  var base='https://www.gstatic.com/firebasejs/'+FB_VER+'/';
  var A=await import(base+'firebase-app.js'),D=await import(base+'firebase-database.js');
  var app=A.initializeApp(FB_CONFIG),db=D.getDatabase(app);
  function r(p){return D.ref(db,p)}
  return {
    on:function(p,cb){return D.onValue(r(p),function(s){cb(s.val())})},
    get:function(p){return D.get(r(p)).then(function(s){return s.val()})},
    set:function(p,v){return D.set(r(p),v)},
    update:function(p,v){return D.update(r(p),v)},
    remove:function(p){return D.remove(r(p))},
    onDisc:function(p,v){return D.onDisconnect(r(p)).update(v)},
    txn:function(p,fn){return D.runTransaction(r(p),fn)},
    now:function(){return D.serverTimestamp()},
    connected:function(cb){return D.onValue(r('.info/connected'),function(s){cb(!!s.val())})}
  };
}
async function netInit(){
  if(NET)return NET;
  NET=MOCK?MockNet():await FireNet();
  return NET;
}

/* ---------- Bildschirme ---------- */
function showOnly(id){['home','setup','onSetup','lobby','game'].forEach(function(s){$(s).hidden=s!==id});window.scrollTo(0,0)}
function openHome(){
  hideIntro();MODE='local';showOnly('home');$('scores').hidden=true;$('roundLbl').textContent='';
}
function openOnlineSetup(code,msg){
  showOnly('onSetup');$('scores').hidden=true;$('roundLbl').textContent='';
  $('onName').value=lsGet('sq_online_name','')||'';
  $('onCode').value=code||'';
  $('onErr').textContent=msg||'';
}
function gamePath(p){return 'games/'+G+(p?'/'+p:'')}
function playerList(){
  var ps=(GAME&&GAME.players)||{};
  return Object.keys(ps).map(function(id){var p=ps[id];return {id:id,name:p.name,color:p.color,score:p.score||0,joinedAt:typeof p.joinedAt==='number'?p.joinedAt:9e15,online:p.online!==false}})
    .sort(function(a,b){return a.joinedAt-b.joinedAt||(a.id<b.id?-1:1)});
}
function hostId(){var l=playerList().filter(function(p){return p.online});return l.length?l[0].id:ME}
function isHost(){return hostId()===ME}
function nameOf(id){var p=GAME&&GAME.players&&GAME.players[id];return p?p.name:'?'}

/* ---------- Erstellen / Beitreten ---------- */
function readName(){
  var n=$('onName').value.trim();
  if(!n){$('onErr').textContent='Gib deinen Namen ein';return null}
  lsSet('sq_online_name',n);return n.slice(0,16);
}
async function createGame(){
  var name=readName();if(!name)return;
  $('onErr').textContent='Verbinde …';
  try{await netInit()}catch(e){$('onErr').textContent='Keine Verbindung zum Server. Bist du online?';return}
  var code;for(var i=0;i<6;i++){code=newCode();var ex=await NET.get('games/'+code+'/createdAt');if(!ex)break}
  await NET.set('games/'+code,{createdAt:NET.now(),state:'lobby',settings:{cats:activeCats.slice(),points:true}});
  await joinGame(code,name);
}
async function joinGame(code,name){
  code=String(code||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  if(code.length!==4){$('onErr').textContent='Der Spielcode hat 4 Zeichen';return}
  name=name||readName();if(!name)return;
  $('onErr').textContent='Verbinde …';
  try{await netInit()}catch(e){$('onErr').textContent='Keine Verbindung zum Server. Bist du online?';return}
  var g=await NET.get('games/'+code);
  if(!g||!g.createdAt){$('onErr').textContent='Spiel „'+code+'“ nicht gefunden';return}
  var id=getPid(code),ps=g.players||{},existing=id&&ps[id];
  var others=Object.keys(ps).filter(function(k){return k!==id&&ps[k].online!==false});
  if(!existing&&others.length>=6){$('onErr').textContent='Das Spiel ist voll (6 Spieler)';return}
  if(!id){id=rid(10);setPid(code,id)}
  var used=Object.keys(ps).filter(function(k){return k!==id}).map(function(k){return ps[k].color});
  var color=existing?existing.color:shuffle([0,1,2,3,4,5]).filter(function(c){return used.indexOf(c)<0})[0];
  if(color===undefined)color=Math.floor(Math.random()*6);
  G=code;ME=id;MODE='online';curRoundId=null;revealedRoundId=null;hostQueue=[];
  var rec={name:name,color:color,score:existing?(existing.score||0):0,joinedAt:existing&&typeof existing.joinedAt==='number'?existing.joinedAt:NET.now(),online:true};
  await NET.set(gamePath('players/'+ME),rec);
  NET.onDisc(gamePath('players/'+ME),{online:false});
  if(connUnsub)connUnsub();
  connUnsub=NET.connected(function(c){if(c&&G===code&&MODE==='online'){NET.update(gamePath('players/'+ME),{online:true});NET.onDisc(gamePath('players/'+ME),{online:false})}});
  lsSet('sq_last_game',code);
  try{history.replaceState(null,'',location.pathname+'?g='+code+(MOCK?'&mock=1':''))}catch(e){}
  $('onErr').textContent='';
  if(gameUnsub)gameUnsub();
  gameUnsub=NET.on(gamePath(),onGame);
}
async function leaveGame(){
  if(G&&NET){await NET.update(gamePath('players/'+ME),{online:false})}
  if(gameUnsub)gameUnsub();gameUnsub=null;if(connUnsub)connUnsub();connUnsub=null;
  G=null;GAME=null;MODE='local';
  try{history.replaceState(null,'',location.pathname+(MOCK?'?mock=1':''))}catch(e){}
  openHome();
}

/* ---------- Zustand vom Server ---------- */
function syncS(){
  var l=playerList();PIDS=l.map(function(p){return p.id});
  var st=GAME.settings||{};
  S={names:l.map(function(p){return p.name}),colors:l.map(function(p){return p.color}),scores:l.map(function(p){return p.score}),
     online:l.map(function(p){return p.online}),round:((GAME.round&&GAME.round.n)||1)-1,points:st.points!==false,played:0};
}
function onGame(g){
  if(!online())return;
  if(!g||!g.createdAt){leaveGame().then(function(){openOnlineSetup('', 'Das Spiel wurde beendet.')});return}
  GAME=g;syncS();
  if(!busy)renderScores();
  if(g.state!=='playing'){renderLobby();return}
  var r=g.round;if(!r)return;
  if($('game').hidden){showOnly('game')}
  if(r.id!==curRoundId){newRoundUI(r)}
  if(r.phase==='reveal'&&revealedRoundId!==r.id){doReveal(r)}
  else if(r.phase==='tip'){renderWait(r);updateTools()}
  if(revealedRoundId===r.id&&!busy)renderNextArea();
  hostDuties(r);
}

/* ---------- Lobby ---------- */
var lobbyDraftInit=false;
function renderLobby(){
  if($('lobby').hidden){showOnly('lobby');lobbyDraftInit=false}
  $('lobbyCode').textContent=G;
  var url=joinUrl();$('lobbyLink').textContent=url.replace(/^https?:\/\//,'');
  renderQR(url);
  var box=$('lobbyPlayers');box.innerHTML='';
  playerList().forEach(function(p){
    var c=el('span','sc'+(p.online?'':' off'));c.style.setProperty('--pc','var(--p'+p.color+')');
    c.appendChild(el('i'));c.appendChild(document.createTextNode(p.name+(p.id===ME?' (du)':'')+(p.id===hostId()?' · Host':'')));
    box.appendChild(c);
  });
  var host=isHost();
  $('lobbyHost').hidden=!host;$('lobbyGuest').hidden=host;
  if(host){
    if(!lobbyDraftInit){var st=GAME.settings||{};draftCats=(st.cats&&st.cats.length?st.cats:activeCats).slice();$('lobbyPoints').checked=st.points!==false;lobbyDraftInit=true;renderChips('lobbyChips','lobbyCatAll')}
  }else{$('lobbyGuest').textContent='Warte, bis '+nameOf(hostId())+' das Spiel startet …'}
}
function joinUrl(){var u=location.origin+location.pathname+'?g='+G;if(MOCK)u+='&mock=1';return u}
function renderQR(url){
  var box=$('lobbyQR');if(box.dataset.url===url)return;box.dataset.url=url;
  try{var qr=qrcode(0,'M');qr.addData(url);qr.make();box.innerHTML=qr.createSvgTag(5,2)}catch(e){box.textContent=''}
}
async function startOnline(){
  if(!isHost())return;
  if(!draftCats.length){$('lobbyErr').textContent='Wähle mindestens eine Kategorie aus';return}
  var cats=CATS.filter(function(c){return draftCats.indexOf(c)>-1});activeCats=cats;lsSet('sq_cats',cats);
  var st={cats:cats,points:$('lobbyPoints').checked};
  await NET.update(gamePath(),{settings:st,state:'playing'});
  GAME.settings=st;GAME.state='playing';hostQueue=[];
  await hostNextRound(false);
}
async function shareLink(){
  var url=joinUrl(),txt='Spiel mit beim Mega Quiz! Code: '+G;
  try{if(navigator.share){await navigator.share({title:'Mega Quiz',text:txt,url:url});return}}catch(e){return}
  try{await navigator.clipboard.writeText(url);$('shareBtn').textContent='Link kopiert';setTimeout(function(){$('shareBtn').textContent='Link teilen'},1600)}catch(e){prompt('Link kopieren:',url)}
}

/* ---------- Host: Fragen ziehen und Runden steuern ---------- */
function hostPick(){
  var cats=((GAME.settings&&GAME.settings.cats)||CATS).filter(function(c){return CATS.indexOf(c)>-1});if(!cats.length)cats=CATS.slice();
  if(!hostQueue.length){hostQueue=shuffle(cats.slice());if(hostQueue.length>1&&hostQueue[0]===hostLastCat){var t=hostQueue[0];hostQueue[0]=hostQueue[1];hostQueue[1]=t}}
  var cat=hostQueue.shift();hostLastCat=cat;
  var usedMap=GAME.used||{},pool=[];
  Q.forEach(function(q,i){if(q.c===cat&&!usedMap[i])pool.push(i)});
  if(!pool.length)Q.forEach(function(q,i){if(q.c===cat)pool.push(i)});
  return pool[Math.floor(Math.random()*pool.length)];
}
async function hostNextRound(sameNumber){
  if(!isHost()||!GAME)return;
  var qi=hostPick(),q=Q[qi],prevN=(GAME.round&&GAME.round.n)||0,n=sameNumber?Math.max(1,prevN):prevN+1;
  var max=0;if(q.t==='s'){var u=q.a/q.rv>5?0.55+Math.random()*0.3:0.25+Math.random()*0.5;max=niceCeil(Math.max(q.a/u,q.rv*1.3,q.a*1.15))}
  var ids=playerList().filter(function(p){return p.online}).map(function(p){return p.id});
  var round={id:n+'-'+rid(5),n:n,qi:qi,q:q,max:max,players:ids,phase:'tip',scored:false};
  var upd={round:round};upd['used/'+qi]=true;
  await NET.update(gamePath(),upd);
}
function roundTips(r){return (GAME.tips&&GAME.tips[r.id])||{}}
function hostDuties(r){
  if(!isHost()||!r)return;
  if(r.phase==='tip'){
    var t=roundTips(r),ps=GAME.players||{};
    var active=(r.players||[]).filter(function(id){return ps[id]&&ps[id].online!==false});
    var any=Object.keys(t).length>0;
    if(any&&active.every(function(id){return t[id]!==undefined})){hostReveal(r)}
  }else if(r.phase==='reveal'&&!r.scored&&scoringRound!==r.id){hostScore(r)}
}
function hostReveal(r){
  if(!isHost())return;
  var t=roundTips(r);if(!Object.keys(t).length)return;
  NET.update(gamePath('round'),{phase:'reveal',final:t});
}
function hostScore(r){
  scoringRound=r.id;
  NET.txn(gamePath('round/scored'),function(v){return v?undefined:true}).then(function(res){
    if(!res||!res.committed)return;
    var aw=computeAwards(r.q,r.final||{},Object.keys(r.final||{}),r.max);
    if(GAME.settings&&GAME.settings.points===false)return;
    Object.keys(aw).forEach(function(id){if(aw[id]>0)NET.txn(gamePath('players/'+id+'/score'),function(v){return (v||0)+aw[id]})});
  });
}
/* Gleiche Bewertung wie in der Auflösung, unabhängig vom Bildschirm */
function computeAwards(q,final,ids){
  var saveCur=cur,saveTips=tips,saveOrder=order;
  cur=q;tips={};order=[];ids.forEach(function(id,i){tips[i]=final[id];order.push(i)});
  var out={};
  try{
    if(ids.length===1){out[ids[0]]=soloPoints()}
    else{var res=evaluate().sort(function(a,b){return b.key-a.key}),best=res[0].key,win=res.filter(function(x){return x.key===best});
      var allTie=win.length===res.length,anyC=res.some(function(x){return x.correct});
      if(!(allTie&&!anyC))win.forEach(function(x){out[ids[x.p]]=1})}
  }finally{cur=saveCur;tips=saveTips;order=saveOrder}
  return out;
}

/* ---------- Runde anzeigen ---------- */
function newRoundUI(r){
  curRoundId=r.id;revealedRoundId=null;busy=false;
  cur=r.q;sizeMax=r.max||0;tips={};
  order=(r.players||[]).map(function(id){return PIDS.indexOf(id)}).filter(function(i){return i>-1});
  step=0;
  $('roundLbl').textContent='Runde '+r.n;
  setStamp($('stamp'),cur.c);$('q').textContent=cur.q;
  if(cur.t==='n')$('hint').textContent=isYear(cur)?'Antwort als Jahreszahl':'Antwort als Zahl · in '+cur.u;
  else if(cur.t==='w')$('hint').textContent='Antwort als Wort oder Name · kleine Tippfehler sind okay';
  else $('hint').textContent='Zieh den Regler auf die Höhe, die du schätzt. Die Linien zeigen Vielfache von '+cur.rn+' ('+fmtSize(cur.rv)+' '+unitShort(cur)+').';
  $('allDone').hidden=true;$('res').hidden=true;$('photo').hidden=true;$('photoImg').removeAttribute('src');
  $('next').hidden=true;$('nextWait').hidden=true;
  if(cur.img)fetchImage(cur.img);
  var mine=(r.players||[]).indexOf(ME)>-1,tipped=roundTips(r)[ME]!==undefined;
  if(mine&&!tipped)showMyTurn();else{$('turn').hidden=true}
  renderWait(r);
  updateTools();
  var n=order.length;
  showIntroCustom('Runde '+r.n,n>1?'Alle tippen gleichzeitig':'Los geht’s, '+nameOf(ME),'var(--p'+((GAME.players[ME]||{}).color||0)+')');
}
function showMyTurn(){
  var me=GAME.players[ME]||{};
  $('turn').hidden=false;$('turn').style.setProperty('--pc','var(--p'+(me.color||0)+')');
  $('who').textContent=me.name+', dein Tipp';$('count').textContent='';$('pass').hidden=true;$('e').textContent='';
  if(cur.t==='s'){
    $('textIn').hidden=true;$('sizeIn').hidden=false;
    $('slider').value=String(Math.max(1,Math.round(cur.rv/sizeMax*1000)));
    order=[PIDS.indexOf(ME)].concat(order.filter(function(i){return i!==PIDS.indexOf(ME)}));step=0;
    drawSizeInput();
  }else{
    $('textIn').hidden=false;$('sizeIn').hidden=true;
    var inp=$('in');inp.value='';
    if(cur.t==='n'){inp.setAttribute('inputmode','decimal');inp.placeholder='Zahl eingeben'}else{inp.setAttribute('inputmode','text');inp.placeholder='Antwort eingeben'}
  }
}
async function submitOnline(){
  var v=readTip();if(v===null)return;
  var r=GAME.round;if(!r||r.phase!=='tip')return;
  $('in').blur();$('turn').hidden=true;
  await NET.set(gamePath('tips/'+r.id+'/'+ME),v);
}
function renderWait(r){
  var t=roundTips(r),box=$('waitList');if(!box)return;
  var mine=(r.players||[]).indexOf(ME)>-1,tipped=t[ME]!==undefined;
  var show=r.phase==='tip'&&(!mine||tipped);
  $('waitCard').hidden=!show;
  if(!show)return;
  $('waitTitle').textContent=mine?'Dein Tipp ist abgegeben.':'Du bist ab der nächsten Runde dabei.';
  box.innerHTML='';
  var missing=0;
  (r.players||[]).forEach(function(id){
    var p=GAME.players[id];if(!p)return;var ok=t[id]!==undefined;if(!ok&&p.online!==false)missing++;
    var c=el('span','sc'+(ok?'':' wait')+(p.online===false?' off':''));c.style.setProperty('--pc','var(--p'+p.color+')');
    c.appendChild(el('i'));c.appendChild(document.createTextNode(p.name+(ok?' ✓':' …')));box.appendChild(c);
  });
  $('waitHint').textContent=missing?'Warte auf '+missing+(missing===1?' Spieler':' Spieler')+' …':'Gleich geht’s los …';
  $('forceReveal').hidden=!(isHost()&&Object.keys(t).length>0&&missing>0);
}
function doReveal(r){
  revealedRoundId=r.id;
  $('turn').hidden=true;$('waitCard').hidden=true;
  var ids=Object.keys(r.final||{}).filter(function(id){return PIDS.indexOf(id)>-1});
  ids.sort(function(a,b){return PIDS.indexOf(a)-PIDS.indexOf(b)});
  order=ids.map(function(id){return PIDS.indexOf(id)});tips={};ids.forEach(function(id){tips[PIDS.indexOf(id)]=r.final[id]});
  cur=r.q;sizeMax=r.max||0;
  hideIntro();
  reveal();
}
function renderNextArea(){
  var host=isHost();
  $('next').hidden=!host;$('nextWait').hidden=host;
  if(!host)$('nextWait').textContent='Warte, bis '+nameOf(hostId())+' die nächste Runde startet …';
  updateTools();
}
function updateTools(){
  var on=online();
  $('toSetup').hidden=on;$('resetSeen').hidden=on;$('leaveGame').hidden=!on;
  if(on)$('skipQ').hidden=!(isHost()&&GAME&&GAME.round&&GAME.round.phase==='tip');
}
function onlineFinish(){
  syncS();renderScores();renderNextArea();
}
