/* 고대 해안선 벡터 생성 — 해수면 +N m 비정(比定) 해안선 (기원후 고대~중세 초)
   사용: node build-land-paleo.js [해수면 m=8] [타일 디렉터리=tiles8]
   원리:
     1) Terrarium z8 고도 타일 → 고도 그리드(3072px, relief와 동일 해상도)
     2) 현대 land 벡터(assets/land.json)를 그리드에 래스터화 — 해안선 단일 기준 유지
     3) 현대 바다에서 flood-fill: 고도 < N m 이고 바다와 이어진 육지만 침수
        (바다와 안 이어진 내륙 저지 분지는 육지로 유지)
     4) paleo 육지 = 현대 육지 ∧ ¬침수 → marching squares 컨투어 → Chaikin 스무딩 → RDP 단순화
   → assets/land-paleo.json  (형식은 land.json과 동일 {viewBox, land}. +N m 는 sea 필드에 기록)
   주의: paleo 육지는 현대 육지의 부분집합이라 뷰어에서 land 경로만 교체하면
         지형 PNG·강·영토가 클립으로 자동 정합된다(재생성 불필요).
   한계: 현대 DEM엔 이후의 하구 퇴적이 포함돼 있어 근사치다. z8(≈0.5km) 해상도라
         좁은 만입은 뭉개질 수 있음 — 필요 시 z10 타일로 그리드를 키워 재생성. */
const fs=require("fs"), path=require("path"), https=require("https");
const {PNG}=require("pngjs");

const SEA=+(process.argv[2]||8);
const TDIR=process.argv[3]||"tiles8";
const CFG={ WIN:[106,26,146,47], SCALE:24, pad:6 };
const kx=Math.cos((CFG.WIN[1]+CFG.WIN[3])/2*Math.PI/180);
const VW=Math.round((CFG.WIN[2]-CFG.WIN[0])*kx*CFG.SCALE+CFG.pad*2), VH=Math.round((CFG.WIN[3]-CFG.WIN[1])*CFG.SCALE+CFG.pad*2);
function unproj(x,y){ return [ (x-CFG.pad)/(kx*CFG.SCALE)+CFG.WIN[0], CFG.WIN[3]-(y-CFG.pad)/CFG.SCALE ]; }

/* ── 1. 타일 확보 (없는 것만 다운로드) ── */
const Z=8, X0=203, X1=231, Y0=89, Y1=108;
function download(url,dest){ return new Promise((res,rej)=>{
  https.get(url,r=>{ if(r.statusCode!==200){ r.resume(); return rej(new Error(url+" → "+r.statusCode)); }
    const ws=fs.createWriteStream(dest); r.pipe(ws); ws.on("finish",()=>ws.close(res)); ws.on("error",rej);
  }).on("error",rej); }); }
async function ensureTiles(){
  if(!fs.existsSync(TDIR)) fs.mkdirSync(TDIR,{recursive:true});
  const jobs=[];
  for(let x=X0;x<=X1;x++)for(let y=Y0;y<=Y1;y++){ const p=path.join(TDIR,x+"_"+y+".png");
    if(!fs.existsSync(p)||fs.statSync(p).size<1000) jobs.push([x,y,p]); }
  console.log("tiles: 필요",(X1-X0+1)*(Y1-Y0+1),"| 다운로드",jobs.length);
  let done=0, fail=0;
  const CONC=10;
  async function worker(){ let j; while((j=jobs.shift())){ const [x,y,p]=j;
    const url=`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${x}/${y}.png`;
    try{ await download(url,p); }catch(e){ try{ await download(url,p); }catch(e2){ fail++; } }
    if(++done%50===0) console.log("  ...",done+"/"+jobs.length+done); } }
  await Promise.all(Array.from({length:CONC},worker));
  if(fail) console.log("다운로드 실패:",fail);
}

