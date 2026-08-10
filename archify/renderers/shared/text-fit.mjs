import { textUnits } from './utils.mjs';

// Node labels are single-line, centered SVG text. These shared constants match
// the existing workflow renderer's fitting geometry: estimate monospace glyph
// advance, reserve a small inset, shrink only to a legible per-field floor.
const WIDTH_FACTOR = 0.6;
const HORIZONTAL_PADDING = 8;

export function availableNodeTextWidth(width) {
  return width - HORIZONTAL_PADDING;
}

export function fittedNodeFontSize(text, width, preferred, minimum) {
  const units = Math.max(1, textUnits(text));
  const available = Math.max(1, availableNodeTextWidth(width));
  const fitted = Math.min(preferred, available / (units * WIDTH_FACTOR));
  return Math.max(minimum, Math.floor(fitted * 10) / 10);
}

// Validation uses the same geometry as rendering so a green result guarantees
// that the fitted text can stay inside the node without dropping below the
// renderer's legibility floor.
export function minimumNodeTextWidth(text, minimum) {
  return textUnits(text) * minimum * WIDTH_FACTOR;
}
