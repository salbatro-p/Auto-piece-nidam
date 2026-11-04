import {readImportGrid} from './import-parser';
self.onmessage=async(event:MessageEvent<{buffer:ArrayBuffer;name:string}>)=>{try{const grid=await readImportGrid(event.data.buffer,event.data.name);self.postMessage({grid});}catch(e){self.postMessage({code:(e as Error).message});}};
