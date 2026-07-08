/* 수묵화식 그레이 지형도 생성 — 높을수록 어두운 명암 램프 × 강한 hillshade(ZF 6)
   사용:
     node build-relief-gray.js base  <z8타일dir>   → ../assets/relief.png       (전체 창 3072px, 한반도 영역은 알파 구멍)
     node build-relief-gray.js korea <z10타일dir>  → ../assets/relief-korea.png (한반도 박스 2048px, z10 고해상)
   설계:
   - 뷰어가 grayscale multiply 오버레이로 쓰므로 색 대신 명암만 굽는다. 평지≈흰색(영향 없음),
     산지는 고도에 따라 뚜렷하게 어두워져 산맥이 '덩어리'로 읽힌다 (소백·태백 강조 목적).
   - base 는 전체 불투명(구멍 없음), korea 패치만 박스 안쪽으로 페더 알파(0→1).
     뷰어가 두 장을 한 그룹에서 보통(source-over) 합성한 뒤 그룹째 multiply 하므로
     페더 구간이 두 톤의 선형 크로스페이드가 된다 — 층마다 multiply 하면 겹침 띠가 생긴다.
   - korea 패치는 z10(≈z8의 4배 해상도) 타일로 2048px — 깊은 줌에서도 능선이 또렷.
   - 두 모드가 같은 램프·음영을 쓰므로 경계에서 톤이 이어진다(선명도만 다름). */
const fs=require("fs"), path=require("path"), https=require("https");
const {PNG}=require("pngjs");

const MODE=process.argv[2]||"base";
const TDIR=process.argv[3]||(MODE==="base"?"tiles8":"tiles10");
const CFG={ WIN:[106,26,146,47], SCALE:24, pad:6 };
const kx=Math.cos((CFG.WIN[1]+CFG.WIN[3])/2*Math.PI/180);
const VW=Math.round((CFG.WIN[2]-CFG.WIN[0])*kx*CFG.SCALE+CFG.pad*2), VH=Math.round((CFG.WIN[3]-CFG.WIN[1])*CFG.SCALE+CFG.pad*2);
function proj(lon,lat){ return [ (lon-CFG.WIN[0])*kx*CFG.SCALE+CFG.pad, (CFG.WIN[3]-lat)*CFG.SCALE+CFG.pad ]; }
function unproj(x,y){ return [ (x-CFG.pad)/(kx*CFG.SCALE)+CFG.WIN[0], CFG.WIN[3]-(y-CFG.pad)/CFG.SCALE ]; }

// 한반도 고해상 박스 [서, 남, 동, 북] — 뷰어 opts.reliefHi.box 와 반드시 동일해야 한다
const KOREA_BOX=[122.5,32.8,132.5,44.2];

const M={ base :{ Z:8,  X0:203, X1:231, Y0:89,  Y1:108, OW:3072 },
          korea:{ Z:10, X0:860, X1:888, Y0:369, Y1:413, OW:2048 } }[MODE];
if(!M){ console.error("mode는 base|korea"); process.exit(1); }

/* ── 타일 확보 ── */
function download(url,dest){ return new Promise((res,rej)=>{
  https.get(url,r=>{ if(r.statusCode!==200){ r.resume(); return rej(new Error(url+" → "+r.statusCode)); }
    const ws=fs.createWriteStream(dest); r.pipe(ws); ws.on("finish",()=>ws.close(res)); ws.on("error",rej);
  }).on("error",rej); }); }
async function ensureTiles(){
  if(!fs.existsSync(TDIR)) fs.mkdirSync(TDIR,{recursive:true});
  const jobs=[];
  for(let x=M.X0;x<=M.X1;x++)for(let y=M.Y0;y<=M.Y1;y++){ const p=path.join(TDIR,x+"_"+y+".png");
    if(!fs.existsSync(p)||fs.statSync(p).size<1000) jobs.push([x,y,p]); }
  console.log("tiles: 필요",(M.X1-M.X0+1)*(M.Y1-M.Y0+1),"| 다운로드",jobs.length);
  let fail=0;
  async function worker(){ let j; while((j=jobs.shift())){ const [x,y,p]=j;
    const url=`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${M.Z}/${x}/${y}.png`;
    try{ await download(url,p); }catch(e){ try{ await download(url,p); }catch(e2){ fail++; } } } }
  await Promise.all(Array.from({length:12},worker));
  if(fail) console.log("다운로드 실패:",fail);
}

