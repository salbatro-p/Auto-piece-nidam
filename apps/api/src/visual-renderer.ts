import sharp from 'sharp';

export const visualKinds = ['CATEGORY_3D', 'SYSTEM_DIAGRAM'] as const;
export type VisualKind = typeof visualKinds[number];
export const visualTemplates = ['OIL_FILTER', 'DISC_BRAKE'] as const;
export type VisualTemplate = typeof visualTemplates[number];
export const localRenderer = 'local-procedural';
export const templateVersion = 1;

export interface VisualProvider {
  render(input: { template: VisualTemplate; kind: VisualKind; requestId: string }): Promise<Buffer>;
}

const oilFilter = `
  <ellipse cx="488" cy="423" rx="230" ry="40" fill="#17283d" opacity=".19"/>
  <path d="M352 337l213 58c57 15 118-39 139-119 23-84-3-164-60-179l-213-58z" fill="url(#blue)" stroke="#214863" stroke-width="4"/>
  <path d="M477 93l165 43c24 7 34 27 41 49l-183-46z" fill="#cee2eb" opacity=".35"/>
  <g transform="translate(389 194) rotate(16)">
    <ellipse rx="113" ry="155" fill="url(#steel)" stroke="#1f3344" stroke-width="5"/>
    <ellipse rx="98" ry="138" fill="#35434e" stroke="#d6e0e4" stroke-width="7"/>
    <ellipse rx="81" ry="120" fill="url(#steel)"/>
    <ellipse rx="31" ry="46" fill="#203144" stroke="#8298a8" stroke-width="8"/>
    <ellipse rx="20" ry="34" fill="#111c28"/>
  </g>`;

const brakes = `
  <ellipse cx="485" cy="422" rx="242" ry="42" fill="#17283d" opacity=".18"/>
  <g transform="translate(472 240) rotate(-22)">
    <ellipse cx="22" cy="12" rx="176" ry="185" fill="#586778" stroke="#324457" stroke-width="5"/>
    <ellipse rx="174" ry="185" fill="url(#steel)" stroke="#65788b" stroke-width="4"/>
    <ellipse rx="151" ry="158" fill="none" stroke="#eef2f5" stroke-width="2" opacity=".75"/>
    <ellipse rx="102" ry="108" fill="#566775" stroke="#eef4f6" stroke-width="4"/>
    <ellipse rx="53" ry="55" fill="#233445" stroke="#a2b2bf" stroke-width="6"/>
  </g>
  <path d="M592 93c48-15 88-2 114 30l39 76c8 20 6 47-12 64l-33 31-47-33 20-44-43-78-54 2z" fill="url(#blue)" stroke="#183f56" stroke-width="5"/>
  <path d="M598 100c46-10 79 1 106 31l38 72" fill="none" stroke="#b4dcea" stroke-width="8" opacity=".55"/>`;

function diagram(template: VisualTemplate) {
  const blocks = template === 'OIL_FILTER'
    ? '<path d="M300 189h460v205H300z M530 390V195" fill="none" stroke="#5a9dab" stroke-width="5" stroke-dasharray="13 9"/>'
    : '<path d="M300 193h460v200H300z M530 390V195 M530 293H760" fill="none" stroke="#5a9dab" stroke-width="5" stroke-dasharray="13 9"/>';
  return `
    ${blocks}
    <rect x="75" y="140" width="225" height="105" rx="16" fill="#edf3f6" stroke="#3f6075" stroke-width="4"/>
    <rect x="760" y="140" width="225" height="105" rx="16" fill="#edf3f6" stroke="#3f6075" stroke-width="4"/>
    <rect x="75" y="340" width="225" height="105" rx="16" fill="#edf3f6" stroke="#3f6075" stroke-width="4"/>
    <rect x="760" y="340" width="225" height="105" rx="16" fill="#edf3f6" stroke="#3f6075" stroke-width="4"/>
    <circle cx="530" cy="290" r="88" fill="#c8e5e8" stroke="#397a8a" stroke-width="5"/>
    <g font-family="Arial,sans-serif" font-weight="700" font-size="35" fill="#173449" text-anchor="middle">
      <text x="187" y="205">1</text><text x="872" y="205">2</text>
      <text x="187" y="405">3</text><text x="872" y="405">4</text><text x="530" y="302">5</text>
    </g>`;
}

// Original geometric templates with no brand, part-reference or vehicle-model geometry.
export const proceduralProvider: VisualProvider = {
  async render({ template, kind }) {
    const shapes = kind === 'SYSTEM_DIAGRAM' ? diagram(template) : template === 'OIL_FILTER' ? oilFilter : brakes;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1060" height="570" viewBox="0 0 1060 570">
      <defs>
        <linearGradient id="blue" x2="0%" y2="100%"><stop stop-color="#123c54"/><stop offset=".42" stop-color="#5494ae"/><stop offset="1" stop-color="#163249"/></linearGradient>
        <linearGradient id="steel" x2="100%" y2="94%"><stop stop-color="#f5f8fa"/><stop offset=".43" stop-color="#9eafb9"/><stop offset=".7" stop-color="#e1e8ea"/><stop offset="1" stop-color="#6d8190"/></linearGradient>
        <radialGradient id="back"><stop stop-color="#fff"/><stop offset="1" stop-color="#e8eef0"/></radialGradient>
      </defs>
      <rect width="1060" height="570" fill="url(#back)"/>
      <g transform="translate(0 35)">${shapes}</g>
    </svg>`;
    return sharp(Buffer.from(svg)).png().toBuffer();
  },
};
