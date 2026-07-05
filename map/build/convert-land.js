const fs=require("fs");
const gj=JSON.parse(fs.readFileSync("land50.json","utf8"));

const WIN=[106,26,146,47];
const midLat=(WIN[1]+WIN[3])/2, kx=Math.cos(midLat*Math.PI/180);
const SCALE=24, pad=6;
function proj([lon,lat]){ return [ (lon-WIN[0])*kx*SCALE+pad, (WIN[3]-lat)*SCALE+pad ]; }
const W=Math.round((WIN[2]-WIN[0])*kx*SCALE+pad*2), H=Math.round((WIN[3]-WIN[1])*SCALE+pad*2);

const EPS=0.7, r=n=>Math.round(n);
function rdp(pts,eps){ if(pts.length<3)return pts; let dmax=0,idx=0;const a=pts[0],b=pts[pts.length-1];
  for(let i=1;i<pts.length-1;i++){const d=perp(pts[i],a,b);if(d>dmax){dmax=d;idx=i;}}
  if(dmax>eps){return rdp(pts.slice(0,idx+1),eps).slice(0,-1).concat(rdp(pts.slice(idx),eps));} return[a,b]; }
function perp(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1];const L=Math.hypot(dx,dy)||1e-9;return Math.abs((p[0]-a[0])*dy-(p[1]-a[1])*dx)/L;}
function simplifyRing(pts){ if(pts.length>1){const a=pts[0],b=pts[pts.length-1];if(a[0]===b[0]&&a[1]===b[1])pts=pts.slice(0,-1);}
  if(pts.length<4)return pts; let far=1,fd=-1;
  for(let i=1;i<pts.length;i++){const d=(pts[i][0]-pts[0][0])**2+(pts[i][1]-pts[0][1])**2;if(d>fd){fd=d;far=i;}}
  return rdp(pts.slice(0,far+1),EPS).slice(0,-1).concat(rdp(pts.slice(far).concat([pts[0]]),EPS).slice(0,-1)); }
function ringBox(ring){let b=[999,999,-999,-999];ring.forEach(([x,y])=>{if(x<b[0])b[0]=x;if(x>b[2])b[2]=x;if(y<b[1])b[1]=y;if(y>b[3])b[3]=y;});return b;}
const M=3;
function ringOut(box){return box[2]<WIN[0]-M||box[0]>WIN[2]+M||box[3]<WIN[1]-M||box[1]>WIN[3]+M;}
function ring2path(ring){ if(ringOut(ringBox(ring)))return "";
  const pts=simplifyRing(ring.map(proj)); if(pts.length<3)return "";
  const out=[];let px=null,py=null;
  for(const p of pts){const x=r(p[0]),y=r(p[1]);if(x!==px||y!==py){out.push(x+","+y);px=x;py=y;}}
  return out.length<3?"":"M"+out.join("L")+"Z"; }

let d="";
gj.features.forEach(f=>{
  const polys=f.geometry.type==="Polygon"?[f.geometry.coordinates]:f.geometry.coordinates;
  polys.forEach(poly=>{ d+=ring2path(poly[0]); }); // outer ring only (ignore lakes)
});

fs.writeFileSync("land.json", JSON.stringify({viewBox:`0 0 ${W} ${H}`, land:d}));
console.log("viewBox 0 0",W,H,"| land path:",Math.round(d.length/1024)+"KB");
