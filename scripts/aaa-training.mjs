import {readFile, mkdir,writeFile} from 'node:fs/promises';
import {parse} from 'csv-parse/sync';
import {pathToFileURL} from 'node:url';
import {resolve,join} from 'node:path';

// Deterministic fictional counter references. No OEM, compatibility or vehicle-year claims.
export async function trainingRows() {
  const categories=parse(await readFile(new URL('../samples/merchandise-types.csv',import.meta.url)),{columns:true,bom:true,skip_empty_lines:true});
  const rows=[];
  for(const [i,c] of categories.entries()){
    for(let v=1;v<=24;v++){
      const code=String(i+1).padStart(3,'0')+'-'+String(v).padStart(2,'0');
      rows.push({sku:'AAA-QA-'+code,barcode:'QA'+code.replace('-',''),brand:'AAA TRAINING',category:c.category,
        names:{ar:c.category_ar+' · '+v,fr:c.category_fr+' · '+v,en:c.category_en+' · '+v},
        categoryNames:{ar:c.category_ar,fr:c.category_fr,en:c.category_en},
        priceMinor:500+(i*241+v*73)%80000,costMinor:250+(i*97+v*31)%30000,
        quantity:1+(i*17+v*9)%120,warehouse:v%2?'MAIN':'DEP',bin:'QA-'+String(1+i%12).padStart(2,'0')});
    }
  }
  return rows;
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const directory=process.argv[2];if(!directory)throw Error('Supply a new directory for the training files');
  const rows=await trainingRows();await mkdir(directory,{recursive:false});
  const columns=['sku','barcode','brand','category','name_ar','name_fr','name_en','price_mad','cost_mad','warehouse','bin','quantity'];
  const csv=rows.map(r=>[r.sku,r.barcode,r.brand,r.category,r.names.ar,r.names.fr,r.names.en,(r.priceMinor/100).toFixed(2),(r.costMinor/100).toFixed(2),r.warehouse,r.bin,r.quantity]);
  await writeFile(join(directory,'AAA-training.csv'),'\uFEFF'+[columns,...csv].map(r=>r.map(x=>'"'+String(x).replaceAll('"','""')+'"').join(',')).join('\r\n')+'\r\n',{flag:'wx'});
  console.log(rows.length+' training references.');
}
