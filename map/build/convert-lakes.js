const fs=require("fs");
const gj=JSON.parse(fs.readFileSync("lakes10.json","utf8"));
const CFG={ WIN:[106,26,146,47], SCALE:24, pad:6 };
const kx=Math.cos((CFG.WIN[1]+CFG.WIN[3])/2*Math.PI/180);
function proj(lon,lat){ return [ (lon-CFG.WIN[0])*kx*CFG.SCALE+CFG.pad, (CFG.WIN[3]-lat)*CFG.SCALE+CFG.pad ]; }
const W=Math.round((CFG.WIN[2]-CFG.WIN[0])*kx*CFG.SCALE+CFG.pad*2), H=Math.round((CFG.WIN[3]-CFG.WIN[1])*CFG.SCALE+CFG.pad*2);

const EPS=0.25, r1=n=>Math.round(n*10)/10;
function rdp(p,e){ if(p.length<3)return p; let dm=0,idx=0;const a=p[0],b=p[p.length-1];
  for(let i=1;i<p.length-1;i++){const d=perp(p[i],a,b);if(d>dm){dm=d;idx=i;}} if(dm>e)return rdp(p.slice(0,idx+1),e).slice(0,-1).concat(rdp(p.slice(idx),e)); return[a,b]; }
function perp(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1];const L=Math.hypot(dx,dy)||1e-9;return Math.abs((p[0]-a[0])*dy-(p[1]-a[1])*dx)/L;}
function simplifyRing(pts){ if(pts.length>1){const a=pts[0],b=pts[pts.length-1];if(a[0]===b[0]&&a[1]===b[1])pts=pts.slice(0,-1);}
  if(pts.length<4)return pts; let far=1,fd=-1;
  for(let i=1;i<pts.length;i++){const d=(pts[i][0]-pts[0][0])**2+(pts[i][1]-pts[0][1])**2;if(d>fd){fd=d;far=i;}}
  return rdp(pts.slice(0,far+1),EPS).slice(0,-1).concat(rdp(pts.slice(far).concat([pts[0]]),EPS).slice(0,-1)); }
function ringArea(ring){ let a=0; for(let i=0;i<ring.length;i++){ const j=(i+1)%ring.length; a+=ring[i][0]*ring[j][1]-ring[j][0]*ring[i][1]; } return Math.abs(a/2); }

const WIN=CFG.WIN, MIN_AREA=0.006; // deg² ≈ 60km² 이상만 (큰 호수)
let d="", kept=0, names=[];
gj.features.forEach(f=>{
  const polys=f.geometry.type==="Polygon"?[f.geometry.coordinates]:f.geometry.coordinates;
  polys.forEach(poly=>{ const ring=poly[0]; if(!ring||ring.length<4) return;
    let b=[999,999,-999,-999]; ring.forEach(p=>{if(p[0]<b[0])b[0]=p[0];if(p[0]>b[2])b[2]=p[0];if(p[1]<b[1])b[1]=p[1];if(p[1]>b[3])b[3]=p[1];});
    if(b[2]<WIN[0]||b[0]>WIN[2]||b[3]<WIN[1]||b[1]>WIN[3]) return;
    if(ringArea(ring)<MIN_AREA) return;
    const pts=simplifyRing(ring.map(p=>proj(p[0],p[1]))); if(pts.length<3) return;
    d+="M"+pts.map(p=>r1(p[0])+","+r1(p[1])).join("L")+"Z"; kept++;
    if(f.properties.name) names.push(f.properties.name);
  });
});
fs.writeFileSync("lakes.json", JSON.stringify({viewBox:`0 0 ${W} ${H}`, lakes:d}));
console.log("kept lakes:",kept,"| path",Math.round(d.length/1024)+"KB");
console.log("names:",[...new Set(names)].slice(0,25).join(", "));
