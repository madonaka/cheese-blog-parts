const fs=require("fs");
const DIR="hydro/HydroRIVERS_v10_as_shp/";
const shp=fs.readFileSync(DIR+"HydroRIVERS_v10_as.shp");
const dbf=fs.readFileSync(DIR+"HydroRIVERS_v10_as.dbf");
const hdrLen=dbf.readUInt16LE(8), recLen=dbf.readUInt16LE(10);
const ORD_POS=88, ORD_LEN=4; // ORD_FLOW
function ordFlow(i){ const off=hdrLen+i*recLen+ORD_POS; return parseInt(dbf.toString("ascii",off,off+ORD_LEN).trim(),10)||99; }

const WIN=[106,26,146,47], M=0.8;
const X0=WIN[0]-M,Y0=WIN[1]-M,X1=WIN[2]+M,Y1=WIN[3]+M;
const MAXORD=6;

let off=100, idx=0, kept=[], counts={};
const fileLen=shp.length;
while(off+8<=fileLen){
  const contentLen=shp.readInt32BE(off+4)*2; // bytes
  const rs=off+8;
  const type=shp.readInt32LE(rs);
  if(type===3||type===13){ // polyline
    const xmin=shp.readDoubleLE(rs+4), ymin=shp.readDoubleLE(rs+12), xmax=shp.readDoubleLE(rs+20), ymax=shp.readDoubleLE(rs+28);
    if(!(xmax<X0||xmin>X1||ymax<Y0||ymin>Y1)){
      const ord=ordFlow(idx);
      counts[ord]=(counts[ord]||0)+1;
      if(ord<=MAXORD){
        const numParts=shp.readInt32LE(rs+36), numPoints=shp.readInt32LE(rs+40);
        const partsOff=rs+44, ptsOff=partsOff+numParts*4;
        const parts=[]; for(let p=0;p<numParts;p++) parts.push(shp.readInt32LE(partsOff+p*4));
        parts.push(numPoints);
        for(let p=0;p<numParts;p++){
          const line=[];
          for(let k=parts[p];k<parts[p+1];k++){
            line.push([shp.readDoubleLE(ptsOff+k*16), shp.readDoubleLE(ptsOff+k*16+8)]);
          }
          if(line.length>1) kept.push({f:ord, p:line});
        }
      }
    }
  }
  off=rs+contentLen; idx++;
}
console.log("scanned:",idx,"| kept reaches (ord<=" +MAXORD+"):",kept.length);
console.log("ord distribution in window:",JSON.stringify(counts));
fs.writeFileSync("hydro-raw.json", JSON.stringify(kept));
console.log("hydro-raw.json", Math.round(fs.statSync("hydro-raw.json").size/1048576)+"MB");
