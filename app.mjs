import {ORIGINAL,TRAINING,createFlight,advance,sampleFlight} from './engine.mjs';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const storage={get(k,f){try{return JSON.parse(localStorage.getItem(k))??f}catch{return f}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch{}}};
const key='lunar56.flight.v1';
let mode='classic',config=ORIGINAL,state=createFlight(),history=[{...state}],burn=25,busy=false,animation=null,display={...state},metric='altitude',selectedMode='classic',hoverTime=null;
let resultAt=0,best=storage.get('lunar56.best',null),sound=false,ctxAudio=null,visible=true,raf=0;
let settings=storage.get('lunar56.settings',{layout:'auto',motion:matchMedia('(prefers-reduced-motion: reduce)').matches});
if(!settings||!['auto','tabletop','stacked'].includes(settings.layout))settings={layout:'auto',motion:false};
const saved=storage.get(key,null);
if(saved&&['classic','training'].includes(saved.mode)&&saved.state&&['ready','landed','crashed'].includes(saved.state.status)&&['altitude','velocity','fuel','time','turn'].every(k=>Number.isFinite(saved.state[k]))&&saved.state.altitude>=0&&saved.state.fuel>=0&&saved.state.time>=0&&Array.isArray(saved.history)&&saved.history.length&&saved.history.every(s=>s&&['altitude','velocity','time'].every(k=>Number.isFinite(s[k])))){
 mode=saved.mode;config=mode==='training'?TRAINING:ORIGINAL;state=saved.state;display={...state};history=saved.history.slice(-2000);burn=Number.isFinite(saved.burn)?Math.max(0,Math.min(75,Math.floor(saved.burn))):25;
}
function save(){storage.set(key,{state,history,mode,burn})}
function num(n,d=0){return n.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d})}
function clock(t){return String(Math.floor(t/60)).padStart(2,'0')+':'+String(Math.floor(t%60)).padStart(2,'0')}
function setBurn(value){
 burn=Math.max(0,Math.min(75,Math.round(Number(value)||0)));$('#throttle').value=burn;$('#burn-number').value=burn;
 $('#throttle').style.setProperty('--fill',`${burn/75*100}%`);$('#throttle').setAttribute('aria-valuetext',`${burn} pounds per second`);
 $$('[data-burn]').forEach(el=>el.classList.toggle('active',Number(el.dataset.burn)===burn));
 const actual=Math.min(burn,Math.floor(state.fuel));
 $('#burn-description').textContent=actual<burn?`Tank limited · ${actual} lb available`:burn===0?'Engine off · free fall':burn===5?'Balanced thrust · velocity holds':burn<5?`Gravity wins · ${5-burn} ft/s faster downward`:`Braking · +${burn-5} ft/s each second`;
 if(!busy&&state.status==='ready')$('#burn-text').textContent=burn===0?'COAST · 1 SEC':'BURN · 1 SEC';
 save();
}
function updateTelemetry(s){
 $('#altitude').textContent=num(s.altitude,s.altitude<10?1:0);
 $('#velocity').textContent=num(Math.abs(s.velocity),Math.abs(s.velocity)<10?1:0);
 $('#velocity-label').innerHTML=s.velocity>0?'ASCENT <span>↑</span>':'DESCENT <span>↓</span>';
 $('#fuel').textContent=num(s.fuel);$('#fuel-bar').style.width=Math.max(0,s.fuel/config.fuel*100)+'%';
 $('#fuel-bar').style.background=s.fuel<100?'var(--orange)':'var(--mint)';
 $('#mission-time').textContent='T+ '+clock(s.time);$('#view-scale').textContent=`ALT. ${num(s.altitude)} FT`;
 $('#flight-name').textContent=mode==='classic'?'CLASSIC / 01':'PRACTICE / 02';
 $('#turn-count').textContent=String(state.turn).padStart(2,'0');
 $('#best').textContent=Number.isFinite(best)?`${best.toFixed(2)} ft/s`:'— ft/s';
}
function lockControls(lock){
 $('#burn').disabled=lock;$('#throttle').disabled=lock;$('#burn-number').disabled=lock;$$('[data-burn]').forEach(e=>e.disabled=lock);
}
function status(text,color='var(--mint)'){$('#status-text').textContent=text;$('#status-dot').style.background=color}
function tone(freq=440,duration=.1){
 if(!sound)return;
 try{ctxAudio??=new (window.AudioContext||window.webkitAudioContext)();ctxAudio.resume();const osc=ctxAudio.createOscillator(),gain=ctxAudio.createGain();osc.connect(gain);gain.connect(ctxAudio.destination);osc.frequency.value=freq;gain.gain.setValueAtTime(.035,ctxAudio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ctxAudio.currentTime+duration);osc.start();osc.stop(ctxAudio.currentTime+duration)}catch{}
}
function engineSound(duration,amount){
 if(!sound||!amount)return;
 try{ctxAudio??=new(window.AudioContext||window.webkitAudioContext)();ctxAudio.resume();const length=Math.ceil(ctxAudio.sampleRate*duration),buffer=ctxAudio.createBuffer(1,length,ctxAudio.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<length;i++)data[i]=(Math.random()*2-1)*.11;const source=ctxAudio.createBufferSource(),filter=ctxAudio.createBiquadFilter(),gain=ctxAudio.createGain();source.buffer=buffer;filter.type='lowpass';filter.frequency.value=160+amount*5;gain.gain.setValueAtTime(.001,ctxAudio.currentTime);gain.gain.linearRampToValueAtTime(.4,ctxAudio.currentTime+.08);gain.gain.exponentialRampToValueAtTime(.001,ctxAudio.currentTime+duration);source.connect(filter);filter.connect(gain);gain.connect(ctxAudio.destination);source.start();source.stop(ctxAudio.currentTime+duration)}catch{}
}
function executeBurn(){
 if(busy||state.status!=='ready'||$$('dialog[open]').length)return;
 const transition=advance(state,burn);if(!transition)return;
 busy=true;lockControls(true);hoverTime=null;$('#graph-tooltip').hidden=true;
 $('#burn-text').textContent=transition.burn?'ENGINE FIRING':'COASTING';
 status(transition.burn?`Burn ${String(state.turn+1).padStart(2,'0')} · ${transition.burn} lb/s`:'Coasting · engine off');
 const duration=settings.motion?120:transition.phases.length>1?1700:900;
 animation={...transition,start:performance.now(),ms:duration};state=transition.next;
 for(const phase of transition.phases){if(phase.start.time>history.at(-1).time)history.push({...phase.start})}
 history.push({...state});if(history.length>2000)history.splice(0,history.length-2000);save();engineSound(duration/1000,transition.burn);if(!raf&&visible)raf=requestAnimationFrame(frame);
}
function finishBurn(now){
 busy=false;animation=null;display={...state};updateTelemetry(state);drawGraph();
 if(state.status==='ready'){
  lockControls(false);setBurn(burn);
  if(state.fuel<100)status('Fuel low. Make it count.','var(--orange)');
  else if(state.velocity>0)status('Ascending. Coast to return.');
  else if(Math.abs(state.velocity)<5)status('Descent is gentle. Watch your altitude.');
  else status('Burn complete. Awaiting input.');
  tone(640,.05);
 }else{
  resultAt=now;$('#burn-text').textContent=state.status==='landed'?'CONTACT LIGHT':'FLIGHT ENDED';$('#control-note').textContent='Flight recorded.';
  if(state.status==='landed'){if(!Number.isFinite(best)||Math.abs(state.velocity)<best){best=Math.abs(state.velocity);storage.set('lunar56.best',best)}status('Contact light. Engine off.');tone(750,.2)}
  else{status('Signal lost.','var(--orange)');tone(95,.35)}
  updateTelemetry(state);save();
 }
}
function showResult(){
 const success=state.status==='landed';$('#result').hidden=false;$('.result-card').classList.toggle('crashed',!success);
 $('#result-kicker').textContent=success?'CONTACT LIGHT':'SIGNAL LOST';$('#result-title').textContent=success?'Touchdown.':'Hard landing.';
 $('#result-copy').textContent=success?`${num(Math.abs(state.velocity),2)} ft/s at contact. ${num(state.fuel)} lb left in the tank.`:`${num(Math.abs(state.velocity),1)} ft/s at impact. ${state.fuel<1?'The tank ran dry.':'Start braking earlier. Aim below 5 ft/s.'}`;
}
function resetFlight(){
 mode=selectedMode;config=mode==='training'?TRAINING:ORIGINAL;state=createFlight(config);history=[{...state}];display={...state};animation=null;busy=false;resultAt=0;hoverTime=null;
 $('#result').hidden=true;$('#graph-tooltip').hidden=true;$('#control-note').textContent='Time waits for your next move.';lockControls(false);setBurn(mode==='classic'?25:15);status('Awaiting first burn.');updateTelemetry(state);drawGraph();drawScene(performance.now());save();
}
function openDialog(id){$(id).showModal()}
$('#throttle').addEventListener('input',e=>setBurn(e.target.value));
$('#burn-number').addEventListener('input',e=>{if(e.target.value!=='')setBurn(e.target.value)});
$('#burn-number').addEventListener('change',e=>setBurn(e.target.value));
$$('[data-burn]').forEach(el=>el.addEventListener('click',()=>setBurn(el.dataset.burn)));
$('#burn').addEventListener('click',executeBurn);
$('#help').addEventListener('click',()=>openDialog('#help-dialog'));
$('#settings').addEventListener('click',()=>openDialog('#settings-dialog'));
function newDialog(){selectedMode=mode;$$('[data-mode]').forEach(b=>b.classList.toggle('selected',b.dataset.mode===mode));$('#restart-note').textContent=state.turn&&state.status==='ready'?'Starting a new flight replaces this run.':'Choose your starting conditions.';openDialog('#new-dialog')}
$('#new-flight').addEventListener('click',newDialog);$('#fly-again').addEventListener('click',newDialog);
$$('.close').forEach(el=>el.addEventListener('click',()=>el.closest('dialog').close()));
$$('dialog').forEach(d=>d.addEventListener('click',e=>{const r=d.getBoundingClientRect();if(e.target===d&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom))d.close()}));
$$('[data-mode]').forEach(el=>el.addEventListener('click',()=>{selectedMode=el.dataset.mode;$$('[data-mode]').forEach(e=>e.classList.toggle('selected',e===el))}));
$('#launch').addEventListener('click',()=>{$('#new-dialog').close();resetFlight()});
$('#sound').addEventListener('click',()=>{sound=!sound;$('#sound').setAttribute('aria-pressed',sound);$('#sound').setAttribute('aria-label',sound?'Mute sound':'Enable sound');$('#sound').title=sound?'Mute sound':'Enable sound';$('#sound').innerHTML=sound?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Zm5 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg>':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Zm5 4 5 6m0-6-5 6"/></svg>';tone(600,.1)});
function applySettings(){document.body.dataset.layout=settings.layout;$('#layout').value=settings.layout;$('#motion').checked=!!settings.motion;storage.set('lunar56.settings',settings)}
$('#layout').addEventListener('change',e=>{settings.layout=e.target.value;applySettings()});$('#motion').addEventListener('change',e=>{settings.motion=e.target.checked;applySettings()});
document.addEventListener('keydown',e=>{if(e.code==='Enter'&&!e.repeat&&!$$('dialog[open]').length&&!['BUTTON','A','SELECT','SUMMARY'].includes(e.target.tagName)){e.preventDefault();executeBurn()}});
$$('[data-metric]').forEach(el=>el.addEventListener('click',()=>{metric=el.dataset.metric;$$('[data-metric]').forEach(b=>{b.classList.toggle('selected',b===el);b.setAttribute('aria-pressed',b===el)});hoverTime=null;$('#graph-tooltip').hidden=true;drawGraph()}));