/* ── 2. 고도 그리드 (build-relief7.js 와 동일 로직·해상도) ── */
const N=1<<Z, WORLD=N*256, TILES={};
function san(b){const i=b.indexOf("IEND");return i<0?b:b.slice(0,i+8);}
function loadTiles(){ let bad=0;
  for(let x=X0;x<=X1;x++)for(let y=Y0;y<=Y1;y++){ const p=path.join(TDIR,x+"_"+y+".png");
    if(fs.existsSync(p)){ try{ const g=PNG.sync.read(san(fs.readFileSync(p))); TILES[x+"_"+y]={d:g.data,w:g.width}; }catch(e){ bad++; } } }
  console.log("tiles 로드:",Object.keys(TILES).length,"bad:",bad); }
function getE(ix,iy){ if(ix<0||iy<0)return NaN; const xt=ix>>8,yt=iy>>8,t=TILES[xt+"_"+yt]; if(!t)return NaN;
  const px=ix-(xt<<8),py=iy-(yt<<8),i=(py*t.w+px)*4; return (t.d[i]*256+t.d[i+1]+t.d[i+2]/256)-32768; }
function vv(e){ return isNaN(e)?0:e; }
function elevBil(lon,lat){ const gx=(lon+180)/360*WORLD, gy=(1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*WORLD;
  const x0=Math.floor(gx-0.5), y0=Math.floor(gy-0.5), fx=gx-0.5-x0, fy=gy-0.5-y0;
  const a=vv(getE(x0,y0)),b=vv(getE(x0+1,y0)),c=vv(getE(x0,y0+1)),d=vv(getE(x0+1,y0+1));
  return (a*(1-fx)+b*fx)*(1-fy)+(c*(1-fx)+d*fx)*fy; }

// 6144 = z8 데이터의 실제 해상도(~0.5km)에 맞춘 그리드 — 영산강 하류 같은 폭 1~3km 물길이 2~6셀로 살아남는다
const OW=6144, OH=Math.round(OW*VH/VW), S=OW/VW; // S: viewBox px → 그리드 px

/* ── 3. 현대 land 벡터 래스터화 (even-odd 스캔라인) ── */
function rasterizeLand(){
  const d=JSON.parse(fs.readFileSync("../assets/land.json","utf8")).land;
  const rings=d.match(/M[^MZ]+Z?/g)||[];
  const edges=[]; // [x1,y1,x2,y2] 그리드 좌표
  for(const r of rings){ const nums=r.match(/-?\d+\.?\d*/g).map(Number);
    const pts=[]; for(let i=0;i<nums.length-1;i+=2) pts.push([nums[i]*S, nums[i+1]*S]);
    for(let i=0;i<pts.length;i++){ const a=pts[i], b=pts[(i+1)%pts.length];
      if(a[1]!==b[1]) edges.push([a[0],a[1],b[0],b[1]]); } }
  const mask=new Uint8Array(OW*OH);
  const rows=Array.from({length:OH},()=>[]);
  for(const [x1,y1,x2,y2] of edges){
    const ymin=Math.min(y1,y2), ymax=Math.max(y1,y2);
    for(let y=Math.max(0,Math.ceil(ymin-0.5));y<OH;y++){ const yc=y+0.5;
      if(yc>=ymax) break; if(yc<ymin) continue;
      rows[y].push(x1+(yc-y1)*(x2-x1)/(y2-y1)); } }
  for(let y=0;y<OH;y++){ const xs=rows[y].sort((a,b)=>a-b);
    for(let i=0;i+1<xs.length;i+=2){
      const a=Math.max(0,Math.ceil(xs[i]-0.5)), b=Math.min(OW-1,Math.floor(xs[i+1]-0.5));
      for(let x=a;x<=b;x++) mask[y*OW+x]=1; } }
  return mask;
}

/* ── 4. flood-fill: 현대 바다에서 시작해 고도<SEA 인 육지로 침수 ── */
function flood(landNE,E){
  const st=new Uint8Array(OW*OH); // 0=미방문 1=침수(바다)
  const q=new Int32Array(OW*OH); let qh=0,qt=0;
  for(let i=0;i<OW*OH;i++) if(!landNE[i]){ st[i]=1; q[qt++]=i; }
  while(qh<qt){ const i=q[qh++], x=i%OW, y=(i/OW)|0;
    const nb=[x>0?i-1:-1, x<OW-1?i+1:-1, y>0?i-OW:-1, y<OH-1?i+OW:-1];
    for(const j of nb){ if(j<0||st[j]) continue;
      if(landNE[j] && E[j]<SEA){ st[j]=1; q[qt++]=j; } } }
  return st;
}

/* ── 5. marching squares → 링 추적 ── */
function traceRings(mask){
  // 가장자리를 바다(0)로 패딩한 (OW+2)x(OH+2) 격자에서 2x2 셀 경계 세그먼트 생성
  const gw=OW+2, gh=OH+2;
  const at=(x,y)=>(x<1||y<1||x>OW||y>OH)?0:mask[(y-1)*OW+(x-1)];
  const segs=new Map(); // key(점) → [인접 점...]
  const key=(x,y)=>x*2+","+y*2; // 반정수 좌표 → 정수 키
  function addSeg(ax,ay,bx,by){ const ka=ax+","+ay, kb=bx+","+by;
    (segs.get(ka)||segs.set(ka,[]).get(ka)).push(kb);
    (segs.get(kb)||segs.set(kb,[]).get(kb)).push(ka); }
  for(let y=0;y<gh-1;y++)for(let x=0;x<gw-1;x++){
    const c=(at(x,y)<<3)|(at(x+1,y)<<2)|(at(x+1,y+1)<<1)|at(x,y+1);
    if(c===0||c===15) continue;
    const T=[x*2+1,y*2], R=[x*2+2,y*2+1], B=[x*2+1,y*2+2], L=[x*2,y*2+1];
    const put=(a,b)=>addSeg(a[0],a[1],b[0],b[1]);
    switch(c){ case 1: put(L,B); break; case 2: put(B,R); break; case 3: put(L,R); break;
      case 4: put(T,R); break; case 5: put(L,T); put(B,R); break; case 6: put(T,B); break;
      case 7: put(L,T); break; case 8: put(T,L); break; case 9: put(T,B); break;
      case 10: put(T,R); put(L,B); break; case 11: put(T,R); break; case 12: put(L,R); break;
      case 13: put(B,R); break; case 14: put(L,B); break; }
  }
  const used=new Set(), rings=[];
  for(const start of segs.keys()){
    if(used.has(start)) continue;
    const ring=[start]; used.add(start);
    let cur=start, prev=null;
    for(;;){ const nbs=segs.get(cur).filter(n=>n!==prev&&!used.has(n));
      if(!nbs.length) break;
      prev=cur; cur=nbs[0]; used.add(cur); ring.push(cur); }
    if(ring.length>=6) rings.push(ring.map(k=>{ const [a,b]=k.split(",").map(Number); return [a/2-1,b/2-1]; }));
  }
  return rings; // 그리드 좌표
}

/* ── 6. 스무딩 + 단순화 (convert-land.js 와 동일 RDP/EPS) ── */
function chaikin(pts){ const out=[];
  for(let i=0;i<pts.length;i++){ const a=pts[i], b=pts[(i+1)%pts.length];
    out.push([a[0]*0.75+b[0]*0.25, a[1]*0.75+b[1]*0.25],[a[0]*0.25+b[0]*0.75, a[1]*0.25+b[1]*0.75]); }
  return out; }
// EPS·정밀도는 convert-land(0.7px·정수)보다 훨씬 촘촘하게 — 이 지도의 1px≈4.6km 라
// 정수 반올림·EPS 0.7이면 좁은 물목이 닫혀 만이 호수처럼 분리돼 보인다
const EPS=0.2, r_=n=>Math.round(n*10)/10;
function rdp(pts,eps){ if(pts.length<3)return pts; let dmax=0,idx=0;const a=pts[0],b=pts[pts.length-1];
  for(let i=1;i<pts.length-1;i++){const d=perp(pts[i],a,b);if(d>dmax){dmax=d;idx=i;}}
  if(dmax>eps){return rdp(pts.slice(0,idx+1),eps).slice(0,-1).concat(rdp(pts.slice(idx),eps));} return[a,b]; }
function perp(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1];const L=Math.hypot(dx,dy)||1e-9;return Math.abs((p[0]-a[0])*dy-(p[1]-a[1])*dx)/L;}
function simplifyRing(pts){ if(pts.length>1){const a=pts[0],b=pts[pts.length-1];if(a[0]===b[0]&&a[1]===b[1])pts=pts.slice(0,-1);}
  if(pts.length<4)return pts; let far=1,fd=-1;
  for(let i=1;i<pts.length;i++){const d=(pts[i][0]-pts[0][0])**2+(pts[i][1]-pts[0][1])**2;if(d>fd){fd=d;far=i;}}
  return rdp(pts.slice(0,far+1),EPS).slice(0,-1).concat(rdp(pts.slice(far).concat([pts[0]]),EPS).slice(0,-1)); }
