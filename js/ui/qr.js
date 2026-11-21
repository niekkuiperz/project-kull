// Tekent een QR-code als SVG (voor het koppelen van de authenticator-app).
import { QRCode, QRErrorCorrectLevel } from '../vendor/qrcode.js';

export function qrSvg(tekst, { grootte = 220 } = {}) {
  const qr = new QRCode(-1, QRErrorCorrectLevel.M);
  qr.addData(tekst);
  qr.make();
  const n = qr.getModuleCount();
  const rand = 4;
  const totaal = n + 2 * rand;
  let pad = '';
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) {
      if (qr.isDark(r, c)) pad += `M${c + rand},${r + rand}h1v1h-1z`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totaal} ${totaal}" width="${grootte}" height="${grootte}" shape-rendering="crispEdges" role="img" aria-label="QR-code"><rect width="100%" height="100%" fill="#fff"/><path d="${pad}" fill="#000"/></svg>`;
}
