// 폴백용 published 데이터 재생성 — 편집기 ☁ 발행과 동일: densify(곡선화) → 겹침 절단
const fs=require("fs"); const pc=require("./pc.js");
const CFG={ WIN:[106,26,146,47], SCALE:24, pad:6 };
const kx=Math.cos((CFG.WIN[1]+CFG.WIN[3])/2*Math.PI/180);
function proj(lon,lat){ return [ (lon-CFG.WIN[0])*kx*CFG.SCALE+CFG.pad, (CFG.WIN[3]-lat)*CFG.SCALE+CFG.pad ]; }
const W=784,H=516, rd=n=>Math.round(n*10)/10;

const NAT=[{id:"koguryo",name:"고구려",color:"#c98a2b"},{id:"paekche",name:"백제",color:"#3f6fb0"},
           {id:"silla",name:"신라",color:"#c0453f"},{id:"gaya",name:"가야",color:"#3f8f78"}];
const SEEDS=JSON.parse(fs.readFileSync("seeds-samguk.json","utf8"));
const CITIES=JSON.parse(fs.readFileSync("cities-samguk.json","utf8"));
const YEARS=[{y:"400",nm:"삼국·가야 정립"},{y:"500",nm:"고구려 전성(장수왕)"},{y:"600",nm:"신라의 부상"}];
const REGIONS=[{name:"요동",lon:122,lat:41.6,y:{"400":1,"500":1,"600":1}},
               {name:"말갈",lon:131,lat:45,y:{"400":1,"500":1,"600":1}},
               {name:"초원(유연)",lon:111,lat:45,y:{"400":1,"500":1,"600":1}}];

function densify(P){ var n=P.length; if(n<3) return P; var out=[]; function pt(i){ return P[((i%n)+n)%n]; }
  for(var i=0;i<n;i++){ var p0=pt(i-1),p1=pt(i),p2=pt(i+1),p3=pt(i+2);
    var c1x=p1[0]+(p2[0]-p0[0])/6, c1y=p1[1]+(p2[1]-p0[1])/6, c2x=p2[0]-(p3[0]-p1[0])/6, c2y=p2[1]-(p3[1]-p1[1])/6;
    out.push([p1[0],p1[1]]);
    for(var st=1;st<6;st++){ var t=st/6,u=1-t;
      out.push([u*u*u*p1[0]+3*u*u*t*c1x+3*u*t*t*c2x+t*t*t*p2[0], u*u*u*p1[1]+3*u*u*t*c1y+3*u*t*t*c2y+t*t*t*p2[1]]); } }
  return out; }
function projPoly(pts){ return [ pts.map(ll=>proj(ll[0],ll[1])) ]; }
function mpPath(mp){ let d=""; mp.forEach(poly=>poly.forEach(ring=>{ d+="M"+ring.map(p=>rd(p[0])+","+rd(p[1])).join("L")+"Z"; })); return d; }

const territories={};
YEARS.forEach(Y=>{ const order=NAT.map(n=>n.id), polys={};
  order.forEach(id=>{ const p=SEEDS[Y.y][id]; polys[id]=(p&&p.length>2)?projPoly(densify(p)):null; });
  territories[Y.y]=[];
  order.forEach((id,i)=>{ if(!polys[id]) return; const cl=[];
    for(let j=i+1;j<order.length;j++){ if(polys[order[j]]) cl.push(polys[order[j]]); }
    let g; try{ g=cl.length?pc.difference.apply(pc,[polys[id]].concat(cl)):[polys[id]]; }catch(e){ g=[polys[id]]; }
    if(g&&g.length){ const dd=mpPath(g); if(dd) territories[Y.y].push({id:id,d:dd}); } }); });

const out={ viewBox:`0 0 ${W} ${H}`, cfg:{WIN:CFG.WIN,SCALE:CFG.SCALE,pad:CFG.pad,ocean:"rgb(95,131,137)"},
  nations:NAT, years:YEARS, territories, cities:CITIES, regions:REGIONS };
const P="C:/Users/ckdwn/OneDrive/바탕 화면/cheese-blog-parts/cheese-blog-parts/map/data/samguk-map.json";
fs.writeFileSync(P, JSON.stringify(out));
console.log("data/samguk-map.json", Math.round(fs.statSync(P).size/1024)+"KB | 곡선 세그먼트 확인:", /L\d/.test(out.territories["400"][0].d), "| regions:", out.regions.length);
