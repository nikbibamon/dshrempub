"use strict";
const PALETTES = {blue:['Blue','Синий','#2563eb','#60a5fa'],violet:['Violet','Фиолетовый','#7c3aed','#c4b5fd'],teal:['Teal','Бирюзовый','#0f766e','#5eead4'],amber:['Amber','Янтарный','#b45309','#fbbf24'],mono:['Graphite','Графит','#334155','#cbd5e1'],spectrum:['Spectrum','Спектр','#087f8c','#67e8f9']};
const PALETTE_CSS=Object.entries(PALETTES).map(([key,v])=>`body[data-palette="${key}"]{--accent:${v[3]};--palette-button:${v[0]==='Graphite'?'#334155':v[2]};--palette-on:#fff}body.vscode-light[data-palette="${key}"],body[data-theme="light"][data-palette="${key}"]{--accent:${v[2]}}`).join('\n')+Object.entries(PALETTES).map(([key,v])=>`.palette-swatch[data-palette-choice="${key}"]{--swatch:linear-gradient(135deg,${v[2]} 50%,${v[3]} 50%)}`).join('\n')+`
body[data-palette="spectrum"]{--palette-button:linear-gradient(120deg,#2563eb,#0f766e,#7c3aed)}
.palette-picker{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:8px 0}.palette-swatch{width:30px;height:30px;min-width:30px;border-radius:50%;padding:5px;border:1px solid var(--border,#64748b);background:transparent}.palette-swatch::before{content:"";display:block;width:18px;height:18px;border-radius:50%;background:var(--swatch)}.palette-swatch[aria-pressed="true"]{outline:2px solid var(--accent);outline-offset:2px}.palette-swatch:focus-visible{outline:3px solid var(--accent)}
body.vscode-high-contrast,body.vscode-high-contrast-light{--accent:var(--vscode-focusBorder);--palette-button:var(--vscode-button-background);--palette-on:var(--vscode-button-foreground)}
`;
module.exports={PALETTES,PALETTE_CSS};
