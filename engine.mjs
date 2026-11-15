export const ORIGINAL = Object.freeze({altitude:2500,velocity:-500,fuel:600});
export const TRAINING = Object.freeze({altitude:1500,velocity:-100,fuel:600});
export function createFlight(config=ORIGINAL){
  return {altitude:config.altitude,velocity:config.velocity,fuel:config.fuel,time:0,status:'ready',turn:0};
}
export function contactTime(h,v,a){
  if(h<=0)return 0;
  if(Math.abs(a)<1e-10)return v<0?-h/v:Infinity;
  const discriminant=v*v-2*a*h;
  if(discriminant<0)return Infinity;
  const root=Math.sqrt(discriminant);
  const roots=[(-v-root)/a,(-v+root)/a].filter(t=>t>=0);
  return roots.length?Math.min(...roots):Infinity;
}
export function advance(state,input){
  if(state.status!=='ready')return null;
  const requested=Number.isFinite(Number(input))?Math.round(Number(input)):0;
  const burn=Math.max(0,Math.min(75,Math.floor(state.fuel),requested));
  const acceleration=burn-5;
  const contact=contactTime(state.altitude,state.velocity,acceleration);
  const dt=Math.min(1,contact);
  const altitude=Math.max(0,state.altitude+state.velocity*dt+0.5*acceleration*dt*dt);
  const velocity=state.velocity+acceleration*dt;
  const landed=contact<=1;
  const next={altitude:landed?0:altitude,velocity,fuel:Math.max(0,state.fuel-burn*dt),time:state.time+dt,turn:state.turn+1,status:landed?(Math.abs(velocity)<5?'landed':'crashed'):'ready'};
  const phases=[{start:{...state},duration:dt,acceleration,burn}];
  // An empty tank ends the calculator's flight in free fall.
  if(!landed&&next.fuel<1){
    const fallTime=contactTime(next.altitude,next.velocity,-5);
    phases.push({start:{...next},duration:fallTime,acceleration:-5,burn:0});
    next.velocity-=5*fallTime;next.altitude=0;next.time+=fallTime;
    next.status=Math.abs(next.velocity)<5?'landed':'crashed';
  }
  return {before:{...state},next,burn,phases,duration:phases.reduce((s,p)=>s+p.duration,0)};
}
export function sampleFlight(transition,progress){
  if(progress>=1)return {...transition.next,burn:0};
  let t=Math.max(0,progress)*transition.duration;
  for(const p of transition.phases){
    if(t<=p.duration){
      return {...p.start,altitude:Math.max(0,p.start.altitude+p.start.velocity*t+p.acceleration*t*t/2),velocity:p.start.velocity+p.acceleration*t,fuel:Math.max(0,p.start.fuel-p.burn*t),time:p.start.time+t,burn:p.burn};
    }
    t-=p.duration;
  }
  return {...transition.next,burn:0};
}
