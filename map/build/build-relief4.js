const fs=require("fs"); const {PNG}=require("pngjs");
const CFG={ WIN:[106,26,146,47], SCALE:24, pad:6 };
const kx=Math.cos((CFG.WIN[1]+CFG.WIN[3])/2*Math.PI/180);
const VW=Math.round((CFG.WIN[2]-CFG.WIN[0])*kx*CFG.SCALE+CFG.pad*2), VH=Math.round((CFG.WIN[3]-CFG.WIN[1])*CFG.SCALE+CFG.pad*2);
function unproj(x,y){ return [ (x-CFG.pad)/(kx*CFG.SCALE)+CFG.WIN[0], CFG.WIN[3]-(y-CFG.pad)/CFG.SCALE ]; }

const Z=7,N=1<<Z,WORLD=N*256,TILES={};
function san(b){const i=b.indexOf("IEND");return i<0?b:b.slice(0,i+8);}
for(let x=101;x<=115;x++)for(let y=45;y<=54;y++){const p="tiles7/"+x+"_"+y+".png"; if(fs.existsSync(p)){try{const g=PNG.sync.read(san(fs.readFileSync(p)));TILES[x+"_"+y]={d:g.data,w:g.width};}catch(e){}}}
function getE(ix,iy){ if(ix<0||iy<0) return NaN; const xt=(ix>>8),yt=(iy>>8),t=TILES[xt+"_"+yt]; if(!t)return NaN;
  const px=ix-(xt<<8),py=iy-(yt<<8),i=(py*t.w+px)*4; return (t.d[i]*256+t.d[i+1]+t.d[i+2]/256)-32768; }
function vv(e){ return isNaN(e)?0:e; } // 없는 타일/바다=0
function elevBil(lon,lat){ const gx=(lon+180)/360*WORLD, gy=(1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*WORLD;
  const x0=Math.floor(gx-0.5), y0=Math.floor(gy-0.5), fx=gx-0.5-x0, fy=gy-0.5-y0;
  const a=vv(getE(x0,y0)),b=vv(getE(x0+1,y0)),c=vv(getE(x0,y0+1)),d=vv(getE(x0+1,y0+1));
  return (a*(1-fx)+b*fx)*(1-fy)+(c*(1-fx)+d*fx)*fy; }

const OW=1280, OH=Math.round(OW*VH/VW);
let E=new Float32Array(OW*OH);
for(let oy=0;oy<OH;oy++)for(let ox=0;ox<OW;ox++){ const ll=unproj((ox+0.5)/OW*VW,(oy+0.5)/OH*VH); E[oy*OW+ox]=elevBil(ll[0],ll[1]); }
// 노이즈 완화: 3x3 박스 블러 1회
function blur(src){ const t=new Float32Array(OW*OH), o=new Float32Array(OW*OH);
  for(let y=0;y<OH;y++)for(let x=0;x<OW;x++){ let s=0,n=0; for(let dx=-1;dx<=1;dx++){const xx=x+dx;if(xx<0||xx>=OW)continue;s+=src[y*OW+xx];n++;} t[y*OW+x]=s/n; }
  for(let y=0;y<OH;y++)for(let x=0;x<OW;x++){ let s=0,n=0; for(let dy=-1;dy<=1;dy++){const yy=y+dy;if(yy<0||yy>=OH)continue;s+=t[yy*OW+x];n++;} o[y*OW+x]=s/n; }
  return o; }
E=blur(E);

const OCEAN=[95,131,137];
const RAMP=[[1,[247,247,242]],[150,[233,226,201]],[450,[214,191,142]],[900,[184,143,97]],
            [1500,[143,101,66]],[2050,[112,76,54]],[2450,[196,190,184]],[2750,[248,248,248]]];
function ramp(e){ if(e<=RAMP[0][0])return RAMP[0][1]; for(let i=1;i<RAMP.length;i++){ if(e<=RAMP[i][0]){
  const a=RAMP[i-1],b=RAMP[i],t=(e-a[0])/(b[0]-a[0]); return [a[1][0]+(b[1][0]-a[1][0])*t,a[1][1]+(b[1][1]-a[1][1])*t,a[1][2]+(b[1][2]-a[1][2])*t]; } } return RAMP[RAMP.length-1][1]; }

const cellx=(CFG.WIN[2]-CFG.WIN[0])*111320*kx/OW, celly=(CFG.WIN[3]-CFG.WIN[1])*110570/OH;
const ZF=1.7, az=315*Math.PI/180, zen=(90-45)*Math.PI/180, cz=Math.cos(zen), sz=Math.sin(zen);
function E_(x,y){x=x<0?0:x>=OW?OW-1:x;y=y<0?0:y>=OH?OH-1:y;return E[y*OW+x];}
const png=new PNG({width:OW,height:OH});
for(let y=0;y<OH;y++)for(let x=0;x<OW;x++){ const e=E[y*OW+x],o=(y*OW+x)*4; png.data[o+3]=255;
  if(e<=0.5){ png.data[o]=OCEAN[0];png.data[o+1]=OCEAN[1];png.data[o+2]=OCEAN[2]; continue; }
  const dzdx=(E_(x+1,y)-E_(x-1,y))/(2*cellx)*ZF, dzdy=(E_(x,y+1)-E_(x,y-1))/(2*celly)*ZF;
  const slope=Math.atan(Math.sqrt(dzdx*dzdx+dzdy*dzdy)), aspect=Math.atan2(dzdy,-dzdx);
  let hs=cz*Math.cos(slope)+sz*Math.sin(slope)*Math.cos(az-aspect); hs=Math.max(0,hs);
  const sh=0.5+0.7*hs, c=ramp(e);
  png.data[o]=Math.max(0,Math.min(255,c[0]*sh)); png.data[o+1]=Math.max(0,Math.min(255,c[1]*sh)); png.data[o+2]=Math.max(0,Math.min(255,c[2]*sh));
}
const buf=PNG.sync.write(png,{colorType:2});
fs.writeFileSync("relief4.json", JSON.stringify({ viewBox:`0 0 ${VW} ${VH}`, ocean:"rgb("+OCEAN.join(",")+")", dataUri:"data:image/png;base64,"+buf.toString("base64") }));
console.log("relief4",OW+"x"+OH,"(bilinear+blur) | PNG",Math.round(buf.length/1024)+"KB | dataUri",Math.round(buf.toString("base64").length/1024)+"KB");
