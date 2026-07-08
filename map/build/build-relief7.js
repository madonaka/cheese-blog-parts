const fs=require("fs"); const {PNG}=require("pngjs");
const CFG={ WIN:[106,26,146,47], SCALE:24, pad:6 };
const kx=Math.cos((CFG.WIN[1]+CFG.WIN[3])/2*Math.PI/180);
const VW=Math.round((CFG.WIN[2]-CFG.WIN[0])*kx*CFG.SCALE+CFG.pad*2), VH=Math.round((CFG.WIN[3]-CFG.WIN[1])*CFG.SCALE+CFG.pad*2);
function unproj(x,y){ return [ (x-CFG.pad)/(kx*CFG.SCALE)+CFG.WIN[0], CFG.WIN[3]-(y-CFG.pad)/CFG.SCALE ]; }

const Z=8,N=1<<Z,WORLD=N*256,TILES={};
const TDIR=process.argv[2]||"tiles8"; // 타일 디렉터리 (build-land-paleo.js 와 공유 가능)
function san(b){const i=b.indexOf("IEND");return i<0?b:b.slice(0,i+8);}
let bad=0;
for(let x=203;x<=231;x++)for(let y=89;y<=108;y++){const p=TDIR+"/"+x+"_"+y+".png";
  if(fs.existsSync(p)){try{const g=PNG.sync.read(san(fs.readFileSync(p)));TILES[x+"_"+y]={d:g.data,w:g.width};}catch(e){bad++;}}}
console.log("tiles:",Object.keys(TILES).length,"bad:",bad);
function getE(ix,iy){ if(ix<0||iy<0)return NaN; const xt=ix>>8,yt=iy>>8,t=TILES[xt+"_"+yt]; if(!t)return NaN;
  const px=ix-(xt<<8),py=iy-(yt<<8),i=(py*t.w+px)*4; return (t.d[i]*256+t.d[i+1]+t.d[i+2]/256)-32768; }
function vv(e){ return isNaN(e)?0:e; }
function elevBil(lon,lat){ const gx=(lon+180)/360*WORLD, gy=(1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*WORLD;
  const x0=Math.floor(gx-0.5), y0=Math.floor(gy-0.5), fx=gx-0.5-x0, fy=gy-0.5-y0;
  const a=vv(getE(x0,y0)),b=vv(getE(x0+1,y0)),c=vv(getE(x0,y0+1)),d=vv(getE(x0+1,y0+1));
  return (a*(1-fx)+b*fx)*(1-fy)+(c*(1-fx)+d*fx)*fy; }

const OW=3072, OH=Math.round(OW*VH/VW);
const E=new Float32Array(OW*OH);
for(let oy=0;oy<OH;oy++)for(let ox=0;ox<OW;ox++){ const ll=unproj((ox+0.5)/OW*VW,(oy+0.5)/OH*VH); E[oy*OW+ox]=elevBil(ll[0],ll[1]); }

const RAMP=[[1,[249,248,243]],[100,[236,228,202]],[300,[219,190,135]],[600,[192,144,90]],[1000,[158,104,60]],[1500,[122,76,46]],[2000,[95,60,40]],[2250,[170,162,155]],[2500,[252,252,252]]];
function ramp(e){ if(e<=RAMP[0][0])return RAMP[0][1]; for(let i=1;i<RAMP.length;i++){ if(e<=RAMP[i][0]){
  const a=RAMP[i-1],b=RAMP[i],t=(e-a[0])/(b[0]-a[0]); return [a[1][0]+(b[1][0]-a[1][0])*t,a[1][1]+(b[1][1]-a[1][1])*t,a[1][2]+(b[1][2]-a[1][2])*t]; } } return RAMP[RAMP.length-1][1]; }

const cellx=(CFG.WIN[2]-CFG.WIN[0])*111320*kx/OW, celly=(CFG.WIN[3]-CFG.WIN[1])*110570/OH;
// ZF 6.0 (2026-07-08): 산맥이 능선으로 읽히도록 음영 과장 2.2배 — 소백·태백산맥 등 고대 문화권 경계 강조
const ZF=6.0, az=315*Math.PI/180, zen=(90-45)*Math.PI/180, cz=Math.cos(zen), sz=Math.sin(zen);
function E_(x,y){x=x<0?0:x>=OW?OW-1:x;y=y<0?0:y>=OH?OH-1:y;return E[y*OW+x];}
const png=new PNG({width:OW,height:OH});
for(let y=0;y<OH;y++)for(let x=0;x<OW;x++){ const e=E[y*OW+x],o=(y*OW+x)*4;
  if(e<=0.5){ png.data[o+3]=0; continue; }
  const dzdx=(E_(x+1,y)-E_(x-1,y))/(2*cellx)*ZF, dzdy=(E_(x,y+1)-E_(x,y-1))/(2*celly)*ZF;
  const slope=Math.atan(Math.sqrt(dzdx*dzdx+dzdy*dzdy)), aspect=Math.atan2(dzdy,-dzdx);
  let hs=cz*Math.cos(slope)+sz*Math.sin(slope)*Math.cos(az-aspect); hs=Math.max(0,hs);
  const sh=0.36+0.88*hs, c=ramp(e);
  png.data[o]=Math.max(0,Math.min(255,c[0]*sh)); png.data[o+1]=Math.max(0,Math.min(255,c[1]*sh)); png.data[o+2]=Math.max(0,Math.min(255,c[2]*sh));
  png.data[o+3]=255;
}
const buf=PNG.sync.write(png,{colorType:6});
fs.writeFileSync("relief7.json", JSON.stringify({ viewBox:`0 0 ${VW} ${VH}`, ocean:"#a9e2f3", dataUri:"data:image/png;base64,"+buf.toString("base64") }));
fs.writeFileSync("relief7.png", buf);
console.log("relief7",OW+"x"+OH,"| PNG",Math.round(buf.length/1024)+"KB");
