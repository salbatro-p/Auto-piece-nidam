import { merchandiseTypeByCode } from '../../../packages/contracts/src/assortment';
import type { TypeNames } from '../../../packages/contracts/src/assortment-data';
import { Field } from './components';
import { useApp } from './context';
import { AttributeEditor } from './technical-attributes';
import type { TechnicalAttribute } from './types';

const labelFields = {
  pack: { en:'Pack capacity or weight', fr:'Contenance ou poids du conditionnement', ar:'سعة العبوة أو وزنها' },
  spec: { en:'Specification printed on the label', fr:'Spécification inscrite sur l’étiquette', ar:'المواصفة المكتوبة على العبوة' },
  sae: { en:'Viscosity grade', fr:'Grade de viscosité', ar:'درجة اللزوجة' },
  base: { en:'Base oil type', fr:'Type d’huile de base', ar:'نوع الزيت الأساسي' },
  nlgi: { en:'NLGI consistency grade', fr:'Grade de consistance NLGI', ar:'درجة قوام الشحم NLGI' },
  thickener: { en:'Grease thickener', fr:'Épaississant de la graisse', ar:'نوع مثخّن الشحم' },
  formula: { en:'Coolant technology', fr:'Technologie du liquide', ar:'تقنية سائل التبريد' },
  dilution: { en:'Concentration as sold', fr:'Concentration à la vente', ar:'التركيز عند البيع' },
} satisfies Record<string, TypeNames>;
type LabelField = keyof typeof labelFields;
const oilFields: LabelField[] = ['pack','sae','base','spec'];
const greaseFields: LabelField[] = ['pack','nlgi','thickener','spec'];
const coolantFields: LabelField[] = ['pack','formula','dilution','spec'];
const serviceFields: LabelField[] = ['pack','spec'];

function fieldsFor(category: string): LabelField[] {
  const group = merchandiseTypeByCode(category)?.group;
  if (group === 'MOTOR_OILS' || group === 'DRIVE_FLUIDS' || category === 'FLUID_ENGINE_OIL' || category === 'DRIVE_TRANSMISSION_FLUID') return oilFields;
  if (group === 'GREASES' || category === 'FLUIDS_GREASE') return greaseFields;
  if ((group === 'COOLANT_SHELF' && !['COOLANT_SHELF_TEST','COOLANT_SHELF_FLUSH','COOLANT_SHELF_WATER'].includes(category)) || category === 'COOL_COOLANT') return coolantFields;
  if (group === 'SERVICE_FLUIDS' || group === 'FLUIDS' || category === 'BRAKE_FLUID') return serviceFields;
  return [];
}

export function RetailAttributeEditor({ category, value, onChange }: {
  category:string; value:TechnicalAttribute[]; onChange:(next:TechnicalAttribute[]) => void;
}) {
  const {t,locale} = useApp();
  const fields = fieldsFor(category);
  if (!fields.length) return <AttributeEditor value={value} onChange={onChange}/>;
  const reserved = new Set(fields.map(key => 'retail_'+key));
  const labelAttrs = value.filter(row => reserved.has(row.code));
  const others = value.filter(row => !reserved.has(row.code));
  function update(key: LabelField, text: string) {
    const code = 'retail_'+key;
    const current = value.find(row => row.code === code);
    if (current) {
      onChange(text ? value.map(row => row===current ? {...row,value:text} : row) : value.filter(row=>row!==current));
    } else if (text && value.length < 50) {
      onChange([...value,{code,labels:{...labelFields[key]},value:text,unit:''}]);
    }
  }
  return <>
    <fieldset><legend>{t('packLabelDetails')}</legend>
      <div className="form-grid">{fields.map(key => {
        const current = labelAttrs.find(row => row.code==='retail_'+key);
        return <Field key={key} label={labelFields[key][locale]}><input dir="auto" maxLength={200}
          disabled={!current && value.length>=50} value={current?.value ?? ''}
          onChange={e=>update(key,e.target.value)}/></Field>;
      })}</div>
    </fieldset>
    <AttributeEditor value={others} max={50-labelAttrs.length} onChange={rows=>onChange([...labelAttrs,...rows])}/>
  </>;
}
