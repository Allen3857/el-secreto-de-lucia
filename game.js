
(()=>{
const root=document.getElementById('lucia-vnext');
const q=s=>root.querySelector(s),qa=s=>[...root.querySelectorAll(s)];
const letters=['C','A','E','H','U','C','S'];
let stage=0,found=[],student={},s={};
let sessionId='';
let sessionStartedAt=0;
let sessionCompleted=false;
let totalAttempts=0;
let totalHints=0;
let totalAudioPlays=0;
let metrics={attempt:0,audioPlays:0,hint1:false,hint2:false};

function resetQuestionMetrics(){
  metrics={attempt:0,audioPlays:0,hint1:false,hint2:false};
}

function reset(){
  s={selected:new Set(),choice:null,typed:'',step:0,final:[],used:new Set()};
  resetQuestionMetrics();
}

function makeSessionId(){
  if(window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'lucia-' + Date.now() + '-' + Math.random().toString(36).slice(2,10);
}

function currentQuestionId(){
  if(stage===0)return 'pista1';
  if(stage===1)return 'pista2';
  if(stage===2)return 'pista3';
  if(stage===3)return 'pista4';
  if(stage===4)return s.step===0?'pista5a':'pista5b';
  if(stage===5)return 'pista6';
  if(stage===6)return 'pista7';
  if(stage===7)return 'final';
  return 'completed';
}

function currentStageLabel(){
  if(stage<7)return `Mensaje ${stage+1} / 7`;
  if(stage===7)return 'Mensaje final';
  return 'Completado';
}

function sendLog(payload){
  if(typeof BACKEND_URL==='undefined' || !BACKEND_URL || BACKEND_URL.includes('PASTE')) return;
  const body=JSON.stringify({
    ...payload,
    session_id:sessionId,
    student_id:student.id||'',
    name:student.name||'',
    game_id:'lucia_v11',
    client_time:new Date().toISOString()
  });

  fetch(BACKEND_URL,{
    method:'POST',
    mode:'no-cors',
    headers:{'Content-Type':'text/plain;charset=UTF-8'},
    body,
    keepalive:true
  }).catch(()=>{});
}

function logEvent(event,detail=''){
  sendLog({
    type:'event',
    stage_label:currentStageLabel(),
    question_id:currentQuestionId(),
    event,
    detail:String(detail)
  });
}

function registerAudio(detail=''){
  metrics.audioPlays++;
  totalAudioPlays++;
  logEvent('audio_play',detail);
}

function recordAttempt(questionId,answer,correct){
  metrics.attempt++;
  totalAttempts++;
  sendLog({
    type:'attempt',
    question_id:questionId,
    stage_label:currentStageLabel(),
    answer:String(answer ?? ''),
    correct:Boolean(correct),
    attempt_no:metrics.attempt,
    audio_play_count:metrics.audioPlays,
    hint1_used:metrics.hint1,
    hint2_used:metrics.hint2
  });
}

function completeSession(){
  if(sessionCompleted)return;
  sessionCompleted=true;
  sendLog({
    type:'completion',
    completed:true,
    duration_sec:Math.round((Date.now()-sessionStartedAt)/1000),
    total_attempts:totalAttempts,
    hints_used:totalHints,
    audio_plays:totalAudioPlays
  });
}
function header(){
  q('#stage-label').textContent=stage<7?`Mensaje ${stage+1} / 7 / 留言 ${stage+1} / 7`:stage===7?'Mensaje final / 最後訊息':'Completado / 完成';
  q('#student-label').textContent=`${student.name} · ${student.id}`;
  q('#progress').innerHTML=Array.from({length:7},(_,i)=>`<div class="progress ${i<Math.min(stage+1,7)?'on':''}"></div>`).join('');
  if(found.length){
    q('#found-wrap').classList.remove('hide');
    q('#found-list').innerHTML=found.map(x=>`<div class="found">${x}</div>`).join('');
  }else q('#found-wrap').classList.add('hide');
}
function show(h){q('#content').innerHTML=h;header();}

let fxCtx=null;
function getFxCtx(){
  if(!fxCtx) fxCtx=new (window.AudioContext||window.webkitAudioContext)();
  if(fxCtx.state==='suspended') fxCtx.resume();
  return fxCtx;
}
function beep(freq,start,duration,gain=0.10,type='sine'){
  try{
    const ctx=getFxCtx();
    const o=ctx.createOscillator();
    const g=ctx.createGain();

    o.type=type;
    o.frequency.setValueAtTime(freq,ctx.currentTime+start);

    g.gain.setValueAtTime(0.0001,ctx.currentTime+start);
    g.gain.exponentialRampToValueAtTime(gain,ctx.currentTime+start+0.02);
    g.gain.setValueAtTime(gain,ctx.currentTime+start+Math.max(0.03,duration-0.08));
    g.gain.exponentialRampToValueAtTime(0.0001,ctx.currentTime+start+duration);

    o.connect(g);
    g.connect(ctx.destination);
    o.start(ctx.currentTime+start);
    o.stop(ctx.currentTime+start+duration+0.05);
  }catch(e){}
}

function correctSfx(){
  // Louder and longer success sound (~1.1 s)
  beep(523.25,0.00,0.28,0.12,'sine');
  beep(659.25,0.22,0.30,0.13,'sine');
  beep(783.99,0.45,0.32,0.14,'sine');
  beep(1046.50,0.70,0.40,0.15,'sine');
}

function wrongSfx(){
  // Mid-frequency descending notes remain audible on laptop/phone speakers.
  beep(392.00,0.00,0.26,0.14,'square');
  beep(293.66,0.22,0.30,0.14,'square');
  beep(220.00,0.48,0.40,0.15,'triangle');
}
function setFeedback(h,type='neutral'){
  const e=q('#feedback');
  if(!e)return;
  e.classList.remove('hide','feedback-good','feedback-bad');
  if(type==='good')e.classList.add('feedback-good');
  if(type==='bad')e.classList.add('feedback-bad');
  e.innerHTML=h;
}
function fb(h){setFeedback(h,'neutral');}
function wrong(h){wrongSfx();setFeedback(h,'bad');}
function correctFb(h){correctSfx();setFeedback(h,'good');}


let spanishVoice=null;
let audioRunId=0;
let currentAudio=null;

function chooseSpanishVoice(){
  if(!('speechSynthesis' in window))return;
  const voices=speechSynthesis.getVoices();
  const es=voices.filter(v=>(v.lang||'').toLowerCase().startsWith('es'));
  spanishVoice=
    es.find(v=>(v.lang||'').toLowerCase()==='es-es' && /google|microsoft|helena|pablo|alvaro|jorge|lucia/i.test(v.name)) ||
    es.find(v=>(v.lang||'').toLowerCase()==='es-es') ||
    es[0] || null;
}

if('speechSynthesis' in window){
  chooseSpanishVoice();
  speechSynthesis.addEventListener?.('voiceschanged',chooseSpanishVoice);
}

function stopSpeech(){
  audioRunId++;
  if(currentAudio){
    try{
      currentAudio.pause();
      currentAudio.currentTime=0;
    }catch(e){}
    currentAudio=null;
  }
  if('speechSynthesis' in window){
    speechSynthesis.cancel();
  }
}

function speakOne(text,{rate=.58,onEnd=null}={}){
  if(!('speechSynthesis' in window)){
    if(onEnd)onEnd();
    return;
  }

  chooseSpanishVoice();
  const u=new SpeechSynthesisUtterance(text);
  u.lang='es-ES';
  if(spanishVoice)u.voice=spanishVoice;
  u.rate=rate;
  u.pitch=1;

  let finished=false;
  const finish=()=>{
    if(finished)return;
    finished=true;
    if(onEnd)onEnd();
  };

  u.onend=finish;
  u.onerror=finish;
  speechSynthesis.speak(u);
}

function playWord(word,{repeat=2,rate=.58,gap=750}={}){
  registerAudio(word);
  stopSpeech();
  const runId=audioRunId;
  let count=0;

  const next=()=>{
    if(runId!==audioRunId)return;

    speakOne(word,{
      rate,
      onEnd:()=>{
        if(runId!==audioRunId)return;
        count++;
        if(count<repeat){
          setTimeout(()=>{
            if(runId===audioRunId)next();
          },gap);
        }
      }
    });
  };

  next();
}

function playSequence(words,{rate=.58,gap=1150,repeat=2,betweenPasses=2800,statusEl=null}={}){
  registerAudio(words.join(' | '));
  stopSpeech();
  const runId=audioRunId;
  let pass=1;
  let index=0;

  const setStatus=(which)=>{
    if(!statusEl)return;
    const el=q(statusEl);
    if(!el)return;

    if(which===1){
      el.classList.remove('hide');
      el.innerHTML='<strong>Primera vez</strong> / 第一次';
    }else if(which===2){
      el.classList.remove('hide');
      el.innerHTML='<strong>Segunda vez</strong> / 第二次';
    }else{
      el.classList.add('hide');
      el.innerHTML='';
    }
  };

  const nextWord=()=>{
    if(runId!==audioRunId)return;

    if(index>=words.length){
      if(pass>=repeat){
        setTimeout(()=>{
          if(runId===audioRunId)setStatus(0);
        },500);
        return;
      }

      pass++;
      index=0;

      setTimeout(()=>{
        if(runId!==audioRunId)return;
        setStatus(pass);
        nextWord();
      },betweenPasses);
      return;
    }

    const word=words[index++];
    speakOne(word,{
      rate,
      onEnd:()=>{
        if(runId!==audioRunId)return;
        setTimeout(()=>{
          if(runId===audioRunId)nextWord();
        },gap);
      }
    });
  };

  setStatus(1);
  nextWord();
}

root.addEventListener('click',(event)=>{
  const id=event.target && event.target.id;
  if(id==='check' || id==='check-final'){
    stopSpeech();
    const p2pass=q('#p2-pass');
    if(p2pass){
      p2pass.classList.add('hide');
      p2pass.innerHTML='';
    }
  }
},true);

function player(es,zh){
  return `<div class="panel" style="display:flex;align-items:center;justify-content:space-between;gap:12px"><div class="body">${es}<div class="small muted">${zh}</div></div><button id="play" class="btn" type="button">▶ REPRODUCIR / 播放</button></div>`;
}
function hints(){
  return `<div class="hints"><button id="h1" class="btn" type="button">💡 Hint 1 / 提示 1</button><button id="h2" class="btn" type="button">💡 Hint 2 / 提示 2</button></div><div id="hintbox" class="hide panel body small"></div>`;
}
function bindHints(a,b){
  q('#h1').onclick=()=>{
    if(!metrics.hint1){
      metrics.hint1=true;
      totalHints++;
      logEvent('hint','hint1');
    }
    q('#hintbox').classList.remove('hide');
    q('#hintbox').innerHTML=a;
  };
  q('#h2').onclick=()=>{
    if(!metrics.hint2){
      metrics.hint2=true;
      totalHints++;
      logEvent('hint','hint2');
    }
    q('#hintbox').classList.remove('hide');
    q('#hintbox').innerHTML=b;
  };
}
function single(selector){
  qa(selector).forEach(b=>b.onclick=()=>{
    qa(selector).forEach(x=>x.setAttribute('aria-pressed','false'));
    b.setAttribute('aria-pressed','true');
    s.choice=b.dataset.value;
  });
}
function reveal(es,zh){
  stopSpeech();
  correctSfx();
  const l=letters[stage];
  found.push(l);
  show(`<div class="center"><h2 style="font-size:24px;margin-bottom:4px">¡Correcto! / 答對了</h2></div>
  <div class="panel body small">${es}<br>${zh}</div>
  <div class="body small center">Al resolver el mensaje, aparece una tarjeta.<br>解開這段留言後，出現了一張卡片。</div>
  <div class="reveal-card"><div class="small muted">Encontraste / 你找到了</div><div class="big-letter">${l}</div></div>
  <div class="body small center muted">Guárdala. Puede servirte después.<br>先留著，之後可能會用到。</div>
  <button id="next" class="primary" type="button">SIGUIENTE / 下一段</button>`);
  q('#next').onclick=()=>{stopSpeech();stage++;reset();render()};
}

function r1(){
  show(`<div class="body">Lucía te da cuatro palabras.<div class="small muted">Lucía 給了你四個單字。</div></div>
  <div class="body"><strong>Escucha las cuatro palabras. ¿En qué dos palabras hay una letra al principio que no se oye? Selecciona dos.</strong><div class="small muted">請聽這四個單字。哪兩個單字開頭有一個看得到、卻聽不到的字母？請選兩個。</div></div>
  <div class="wordgrid">${['hotel','mesa','hospital','jardín'].map(w=>`<div class="wordrow"><button class="btn text-left" data-word="${w}" aria-pressed="false" type="button">${w}</button><button class="sound" data-sound="${w}" type="button">🔊</button></div>`).join('')}</div>
  <button id="check" class="primary" type="button">COMPROBAR / 確認答案</button>${hints()}<div id="feedback" class="hide panel body small"></div>`);
  qa('[data-sound]').forEach(b=>b.onclick=()=>playWord(b.dataset.sound));
  qa('[data-word]').forEach(b=>b.onclick=()=>{
    const w=b.dataset.word;
    if(s.selected.has(w)){s.selected.delete(w);b.setAttribute('aria-pressed','false')}
    else if(s.selected.size<2){s.selected.add(w);b.setAttribute('aria-pressed','true')}
  });
  q('#check').onclick=()=>{
    if(s.selected.size!==2)return fb('Selecciona dos palabras.<br>請選兩個單字。');
    const answer=[...s.selected].sort().join('|');
    const ok=s.selected.has('hotel')&&s.selected.has('hospital');
    recordAttempt('pista1',answer,ok);
    ok?reveal('<strong>hotel</strong> y <strong>hospital</strong> empiezan con una h que no se pronuncia.','<strong>hotel</strong> 和 <strong>hospital</strong> 都以不發音的 h 開頭。'):wrong('Escucha otra vez y fíjate en el primer sonido.<br>再聽一次，注意每個單字的第一個聲音。');
  };
  bindHints('Compara la primera letra con el primer sonido.<br>比較第一個字母和實際聽到的第一個聲音。','En español, la <strong>h</strong> normalmente no se pronuncia.<br>西班牙文的 h 通常不發音。');
}

function r2(){
  show(`<div class="body">Ahora Lucía te manda cinco palabras.<div class="small muted">接著，Lucía 傳來五個單字。</div></div>${player('Escucha cinco palabras.','請聽五個單字。')}
  <div id="p2-pass" class="hide panel body small" aria-live="polite"></div>
  <div class="body"><strong>¿En cuál de las cinco palabras escuchas la vocal “e”?</strong><div class="small muted">五個單字中，你在第幾個單字聽到母音 e？</div></div>
  <div class="grid5">${[1,2,3,4,5].map(n=>`<button class="btn" data-one data-value="${n}" aria-pressed="false" type="button">${n}</button>`).join('')}</div>
  <button id="check" class="primary" type="button">COMPROBAR / 確認答案</button>${hints()}<div id="feedback" class="hide panel body small"></div>`);
  q('#play').onclick=()=>playSequence(
    ['musa','mesa','moto','masa','misa'],
    {repeat:2,betweenPasses:2500,statusEl:'#p2-pass'}
  );
  single('[data-one]');
  q('#check').onclick=()=>{
    if(s.choice===null)return fb('Selecciona una respuesta.<br>請先選一個答案。');
    const ok=s.choice==='2';
    recordAttempt('pista2',s.choice,ok);
    ok?reveal('La segunda palabra es <strong>mesa</strong>; allí escuchas la vocal <strong>e</strong>.','第 2 個單字是 <strong>mesa</strong>，其中可以聽到母音 <strong>e</strong>。'):wrong('Escucha otra vez y busca la palabra que contiene el sonido e.<br>再聽一次，找出有 e 聲音的單字。');
  };
  bindHints('No necesitas saber el significado. Escucha solo las vocales.<br>不需要知道單字意思，只注意母音。','Escucha las cinco palabras una por una.<br>把五個單字一個一個聽清楚。');
}

function r3(){
  show(`<div class="body">En el tercer mensaje aparecen tres palabras.<div class="small muted">第三段留言裡出現三個單字。</div></div>
  <div class="panel body small">Dos empiezan con el mismo sonido. Una empieza con un sonido diferente.<br>其中兩個單字的開頭聲音相同，只有一個不同。</div>
  <div class="body"><strong>¿Cuál es diferente?</strong><div class="small muted">哪一個不同？</div></div>
  <div class="grid3">${['casa','cine','cubo'].map(w=>`<div class="option-stack"><button class="btn" data-one data-value="${w}" aria-pressed="false" type="button">${w.toUpperCase()}</button><button class="sound" data-sound="${w}" type="button">🔊</button></div>`).join('')}</div>
  <button id="check" class="primary" type="button">COMPROBAR / 確認答案</button>${hints()}<div id="feedback" class="hide panel body small"></div>`);
  qa('[data-sound]').forEach(b=>b.onclick=()=>playWord(b.dataset.sound));
  single('[data-one]');
  q('#check').onclick=()=>{
    if(s.choice===null)return fb('Selecciona una respuesta.<br>請先選一個答案。');
    const ok=s.choice==='cine';
    recordAttempt('pista3',s.choice,ok);
    ok?reveal('<strong>casa</strong> y <strong>cubo</strong> empiezan con el mismo sonido; <strong>cine</strong> empieza de forma diferente.','<strong>casa</strong> 和 <strong>cubo</strong> 的開頭聲音相同；<strong>cine</strong> 不同。'):wrong('Escucha otra vez los primeros sonidos.<br>再比較三個單字的第一個聲音。');
  };
  bindHints('Compara primero casa y cubo.<br>先比較 casa 和 cubo。','La pronunciación de c cambia según la vocal que viene después.<br>c 後面的母音不同時，發音也可能不同。');
}

function r4(){
  show(`${player('Escucha: jamón.','請聽：jamón。')}
  <div class="body"><strong>¿Qué palabras empiezan con el mismo sonido que “jamón”? Selecciona todas las respuestas correctas.</strong><div class="small muted">哪些單字和 jamón 的開頭發音相同？請選出所有正確答案。</div></div>
  <div class="wordgrid">${['gente','gato','girasol','jardín'].map(w=>`<div class="wordrow"><button class="btn text-left" data-word="${w}" aria-pressed="false" type="button">${w}</button><button class="sound" data-sound="${w}" type="button">🔊</button></div>`).join('')}</div>
  <button id="check" class="primary" type="button">COMPROBAR / 確認答案</button>${hints()}<div id="feedback" class="hide panel body small"></div>`);
  q('#play').onclick=()=>playWord('jamón');
  qa('[data-sound]').forEach(b=>b.onclick=()=>playWord(b.dataset.sound));
  qa('[data-word]').forEach(b=>b.onclick=()=>{
    const w=b.dataset.word;
    if(s.selected.has(w)){s.selected.delete(w);b.setAttribute('aria-pressed','false')}
    else{s.selected.add(w);b.setAttribute('aria-pressed','true')}
  });
  q('#check').onclick=()=>{
    const good=new Set(['gente','girasol','jardín']),chosen=[...s.selected];
    if(!chosen.length)return fb('Selecciona al menos una palabra.<br>請先選答案。');
    const extra=chosen.filter(x=>!good.has(x)),missing=[...good].filter(x=>!s.selected.has(x));
    const ok=!extra.length&&!missing.length;
    recordAttempt('pista4',chosen.sort().join('|'),ok);
    if(ok)return reveal('<strong>gente</strong>, <strong>girasol</strong> y <strong>jardín</strong> empiezan como <strong>jamón</strong>; <strong>gato</strong> no.','<strong>gente、girasol、jardín</strong> 和 <strong>jamón</strong> 的開頭聲音相同；<strong>gato</strong> 不同。');
    if(!extra.length)return wrong(`Todas tus respuestas son correctas, pero te faltan ${missing.length}.<br>目前選到的都對，但還漏了 ${missing.length} 個。`);
    if(!missing.length)return wrong('Encontraste todas las correctas, pero elegiste una respuesta de más.<br>正確答案都找到了，但有多選。');
    wrong('Hay respuestas de más y también faltan respuestas.<br>目前有多選，也有漏選。');
  };
  bindHints('Compara especialmente ge, gi y j.<br>特別比較 ge、gi 和 j 的開頭聲音。','La g delante de e o i puede sonar como j.<br>g 在 e、i 前面時，發音可以和 j 很接近。');
}

function r5(){
  if(s.step===0){
    show(`<div class="body">El quinto mensaje tiene dos sonidos muy parecidos.<div class="small muted">第五段留言裡有兩個很像的聲音。</div></div>
    <div class="panel body small">Primero, escucha A y B.<br>先聽 A 和 B。</div>
    <div class="grid2"><button class="btn" data-ab="pero" type="button">🔊<br>A</button><button class="btn" data-ab="perro" type="button">🔊<br>B</button></div>
    <div class="panel body small">Ahora escucha un tercer audio.<br>現在再聽第三段錄音。</div>
    <button id="mystery" class="btn" type="button">▶ REPRODUCIR / 播放</button>
    <div class="body"><strong>¿Suena como A o como B?</strong><div class="small muted">這段錄音聽起來像 A 還是 B？</div></div>
    <div class="grid2"><button class="btn" data-one data-value="A" aria-pressed="false" type="button">A</button><button class="btn" data-one data-value="B" aria-pressed="false" type="button">B</button></div>
    <button id="check" class="primary" type="button">COMPROBAR / 確認答案</button>${hints()}<div id="feedback" class="hide panel body small"></div>`);
    qa('[data-ab]').forEach(b=>b.onclick=()=>playWord(b.dataset.ab,{repeat:2,rate:.78,gap:800}));
    q('#mystery').onclick=()=>playWord('perro',{repeat:2,rate:.78,gap:800});
    single('[data-one]');
    q('#check').onclick=()=>{
      if(s.choice===null){
        fb('Selecciona A o B.<br>請先選 A 或 B。');
        return;
      }
      const ok=s.choice==='B';
      recordAttempt('pista5a',s.choice,ok);
      if(ok){
        correctFb(`<strong>✅ ¡Correcto! / 答對了</strong><br>El tercer audio suena como B.<br>第三段錄音和 B 一樣。
        <div style="margin-top:12px"><button id="p5continue" class="btn" type="button">CONTINUAR / 繼續</button></div>`);
        q('#check').disabled=true;
        qa('[data-one]').forEach(x=>x.disabled=true);
        q('#p5continue').onclick=()=>{s.step=1;s.choice=null;resetQuestionMetrics();r5();};
      }else{
        wrong('<strong>❌ Todavía no. / 還不對</strong><br>Compara otra vez A, B y el tercer audio.<br>再比較一次 A、B 和第三段錄音。');
      }
    };
    bindHints('Escucha solo el sonido de la r en el centro.<br>只注意中間的 r 聲音。','B tiene una vibración más larga y clara.<br>B 的 r 震動比較長、比較明顯。');
    return;
  }

  show(`<div class="body">A = pero　　B = perro<div class="small muted">El tercer audio era “perro”.<br>剛才第三段錄音是 perro。</div></div>
  <div class="body"><strong>¿Cuál tiene el sonido de “rr” más fuerte?</strong><div class="small muted">哪一個的 rr 聲音比較強？</div></div>
  <div class="grid2"><button class="sound" data-r="pero" type="button">🔊 pero</button><button class="sound" data-r="perro" type="button">🔊 perro</button></div>
  <div class="grid2"><button class="btn" data-one data-value="pero" aria-pressed="false" type="button">pero</button><button class="btn" data-one data-value="perro" aria-pressed="false" type="button">perro</button></div>
  <button id="check" class="primary" type="button">COMPROBAR / 確認答案</button><div id="feedback" class="hide panel body small"></div>`);
  qa('[data-r]').forEach(b=>b.onclick=()=>playWord(b.dataset.r,{repeat:2,rate:.78,gap:800}));
  single('[data-one]');
  q('#check').onclick=()=>{
    if(s.choice===null){
      fb('Selecciona una respuesta.<br>請先選一個答案。');
      return;
    }
    const ok=s.choice==='perro';
    recordAttempt('pista5b',s.choice,ok);
    if(ok){
      reveal('<strong>perro</strong> tiene una vibración de rr más fuerte que <strong>pero</strong>.','<strong>perro</strong> 的 rr 震動比 <strong>pero</strong> 更明顯。');
    }else{
      wrong('<strong>❌ Todavía no. / 還不對</strong><br>Escucha otra vez los dos sonidos.<br>再比較一次兩個聲音。');
    }
  };
}

function r6(){
  const keys=['a','á','b','c','d','e','é','f','g','h','i','í','j','k','l','m','n','ñ','o','ó','p','q','r','s','t','u','ú','ü','v','w','x','y','z'];
  show(`${player('Escucha la palabra.','請聽這個單字。')}
  <div class="body"><strong>Forma la palabra usando los botones de abajo.</strong><div class="small muted">請用下面的字母按鈕拼出你聽到的單字。</div></div>
  <div id="typed" class="answer">_</div>
  <div class="keyboard">${keys.map(k=>`<button class="key" data-key="${k}" type="button">${k}</button>`).join('')}</div>
  <div class="grid2"><button id="back" class="btn" type="button">← Borrar / 刪除</button><button id="clear" class="btn" type="button">Limpiar / 清除</button></div>
  <button id="check" class="primary" type="button">COMPROBAR / 確認答案</button>${hints()}<div id="feedback" class="hide panel body small"></div>`);
  const draw=()=>q('#typed').textContent=s.typed||'_';
  q('#play').onclick=()=>playWord('niño');
  qa('[data-key]').forEach(b=>b.onclick=()=>{if(s.typed.length<10){s.typed+=b.dataset.key;draw()}});
  q('#back').onclick=()=>{s.typed=[...s.typed].slice(0,-1).join('');draw()};
  q('#clear').onclick=()=>{s.typed='';draw()};
  q('#check').onclick=()=>{
    const answer=s.typed.toLocaleLowerCase('es');
    const ok=answer==='niño';
    recordAttempt('pista6',answer,ok);
    ok?reveal('<strong>n</strong> y <strong>ñ</strong> son letras diferentes y representan sonidos diferentes.','<strong>n</strong> 和 <strong>ñ</strong> 是不同的字母，也代表不同的聲音。'):wrong('Escucha otra vez y presta atención al sonido del medio.<br>再聽一次，注意中間的聲音。');
  };
  bindHints('Presta atención al sonido del medio.<br>注意單字中間的聲音。','n y ñ son letras diferentes.<br>n 和 ñ 是不同的字母。');
}

function r7(){
  show(`${player('Escucha la palabra.','請聽這個單字。')}
  <div class="body"><strong>¿Qué sílaba suena más fuerte?</strong><div class="small muted">哪一個音節聽起來最重？</div></div>
  <div class="grid3">${['se','cre','to'].map(x=>`<button class="btn" data-one data-value="${x}" aria-pressed="false" type="button">${x}</button>`).join('')}</div>
  <button id="check" class="primary" type="button">COMPROBAR / 確認答案</button>${hints()}<div id="feedback" class="hide panel body small"></div>`);
  q('#play').onclick=()=>playWord('secreto');
  single('[data-one]');
  q('#check').onclick=()=>{
    if(s.choice===null)return fb('Selecciona una sílaba.<br>請先選一個音節。');
    const ok=s.choice==='cre';
    recordAttempt('pista7',s.choice,ok);
    ok?reveal('En <strong>secreto</strong>, la sílaba más fuerte es <strong>cre</strong>.','在 <strong>secreto</strong> 裡，最重的音節是 <strong>cre</strong>。'):wrong('Escucha otra vez y compara las tres sílabas.<br>再聽一次，比較三個音節。');
  };
  bindHints('Repítela una vez y compara las tres sílabas.<br>跟著念一次，再比較三個音節。','Presta atención a cuál sílaba destaca más.<br>注意哪一個音節最突出。');
}

function finalStage(){
  const pool=[{id:0,l:'C'},{id:1,l:'A'},{id:2,l:'E'},{id:3,l:'H'},{id:4,l:'U'},{id:5,l:'C'},{id:6,l:'S'}];
  show(`<div class="body">Ya resolviste los siete mensajes.<div class="small muted">你已經解開七段留言。</div></div>
  <div class="panel body small">Mira las letras que encontraste.<br>看看你找到的字母。<br><br>Lucía dejó una última indicación: «Ponlas en orden.»<br>Lucía 留下最後一句提示：「把它們排好。」</div>
  <div class="tiles">${pool.map(x=>`<button class="tile" data-id="${x.id}" data-letter="${x.l}" type="button">${x.l}</button>`).join('')}</div>
  <div id="final-answer" class="answer">_ _ _ _ _ _ _</div>
  <div class="grid2"><button id="undo" class="btn" type="button">← Deshacer / 退回一張</button><button id="reset-final" class="btn" type="button">Reiniciar / 重新排列</button></div>
  <button id="check-final" class="primary" type="button">COMPROBAR / 確認答案</button><div id="feedback" class="hide panel body small"></div>`);
  const draw=()=>{
    q('#final-answer').textContent=s.final.length?s.final.map(x=>x.l).join(' '):'_ _ _ _ _ _ _';
    qa('[data-id]').forEach(b=>b.disabled=s.used.has(+b.dataset.id))
  };
  qa('[data-id]').forEach(b=>b.onclick=()=>{
    const id=+b.dataset.id;
    if(s.used.has(id))return;
    s.used.add(id);
    s.final.push({id,l:b.dataset.letter});
    draw()
  });
  q('#undo').onclick=()=>{const x=s.final.pop();if(x)s.used.delete(x.id);draw()};
  q('#reset-final').onclick=()=>{s.final=[];s.used.clear();draw()};
  q('#check-final').onclick=()=>{
    const answer=s.final.map(x=>x.l).join('');
    const ok=answer==='ESCUCHA';
    recordAttempt('final',answer,ok);
    if(ok){stage=8;render();}
    else wrong('El orden todavía no es correcto.<br>順序還不對。');
  };
  draw();
}

function done(){
  completeSession();
  show(`<div class="center">
    <h2 style="font-size:40px;margin-bottom:12px">ESCUCHA / 聽</h2>
    <p class="body">¡Muy bien! Ya sabes lo que Lucía quería decirte.<br>做得好！現在你知道 Lucía 想告訴你什麼了。</p>
  </div>
  <div class="panel body center">«¡Lo hiciste! Ahora sigue escuchando mucho español.»<br>「成功了！之後也要繼續多聽西班牙文喔！」</div>`);
}

function render(){
  header();
  if(stage===0)r1();
  else if(stage===1)r2();
  else if(stage===2)r3();
  else if(stage===3)r4();
  else if(stage===4)r5();
  else if(stage===5)r6();
  else if(stage===6)r7();
  else if(stage===7)finalStage();
  else done();
}

q('#begin').onclick=()=>{
  const id=q('#sid').value.trim(),name=q('#sname').value.trim();
  if(!id||!name){
    q('#start-error').textContent='Escribe tu número de estudiante y tu nombre. / 請先填寫學號和姓名。';
    q('#start-error').classList.remove('hide');
    return
  }
  student={id,name};
  sessionId=makeSessionId();
  sessionStartedAt=Date.now();
  sessionCompleted=false;
  totalAttempts=0;
  totalHints=0;
  totalAudioPlays=0;
  sendLog({type:'session_start'});
  q('#start').classList.add('hide');
  q('#game').classList.remove('hide');
  reset();
  render();
};
})();
