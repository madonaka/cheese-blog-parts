const fs=require("fs"); const {PNG}=require("pngjs");
const RAW=JSON.parse(fs.readFileSync("hydro-raw3.json","utf8"));
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
  // 흐름 방향(말단 진행 방향) — 탈출 방향은 흐름과 비슷할수록 우대(급꺾임·해안 평행 사선 방지)
  const p1=atStart?line[1]:line[line.length-2];
  let hAng=null; if(p1){ hAng=Math.atan2(p0[1]-p1[1], p0[0]-p1[0]); }
  let best=null; // {dx,dy,dist,score}
  for(let k=0;k<32;k++){ const ang=k*Math.PI/16;
    if(hAng!=null){ let dAng=Math.abs(ang-hAng); if(dAng>Math.PI) dAng=2*Math.PI-dAng;
      if(dAng>Math.PI*0.67) continue; // 흐름 대비 120° 초과 방향 배제
      var pen=dAng*14; } else var pen=0;
    const dx=Math.cos(ang), dy=Math.sin(ang);
    for(let s=1;s<=maxSteps;s++){ const nx=p0[0]+dx*STEP*s, ny=p0[1]+dy*STEP*s;
      if(elevAt(nx,ny)>40) break; // 고지 횡단 금지 — 반도·능선 가로지르는 직선 방지(저지대 회랑만 허용)
      if(!inLandLL(nx,ny)){ const sc=s+pen; if(!best||sc<best.score) best={dx:dx,dy:dy,dist:s,score:sc}; break; }
      if(best&&s+pen>=best.score) break; }
  }
  if(!best) return false;
  // 중간점을 3스텝 간격으로 넣어 클립·렌더가 자연스럽게
  const pts=[]; for(let s=3;s<best.dist+2;s+=3) pts.push([p0[0]+best.dx*STEP*s, p0[1]+best.dy*STEP*s]);
  pts.push([p0[0]+best.dx*STEP*(best.dist+2), p0[1]+best.dy*STEP*(best.dist+2)]);
  if(atStart){ for(const q of pts) line.unshift(q); } else { for(const q of pts) line.push(q); }
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
    for(let k=-2;k<=2;k++){ // 진행방향 ±45° 내 5방향 — 급회전 금지(제자리 말림 방지)
      const ang=Math.atan2(hy,hx)+k*(Math.PI/8);
      const nx=cur[0]+Math.cos(ang)*STEP, ny=cur[1]+Math.sin(ang)*STEP;
      const e=elevAt(nx,ny);
      if(e<bestE){ bestE=e; best=[nx,ny]; bhx=Math.cos(ang); bhy=Math.sin(ang); } }
    if(!best) break;
    // 루프 감지: 이전 추적점 근처로 되돌아오면 연장 전체 취소(꼬임 방지)
    for(let i=0;i<added.length-2;i++){ if(Math.hypot(best[0]-added[i][0],best[1]-added[i][1])<STEP*0.8) return; }
    added.push(best); cur=best; hx=bhx; hy=bhy;
    if(bestE<=0){ // 바다 도달 → 확정 (여유 한 걸음 더)
      added.push([cur[0]+hx*STEP*2, cur[1]+hy*STEP*2]);
      if(atStart){ for(const q of added) line.unshift(q); } else { for(const q of added) line.push(q); }
      return; }
  }
  // 바다 미도달 → 연장 취소(아무것도 안 붙임)
}

// 작은 자기교차 고리 절제(데이터·추적에서 생긴 꼬임 제거) — 큰 곡류는 보존
function cutLoops(line){
  var changed=true, guard=0;
  while(changed && guard++<8){ changed=false;
    outer:
    for(var i=0;i<line.length-4;i++){
      var acc=0;
      for(var j=i+3;j<line.length;j++){
        acc+=Math.hypot(line[j][0]-line[j-1][0], line[j][1]-line[j-1][1]);
        if(acc>0.6) break; // 이 이상 긴 구간은 정상 곡류로 간주
        var d=Math.hypot(line[j][0]-line[i][0], line[j][1]-line[i][1]);
        if(d<0.018 && acc>0.05){ line.splice(i+1, j-i-1); changed=true; break outer; }
      }
    }
  }
  return line;
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
  // 일반(비하구) 말단: 해안 바로 앞(고도<3m)일 때만 짧게(0.16°) — 평야 내륙에서 긴 직선 발사 방지
  if(inf.aDeg===1&&inf.aE<3){ descentTrace(line,true,6); exitToSea(line,true,8); }
  if(inf.bDeg===1&&inf.bE<3){ descentTrace(line,false,6); exitToSea(line,false,8); }
}

// 연속 굵기: 유역면적 → w = 0.5*log10(U)-1.0, [0.32, 2.3], 0.1 단위 양자화
function widthOf(U,Q){ return Math.max(0.26, Math.min(2.0, 0.30*Math.log10(Math.max(10,U)) + 0.28*Math.log10(Math.max(0.5,Q)) - 1.1)); } // 유역+유량 결합 — 대비 강화
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
// 품질 통계(수정 전후 비교용)
function statsOf(list){ var longSeg=0, sharp=0;
  list.forEach(function(line){
    for(var i=1;i<line.length;i++){ if(Math.hypot(line[i][0]-line[i-1][0],line[i][1]-line[i-1][1])>0.3) longSeg++; }
    for(var i=2;i<line.length;i++){ var a=Math.atan2(line[i-1][1]-line[i-2][1],line[i-1][0]-line[i-2][0]);
      var b=Math.atan2(line[i][1]-line[i-1][1],line[i][0]-line[i-1][0]);
      var d=Math.abs(b-a); if(d>Math.PI)d=2*Math.PI-d; if(d>Math.PI*0.83) sharp++; } });
  return {longSeg:longSeg, sharp:sharp}; }

const acc={};
const processed=[];
RAW.forEach(r=>{ if(r.u<8000 && !(inK(r.p[0])||inK(r.p[r.p.length-1]))) return;
  extend(r); cutLoops(r.p); processed.push(r.p);
  const w=q(widthOf(r.u, r.q||1));
  const eps=w>=1.2?0.05:(w>=0.7?0.07:0.09);
  const d=toPath(r.p,eps); if(!d) return;
  acc[w]=(acc[w]||"")+d; });

const st=statsOf(processed);
console.log("품질: 긴 직선세그(>0.3°)", st.longSeg, "| 급반전(>150°)", st.sharp);
const classes=Object.keys(acc).map(k=>({w:+k,d:acc[k]})).sort((a,b)=>a.w-b.w);
fs.writeFileSync("rivers9.json", JSON.stringify({viewBox:`0 0 ${W} ${H}`, classes}));
let tot=0; classes.forEach(c=>{ tot+=c.d.length; });
console.log("classes:",classes.length,"| widths:",classes.map(c=>c.w).join(","));
console.log("total path:",Math.round(tot/1024)+"KB | rivers9.json",Math.round(fs.statSync("rivers6.json").size/1024)+"KB");
