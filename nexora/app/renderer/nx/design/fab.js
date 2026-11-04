// NEXORA #011 : accès aux classes de Fabric.js (même instance que NEX-DESIGN).
import { A as Group, B as util, E as Canvas, I as Path, O as Line, Q as Ellipse, S as Polygon, V as Textbox, Y as ActiveSelection, ca as FabricImage, ia as filters, l as Point, q as Shadow, v as FabricObject, w as Rect, i as classRegistry, ea as loadSVGFromString } from '../../dist/chunks/chunk-S2TRS7K5.js';

export { Group, util, Canvas, Path, Line, Ellipse, Polygon, Textbox, ActiveSelection, FabricImage, filters, Point, Shadow, FabricObject, Rect, classRegistry, loadSVGFromString };
export const Gradient = classRegistry.getClass('gradient');
export const Pattern = classRegistry.getClass('pattern');
export const IText = classRegistry.getClass('IText');

// Propriétés ajoutées par NEXORA #011, enregistrées avec chaque calque (copie, annulation, cloud, .nexd).
export const NX_PROPS = ['nxFx', 'nxAdj', 'nxMask', 'nxAnim', 'nxComp', 'nxLink', 'nxChart', 'nxTable', 'nxQr', 'nxFrame', 'nxRepeat', 'nxPattern', 'nxStyle', 'nxOrig', 'nxCurve', 'nxArrows', 'nxKind'];
for (const p of NX_PROPS) if (!FabricObject.customProperties.includes(p)) FabricObject.customProperties.push(p);

// Matrice (Fabric) vers point.
export const apply = (m, x, y) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });
export const invert = (m) => util.invertTransform(m);
export const multiply = (a, b) => util.multiplyTransformMatrices(a, b);
