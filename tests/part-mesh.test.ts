import test from 'node:test';
import assert from 'node:assert/strict';
import {parseStl,STL_PROVIDER,FRAME_COUNT} from '../apps/business/src/part-mesh';
import {reviewedSpins,type SpinMedia} from '../apps/business/src/part-mesh';
import type {Product} from '../apps/business/src/types';

test('STL reads binary and ASCII faces, normalizes uniformly and rejects malformed geometry',()=>{
 const ascii=new TextEncoder().encode('solid wedge\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 2 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid wedge').buffer;
 const binary=new ArrayBuffer(134),v=new DataView(binary);v.setUint32(80,1,true);v.setFloat32(108,2,true);v.setFloat32(124,1,true);
 assert.deepEqual(parseStl(ascii),parseStl(binary));
 assert.deepEqual(parseStl(ascii)[0].points,[[-.5,-.25,0],[.5,-.25,0],[-.5,.25,0]]);
 v.setFloat32(108,NaN,true);assert.throws(()=>parseStl(binary));assert.throws(()=>parseStl(new ArrayBuffer(20)));
});
test('SKU turntables require every approved angle of one current identity, rights record and geometry digest',()=>{
 const product={id:'p',sku:'s',brand:'b',manufacturerPartNo:'m',fitments:[{status:'VERIFIED',sourceId:'e',vehicleId:'v',make:'Test',model:'City',yearFrom:2014,yearTo:2018}]} as Product;
 const rows:SpinMedia[]=Array.from({length:FRAME_COUNT},(_,i)=>({id:String(i),productId:'p',vehicleVariantId:'v',sku:'s',manufacturerBrand:'b',manufacturerPartNumber:'m',kind:'GENERIC_CATEGORY_ILLUSTRATION',provider:STL_PROVIDER,illustrationId:'mesh-sha256:'+'a'.repeat(64)+':2016',licenseId:'l',viewAngle:String(i*30),displayApproved:true}));
 assert.equal(reviewedSpins(product,[...rows].reverse())[0].frames.length,12);
 for(const override of [{displayApproved:false},{sku:'x'},{productId:'q'},{vehicleVariantId:'other'},{manufacturerPartNumber:'x'},{licenseId:'other'},{illustrationId:'mesh-sha256:'+'b'.repeat(64)+':2016'},{viewAngle:'30'}])assert.equal(reviewedSpins(product,[{...rows[0],...override},...rows.slice(1)]).length,0);
 assert.equal(reviewedSpins(product,rows.map(m=>({...m,illustrationId:m.illustrationId.replace('2016','2019')}))).length,0);
 assert.equal(reviewedSpins({...product,fitments:[]},rows).length,0);
});

test('Measured profiles reject other years, other references and crossing contours',async()=>{
 const {measuredProfile}=await import('../apps/business/src/measured-profile');
 const id={sku:'A',manufacturerPartNumber:'B',vehicleId:'C',year:2016};
 const spec={...id,kind:'measured-revolution-v1',unit:'mm',axisymmetric:true,profile:[[10,0],[20,0],[20,5],[10,5]]};
 assert.ok(measuredProfile(JSON.stringify(spec),id).length>100);
 for(const patch of [{year:2015},{manufacturerPartNumber:'other'},{axisymmetric:false},{unit:'inch'},{profile:[[0,0],[4,4],[0,4],[4,0]]}])
    assert.throws(()=>measuredProfile(JSON.stringify({...spec,...patch}),id));
});
