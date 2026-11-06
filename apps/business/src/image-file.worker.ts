import { ImageArchive, type ImageManifestRow } from './image-manifest';
let archive: ImageArchive,
  rows: ImageManifestRow[] = [];
self.onmessage = async (event: MessageEvent) => {
  const { id, type, ...args } = event.data;
  try {
    if (type === 'open') {
      archive = new ImageArchive(args.archive);
      const result = await archive.manifest(args.license, args.external);
      rows = result.rows;
      self.postMessage({ id, ...result });
    } else if (type === 'file')
      self.postMessage({ id, row: { ...rows[args.index], ...archive.file(rows[args.index]) } });
  } catch (err) {
    self.postMessage({ id, error: err instanceof Error ? err.message : 'IMPORT_INVALID' });
  }
};
