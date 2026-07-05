const fs = require("fs");
const gj = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));

// ---- 1. bounds ----
let minLon=Infinity,maxLon=-Infinity,minLat=Infinity,maxLat=-Infinity;
function scan(c){ if(typeof c[0]==="number"){const[x,y]=c;if(x<minLon)minLon=x;if(x>maxLon)maxLon=x;if(y<minLat)minLat=y;if(y>maxLat)maxLat=y;}else c.forEach(scan); }
gj.features.forEach(f=>scan(f.geometry.coordinates));
const midLat=(minLat+maxLat)/2, kx=Math.cos(midLat*Math.PI/180);

// ---- 2. projection lon/lat -> svg ----
const SCALE=118; // degrees -> units
const pad=8;
function proj([lon,lat]){ return [ (lon-minLon)*kx*SCALE+pad, (maxLat-lat)*SCALE+pad ]; }
const W=(maxLon-minLon)*kx*SCALE+pad*2;
const H=(maxLat-minLat)*SCALE+pad*2;

// ---- 3. Douglas-Peucker simplify (on projected pts) ----
function rdp(pts,eps){
  if(pts.length<3) return pts;
  let dmax=0,idx=0;const[a,b]=[pts[0],pts[pts.length-1]];
  for(let i=1;i<pts.length-1;i++){const d=perp(pts[i],a,b);if(d>dmax){dmax=d;idx=i;}}
  if(dmax>eps){const l=rdp(pts.slice(0,idx+1),eps),r=rdp(pts.slice(idx),eps);return l.slice(0,-1).concat(r);}
  return [a,b];
}
function perp(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1];const L=Math.hypot(dx,dy)||1e-9;return Math.abs((p[0]-a[0])*dy-(p[1]-a[1])*dx)/L;}

const EPS=0.5; // simplification strength (units)
const MINRING=2.5; // drop islands smaller than this (units)
const r=n=>Math.round(n);

// closed-ring RDP: split at farthest vertex so the baseline isn't zero-length
function simplifyRing(pts){
  if(pts.length>1){const a=pts[0],b=pts[pts.length-1];if(a[0]===b[0]&&a[1]===b[1])pts=pts.slice(0,-1);}
  if(pts.length<4) return pts;
  let far=1,fd=-1;
  for(let i=1;i<pts.length;i++){const d=(pts[i][0]-pts[0][0])**2+(pts[i][1]-pts[0][1])**2;if(d>fd){fd=d;far=i;}}
  const s1=rdp(pts.slice(0,far+1),EPS);
  const s2=rdp(pts.slice(far).concat([pts[0]]),EPS);
  return s1.slice(0,-1).concat(s2.slice(0,-1));
}

function ring2path(ring){
  const proj0=ring.map(proj);
  const xs=proj0.map(p=>p[0]),ys=proj0.map(p=>p[1]);
  if(Math.max(...xs)-Math.min(...xs)<MINRING && Math.max(...ys)-Math.min(...ys)<MINRING) return ""; // drop tiny island
  const pts=simplifyRing(proj0);
  if(pts.length<3) return "";
  // round to int + drop consecutive duplicates
  const out=[];let px=null,py=null;
  for(const p of pts){const x=r(p[0]),y=r(p[1]);if(x!==px||y!==py){out.push(x+","+y);px=x;py=y;}}
  if(out.length<3) return "";
  return "M"+out.join("L")+"Z";
}
function geom2path(g){
  const polys = g.type==="Polygon"?[g.coordinates]:g.coordinates;
  return polys.map(poly=>poly.map(ring2path).join("")).join("");
}

const out = gj.features.map(f=>({
  name:f.properties.name, code:f.properties.code, path:geom2path(f.geometry)
}));

const result={ viewBox:`0 0 ${r(W)} ${r(H)}`, provinces:out };
fs.writeFileSync(process.argv[3], JSON.stringify(result));
const bytes=JSON.stringify(out.map(o=>o.path)).length;
console.log("viewBox:",result.viewBox);
console.log("provinces:",out.length,"| total path chars:",bytes,"(~"+Math.round(bytes/1024)+"KB)");
console.log("sample:",out[8].name,"->",out[8].path.slice(0,80)+"...");
