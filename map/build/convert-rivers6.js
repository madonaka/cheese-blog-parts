const fs=require("fs"); const {PNG}=require("pngjs");
const RAW=JSON.parse(fs.readFileSync("hydro-raw2.json","utf8"));
const CFG={ WIN:[106,26,146,47], SCALE:24, pad:6 };
const kx=Math.cos((CFG.WIN[1]+CFG.WIN[3])/2*Math.PI/180);
function proj(lon,lat){ return [ (lon-CFG.WIN[0])*kx*CFG.SCALE+CFG.pad, (CFG.WIN[3]-lat)*CFG.SCALE+CFG.pad ]; }
const W=Math.round((CFG.WIN[2]-CFG.WIN[0])*kx*CFG.SCALE+CFG.pad*2), H=Math.round((CFG.WIN[3]-CFG.WIN[1])*CFG.SCALE+CFG.pad*2);

// 끝점 차수(연결 여부)
const deg={};
function key(p){ return p[0].toFixed(3)+","+p[1].toFixed(3); }
RAW.forEach(r=>{ [r.p[0],r.p[r.p.length-1]].forEach(p=>{ const k=key(p); deg[k]=(deg[k]||0)+1; }); });

// 고도 (z8)
const Z=8,N=1<<Z,WORLD=N*256,TILES={};
function san(b){const i=b.indexOf("IEND");return i<0?b:b.slice(0,i+8);}
for(let x=203;x<=231;x++)for(let y=89;y<=108;y++){const p="tiles8/"+x+"_"+y+".png"; if(fs.existsSync(p)){try{const g=PNG.sync.read(san(fs.readFileSync(p)));TILES[x+"_"+y]={d:g.data,w:g.width};}catch(e){}}}
function elevAt(lon,lat){ const gx=(lon+180)/360*WORLD, gy=(1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*WORLD;
  const ix=Math.floor(gx),iy=Math.floor(gy),xt=ix>>8,yt=iy>>8,t=TILES[xt+"_"+yt]; if(!t)return 9999;
  const px=ix-(xt<<8),py=iy-(yt<<8),i=(py*t.w+px)*4; return (t.d[i]*256+t.d[i+1]+t.d[i+2]/256)-32768; }

// ---- 벡터 육지 마스크 (0.5 viewBox단위 격자, 스캔라인 채움) ----
// 하구 연장의 종착 기준 = "벡터 해안선 밖" (DEM 바다≠벡터 바다: 갯벌/간척지에서 수십km 차이)
const LAND=JSON.parse(fs.readFileSync("land.json","utf8")).land;
const GRID=0.5, GW=Math.ceil(W/GRID), GH=Math.ceil(H/GRID);
const MASK=new Uint8Array(GW*GH);
(function(){ const rings=LAND.split("M").filter(Boolean).map(seg=>seg.replace(/Z/g,"").split("L").map(s=>s.split(",").map(Number)).filter(p=>p.length===2&&!isNaN(p[0])));
  for(let gy=0;gy<GH;gy++){ const y=(gy+0.5)*GRID; const xs=[];
    rings.forEach(P=>{ for(let i=0,j=P.length-1;i<P.length;j=i++){
      const yi=P[i][1],yj=P[j][1]; if((yi>y)!==(yj>y)){ xs.push((P[j][0]-P[i][0])*(y-yi)/(yj-yi)+P[i][0]); } } });
    xs.sort((a,b)=>a-b);
    for(let k=0;k+1<xs.length;k+=2){ const a=Math.max(0,Math.ceil(xs[k]/GRID-0.5)), b=Math.min(GW-1,Math.floor(xs[k+1]/GRID-0.5));
      for(let gx=a;gx<=b;gx++) MASK[gy*GW+gx]=1; } }
})();
function inLandLL(lon,lat){ const p=proj(lon,lat); const gx=Math.round(p[0]/GRID-0.5), gy=Math.round(p[1]/GRID-0.5);
  if(gx<0||gy<0||gx>=GW||gy>=GH) return false; return MASK[gy*GW+gx]===1; }

// 벡터 해안 관통: 육지 안이면 32방향 중 가장 빨리 바다로 나가는 방향으로 밀어냄
function exitToSea(line,atStart,maxSteps){
  const p0=atStart?line[0]:line[line.length-1];
  if(!inLandLL(p0[0],p0[1])) return true; // 이미 벡터 바다
  let bestDir=null,bestDist=maxSteps+1;
  for(let k=0;k<32;k++){ const ang=k*Math.PI/16, dx=Math.cos(ang), dy=Math.sin(ang);
    for(let s=1;s<bestDist;s++){ const nx=p0[0]+dx*STEP*s, ny=p0[1]+dy*STEP*s;
      if(!inLandLL(nx,ny)){ bestDist=s; bestDir=[dx,dy]; break; } } }
  if(!bestDir) return false;
  const q=[p0[0]+bestDir[0]*STEP*(bestDist+4), p0[1]+bestDir[1]*STEP*(bestDist+4)];
  if(atStart) line.unshift(q); else line.push(q);
  return true;
}

// 연장 1단계: "고도 하강 추적" — 실제 물길처럼 저지대를 따라 바다(고도≤0)쪽으로 걷는다.
function endInfo(line){ const a=line[0], b=line[line.length-1];
  return { aDeg:deg[key(a)]||1, bDeg:deg[key(b)]||1, aE:elevAt(a[0],a[1]), bE:elevAt(b[0],b[1]) }; }
const STEP=0.02;
function descentTrace(line,atStart,maxSteps){
  const p0=atStart?line[0]:line[line.length-1], p1=atStart?line[1]:line[line.length-2]; if(!p1)return;
  let hx=p0[0]-p1[0], hy=p0[1]-p1[1]; const hl=Math.hypot(hx,hy)||1e-9; hx/=hl; hy/=hl; // 진행 방향
  let cur=[p0[0],p0[1]]; const added=[];
  for(let s=0;s<maxSteps;s++){
    let best=null,bestE=1e9,bhx=hx,bhy=hy;
    for(let k=-3;k<=3;k++){ // 진행방향 ±67.5° 내 7방향 중 최저 고도
      const ang=Math.atan2(hy,hx)+k*(Math.PI/8);
      const nx=cur[0]+Math.cos(ang)*STEP, ny=cur[1]+Math.sin(ang)*STEP;
      const e=elevAt(nx,ny);
      if(e<bestE){ bestE=e; best=[nx,ny]; bhx=Math.cos(ang); bhy=Math.sin(ang); } }
    if(!best) break;
    added.push(best); cur=best; hx=bhx; hy=bhy;
    if(bestE<=0){ // 바다 도달 → 확정 (여유 한 걸음 더)
      added.push([cur[0]+hx*STEP*2, cur[1]+hy*STEP*2]);
      if(atStart){ for(const q of added) line.unshift(q); } else { for(const q of added) line.push(q); }
      return; }
  }
  // 바다 미도달 → 연장 취소(아무것도 안 붙임)
}
function extend(r){ const line=r.p, inf=endInfo(line);
  if(r.m){ // 하구 reach: 하강 추적 후, 벡터 해안선 밖까지 확실히 관통
    let atStart;
    if(inf.aDeg===1&&inf.bDeg!==1) atStart=true; else if(inf.bDeg===1&&inf.aDeg!==1) atStart=false;
    else atStart=(inf.aE<=inf.bE);
    descentTrace(line,atStart,30);
    exitToSea(line,atStart,120); // 갯벌·간척지 폭까지 커버(최대 2.4°)
    return;
  }
  if(inf.aDeg===1&&inf.aE<5){ descentTrace(line,true,10); exitToSea(line,true,30); }
  if(inf.bDeg===1&&inf.bE<5){ descentTrace(line,false,10); exitToSea(line,false,30); }
}

// 연속 굵기: 유역면적 → w = 0.5*log10(U)-1.0, [0.32, 2.3], 0.1 단위 양자화
function widthOf(U){ return Math.max(0.32, Math.min(2.3, 0.5*Math.log10(Math.max(10,U))-1.0)); }
const q=w=>Math.round(w*10)/10;

function rdp(p,e){ if(p.length<3)return p; let dm=0,idx=0;const a=p[0],b=p[p.length-1];
  for(let i=1;i<p.length-1;i++){const d=perp(p[i],a,b);if(d>dm){dm=d;idx=i;}} if(dm>e)return rdp(p.slice(0,idx+1),e).slice(0,-1).concat(rdp(p.slice(idx),e)); return[a,b]; }
function perp(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1];const L=Math.hypot(dx,dy)||1e-9;return Math.abs((p[0]-a[0])*dy-(p[1]-a[1])*dx)/L;}
const r1=n=>Math.round(n*10)/10;
function toPath(line,eps){ let p=rdp(line.map(c=>proj(c[0],c[1])),eps); if(p.length<2)return "";
  const out=[]; let px=null,py=null;
  for(const pt of p){ const x=r1(pt[0]),y=r1(pt[1]); if(x!==px||y!==py){ out.push(x+","+y); px=x; py=y; } }
  return out.length<2?"":"M"+out.join("L"); }

