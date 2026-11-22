import {useEffect, useMemo, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {Box, ExternalLink, SlidersHorizontal} from 'lucide-react';
import {Modal} from './components';
import {useApp} from './context';
import {drawMesh} from './part-mesh';
import {drawings, displayMesh, type Drawing} from './reference-drawings';
import './reference-studio.css';

const views = [{key:'viewOblique',angle:32},{key:'viewTop',angle:90},{key:'viewEdge',angle:0}] as const;

export function ReferenceDrawing({drawing}: {drawing: Drawing}) {
  const {t, locale} = useApp();
  const [tilt,setTilt] = useState(32);
  const [dimension,setDimension] = useState<'drawingBore'|'drawingOuter'|'drawingThickness'>();
  function changeView(angle:number){setDimension(undefined);setTilt(angle);}
  const [error,setError] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{id:number; y:number; tilt:number} | null>(null);
  const mesh = useMemo(() => displayMesh(drawing), [drawing]);
  const units = new Intl.NumberFormat(locale,{style:'unit',unit:'millimeter',unitDisplay:'short'});
  useEffect(() => {
    const target = canvas.current;
    if (!target) return;
    try {drawMesh(target, mesh, .2, {
      tilt:tilt*Math.PI/180, heightRatio:drawing.thickness/drawing.outer,
      dimension:dimension && {ratio:dimension==='drawingThickness' ? drawing.thickness/drawing.outer :
        dimension==='drawingBore' ? drawing.bore/drawing.outer : 1, vertical:dimension==='drawingThickness'}
    }); setError(false);}
    catch {setError(true);}
  },[mesh,tilt,drawing,dimension]);
  const caption = t(drawing.title) + ' · ' + drawing.brand + ' ' + drawing.reference;
  return <section className="reference-drawing" aria-label={caption}>
    <div className="drawing-stage">
      <div className="drawing-id"><Box size={15} aria-hidden="true"/><bdi>{drawing.brand} · {drawing.reference}</bdi></div>
      <canvas ref={canvas} width={720} height={350} role="img" aria-label={caption}
        onPointerDown={e=>{if(e.button!==0 || !e.isPrimary)return;drag.current={id:e.pointerId,y:e.clientY,tilt};e.currentTarget.setPointerCapture(e.pointerId);}}
        onPointerMove={e=>{const start=drag.current;if(start?.id===e.pointerId)changeView(Math.max(0,Math.min(90,Math.round(start.tilt+(start.y-e.clientY)*.6))));}}
        onLostPointerCapture={()=>{drag.current=null;}} />
      {error && <p role="status">{t('IMAGE_UNAVAILABLE')}</p>}
      <span className="drawing-angle" dir="ltr">{new Intl.NumberFormat(locale).format(tilt)}°</span>
    </div>
    <div className="drawing-body">
      <h3>{t(drawing.title)}</h3>
      <div className="drawing-views" role="group" aria-label={t('drawingAngle')}>
        {views.map(v=><button type="button" key={v.key} aria-pressed={tilt===v.angle}
          onClick={()=>changeView(v.angle)}>{t(v.key)}</button>)}
      </div>
      <label className="drawing-slider"><SlidersHorizontal aria-hidden="true" size={16}/><span>{t('drawingAngle')}</span>
        <input type="range" min="0" max="90" value={tilt} onChange={e=>changeView(Number(e.target.value))} /></label>
      <div className="drawing-sizes" role="group" aria-label={t('drawingMeasures')}>{([['drawingBore',drawing.bore],['drawingOuter',drawing.outer],['drawingThickness',drawing.thickness]] as const).map(([key,value])=>
        <button key={key} type="button" aria-pressed={dimension===key} onClick={()=>{setTilt(key==='drawingThickness'?0:90);setDimension(key);}}>
          <span>{t(key)}</span><strong>{units.format(value)}</strong></button>)}</div>
      <p className="drawing-source">{t('drawingNominal')} <a href={drawing.source} target="_blank" rel="noreferrer">{t('drawingSource')} <ExternalLink size={13} aria-hidden="true"/></a></p>
      <a href={drawing.application} target="_blank" rel="noreferrer">{t(drawing.applicationLabel)}{drawing.brand==='febi' && <> · <bdi dir="ltr">OE 007603-014106</bdi></>}</a>
    </div>
  </section>;
}

export function ReferenceStudio() {
  const {t} = useApp(), [open,setOpen] = useState(false);
  const [chosen,setChosen] = useState<Drawing>(drawings[0]);
  return <><button className="button secondary" type="button" onClick={()=>setOpen(true)}>
    <Box size={17} aria-hidden="true"/>{t('partStudio')}</button>
    {open && createPortal(<Modal title={t('partStudio')} onClose={()=>setOpen(false)}>
      <label className="field drawing-selection"><span>{t('drawingReference')}</span>
        <select value={chosen.reference} onChange={e=>setChosen(drawings.find(d=>d.reference===e.target.value)!)}>
          {drawings.map(d=><option key={d.reference} value={d.reference}>{d.brand} {d.reference} · {t(d.title)}</option>)}
        </select></label>
      <ReferenceDrawing key={chosen.reference} drawing={chosen}/>
    </Modal>,document.body)}
  </>;
}
