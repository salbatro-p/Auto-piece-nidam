import {prepareMesh,type Mesh,type Point} from './part-mesh';

// A closed axial section describes a fully rotational part, including its bore.
export function measuredProfile(text:string, identity:{sku:string;manufacturerPartNumber:string;vehicleId:string;year:number}):Mesh {
  const data=JSON.parse(text);
  if(!data || data.kind!=='measured-revolution-v1' || data.unit!=='mm' || data.axisymmetric!==true ||
    Object.entries(identity).some(([key,value])=>data[key]!==value))throw new Error('MEDIA_REFERENCE_MISMATCH');
  const p: number[][]=data.profile;
  if(!Array.isArray(p)||p.length<3||p.length>128||!p.every(row=>Array.isArray(row)&&row.length===2&&row.every(Number.isFinite)&&row[0]>=0&&row.every(n=>Math.abs(n)<=100000)))throw new Error('INVALID_FILE');
  const cross=(a:number[],b:number[],c:number[])=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const on=(a:number[],b:number[],c:number[])=>cross(a,b,c)===0 && c.every((n,i)=>n>=Math.min(a[i],b[i])&&n<=Math.max(a[i],b[i]));
  let area=0;
  for(let i=0;i<p.length;i++){
    const a=p[i],b=p[(i+1)%p.length];area+=a[0]*b[1]-a[1]*b[0];
    if(a[0]===b[0] && a[1]===b[1])throw new Error('INVALID_FILE');
    for(let j=i+2;j<p.length;j++){
      if(i===0&&j===p.length-1)continue;
      const c=p[j],d=p[(j+1)%p.length];
      if((cross(a,b,c)*cross(a,b,d)<0 && cross(c,d,a)*cross(c,d,b)<0)||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b))throw new Error('INVALID_FILE');
    }
  }
  if(Math.abs(area)<1e-9)throw new Error('INVALID_FILE');
  const faces:Mesh=[],segments=72;
  const point=(corner:number[],i:number):Point=>[corner[0]*Math.cos(i*2*Math.PI/segments),corner[1],corner[0]*Math.sin(i*2*Math.PI/segments)];
  for(let j=0;j<p.length;j++)for(let i=0;i<segments;i++){
    const start=p[j],end=p[(j+1)%p.length],a=point(start,i),b=point(start,i+1),c=point(end,i+1),d=point(end,i);
    faces.push({color:'#abb7b5',points:[a,b,c]},{color:'#abb7b5',points:[a,c,d]});
  }
  return prepareMesh(faces);
}
