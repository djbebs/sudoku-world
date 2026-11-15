/**
 * Atlas population motion engine v1.
 * Pure, Three.js-independent, data-driven behavior evaluation.
 * Input coordinates are local tile metres; no district or Ycoor coordinates.
 *
 * A person only moves their legs when actually walking, climbing, jumping or
 * sliding. Idle actors remain planted and gesture briefly, infrequently.
 *
 * A future Crans-Montana tile provides pedestrian routes and interactive
 * prefab anchors; the same engine operates without code changes.
 */
export const SCENES={
 'play-slide':[
  ['waitTop',0,0,2.7],
  ['slide',0,1,1.25],
  ['land',1,2,.85],
  ['rest',2,2,1.5],
  ['return',2,3,1.35],
  ['return',3,4,2.7],
  ['climb',4,5,2.5],
  ['return',5,6,1.2],
  ['return',6,7,1.0]
 ],
 'play-tube':[
  ['waitTop',0,0,2.8],
  ['insideTube',0,1,1.15],
  ['insideTube',1,2,1.15],
  ['land',2,3,.8],
  ['rest',3,3,1.4],
  ['return',3,4,4.2],
  ['return',4,5,2.0],
  ['climb',5,6,2.8],
  ['return',6,7,1.5]
 ]
};
export function clamp(x,min,max){return Math.max(min,Math.min(max,x))}
export function lerp(a,b,t){return a+(b-a)*t}
export function distance(a,b){return Math.hypot(b.x-a.x,b.z-a.z)}
function hash(n){
 let x=n|0;x=Math.imul(x^(x>>>16),0x21f0aaad);
 x=Math.imul(x^(x>>>15),0x735a2d97);
 return (x^(x>>>15))>>>0;
}
export function compileWalkPath(route){
 const points=Array.isArray(route)?route.filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.z)):[];
 const legs=[],total={value:0};
 for(let i=1;i<points.length;i++){
  const length=distance(points[i-1],points[i]);
  if(length<.001)continue;
  legs.push({a:points[i-1],b:points[i],start:total.value,length});
  total.value+=length;
 }
 return {legs,total:total.value,points};
}
export function walkPoint(compiled,metres){
 if(!compiled?.legs?.length||compiled.total<=0)return null;
 const {legs,total}=compiled;
 const wrapped=((metres%(2*total))+(2*total))%(2*total);
 const backward=wrapped>total;
 const d=backward?2*total-wrapped:wrapped;
 const leg=legs.find(l=>d<=l.start+l.length+1e-9)||legs[legs.length-1];
 const f=clamp((d-leg.start)/leg.length,0,1);
 const x=lerp(leg.a.x,leg.b.x,f),z=lerp(leg.a.z,leg.b.z,f);
 const vx=(leg.b.x-leg.a.x)*(backward?-1:1);
 const vz=(leg.b.z-leg.a.z)*(backward?-1:1);
 const nearTurn=Math.min(d,total-d)<.12;
 return {x,z,heading:Math.atan2(vx,vz),moving:!nearTurn,
  travelled:wrapped,backward,sourceLength:total};
}
export function evaluateSequence(track,frames,t){
 if(!Array.isArray(track)||track.length<2||!Array.isArray(frames))return null;
 const cycle=frames.reduce((n,f)=>n+f[3],0);
 if(cycle<=0)return null;
 let now=((t%cycle)+cycle)%cycle;
 for(const [phase,from,to,duration] of frames){
  if(now<=duration+1e-9){
   const a=track[from],b=track[to];
   if(!a||!b)return null;
   const u=clamp(now/duration,0,1),moving=from!==to;
   const p={x:lerp(a.x,b.x,u),z:lerp(a.z,b.z,u),y:lerp(a.y,b.y,u)};
   return {...p,phase,moving,
    visible:phase!=='insideTube',
    heading:moving?Math.atan2(b.x-a.x,b.z-a.z):0,
    progress:u,cycleLength:cycle};
  }
  now-=duration;
 }
 return null;
}
function pulse(time,seed,period=11,length=1.2){
 // Every actor's gesture is a rare, short event, never perpetual flailing.
 const phase=((time+(hash(seed+61)%100)/100*period)%period+period)%period;
 if(phase<period-length)return 0;
 const f=(phase-(period-length))/length;
 return Math.sin(Math.PI*f)**2;
}
const STILL_ROLES=new Set(['stand','watch','supervise','chat','wave','sit','play-platform']);
export function motionAt(spec,t,height,cache={}){
 const secs=Math.max(0,t);
 const seed=spec.id||1;
 const baseX=spec.x,baseZ=spec.z;
 const ground=(x,z)=>height(x,z)+.25;
 const baseY=ground(baseX,baseZ)+(spec.offsetY||0);
 const pose={
  x:baseX,y:baseY,z:baseZ,heading:spec.facing??(spec.kind==='adulte'?.9:-.5),
  armL:0,armR:0,legL:0,legR:0,headY:0,bodyZ:0,visible:true,phase:'idle'
 };
 const role=spec.role;
 if(role==='walk'){
  const route=cache.path||compileWalkPath(spec.route);
  const loc=walkPoint(route,secs*(spec.speed||.95));
  if(loc){
   pose.x=loc.x;pose.z=loc.z;pose.y=ground(loc.x,loc.z);
   pose.heading=loc.heading;pose.phase=loc.moving?'walk':'pause-at-turn';
   if(loc.moving){
    const pace=(secs*(spec.speed||.95))*9+(seed%5);
    pose.armL=-.33*Math.sin(pace);pose.armR=.33*Math.sin(pace);
    pose.legL=.42*Math.sin(pace);pose.legR=-.42*Math.sin(pace);
    pose.y+=.015*Math.abs(Math.sin(pace));
   }
  }
  return pose;
 }
 if((role==='play-slide'||role==='play-tube')&&spec.track){
  const sampled=evaluateSequence(spec.track,SCENES[role],secs+(spec.clockOffset||0));
  if(sampled){
   pose.x=sampled.x;pose.z=sampled.z;
   // Track y is height above the *actual* locally sampled terrain.
   pose.y=height(sampled.x,sampled.z)+.27+sampled.y;
   pose.visible=sampled.visible;pose.phase=sampled.phase;
   if(sampled.moving)pose.heading=sampled.heading;
   if(sampled.phase==='slide'||sampled.phase==='insideTube'){
    pose.armL=-.32;pose.armR=-.32;
    pose.legL=.48;pose.legR=.48;
    pose.bodyZ=-.09;
   }else if(sampled.phase==='climb'){
    pose.armL=-.76+.12*Math.sin(6*secs);
    pose.armR=-.76-.12*Math.sin(6*secs);
    pose.legL=.30*Math.sin(6*secs);
    pose.legR=-.30*Math.sin(6*secs);
   }else if(sampled.phase==='return'||sampled.phase==='land'){
    const pace=secs*7.2+seed;
    pose.armL=.27*Math.sin(pace);pose.armR=-pose.armL;
    pose.legL=-.29*Math.sin(pace);pose.legR=-pose.legL;
   }
  }
  return pose;
 }
 if(role==='climb-ropes'){
  // Actual vertical movement, no walking-in-place. Reach net/handles.
  const rise=(1-Math.cos(secs*1.16+seed*.15))/2;
  const maxY=spec.maxY??1.78,minY=spec.minY??.35;
  pose.y=height(baseX,baseZ)+.27+lerp(minY,maxY,rise);
  pose.heading=spec.facing??0;
  pose.phase='climb-ropes';
  pose.armL=-.88+.16*Math.sin(secs*2.7);
  pose.armR=-.82-.16*Math.sin(secs*2.7);
  pose.legL=.18*Math.sin(secs*2.7);
  pose.legR=-.18*Math.sin(secs*2.7);
  pose.bodyZ=.04*Math.sin(secs*.75);
  return pose;
 }
 if(role==='skip'||role==='play-ground'){
  const jumping=pulse(secs,seed,6.7,.80);
  pose.y=baseY+.15*jumping;
  pose.phase=jumping>.02?'jump':'idle';
  pose.legL=.22*jumping;pose.legR=.22*jumping;
  pose.armL=-.22*jumping;pose.armR=-.24*jumping;
  pose.headY=.04*Math.sin(secs*.25+seed);
  return pose;
 }
 // For STATIONARY people (adult and child) legs are always neutral.
 // Sitting has a constant seated leg pose, never a running cycle.
 if(role==='sit'){
  pose.phase='sit';pose.legL=1.10;pose.legR=1.10;
  pose.armL=.06;pose.armR=.06;
  pose.headY=.07*Math.sin(secs*.24+seed);
  return pose;
 }
 if(STILL_ROLES.has(role)){
  const dur=role==='chat'?1.5:role==='wave'?1.4:1.1;
  const period=role==='wave'?8.8:role==='chat'?10.5:12.5;
  const gesture=pulse(secs,seed,period,dur);
  pose.phase=gesture>.04?'gesture':'idle';
  pose.headY=.08*Math.sin(secs*.18+seed)+.13*gesture;
  pose.heading=(spec.facing??pose.heading)+.035*Math.sin(secs*.16+seed*.25);
  if(role==='play-platform'){
   // The child is holding the rail and occasionally touching/reaching,
   // rather than walking or sliding without movement.
   pose.armL=-.12-.58*gesture;
   pose.armR=-.12-.28*gesture;
   pose.bodyZ=.035*gesture;
  }else if(role==='wave'){
   pose.armR=-.85*gesture;
   pose.armL=.03*gesture;
  }else if(role==='chat'){
   pose.armR=-.38*gesture;
   pose.armL=-.17*gesture;
  }else{
   pose.armL=-.10*gesture;
   pose.armR=-.26*gesture;
  }
  return pose;
 }
 return pose;
}
