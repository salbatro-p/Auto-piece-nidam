import {prepareMesh, type Mesh, type Point} from './part-mesh';

export const drawings = [
  {
    brand: 'febi', reference: '07215', title: 'copperDrainSeal', bore: 14, outer: 20, thickness: 1.5,
    application: 'https://classicparts.mbusa.com/v-2014-mercedes-benz-c250--base--1-8l-l4-gas/engine--engine-parts', applicationLabel: 'febiApplication',
    section: 'flat', color: '#e69a65',
    source: 'https://partsfinder.bilsteingroup.com/en/article/febi/07215',
  },
  {
    brand: 'BMW', reference: '11431740045', title: 'dipstickSeal', bore: 19.5, outer: 25.5, thickness: 3,
    applicationLabel: 'bmwApplication', section: 'round', color: '#747e80',
    source: 'https://parts.bmwofsouthatlanta.com/oem-parts/bmw-engine-oil-dipstick-tube-seal-11431740045',
    application: 'https://www.realoem.com/bmw/enUS/showparts?diagId=11_9918&id=EU33-USA-12-2004-E46-BMW-325xi',
  },
] as const;
export type Drawing = (typeof drawings)[number];

export function findDrawing(brand: string, part?: string | null) {
  const maker = brand.trim().toLowerCase();
  return drawings.find(drawing => {
    const knownBrand = maker === drawing.brand.toLowerCase() || (drawing.brand === 'febi' && maker === 'febi bilstein');
    const number = drawing.brand === 'BMW' ? part?.trim().replace(/[\s-]/g, '') : part?.trim();
    return knownBrand && number === drawing.reference;
  });
}

// Original axial sections in millimetres. Revolve each one through a full turn.
export function nominalMesh(drawing: Drawing): Mesh {
  const inner = drawing.bore / 2, outer = drawing.outer / 2, half = drawing.thickness / 2;
  const profile = drawing.section === 'flat'
    ? [[inner, -half], [outer, -half], [outer, half], [inner, half]]
    : Array.from({length: 24}, (_, i) => {
        const angle = i * 2 * Math.PI / 24;
        return [(inner + outer) / 2 + half * Math.cos(angle), half * Math.sin(angle)];
      });
  const faces: Mesh = [];
  const point = ([r, y]: number[], i: number): Point => {
    const angle = 2 * Math.PI * i / 96;
    return [r * Math.cos(angle), y, r * Math.sin(angle)];
  };
  for (let j = 0; j < profile.length; j++) {
    const start = profile[j], end = profile[(j + 1) % profile.length];
    for (let i = 0; i < 96; i++) {
      const a = point(start, i), b = point(start, i + 1), c = point(end, i + 1), d = point(end, i);
      faces.push({points: [a,b,c], color: drawing.color}, {points: [a,c,d], color: drawing.color});
    }
  }
  return faces;
}
export function displayMesh(drawing: Drawing) { return prepareMesh(nominalMesh(drawing)); }
