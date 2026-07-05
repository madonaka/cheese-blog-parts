const fs=require("fs");
const YEARS=[400,500,600];

const WIN=[106,26,146,47];
const midLat=(WIN[1]+WIN[3])/2, kx=Math.cos(midLat*Math.PI/180);
const SCALE=24, pad=6;
function proj([lon,lat]){ return [ (lon-WIN[0])*kx*SCALE+pad, (WIN[3]-lat)*SCALE+pad ]; }
const W=Math.round((WIN[2]-WIN[0])*kx*SCALE+pad*2), H=Math.round((WIN[3]-WIN[1])*SCALE+pad*2);

const EPS=0.45, r=n=>Math.round(n);
function rdp(pts,eps){ if(pts.length<3)return pts; let dmax=0,idx=0;const a=pts[0],b=pts[pts.length-1];
  for(let i=1;i<pts.length-1;i++){const d=perp(pts[i],a,b);if(d>dmax){dmax=d;idx=i;}}
  if(dmax>eps){return rdp(pts.slice(0,idx+1),eps).slice(0,-1).concat(rdp(pts.slice(idx),eps));} return[a,b]; }
function perp(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1];const L=Math.hypot(dx,dy)||1e-9;return Math.abs((p[0]-a[0])*dy-(p[1]-a[1])*dx)/L;}
function simplifyRing(pts){ if(pts.length>1){const a=pts[0],b=pts[pts.length-1];if(a[0]===b[0]&&a[1]===b[1])pts=pts.slice(0,-1);}
  if(pts.length<4)return pts; let far=1,fd=-1;
  for(let i=1;i<pts.length;i++){const d=(pts[i][0]-pts[0][0])**2+(pts[i][1]-pts[0][1])**2;if(d>fd){fd=d;far=i;}}
  return rdp(pts.slice(0,far+1),EPS).slice(0,-1).concat(rdp(pts.slice(far).concat([pts[0]]),EPS).slice(0,-1)); }
function ringBox(ring){let b=[999,999,-999,-999];ring.forEach(([x,y])=>{if(x<b[0])b[0]=x;if(x>b[2])b[2]=x;if(y<b[1])b[1]=y;if(y>b[3])b[3]=y;});return b;}
const M=4;
function ringOut(box){return box[2]<WIN[0]-M||box[0]>WIN[2]+M||box[3]<WIN[1]-M||box[1]>WIN[3]+M;}
function ring2path(ring){ if(ringOut(ringBox(ring)))return "";
  const pts=simplifyRing(ring.map(proj)); if(pts.length<3)return "";
  const out=[];let px=null,py=null;
  for(const p of pts){const x=r(p[0]),y=r(p[1]);if(x!==px||y!==py){out.push(x+","+y);px=x;py=y;}}
  return out.length<3?"":"M"+out.join("L")+"Z"; }
function geom2path(g){ const polys=g.type==="Polygon"?[g.coordinates]:g.coordinates;
  return polys.map(poly=>poly.map(ring2path).join("")).join(""); }

function cat(name){ if(!name)return "other";
  if(/Koguryo/i.test(name))return "koguryo";
  if(/Paekche/i.test(name))return "paekche";
  if(/^Silla/i.test(name))return "silla";
  if(/Gaya|Kaya/i.test(name))return "gaya";
  return "other"; }

// largest-ring bbox centre -> label anchor (projected)
function labelXY(g){ let best=null,ba=-1;
  const polys=g.type==="Polygon"?[g.coordinates]:g.coordinates;
  polys.forEach(poly=>{const ring=poly[0];const b=ringBox(ring);const a=(b[2]-b[0])*(b[3]-b[1]);if(a>ba){ba=a;best=b;}});
  if(!best)return null; const p=proj([(best[0]+best[2])/2,(best[1]+best[3])/2]); return [r(p[0]),r(p[1])]; }

const years={};
for(const Y of YEARS){
  const gj=JSON.parse(fs.readFileSync(`hist_${Y}.json`,"utf8"));
  const feats=[];
  gj.features.forEach(f=>{
    const name=f.properties.NAME||f.properties.name||"";
    const allpts=[]; (function walk(c){if(typeof c[0]==="number")allpts.push(c);else c.forEach(walk);})(f.geometry.coordinates);
    const fb=ringBox(allpts);
    if(fb[2]<WIN[0]||fb[0]>WIN[2]||fb[3]<WIN[1]||fb[1]>WIN[3]) return;
    const span=Math.max(fb[2]-fb[0],fb[3]-fb[1]);
    if(!name && span>3) return;
    const d=geom2path(f.geometry); if(!d)return;
    const c=cat(name);
    const feat={ name, cat:c, d };
    if(name){ const lp=labelXY(f.geometry); if(lp) feat.l=lp; }
    feats.push(feat);
  });
  years[Y]=feats;
  const kb=Math.round(JSON.stringify(feats).length/1024);
  console.log(`[${Y}] feats:${feats.length} (${kb}KB) | `+feats.filter(f=>f.name).map(f=>f.name).join(", "));
}

fs.writeFileSync("ea-years.json", JSON.stringify({viewBox:`0 0 ${W} ${H}`,years}));
console.log("viewBox 0 0",W,H,"-> ea-years.json",Math.round(fs.statSync("ea-years.json").size/1024)+"KB");
