const fs=require("fs");
const DIR="hydro/HydroRIVERS_v10_as_shp/";
const shp=fs.readFileSync(DIR+"HydroRIVERS_v10_as.shp");
const dbf=fs.readFileSync(DIR+"HydroRIVERS_v10_as.dbf");
const hdrLen=dbf.readUInt16LE(8), recLen=dbf.readUInt16LE(10);
function num(i,pos,len){ const off=hdrLen+i*recLen+pos; return parseFloat(dbf.toString("ascii",off,off+len).trim())||0; }
// 필드 오프셋: NEXT_DOWN@10(9) UPLAND_SKM@56(10) ENDORHEIC@66(4) ORD_FLOW@88(4)
const WIN=[106,26,146,47], M=0.8;
const X0=WIN[0]-M,Y0=WIN[1]-M,X1=WIN[2]+M,Y1=WIN[3]+M;
const KBOX=[123.3,33,131.8,43.6];
const U_GLOBAL=800, U_KOREA=150; // 유역면적(km²) 포함 임계

let off=100, idx=0, kept=[];
while(off+8<=shp.length){
  const contentLen=shp.readInt32BE(off+4)*2, rs=off+8;
  const type=shp.readInt32LE(rs);
  if(type===3||type===13){
    const xmin=shp.readDoubleLE(rs+4), ymin=shp.readDoubleLE(rs+12), xmax=shp.readDoubleLE(rs+20), ymax=shp.readDoubleLE(rs+28);
    if(!(xmax<X0||xmin>X1||ymax<Y0||ymin>Y1)){
      const U=num(idx,56,10);
      const inK=!(xmax<KBOX[0]||xmin>KBOX[2]||ymax<KBOX[1]||ymin>KBOX[3]);
      if(U>=U_GLOBAL || (inK && U>=U_KOREA)){
        const nd=num(idx,10,9), endo=num(idx,66,4);
        const numParts=shp.readInt32LE(rs+36), numPoints=shp.readInt32LE(rs+40);
        const partsOff=rs+44, ptsOff=partsOff+numParts*4;
        const parts=[]; for(let p=0;p<numParts;p++) parts.push(shp.readInt32LE(partsOff+p*4));
        parts.push(numPoints);
        for(let p=0;p<numParts;p++){
          const line=[];
          for(let k=parts[p];k<parts[p+1];k++) line.push([shp.readDoubleLE(ptsOff+k*16), shp.readDoubleLE(ptsOff+k*16+8)]);
          if(line.length>1) kept.push({u:U, q:num(idx,70,10), m:(nd===0&&endo===0)?1:0, p:line});
        }
      }
    }
  }
  off=rs+contentLen; idx++;
}
console.log("kept:",kept.length,"| mouths:",kept.filter(r=>r.m).length);
fs.writeFileSync("hydro-raw3.json", JSON.stringify(kept));
console.log("hydro-raw3.json", Math.round(fs.statSync("hydro-raw3.json").size/1048576)+"MB");
