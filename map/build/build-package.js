const fs=require("fs"); const pc=require("./pc.js");
const {viewBox}=JSON.parse(fs.readFileSync("relief4.json","utf8"));
const {dataUri,ocean}=JSON.parse(fs.readFileSync("relief4.json","utf8"));
const {major,minor}=JSON.parse(fs.readFileSync("rivers3.json","utf8"));
const CFG={ WIN:[106,26,146,47], SCALE:24, pad:6 };
const kx=Math.cos((CFG.WIN[1]+CFG.WIN[3])/2*Math.PI/180);
function proj(lon,lat){ return [ (lon-CFG.WIN[0])*kx*CFG.SCALE+CFG.pad, (CFG.WIN[3]-lat)*CFG.SCALE+CFG.pad ]; }
const rd=n=>Math.round(n*10)/10;

const NAT=[{id:"koguryo",name:"고구려",color:"#c98a2b"},{id:"paekche",name:"백제",color:"#3f6fb0"},
           {id:"silla",name:"신라",color:"#c0453f"},{id:"gaya",name:"가야",color:"#3f8f78"}];
const SEEDS=JSON.parse(fs.readFileSync("seeds-samguk.json","utf8")); // 편집기 seeds를 파일로 분리해 재사용
const YEARS=[{y:"400",nm:"삼국·가야 정립"},{y:"500",nm:"고구려 전성(장수왕)"},{y:"600",nm:"신라의 부상"}];
const CITIES=JSON.parse(fs.readFileSync("cities-samguk.json","utf8"));

function projPoly(pts){ return [ pts.map(ll=>proj(ll[0],ll[1])) ]; }
function mpPath(mp){ let d=""; mp.forEach(poly=>poly.forEach(ring=>{ d+="M"+ring.map(p=>rd(p[0])+","+rd(p[1])).join("L")+"Z"; })); return d; }
const territories={};
YEARS.forEach(Y=>{ const order=NAT.map(n=>n.id),polys={}; order.forEach(id=>{const p=SEEDS[Y.y][id];polys[id]=(p&&p.length>2)?projPoly(p):null;});
  territories[Y.y]=NAT.map((n,i)=>{ if(!polys[n.id])return null; const cl=[]; for(let j=i+1;j<order.length;j++){if(polys[order[j]])cl.push(polys[order[j]]);}
    let g; try{g=cl.length?pc.difference.apply(pc,[polys[n.id]].concat(cl)):[polys[n.id]];}catch(e){g=[polys[n.id]];}
    return {id:n.id, d:mpPath(g)}; }).filter(Boolean); });

// 배포용 published 지도 데이터 (뷰어는 pc 라이브러리 불필요)
const published={ viewBox, cfg:Object.assign({},CFG,{ocean:ocean}), nations:NAT, years:YEARS, territories, cities:CITIES };
fs.mkdirSync("map/data",{recursive:true}); fs.mkdirSync("map/assets",{recursive:true});
fs.writeFileSync("map/data/samguk-map.json", JSON.stringify(published));
fs.writeFileSync("map/assets/rivers.json", JSON.stringify({viewBox,major,minor}));
// relief PNG를 실제 파일로 (jsDelivr 커밋용)
fs.writeFileSync("map/assets/relief.png", Buffer.from(dataUri.split(",")[1],"base64"));

console.log("map/data/samguk-map.json", Math.round(fs.statSync("map/data/samguk-map.json").size/1024)+"KB");
console.log("map/assets/rivers.json", Math.round(fs.statSync("map/assets/rivers.json").size/1024)+"KB");
console.log("map/assets/relief.png", Math.round(fs.statSync("map/assets/relief.png").size/1024)+"KB");