// 한반도 밖은 굵은 강만(유역 8000km²↑), 한반도는 상세(150km²↑, parse 단계 적용됨)
const KBOX=[123.3,33,131.8,43.6];
function inK(p){ return p[0]>=KBOX[0]&&p[0]<=KBOX[2]&&p[1]>=KBOX[1]&&p[1]<=KBOX[3]; }
const acc={};
RAW.forEach(r=>{ if(r.u<8000 && !(inK(r.p[0])||inK(r.p[r.p.length-1]))) return;
  extend(r);
  const w=q(widthOf(r.u));
  const eps=w>=1.2?0.05:(w>=0.7?0.07:0.09);
  const d=toPath(r.p,eps); if(!d) return;
  acc[w]=(acc[w]||"")+d; });

const classes=Object.keys(acc).map(k=>({w:+k,d:acc[k]})).sort((a,b)=>a.w-b.w);
fs.writeFileSync("rivers6.json", JSON.stringify({viewBox:`0 0 ${W} ${H}`, classes}));
let tot=0; classes.forEach(c=>{ tot+=c.d.length; });
console.log("classes:",classes.length,"| widths:",classes.map(c=>c.w).join(","));
console.log("total path:",Math.round(tot/1024)+"KB | rivers6.json",Math.round(fs.statSync("rivers6.json").size/1024)+"KB");
