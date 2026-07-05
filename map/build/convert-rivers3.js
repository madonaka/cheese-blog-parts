const fs=require("fs");
const gj=JSON.parse(fs.readFileSync("rivers10.json","utf8"));
const CFG={ WIN:[106,26,146,47], SCALE:24, pad:6 };
const kx=Math.cos((CFG.WIN[1]+CFG.WIN[3])/2*Math.PI/180);
function proj(lon,lat){ return [ (lon-CFG.WIN[0])*kx*CFG.SCALE+CFG.pad, (CFG.WIN[3]-lat)*CFG.SCALE+CFG.pad ]; }
const W=Math.round((CFG.WIN[2]-CFG.WIN[0])*kx*CFG.SCALE+CFG.pad*2), H=Math.round((CFG.WIN[3]-CFG.WIN[1])*CFG.SCALE+CFG.pad*2);

// 수집 창(연결 조각까지 포함하려고 여유)
const COL=[103,23,149,50];
function box(l){let b=[999,999,-999,-999];l.forEach(([x,y])=>{if(x<b[0])b[0]=x;if(x>b[2])b[2]=x;if(y<b[1])b[1]=y;if(y>b[3])b[3]=y;});return b;}
function inter(b){return !(b[2]<COL[0]||b[0]>COL[2]||b[3]<COL[1]||b[1]>COL[3]);}

let subs=[];
gj.features.forEach(f=>{ const lines=f.geometry.type==="LineString"?[f.geometry.coordinates]:f.geometry.coordinates;
  lines.forEach(l=>{ if(l.length<2)return; if(inter(box(l))) subs.push(l.map(c=>[c[0],c[1]])); }); });

// ---- stitch: 끝점이 EPS 이내면 이어붙임 ----
const EPS=0.25;
function near(a,b){ return Math.hypot(a[0]-b[0],a[1]-b[1])<=EPS; }
const used=new Array(subs.length).fill(false), chains=[];
for(let i=0;i<subs.length;i++){ if(used[i])continue; used[i]=true; let ch=subs[i].slice(), ext=true;
  while(ext){ ext=false; const head=ch[0], tail=ch[ch.length-1];
    for(let j=0;j<subs.length;j++){ if(used[j])continue; const L=subs[j], a=L[0], b=L[L.length-1];
      if(near(tail,a)){ ch=ch.concat(L.slice(1)); used[j]=1; ext=1; }
      else if(near(tail,b)){ ch=ch.concat(L.slice(0,-1).reverse()); used[j]=1; ext=1; }
      else if(near(head,b)){ ch=L.slice(0,-1).concat(ch); used[j]=1; ext=1; }
      else if(near(head,a)){ ch=L.slice(1).reverse().concat(ch); used[j]=1; ext=1; }
      if(ext) break; } }
  chains.push(ch); }

function len(ch){ let s=0; for(let i=1;i<ch.length;i++) s+=Math.hypot(ch[i][0]-ch[i-1][0],ch[i][1]-ch[i-1][1]); return s; }

// RDP + project
const RE=0.32, r=n=>Math.round(n*10)/10;
function rdp(p,e){ if(p.length<3)return p; let dm=0,idx=0;const a=p[0],b=p[p.length-1];
  for(let i=1;i<p.length-1;i++){const d=perp(p[i],a,b);if(d>dm){dm=d;idx=i;}} if(dm>e)return rdp(p.slice(0,idx+1),e).slice(0,-1).concat(rdp(p.slice(idx),e)); return[a,b]; }
function perp(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1];const L=Math.hypot(dx,dy)||1e-9;return Math.abs((p[0]-a[0])*dy-(p[1]-a[1])*dx)/L;}
function toPath(ch){ let p=rdp(ch.map(c=>proj(c[0],c[1])),RE); if(p.length<2)return ""; return "M"+p.map(q=>r(q[0])+","+r(q[1])).join("L"); }

let major="",minor="",nMaj=0,nMin=0,dropped=0;
chains.forEach(ch=>{ const L=len(ch); if(L<0.4){ dropped++; return; } const d=toPath(ch); if(!d)return;
  if(L>=2.2){ major+=d; nMaj++; } else { minor+=d; nMin++; } });

// 대동강(10m 없음) 손보정
const TAEDONG=[[126.9,40.0],[126.4,39.6],[126.0,39.3],[125.8,39.12],[125.75,39.03],[125.55,38.9],[125.38,38.76],[125.4,38.62]];
major+="M"+rdp(TAEDONG.map(c=>proj(c[0],c[1])),0.1).map(q=>r(q[0])+","+r(q[1])).join("L"); nMaj++;

fs.writeFileSync("rivers3.json", JSON.stringify({viewBox:`0 0 ${W} ${H}`, major, minor}));
console.log("subs",subs.length,"→ chains",chains.length,"| dropped tiny",dropped,"| major",nMaj,"("+Math.round(major.length/1024)+"KB) minor",nMin,"("+Math.round(minor.length/1024)+"KB)");
