import test from 'node:test';
import assert from 'node:assert/strict';
import {drawings,findDrawing,nominalMesh} from '../apps/business/src/reference-drawings';

test('Both original meshes reproduce the specified bore, outside diameter and axial thickness',()=>{
  for(const [part,bore,outer,height] of [[drawings[0],14,20,1.5],[drawings[1],19.5,25.5,3]] as const){
    const vertices=nominalMesh(part).flatMap(face=>face.points);
    const r=vertices.map(([x,,z])=>Math.hypot(x,z)), y=vertices.map(p=>p[1]);
    assert.ok(Math.abs(2*Math.min(...r)-bore)<1e-8);
    assert.ok(Math.abs(2*Math.max(...r)-outer)<1e-8);
    assert.equal(Math.max(...y)-Math.min(...y),height);
  }
  assert.equal(findDrawing('febi bilstein','07215'),drawings[0]);
  assert.equal(findDrawing('BMW','11 43 1 740 045'),drawings[1]);
  for(const [brand,mpn] of [['febi','7215'],['anonymous','07215'],['BMW','07215'],['febi','N 013 849 2']])
    assert.equal(findDrawing(brand,mpn),undefined);
});
