import type {Product} from './types';
export type Point = [number, number, number];
export type Triangle = {points: [Point, Point, Point]; color: string};
export type Mesh = Triangle[];
const MAX_TRIANGLES = 24000;
export const MAX_STL_BYTES = 6_000_000;
export const FRAME_COUNT = 12;
export const STL_PROVIDER = 'AutoParts measured turntable v1';

export function prepareMesh(triangles: Mesh): Mesh {
  if (!triangles.length || triangles.length > MAX_TRIANGLES) throw new Error('INVALID_FILE');
  const low = [Infinity,Infinity,Infinity], high = [-Infinity,-Infinity,-Infinity];
  for (const face of triangles) for (const vertex of face.points) for (let axis=0; axis<3; axis++) {
    const n = vertex[axis];
    if (!Number.isFinite(n) || Math.abs(n)>1e12) throw new Error('INVALID_FILE');
    low[axis] = Math.min(low[axis],n); high[axis] = Math.max(high[axis],n);
  }
  const center = low.map((n,i)=>(n+high[i])/2);
  const size = Math.max(...high.map((n,i)=>n-low[i]));
  if (!size) throw new Error('INVALID_FILE');
  const vertices = triangles.map(face => ({color:face.color,points:face.points.map(p=>
    p.map((v,i)=>(v-center[i])/size) as Point) as [Point,Point,Point]}));
  if (!vertices.some(({points:[a,b,c]}) => {
    const u=b.map((n,i)=>n-a[i]),v=c.map((n,i)=>n-a[i]);
    return Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])>1e-12;
  })) throw new Error('INVALID_FILE');
  return vertices;
}

export function parseStl(buffer: ArrayBuffer): Mesh {
  if (buffer.byteLength > MAX_STL_BYTES || buffer.byteLength < 15) throw new Error('INVALID_FILE');
  const view = new DataView(buffer), faces: Mesh = [], color = '#abb7b5';
  if (buffer.byteLength >= 84) {
    const count = view.getUint32(80,true);
    if (84+50*count === buffer.byteLength) {
      if (!count || count>MAX_TRIANGLES) throw new Error('INVALID_FILE');
      for (let i=0;i<count;i++) {
        const offset = 84+i*50+12;
        const corners = [0,12,24].map(j=>[0,4,8].map(k=>view.getFloat32(offset+j+k,true)) as Point);
        faces.push({color,points:corners as [Point,Point,Point]});
      }
      return prepareMesh(faces);
    }
  }
  const content = new TextDecoder().decode(buffer).trim();
  if (!/^solid(?:\s|$)/i.test(content) || !/endsolid[^\r\n]*$/i.test(content)) throw new Error('INVALID_FILE');
  let corners: Point[] | null = null;
  for (const line of content.split(/\r?\n/)) {
    const tokens=line.trim().split(/\s+/), token=tokens[0].toLowerCase();
    if (token==='facet') {
      if(corners || faces.length>=MAX_TRIANGLES) throw new Error('INVALID_FILE');
      corners=[];
    } else if (token==='vertex') {
      if(!corners || corners.length>=3 || tokens.length!==4) throw new Error('INVALID_FILE');
      corners.push(tokens.slice(1).map(Number) as Point);
    } else if (token==='endfacet') {
      if(corners?.length!==3) throw new Error('INVALID_FILE');
      faces.push({points:corners as [Point,Point,Point],color}); corners=null;
    }
  }
  if(corners) throw new Error('INVALID_FILE');
  return prepareMesh(faces);
}