function ringArea(pts){ let a=0; for(let i=0;i<pts.length;i++){ const p=pts[i],q=pts[(i+1)%pts.length]; a+=p[0]*q[1]-q[0]*p[1]; } return Math.abs(a/2); }
function ring2path(ringGrid){
  let pts=chaikin(chaikin(ringGrid)).map(([x,y])=>[x/S,y/S]); // 그리드 → viewBox
  if(ringArea(pts)<0.5) return ""; // 스펙클 제거 (0.5 viewBox px² ≈ 10 km²)
  pts=simplifyRing(pts); if(pts.length<3) return "";
  const out=[]; let px=null,py=null;
  for(const p of pts){ const x=r_(p[0]),y=r_(p[1]); if(x!==px||y!==py){ out.push(x+","+y); px=x; py=y; } }
  return out.length<3?"":"M"+out.join("L")+"Z";
}

(async function main(){
  await ensureTiles();
  loadTiles();
  console.log("고도 그리드 계산",OW+"x"+OH,"...");
  const E=new Float32Array(OW*OH);
  for(let oy=0;oy<OH;oy++)for(let ox=0;ox<OW;ox++){ const ll=unproj((ox+0.5)/S,(oy+0.5)/S); E[oy*OW+ox]=elevBil(ll[0],ll[1]); }
  console.log("현대 land 래스터화...");
  const landNE=rasterizeLand();
  let landPx=0; for(let i=0;i<landNE.length;i++) landPx+=landNE[i];
  console.log("flood-fill (해수면 +"+SEA+"m)...");
  const fl=flood(landNE,E);
  const paleo=new Uint8Array(OW*OH); let paleoPx=0;
  for(let i=0;i<paleo.length;i++){ paleo[i]=landNE[i]&&!fl[i]?1:0; paleoPx+=paleo[i]; }
  const pxKm2=((CFG.WIN[2]-CFG.WIN[0])*111.32*kx/OW)*((CFG.WIN[3]-CFG.WIN[1])*110.57/OH);
  console.log("침수:",Math.round((landPx-paleoPx)*pxKm2).toLocaleString(),"km² ("+((1-paleoPx/landPx)*100).toFixed(2)+"% of land)");
  console.log("컨투어 추적...");
  const rings=traceRings(paleo);
  let d=""; let kept=0;
  rings.sort((a,b)=>b.length-a.length);
  for(const rg of rings){ const p=ring2path(rg); if(p){ d+=p; kept++; } }
  fs.writeFileSync("../assets/land-paleo.json", JSON.stringify({viewBox:`0 0 ${VW} ${VH}`, sea:SEA, land:d}));
  console.log("land-paleo.json | 링",kept+"/"+rings.length,"|",Math.round(d.length/1024)+"KB");
})();