// Both canvases share CSS pixels. ResizeObserver follows folding and rotation.
const scene=$('#scene'),graph=$('#graph'),sc=scene.getContext('2d'),gc=graph.getContext('2d');
function fitCanvas(canvas){const r=canvas.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2);if(r.width<1||r.height<1)return;canvas.width=Math.round(r.width*d);canvas.height=Math.round(r.height*d);canvas.getContext('2d').setTransform(d,0,0,d,0,0);canvas.logicalWidth=r.width;canvas.logicalHeight=r.height}
const observer=new ResizeObserver(()=>{fitCanvas(scene);fitCanvas(graph);drawGraph();drawScene(performance.now())});observer.observe(scene);observer.observe(graph);
let seed=56;function random(){seed=(seed*16807)%2147483647;return(seed-1)/2147483646}
const stars=Array.from({length:92},()=>({x:random(),y:random(),r:random()*.85+.2,a:random()*.6+.12}));
const craters=Array.from({length:30},()=>({x:random(),y:random(),r:random()}));
function path(ctx,points,fill,stroke,width=1){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill()}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke()}}
function line(ctx,x1,y1,x2,y2,color,width=1){ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke()}
function lander(ctx,x,y,scale,burning,now){
 ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);
 if(burning>0){
  const pulse=settings.motion?1:.88+Math.sin(now*.04)*.09+Math.sin(now*.08)*.06;
  const length=(18+burning*.85)*pulse;
  const glow=ctx.createRadialGradient(0,29,1,0,34,60);glow.addColorStop(0,'#ffbf6140');glow.addColorStop(1,'#ff883300');ctx.fillStyle=glow;ctx.fillRect(-60,0,120,105);
  path(ctx,[[-9,21],[-12,32],[-6,42],[-7,55],[0,25+length],[7,53],[5,41],[11,32],[9,21]],'#ff8057c0');
  path(ctx,[[-6,21],[-5,37],[0,26+length*.73],[5,37],[6,21]],'#ffc57c');
  path(ctx,[[-3,21],[0,27+length*.4],[3,21]],'#fff1cf');
 }
 // Landing struts, gold foil descent stage, faceted ascent cabin.
 line(ctx,-17,9,-34,31,'#c2c8c1',2);line(ctx,17,9,34,31,'#c2c8c1',2);line(ctx,-19,20,-31,31,'#8c9795',1);line(ctx,19,20,31,31,'#8c9795',1);
 line(ctx,-41,32,-26,32,'#c2c8c1',2.5);line(ctx,26,32,41,32,'#c2c8c1',2.5);
 path(ctx,[[-7,15],[7,15],[10,23],[-10,23]],'#4e5553','#8f9e98');
 path(ctx,[[-23,0],[22,0],[24,17],[13,21],[-17,20],[-25,13]],'#a97f42','#c8a66a');
 path(ctx,[[-23,0],[-9,5],[-15,19],[-25,13]],'#d8ae66');path(ctx,[[7,2],[22,0],[24,17],[13,21]],'#765b3a');
 line(ctx,-18,7,17,7,'#d2b679',.5);line(ctx,-8,2,-4,19,'#92774f',1);line(ctx,10,2,11,19,'#d7b974',1);
 path(ctx,[[-16,-4],[-17,-23],[-8,-33],[8,-33],[19,-23],[17,-4],[8,1],[-9,1]],'#d4d5c6','#d6d8cc',1);
 path(ctx,[[1,-33],[8,-33],[19,-23],[17,-4],[8,1],[1,-5]],'#8d9b99');
 path(ctx,[[-14,-23],[-5,-28],[-4,-15],[-13,-14]],'#14303a','#a7c3c2',.8);path(ctx,[[5,-28],[14,-23],[13,-14],[5,-15]],'#142830','#c0d0cc',.8);
 line(ctx,-4,-13,4,-13,'#4a605e',1);path(ctx,[[-5,-9],[5,-9],[6,-1],[-6,-1]],'#a4aaa1','#6e807b',.7);
 line(ctx,1,-33,1,-44,'#a8b7b3',1);line(ctx,-10,-35,8,-40,'#aab9b4',1);ctx.beginPath();ctx.arc(-11,-36,5,-.2,Math.PI+1);ctx.strokeStyle='#afbfba';ctx.stroke();
 ctx.fillStyle='#ff9a61';ctx.fillRect(-21,4,3,2);ctx.restore();
}
function drawScene(now){
 const w=scene.logicalWidth||400,h=scene.logicalHeight||380;sc.clearRect(0,0,w,h);
 const sky=sc.createLinearGradient(0,0,w,h);sky.addColorStop(0,'#0b1219');sky.addColorStop(.7,'#101f27');sky.addColorStop(1,'#152b31');sc.fillStyle=sky;sc.fillRect(0,0,w,h);
 for(const s of stars){sc.beginPath();sc.arc(s.x*w,34+s.y*(h*.72-34),s.r,0,Math.PI*2);sc.fillStyle=`rgba(181,206,202,${s.a})`;sc.fill()}
 const ex=w*.8,ey=h*.25,er=Math.max(13,Math.min(24,w*.05));const earthGlow=sc.createRadialGradient(ex,ey,er*.8,ex,ey,er*1.7);earthGlow.addColorStop(0,'#83c4cb2a');earthGlow.addColorStop(1,'#83c4cb00');sc.fillStyle=earthGlow;sc.fillRect(ex-er*2,ey-er*2,er*4,er*4);
 sc.save();sc.beginPath();sc.arc(ex,ey,er,0,Math.PI*2);sc.clip();sc.fillStyle='#365e68';sc.fillRect(ex-er,ey-er,er*2,er*2);path(sc,[[ex-er,ey-er*.2],[ex-er*.2,ey-er*.7],[ex+er*.2,ey-er*.1],[ex-er*.3,ey+er*.2],[ex+er*.3,ey+er*.55],[ex-er*.2,ey+er]],'#91a59b');sc.beginPath();sc.ellipse(ex+er*.5,ey-er*.3,er*.8,er*1.2,-.4,0,Math.PI*2);sc.fillStyle='#0d1a23d9';sc.fill();sc.restore();
 const ground=h*(h<300?.76:.80),x=w*.44,maxHeight=Math.max(config.altitude*1.12,...history.map(p=>p.altitude*1.08),display.altitude*1.08,100),top=h<300?64:82;
 const cy=ground-24-Math.min(1,display.altitude/maxHeight)*Math.max(60,ground-top-24);const scale=Math.max(.66,Math.min(1.12,w/530));
 // Layered, quiet lunar terrain.
 path(sc,[[0,ground+8],[0,ground-10],[w*.09,ground-14],[w*.18,ground-7],[w*.28,ground-15],[w*.4,ground-3],[w*.53,ground-11],[w*.64,ground-15],[w*.77,ground-5],[w*.9,ground-20],[w,ground-10],[w,h]],'#26373c');
 path(sc,[[0,ground+7],[w*.13,ground-1],[w*.27,ground+10],[w*.38,ground+5],[w*.55,ground+8],[w*.68,ground+1],[w*.84,ground+11],[w,ground+3],[w,h],[0,h]],'#354449');
 const groundGrad=sc.createLinearGradient(0,ground,0,h);groundGrad.addColorStop(0,'#4e5a5960');groundGrad.addColorStop(1,'#17262c');sc.fillStyle=groundGrad;sc.fillRect(0,ground+11,w,h-ground);
 for(const c of craters){const px=c.x*w,py=ground+17+c.y*(h-ground-22),r=2+c.r*11;sc.beginPath();sc.ellipse(px,py,r,r*.25,-.1,0,Math.PI*2);sc.fillStyle='#15282e70';sc.fill();sc.strokeStyle='#70818030';sc.lineWidth=.8;sc.stroke()}
 sc.save();sc.setLineDash([3,6]);line(sc,x,75,x,ground+7,'#a8dec912');sc.restore();
 sc.beginPath();sc.ellipse(x,ground+14,35*scale,5*scale,0,0,Math.PI*2);sc.fillStyle='#07121866';sc.fill();
 line(sc,x-40,ground+9,x+40,ground+9,'#a6c3b366',1);line(sc,x-40,ground+4,x-40,ground+14,'#a6c3b366');line(sc,x+40,ground+4,x+40,ground+14,'#a6c3b366');sc.font='8px monospace';sc.fillStyle='#b4c6bd99';sc.textAlign='center';if(h>=300)sc.fillText('LZ–01',x,ground+29);
 // Altitude ruler is scaled to the entire flight, including any climb.
 const rx=w-25;line(sc,rx,70,rx,ground,'#acc5c51a');sc.font='7px monospace';sc.textAlign='right';
 for(let i=0;i<=4;i++){const yy=ground-(ground-70)*i/4;line(sc,rx-5,yy,rx+2,yy,'#a4c2c33a');sc.fillStyle='#8ba6ae80';sc.fillText(num(maxHeight*i/4),rx-10,yy+3)}
 sc.save();sc.setLineDash([3,4]);line(sc,w*.08,cy,x-44*scale,cy,'#b3d3c53a');sc.restore();sc.fillStyle='#b8d7cc';sc.font='9px monospace';sc.textAlign='left';sc.fillText(`${num(display.altitude)} FT`,w*.08,cy-8);
 const ended=state.status!=='ready'&&!busy,elapsed=resultAt?(now-resultAt)/1000:0;
 if(!(ended&&state.status==='crashed'))lander(sc,x,cy-(32*scale-24),scale,display.burn||0,now);
 else{path(sc,[[x-24,ground+6],[x-13,ground-8],[x+7,ground-3],[x+19,ground+9]],'#8e8066');line(sc,x+2,ground-5,x+31,ground+12,'#b7b6a2',2)}
 if(ended&&resultAt&&elapsed<3&&!settings.motion){
  const crash=state.status==='crashed',n=crash?32:16;
  for(let i=0;i<n;i++){const a=i*2.399,v=(crash?28:14)+((i*19)%31),px=x+Math.cos(a)*v*elapsed,py=ground+2-Math.abs(Math.sin(a))*v*elapsed+13*elapsed*elapsed;sc.globalAlpha=Math.max(0,1-elapsed/3);sc.fillStyle=crash&&elapsed<.8?(i%2?'#ffae6f':'#e17d4e'):'#9ca9a1';sc.beginPath();sc.arc(px,Math.min(ground+14,py),crash?2:3+elapsed*2,0,Math.PI*2);sc.fill()}sc.globalAlpha=1;
 }
 if(display.burn>0&&display.altitude<300&&!settings.motion){sc.fillStyle='#c4c7ab24';sc.beginPath();sc.ellipse(x,ground+6,55+Math.sin(now*.01)*10,7,0,0,Math.PI*2);sc.fill()}
}
function graphPoints(){let points=history.filter(p=>p.time<=display.time+1e-6);if(!points.length)points=[history[0]];if(display.time>points.at(-1).time+.001)points.push(display);return points}
function graphBounds(){const points=graphPoints();let vals=points.map(p=>p[metric]);let lo=metric==='altitude'?0:Math.min(-5,...vals),hi=metric==='altitude'?Math.max(config.altitude,...vals):Math.max(5,...vals);if(hi===lo)hi=lo+10;const spread=hi-lo;return {points,min:metric==='altitude'?0:lo-spread*.06,max:hi+spread*.08,timeMax:Math.max(10,Math.ceil(display.time/5)*5)}}
function drawGraph(){
 const w=graph.logicalWidth||400,h=graph.logicalHeight||135;gc.clearRect(0,0,w,h);const b=graphBounds(),left=w<350?36:42,right=10,top=10,bottom=22,pw=w-left-right,ph=h-top-bottom;
 const X=t=>left+t/b.timeMax*pw,Y=v=>top+ph-(v-b.min)/(b.max-b.min)*ph;
 gc.font='8px monospace';gc.textAlign='right';gc.lineWidth=1;
 for(let i=0;i<=3;i++){const v=b.min+(b.max-b.min)*i/3,y=Y(v);line(gc,left,y,w-right,y,'#acc5c515');gc.fillStyle='#789099';gc.fillText(Math.round(v).toLocaleString('en-US'),left-8,y+3)}
 gc.textAlign='center';for(let i=0;i<=4;i++){const t=i*b.timeMax/4,x=X(t);gc.fillStyle='#789099';gc.fillText(t%1===0?t:t.toFixed(1),x,h-5)}
 if(metric==='velocity'){const y1=Y(5),y2=Y(-5);gc.fillStyle='#a8dec91a';gc.fillRect(left,y1,pw,Math.max(2,y2-y1));line(gc,left,Y(0),w-right,Y(0),'#a8dec952');}
 if(b.points.length>1){const fill=gc.createLinearGradient(0,top,0,h-bottom);fill.addColorStop(0,'#a8dec920');fill.addColorStop(1,'#a8dec902');gc.beginPath();gc.moveTo(X(b.points[0].time),h-bottom);for(const p of b.points)gc.lineTo(X(p.time),Y(p[metric]));gc.lineTo(X(b.points.at(-1).time),h-bottom);gc.closePath();gc.fillStyle=fill;gc.fill();gc.beginPath();b.points.forEach((p,i)=>i?gc.lineTo(X(p.time),Y(p[metric])):gc.moveTo(X(p.time),Y(p[metric])));gc.strokeStyle='#a8dec9';gc.lineWidth=2;gc.lineJoin='round';gc.stroke();}
 for(const p of b.points){if(b.points.length<75||p===b.points.at(-1)){gc.beginPath();gc.arc(X(p.time),Y(p[metric]),p===b.points.at(-1)?3:1.7,0,Math.PI*2);gc.fillStyle='#bfe9d4';gc.fill()}}
 if(b.points.length===1){gc.fillStyle='#839b9f';gc.font='10px Arial';gc.textAlign='center';gc.fillText('Your flight draws the line.',left+pw*.5,top+ph*.55)}
 if(hoverTime!==null){const point=b.points.reduce((best,p)=>Math.abs(p.time-hoverTime)<Math.abs(best.time-hoverTime)?p:best,b.points[0]);const x=X(point.time);gc.save();gc.setLineDash([3,3]);line(gc,x,top,x,h-bottom,'#f0d6ae80');gc.restore();gc.beginPath();gc.arc(x,Y(point[metric]),4,0,Math.PI*2);gc.fillStyle='#ffbc8c';gc.fill();const tip=$('#graph-tooltip');tip.hidden=false;tip.textContent=`${point.time.toFixed(1)}s · ${num(point[metric],1)} ${metric==='altitude'?'ft':'ft/s'}`;tip.style.left=Math.max(5,Math.min(w-165,x-65))+'px'}
 graph.setAttribute('aria-label',`${metric==='altitude'?'Altitude':'Signed velocity'} over time. ${b.points.length} points. Current ${num(display[metric],1)} ${metric==='altitude'?'feet':'feet per second'} at ${display.time.toFixed(1)} seconds.`);
}
graph.addEventListener('pointermove',e=>{const r=graph.getBoundingClientRect(),left=r.width<350?36:42;hoverTime=Math.max(0,(e.clientX-r.left-left)/(r.width-left-10)*graphBounds().timeMax);drawGraph()});
graph.addEventListener('pointerleave',()=>{hoverTime=null;$('#graph-tooltip').hidden=true;drawGraph()});
graph.addEventListener('pointerdown',e=>{const r=graph.getBoundingClientRect(),left=r.width<350?36:42;hoverTime=Math.max(0,(e.clientX-r.left-left)/(r.width-left-10)*graphBounds().timeMax);drawGraph()});
let lastFrame=0;
function frame(now){
 if(!visible){raf=0;return;}
 if(now-lastFrame>30||busy){lastFrame=now;if(animation){const p=Math.min(1,(now-animation.start)/animation.ms);display=sampleFlight(animation,p);updateTelemetry(display);drawGraph();if(p>=1)finishBurn(now)}drawScene(now);if(resultAt&&now-resultAt>650&&$('#result').hidden)showResult()}
 raf=busy||(resultAt&&now-resultAt<3200)?requestAnimationFrame(frame):0;
}
document.addEventListener('visibilitychange',()=>{visible=!document.hidden;if(visible){if(animation)animation.start=performance.now();if(!raf)raf=requestAnimationFrame(frame)}else{cancelAnimationFrame(raf);raf=0}});
applySettings();setBurn(burn);updateTelemetry(state);fitCanvas(scene);fitCanvas(graph);drawGraph();
if(state.status!=='ready'){lockControls(true);$('#burn-text').textContent='FLIGHT ENDED';$('#control-note').textContent='Flight recorded.';status(state.status==='landed'?'Contact light. Engine off.':'Signal lost.');showResult()}
else if(state.turn)status('Flight resumed. Awaiting input.');
raf=requestAnimationFrame(frame);
