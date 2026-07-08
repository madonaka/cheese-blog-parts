/* 수묵화식 그레이 지형도 생성 — 높을수록 어두운 명암 램프 × 강한 hillshade(ZF 6)
   사용:
     node build-relief-gray.js base  <z8타일dir>   → ../assets/relief.png       (전체 창 3072px, 한반도 영역은 알파 구멍)
     node build-relief-gray.js korea <z10타일dir>  → ../assets/relief-korea.png (한반도 박스 2048px, z10 고해상)
   설계:
   - 뷰어가 grayscale multiply 오버레이로 쓰므로 색 대신 명암만 굽는다. 평지≈흰색(영향 없음),
     산지는 고도에 따라 뚜렷하게 어두워져 산맥이 '덩어리'로 읽힌다 (소백·태백 강조 목적).
   - base 는 KOREA_BOX 안쪽 알파를 0으로 뚫는다(24px 페더) — korea 패치와 이중 곱셈 방지.
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

/* ── 명암 램프: 높을수록 어둡다 (수묵) — 평지는 거의 흰색이라 영토색에 영향 없음 ── */
const RAMP=[[5,253],[100,238],[300,210],[600,172],[1000,132],[1500,98],[2000,78],[2500,62]];
function lum(e){ if(e<=RAMP[0][0]) return RAMP[0][1];
  for(let i=1;i<RAMP.length;i++){ if(e<=RAMP[i][0]){ const a=RAMP[i-1],b=RAMP[i],t=(e-a[0])/(b[0]-a[0]); return a[1]+(b[1]-a[1])*t; } }
  return RAMP[RAMP.length-1][1]; }

(async function main(){
  await ensureTiles();
  loadTiles();
  console.log(MODE,"고도 그리드",OW+"x"+OH,"...");
  const E=new Float32Array(OW*OH);
  for(let y=0;y<OH;y++)for(let x=0;x<OW;x++){ const ll=unproj(ox0+(x+0.5)/S, oy0+(y+0.5)/S); E[y*OW+x]=elevBil(ll[0],ll[1]); }

  const cellx=ow/OW*(1/(kx*CFG.SCALE))*111320*kx, celly=oh/OH*(1/CFG.SCALE)*110570;
  const ZF=6.0, az=315*Math.PI/180, zen=45*Math.PI/180, cz=Math.cos(zen), sz=Math.sin(zen);
  function E_(x,y){x=x<0?0:x>=OW?OW-1:x;y=y<0?0:y>=OH?OH-1:y;return E[y*OW+x];}

  // base 모드: 한반도 박스 안은 알파 구멍(24px 페더) — korea 패치가 대신 그린다
  let hx0=-1,hy0=-1,hx1=-1,hy1=-1;
  if(MODE==="base"){ const p1=proj(KOREA_BOX[0],KOREA_BOX[3]), p2=proj(KOREA_BOX[2],KOREA_BOX[1]);
    hx0=p1[0]*S; hy0=p1[1]*S; hx1=p2[0]*S; hy1=p2[1]*S; }
  const F=24; // 페더 폭(출력 px)
  function holeAlpha(x,y){ // 0=완전 구멍, 1=바깥
    if(MODE!=="base") return 1;
    const dx=Math.max(hx0-x, x-hx1), dy=Math.max(hy0-y, y-hy1); // 박스 밖이면 양수
    const d=Math.max(dx,dy);
    if(d>=0) return Math.min(1,d/F);
    return 0; }
  function edgeAlpha(x,y){ // korea 패치 가장자리 페더(박스 경계에서 스르륵)
    if(MODE!=="korea") return 1;
    const d=Math.min(x,y,OW-1-x,OH-1-y);
    return Math.min(1,d/F); }

  const png=new PNG({width:OW,height:OH});
  for(let y=0;y<OH;y++)for(let x=0;x<OW;x++){ const e=E[y*OW+x],o=(y*OW+x)*4;
    const a=MODE==="base"?holeAlpha(x,y):edgeAlpha(x,y);
    if(e<=0.5||a<=0){ png.data[o+3]=0; continue; }
    const dzdx=(E_(x+1,y)-E_(x-1,y))/(2*cellx)*ZF, dzdy=(E_(x,y+1)-E_(x,y-1))/(2*celly)*ZF;
    const slope=Math.atan(Math.sqrt(dzdx*dzdx+dzdy*dzdy)), aspect=Math.atan2(dzdy,-dzdx);
    let hs=cz*Math.cos(slope)+sz*Math.sin(slope)*Math.cos(az-aspect); hs=Math.max(0,hs);
    const sh=0.42+0.75*hs;
    // 4단계 양자화 — multiply 0.5 오버레이에선 실효 2/255라 밴딩이 안 보이고 PNG가 훨씬 작아진다
    const L=Math.round(Math.max(0,Math.min(255,lum(e)*sh))/4)*4;
    png.data[o]=L; png.data[o+1]=L; png.data[o+2]=L;
    png.data[o+3]=Math.round(255*a);
  }
  const out=MODE==="base"?"../assets/relief.png":"../assets/relief-korea.png";
  const buf=PNG.sync.write(png,{colorType:6});
  fs.writeFileSync(out,buf);
  console.log(out,OW+"x"+OH,"|",Math.round(buf.length/1024)+"KB");
})();
