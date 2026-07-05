const fs=require("fs"); const {PNG}=require("pngjs");
const RAW=JSON.parse(fs.readFileSync("hydro-raw.json","utf8"));
const CFG={ WIN:[106,26,146,47], SCALE:24, pad:6 };
const kx=Math.cos((CFG.WIN[1]+CFG.WIN[3])/2*Math.PI/180);
function proj(lon,lat){ return [ (lon-CFG.WIN[0])*kx*CFG.SCALE+CFG.pad, (CFG.WIN[3]-lat)*CFG.SCALE+CFG.pad ]; }
const W=Math.round((CFG.WIN[2]-CFG.WIN[0])*kx*CFG.SCALE+CFG.pad*2), H=Math.round((CFG.WIN[3]-CFG.WIN[1])*CFG.SCALE+CFG.pad*2);

// 선별: 등급2-4=전역, 등급5=한반도 창만
const KBOX=[123.3,33,131.8,43.6];
function inK(p){ return p[0]>=KBOX[0]&&p[0]<=KBOX[2]&&p[1]>=KBOX[1]&&p[1]<=KBOX[3]; }
const reaches=RAW.filter(r=> r.f<=4 || (r.f===5 && (inK(r.p[0])||inK(r.p[r.p.length-1]))) );
console.log("selected reaches:",reaches.length,"of",RAW.length);

// 하구 판정용: 끝점 차수(degree) — 1이면 말단
const deg={};
function key(p){ return p[0].toFixed(3)+","+p[1].toFixed(3); }
reaches.forEach(r=>{ [r.p[0],r.p[r.p.length-1]].forEach(p=>{ const k=key(p); deg[k]=(deg[k]||0)+1; }); });

// 저고도 판정 (z8 타일)
const Z=8,N=1<<Z,WORLD=N*256,TILES={};
function san(b){const i=b.indexOf("IEND");return i<0?b:b.slice(0,i+8);}
for(let x=203;x<=231;x++)for(let y=89;y<=108;y++){const p="tiles8/"+x+"_"+y+".png"; if(fs.existsSync(p)){try{const g=PNG.sync.read(san(fs.readFileSync(p)));TILES[x+"_"+y]={d:g.data,w:g.width};}catch(e){}}}
function elevAt(lon,lat){ const gx=(lon+180)/360*WORLD, gy=(1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*WORLD;
  const ix=Math.floor(gx),iy=Math.floor(gy),xt=ix>>8,yt=iy>>8,t=TILES[xt+"_"+yt]; if(!t)return 9999;
  const px=ix-(xt<<8),py=iy-(yt<<8),i=(py*t.w+px)*4; return (t.d[i]*256+t.d[i+1]+t.d[i+2]/256)-32768; }

// 하구 연장: 말단(degree1)이고 해수면 근처면 바다쪽으로 0.12° 연장(클립이 해안에서 자름)
const EXT=0.12, SEA=8;
function extend(line,atStart){ const p0=atStart?line[0]:line[line.length-1], p1=atStart?line[1]:line[line.length-2];
  if(!p1) return; if(deg[key(p0)]!==1) return; if(elevAt(p0[0],p0[1])>SEA) return;
  const dx=p0[0]-p1[0],dy=p0[1]-p1[1],L=Math.hypot(dx,dy)||1e-9;
  const q=[p0[0]+dx/L*EXT, p0[1]+dy/L*EXT];
  if(atStart) line.unshift(q); else line.push(q); }

// 단순화(가볍게) + path 생성
function rdp(p,e){ if(p.length<3)return p; let dm=0,idx=0;const a=p[0],b=p[p.length-1];
  for(let i=1;i<p.length-1;i++){const d=perp(p[i],a,b);if(d>dm){dm=d;idx=i;}} if(dm>e)return rdp(p.slice(0,idx+1),e).slice(0,-1).concat(rdp(p.slice(idx),e)); return[a,b]; }
function perp(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1];const L=Math.hypot(dx,dy)||1e-9;return Math.abs((p[0]-a[0])*dy-(p[1]-a[1])*dx)/L;}
const r1=n=>Math.round(n*10)/10;
function toPath(line,eps){ let p=rdp(line.map(c=>proj(c[0],c[1])),eps); if(p.length<2)return "";
  const out=[]; let px=null,py=null;
  for(const q of p){ const x=r1(q[0]),y=r1(q[1]); if(x!==px||y!==py){ out.push(x+","+y); px=x; py=y; } }
  return out.length<2?"":"M"+out.join("L"); }

// 등급 → 굵기/단순화 (viewBox 단위)
const CLASS={ 2:{w:1.9,eps:0.06}, 3:{w:1.4,eps:0.06}, 4:{w:1.0,eps:0.07}, 5:{w:0.55,eps:0.1} };
const acc={2:"",3:"",4:"",5:""};
reaches.forEach(r=>{ const line=r.p.slice(); extend(line,true); extend(line,false);
  const c=CLASS[Math.max(2,r.f)]; const d=toPath(line,c.eps); if(d) acc[Math.max(2,r.f)]+=d; });

const classes=Object.keys(CLASS).map(k=>({w:CLASS[k].w,d:acc[k]})).filter(c=>c.d);
fs.writeFileSync("rivers5.json", JSON.stringify({viewBox:`0 0 ${W} ${H}`, classes}));
classes.forEach((c,i)=>console.log("class w="+c.w, Math.round(c.d.length/1024)+"KB"));
console.log("rivers5.json total", Math.round(fs.statSync("rivers5.json").size/1024)+"KB");
