import {useEffect,useMemo,useState} from 'react';
import {useApp} from './context';
import {ApiError} from './api';
import {CategoryName, Field} from './components';
import {drawMesh,FRAME_COUNT,MAX_STL_BYTES,parseStl,reviewedSpins,type SpinMedia,type Fitment} from './part-mesh';
import type {Product} from './types';
import {measuredProfile} from './measured-profile';

export async function renderPartFrames(file:File,product:Product,fitment:Fitment,year:number) {
  if(file.size>MAX_STL_BYTES || !/\.(stl|json)$/i.test(file.name))throw new ApiError('INVALID_FILE');
  const buffer=await file.arrayBuffer(),mesh=/\.json$/i.test(file.name)
    ? measuredProfile(new TextDecoder().decode(buffer),{sku:product.sku,manufacturerPartNumber:product.manufacturerPartNo!,vehicleId:fitment.vehicleId!,year})
    : parseStl(buffer);
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)),v=>v.toString(16).padStart(2,'0')).join('');
  const canvas=document.createElement('canvas'),scene=document.createElement('canvas');
  canvas.width=scene.width=680;canvas.height=520;scene.height=424;
  const files:File[]=[];
  for(let i=0;i<FRAME_COUNT;i++){
    drawMesh(scene,mesh,i*2*Math.PI/FRAME_COUNT);
    const ctx=canvas.getContext('2d')!;
    ctx.drawImage(scene,0,0);ctx.fillStyle='#243938';ctx.fillRect(0,scene.height,680,96);
    ctx.direction='ltr';ctx.textAlign='left';ctx.fillStyle='#fff9e8';ctx.font='bold 27px sans-serif';
    ctx.fillText([year,fitment.make,fitment.model,fitment.generation].filter(Boolean).join(' · '),18,460,644);
    ctx.fillStyle='#e4e9df';ctx.font='21px sans-serif';
    ctx.fillText([product.manufacturerPartNo,fitment.engine,product.sku,i*360/FRAME_COUNT+'°'].filter(Boolean).join(' · '),18,497,644);
    const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new ApiError('INVALID_FILE')),'image/png'));
    files.push(new File([blob],String(i*360/FRAME_COUNT)+'.png',{type:'image/png'}));
  }
  return {files,id:'mesh-sha256:'+digest+':'+year,angles:Object.fromEntries(files.map((_,i)=>[i,String(i*360/FRAME_COUNT)]))};
}

export function PartSpin({product,media,hasPhoto}:{product:Product;media:SpinMedia[];hasPhoto:boolean}){
  const {t}=useApp(),[playing,setPlaying]=useState(false),[step,setStep]=useState(0),[open,setOpen]=useState(false);
  const [chosen,setChosen]=useState(''),[failed,setFailed]=useState(false);
  const sets=useMemo(()=>reviewedSpins(product,media),[product,media]);
  const set=sets.find(s=>s.key===chosen)??sets[0];
  useEffect(()=>{setPlaying(false);setStep(0);setFailed(false);},[set?.key]);
  useEffect(()=>{
    if(!playing || !open || failed || !set)return;
    const pause=()=>setPlaying(false);
    const timer=window.setInterval(()=>setStep(i=>(i+1)%FRAME_COUNT),250);
    document.addEventListener('visibilitychange',pause);
    return ()=>{clearInterval(timer);document.removeEventListener('visibilitychange',pause);};
  },[playing,open,failed,set?.key]);
  if(!set){
    if(hasPhoto)return null;
    const part=product.manufacturerPartNo?.trim();
    const variants=(product.fitments??[]).filter(f=>f.status==='VERIFIED' && f.sourceId && f.vehicleId);
    const searches=variants.length ? variants : [undefined];
    const maker=product.brand.toLowerCase().replace(/[^a-z0-9]/g,''),number=part?.toUpperCase().replaceAll(' ','');
    const official=maker==='mannfilter' && number==='W75/3' ? 'https://www.mann-filter.com/fr-fr/catalogue/resultats-de-la-recherche/produit.html/w75/3_mann-filter.html'
      : maker==='skf' && number==='6203-2RSH' ? 'https://www.skf.com/lv/products/rolling-bearings/ball-bearings/deep-groove-ball-bearings/productid-6203-2RSH' : '';

    return <div className="small"><p>{t('needsSkuGeometry')}</p>{official && <p><a href={official} target="_blank" rel="noreferrer">{t('source')} · <bdi>{product.brand} {part}</bdi></a></p>}{part && searches.map(f=>{
      const vehicle=[f?.make,f?.model,f?.generation,f?.yearFrom,f?.yearTo,f?.engine].filter(Boolean).join(' ');
      const query=new URLSearchParams({q:[product.brand,'"'+part+'"',vehicle,'CAD 3D manufacturer'].filter(Boolean).join(' ')});
      return <p key={f?.vehicleId??'part'}><a href={'https://www.google.com/search?'+query} target="_blank" rel="noreferrer">
        {t('researchModel')} · <bdi>{part} {vehicle}</bdi></a></p>;
    })}</div>;
  }
  const f=set.fitment,current=set.frames[step], model=[f.make,f.model,f.generation,set.year,f.engine].filter(Boolean).join(' · ');
  return <details className="part-spin panel" open={open} onToggle={e=>{setOpen(e.currentTarget.open);if(!e.currentTarget.open)setPlaying(false);}}>
    <summary>{t('reviewedPartSpin')}</summary>
    {open && <>
      {sets.length>1 && <Field label={t('verifiedSpinVehicles')}><select value={set.key} onChange={e=>setChosen(e.target.value)}>
        {sets.map(s=><option key={s.key} value={s.key}>{[s.fitment.make,s.fitment.model,s.fitment.generation,s.year,s.fitment.engine].filter(Boolean).join(' · ')}</option>)}
      </select></Field>}
      <figure>
        {failed ? <p role="status">{t('IMAGE_UNAVAILABLE')}</p> : <img width="680" height="520" src={'/api/media/'+current.id+'?size=display'}
          alt={t('reviewedPartSpin')+' · '+model+' · '+product.sku} onError={()=>{setFailed(true);setPlaying(false);}}/>}
        <figcaption><strong><CategoryName product={product}/></strong> · <bdi>{product.brand} · {product.manufacturerPartNo} · {product.sku}</bdi>
          <p><bdi>{model}</bdi></p>
          <small>{[f.market,f.equipment,f.qualifiers,f.sourceName].filter(Boolean).join(' · ')}</small>
        </figcaption>
      </figure>
      {!failed && <div className="toolbar">
        <button type="button" className="button secondary" onClick={()=>{setPlaying(false);setStep(i=>(i+FRAME_COUNT-1)%FRAME_COUNT);}}>{t('rotateBack')}</button>
        <button type="button" className="button primary" aria-pressed={playing} onClick={()=>setPlaying(on=>!on)}>{t(playing?'pauseSpin':'playSpin')}</button>
        <button type="button" className="button secondary" onClick={()=>{setPlaying(false);setStep(i=>(i+1)%FRAME_COUNT);}}>{t('rotateNext')}</button>
      </div>}
    </>}
  </details>;
}