/* ── 고도 샘플 ── */
const N=1<<M.Z, WORLD=N*256, TILES={};
function san(b){const i=b.indexOf("IEND");return i<0?b:b.slice(0,i+8);}
function loadTiles(){ let bad=0;
  for(let x=M.X0;x<=M.X1;x++)for(let y=M.Y0;y<=M.Y1;y++){ const p=path.join(TDIR,x+"_"+y+".png");
    if(fs.existsSync(p)){ try{ const g=PNG.sync.read(san(fs.readFileSync(p))); TILES[x+"_"+y]={d:g.data,w:g.width}; }catch(e){ bad++; } } }
  console.log("tiles 로드:",Object.keys(TILES).length,"bad:",bad); }
function getE(ix,iy){ if(ix<0||iy<0)return NaN; const xt=ix>>8,yt=iy>>8,t=TILES[xt+"_"+yt]; if(!t)return NaN;
  const px=ix-(xt<<8),py=iy-(yt<<8),i=(py*t.w+px)*4; return (t.d[i]*256+t.d[i+1]+t.d[i+2]/256)-32768; }
function vv(e){ return isNaN(e)?0:e; }
function elevBil(lon,lat){ const gx=(lon+180)/360*WORLD, gy=(1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*WORLD;
  const x0=Math.floor(gx-0.5), y0=Math.floor(gy-0.5), fx=gx-0.5-x0, fy=gy-0.5-y0;
  const a=vv(getE(x0,y0)),b=vv(getE(x0+1,y0)),c=vv(getE(x0,y0+1)),d=vv(getE(x0+1,y0+1));
  return (a*(1-fx)+b*fx)*(1-fy)+(c*(1-fx)+d*fx)*fy; }

/* ── 출력 영역: base=전체 창, korea=KOREA_BOX ── */
let ox0,oy0,ow,oh; // viewBox 좌표
if(MODE==="base"){ ox0=0; oy0=0; ow=VW; oh=VH; }
else { const p1=proj(KOREA_BOX[0],KOREA_BOX[3]), p2=proj(KOREA_BOX[2],KOREA_BOX[1]);
  ox0=p1[0]; oy0=p1[1]; ow=p2[0]-p1[0]; oh=p2[1]-p1[1]; }
const OW=M.OW, OH=Math.round(OW*oh/ow), S=OW/ow; // 출력px / viewBoxpx

(async function main(){
  await ensureTiles();
  loadTiles();
  console.log(MODE,"고도 그리드",OW+"x"+OH,"...");
  const E=new Float32Array(OW*OH);
  for(let y=0;y<OH;y++)for(let x=0;x<OW;x++){ const ll=unproj(ox0+(x+0.5)/S, oy0+(y+0.5)/S); E[y*OW+x]=elevBil(ll[0],ll[1]); }
  // 블러 없음 — 예전 '점박이'의 원인은 고도 스파이크가 아니라 양자화 오버플로(검정 랩어라운드, 수정됨)였고,
  // 평지 DEM 노이즈는 경사 게이트가 걸러낸다. 블러는 z10 잔능선을 뭉개 고해상 패치의 의미를 없앤다.
  const Eg=E;

  const cellx=ow/OW*(1/(kx*CFG.SCALE))*111320*kx, celly=oh/OH*(1/CFG.SCALE)*110570;
  const ZF=3.5, az=315*Math.PI/180, zen=45*Math.PI/180, cz=Math.cos(zen), sz=Math.sin(zen);
  function EG_(x,y){x=x<0?0:x>=OW?OW-1:x;y=y<0?0:y>=OH?OH-1:y;return Eg[y*OW+x];}

  // base↔korea 경계: base 는 전체 불투명, korea 만 박스 안쪽으로 페더(0→1) — 뷰어의 isolate 그룹에서
  // korea 가 base 위에 보통 합성되므로 페더 구간 = 두 톤의 선형 크로스페이드(그룹 전체 알파는 항상 1)
  const FEATHER=0.6; // 페더 폭(도) ≈ 66km — z8(흐림)→z10(선명) 전환을 넓게 뭉갬
  const KB={W:KOREA_BOX[0],S:KOREA_BOX[1],E:KOREA_BOX[2],N:KOREA_BOX[3]};
  function terrAlpha(lon,lat){
    if(MODE==="base") return 1;
    const inside = lon>KB.W&&lon<KB.E&&lat>KB.S&&lat<KB.N;
    if(!inside) return 0; // korea
    const depth=Math.min(lon-KB.W,KB.E-lon,lat-KB.S,KB.N-lat);
    return Math.max(0,Math.min(1,depth/FEATHER)); }

  const png=new PNG({width:OW,height:OH});
  for(let y=0;y<OH;y++)for(let x=0;x<OW;x++){ const e=E[y*OW+x],o=(y*OW+x)*4;
    const ll=unproj(ox0+(x+0.5)/S, oy0+(y+0.5)/S);
    const a=terrAlpha(ll[0],ll[1]);
    if(e<=0.5||a<=0){ png.data[o+3]=0; continue; }
    // 그림자식 음영: '그늘 사면'만 어둡게 — 햇빛 면은 거의 흰색, 평지는 게이트로 완전 흰색.
    // (전방향 hillshade는 ZF 과장 시 수직 사면까지 어두워져 산 전체가 담요처럼 덮이는 반전 느낌이 난다)
    const gx=(EG_(x+1,y)-EG_(x-1,y))/(2*cellx), gy=(EG_(x,y+1)-EG_(x,y-1))/(2*celly); // 실제 기울기(m/m)
    const trueSlope=Math.atan(Math.sqrt(gx*gx+gy*gy));
    // 경사 게이트: 완경사(평지)는 음영 0 → DEM 노이즈가 만드는 저지대 점박이 제거. 0.9°~3.4° 사이 램프
    let gate=(trueSlope-0.016)/(0.060-0.016); gate=gate<0?0:gate>1?1:gate;
    const zx=gx*ZF, zy=gy*ZF;
    const slope=Math.atan(Math.sqrt(zx*zx+zy*zy)), aspect=Math.atan2(zy,-zx);
    const cosd=Math.cos(az-aspect), sl=Math.sin(slope);
    const sd=sl*Math.max(0,-cosd);                       // 해 반대편(그늘) 사면만 0..1
    const amb=0.18*sl*(1-0.85*Math.max(0,cosd));         // 질감용 약한 전방향 음영 — 햇빛 면은 거의 0
    let ev=(EG_(x,y)-300)/2200; ev=ev<0?0:ev>1?1:ev; ev=ev*Math.sqrt(ev)*0.38; // 고도 심도 — 높을수록 뚜렷하게 어둡게(수묵 명암), 저지대(≤300m)는 0
    let dark=gate*(0.62*sd+amb)+ev; if(dark>0.85) dark=0.85;
    // 4단계 양자화 — multiply 오버레이에선 실효 수 단계라 밴딩이 안 보이고 PNG가 훨씬 작아진다
    // dark≈0일 때 256으로 넘쳐 0(검정)이 되므로 255로 캡 — 평지는 순백(영향 없음)이어야 한다
    const L=Math.min(255,Math.round(255*(1-dark)/4)*4);
    png.data[o]=L; png.data[o+1]=L; png.data[o+2]=L;
    png.data[o+3]=Math.round(255*a);
  }
  const out=MODE==="base"?"../assets/relief.png":"../assets/relief-korea.png";
  const buf=PNG.sync.write(png,{colorType:6});
  fs.writeFileSync(out,buf);
  console.log(out,OW+"x"+OH,"|",Math.round(buf.length/1024)+"KB");
})();
