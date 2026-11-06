import { readImportGrid } from './import-parser';
import { mapProductGrid } from './import-mapping';
import { mapOpeningGrid } from './opening-mapping';
self.onmessage = async (event: MessageEvent<{ buffer: ArrayBuffer; name: string; mode?: string }>) => {
  try {
    const grid = await readImportGrid(event.data.buffer, event.data.name);
    self.postMessage({ rows: event.data.mode === 'opening' ? mapOpeningGrid(grid) : mapProductGrid(grid) });
  } catch (e) {
    self.postMessage({ code: (e as Error).message });
  }
};