export function drawMesh(canvas: HTMLCanvasElement, mesh: Mesh, angle: number, studio?: {tilt: number; heightRatio: number; dimension?: {ratio: number; vertical: boolean}}) {
  const ctx=canvas.getContext('2d');
  if(!ctx) throw new Error('IMAGE_UNAVAILABLE');
  const {width:w,height:h}=canvas, scale=studio ? Math.min(w*.7,h*.85/(Math.sin(studio.tilt)+studio.heightRatio*Math.cos(studio.tilt))) : Math.min(w*.6,h*.69);
  const c=Math.cos(angle),s=Math.sin(angle), tilt=studio?.tilt??.34,ct=Math.cos(tilt),st=Math.sin(tilt);
  const background=ctx.createRadialGradient(w*.43,h*.34,4,w*.5,h*.5,w*.67);
  background.addColorStop(0,studio?'#3e665d':'#fffcf1');background.addColorStop(1,studio?'#0b2426':'#e8e4d4');
  ctx.fillStyle=background;ctx.fillRect(0,0,w,h);
  if (studio) {
    // A fine reference grid stays fixed as the part tilts.
    ctx.fillStyle='#c8dbc032';
    for(let y=10;y<h;y+=24) for(let x=12;x<w;x+=24) ctx.fillRect(x,y,1.5,1.5);
    ctx.strokeStyle='#e9d89b58';ctx.lineWidth=1;
    for(const x of [18,w-18]) for(const y of [18,h-18]){
      ctx.beginPath();ctx.moveTo(x,y+(y<h/2?12:-12));ctx.lineTo(x,y);ctx.lineTo(x+(x<w/2?12:-12),y);ctx.stroke();
    }
  }
  ctx.fillStyle=studio?'#06181765':'#a6a49555';ctx.beginPath();ctx.ellipse(w*.5,studio ? h*.49+scale*.5*(st+studio.heightRatio*ct)+3 : h*.87,scale*.43,studio?5:scale*.063,0,0,Math.PI*2);ctx.fill();
  const projected=mesh.map(face=>{
    const p=face.points.map(([x,y,z])=>{
      const rx=c*x+s*z, rz=-s*x+c*z;
      return [rx,ct*y-st*rz,st*y+ct*rz] as Point;
    });
    return {p,depth:p[0][2]+p[1][2]+p[2][2],color:face.color};
  }).sort((a,b)=>a.depth-b.depth);
  for(const {p,color} of projected) {
    const [a,b,c]=p,ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
    const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,len=Math.hypot(nx,ny,nz);
    if(len<1e-12) continue;
    const light=.57+.5*Math.max(0,(-.38*nx+.7*ny+.6*nz)*(nz<0?-1:1)/len);
    let finish=1;
    if(studio){
      const phase=Math.atan2(a[2]+b[2]+c[2],a[0]+b[0]+c[0]);
      finish=.98+.19*Math.sin(3*phase+.7)+.13*Math.pow(Math.max(0,Math.cos(phase-.8)),12);
    }
    const rgb=parseInt(color.slice(1),16);
    ctx.fillStyle='rgb('+[((rgb>>16)&255),((rgb>>8)&255),(rgb&255)].map(v=>Math.round(Math.min(255,v*light*finish))).join(',')+')';
    ctx.beginPath();p.forEach(([x,y],i)=>{const px=w*.5+x*scale,py=h*.49-y*scale;i?ctx.lineTo(px,py):ctx.moveTo(px,py);});
    ctx.closePath();ctx.fill();ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=.55;ctx.stroke();
  }
  if (studio?.dimension) {
    const {ratio,vertical}=studio.dimension, extent=scale*ratio/2;
    const x=w*.5+(vertical?scale*.55:0), y=h*.49;
    ctx.save();ctx.strokeStyle='#fff1a9';ctx.lineWidth=3;
    ctx.beginPath();
    if(vertical){ctx.moveTo(x,y-extent);ctx.lineTo(x,y+extent);}
    else{ctx.moveTo(x-extent,y);ctx.lineTo(x+extent,y);}
    for(const sign of [-1,1]){
      if(vertical){ctx.moveTo(x-8,y+sign*extent);ctx.lineTo(x+8,y+sign*extent);}
      else{ctx.moveTo(x+sign*extent,y-8);ctx.lineTo(x+sign*extent,y+8);}
    }
    ctx.stroke();ctx.restore();
  }
}

export type SpinMedia = {
  id:string; productId?:string; vehicleVariantId?:string; sku:string; manufacturerBrand:string; manufacturerPartNumber:string;
  kind:string; provider:string; illustrationId:string; licenseId:string; viewAngle:string; displayApproved:boolean;
};
export type Fitment = NonNullable<Product['fitments']>[number];
export function yearMatches(f:Fitment,year:number) {
  return f.status==='VERIFIED' && !!f.vehicleId && !!f.sourceId && !!f.make && !!f.model &&
    Number.isInteger(year) && !!f.yearFrom && year>=f.yearFrom && year<=(f.yearTo??f.yearFrom);
}
export function reviewedSpins(product:Product, media:SpinMedia[]) {
  const groups=new Map<string,Map<string,SpinMedia>>();
  const results:{key:string; frames:SpinMedia[]; fitment:Fitment; year:number}[]=[];
  for(const m of media){
    if(!product.manufacturerPartNo || m.productId!==product.id || m.sku!==product.sku ||
      m.manufacturerBrand!==product.brand || m.manufacturerPartNumber!==product.manufacturerPartNo ||
      !m.displayApproved || m.kind!=='GENERIC_CATEGORY_ILLUSTRATION' || m.provider!==STL_PROVIDER ||
      !/^mesh-sha256:[a-f0-9]{64}:\d{4}$/.test(m.illustrationId))continue;
    const key=m.vehicleVariantId+'/'+m.licenseId+'/'+m.illustrationId, angles=groups.get(key)??new Map<string,SpinMedia>();
    if(!angles.has(m.viewAngle))angles.set(m.viewAngle,m);groups.set(key,angles);
  }
  for(const [key,angles] of groups){
    const frames=Array.from({length:FRAME_COUNT},(_,i)=>angles.get(String(i*360/FRAME_COUNT)));
    if(!frames.every((f):f is SpinMedia=>!!f))continue;
    const first=frames[0],year=Number(first.illustrationId.slice(-4));
    const fitment=product.fitments?.find(f=>f.vehicleId===first.vehicleVariantId && yearMatches(f,year));
    if(fitment)results.push({key,frames,year,fitment});
  }
  return results;
}
