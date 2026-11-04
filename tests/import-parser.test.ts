import {test} from 'node:test';
import assert from 'node:assert/strict';
import {zipSync,strToU8} from 'fflate';
import {csvRows,readImportGrid} from '../apps/business/src/import-parser.js';
function workbook(cell:string){
 const files:Record<string,string>={
  '[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/></Types>',
  '_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  'xl/workbook.xml':'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Parts" sheetId="1" r:id="rId1"/></sheets></workbook>',
  'xl/_rels/workbook.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
  'xl/worksheets/sheet1.xml':`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>sku</t></is></c></row><row r="2">${cell}</row></sheetData></worksheet>`,
 };
 const zipped=zipSync(Object.fromEntries(Object.entries(files).map(([k,v])=>[k,strToU8(v)])));return zipped.buffer.slice(zipped.byteOffset,zipped.byteOffset+zipped.byteLength) as ArrayBuffer;
}
test('Import parser preserves mixed-script exact text and rejects formulas, numeric identifiers and archive expansion abuse',async()=>{
 const valid=workbook('<c r="A2" t="inlineStr"><is><t>00012-OEM/ع</t></is></c>');assert.equal((await readImportGrid(valid,'parts.xlsx'))[1]![0],'00012-OEM/ع');
 await assert.rejects(readImportGrid(workbook('<c r="A2"><f>1+1</f><v>2</v></c>'),'parts.xlsx'),/FORMULA_REJECTED/);
 await assert.rejects(readImportGrid(workbook('<c r="A2"><v>123</v></c>'),'parts.xlsx'),/IDENTIFIER_TEXT_REQUIRED/);
 const bomb=workbook('<c r="A2" t="inlineStr"><is><t>SAFE</t></is></c>'),view=new DataView(bomb);for(let i=0;i<view.byteLength-28;i++){if(view.getUint32(i,true)===0x02014b50){view.setUint32(i+24,129_000_000,true);break;}}
 await assert.rejects(readImportGrid(bomb,'parts.xlsx'),/PAYLOAD_TOO_LARGE/);
 assert.deepEqual(csvRows('sku,name_en\r\n"00-A","Part, with \"\"quotes\"\""'),[['sku','name_en'],['00-A','Part, with "quotes"']]);assert.throws(()=>csvRows('sku\n"unclosed'),/IMPORT_INVALID/);
});
