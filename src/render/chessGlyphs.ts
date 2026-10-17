// Chess piece silhouettes, drawn with canvas paths (no font: system chess glyphs differ per device
// and iOS may draw ♟ as an emoji). White on transparent; materials tint them.

/** Draw one piece (type 1 pawn … 6 king) filling a `size` square. */
export function drawGlyph(
  g: CanvasRenderingContext2D,
  type: number,
  x: number,
  y: number,
  size: number,
): void {
  g.save();
  g.translate(x, y);
  g.scale(size / 100, size / 100);
  g.fillStyle = '#fff';
  g.strokeStyle = '#fff';
  g.lineJoin = 'round';
  g.lineCap = 'round';
  const base = () => {
    g.beginPath();
    g.roundRect(24, 80, 52, 10, 4);
    g.fill();
  };
  const body = (topW: number, topY: number) => {
    g.beginPath();
    g.moveTo(32, 80);
    g.quadraticCurveTo(38, (80 + topY) / 2, 50 - topW / 2, topY);
    g.lineTo(50 + topW / 2, topY);
    g.quadraticCurveTo(62, (80 + topY) / 2, 68, 80);
    g.closePath();
    g.fill();
  };
  const collar = (yc: number, w: number) => {
    g.beginPath();
    g.roundRect(50 - w / 2, yc - 3.5, w, 7, 3.5);
    g.fill();
  };
  switch (type) {
    case 1: // pawn
      base();
      body(14, 52);
      collar(50, 30);
      g.beginPath();
      g.arc(50, 34, 13, 0, Math.PI * 2);
      g.fill();
      break;
    case 2: {
      // knight: a horse head facing left
      base();
      g.beginPath();
      g.moveTo(30, 80);
      g.lineTo(34, 62);
      g.quadraticCurveTo(40, 52, 48, 48);
      g.lineTo(38, 48);
      g.quadraticCurveTo(30, 54, 24, 52);
      g.quadraticCurveTo(16, 48, 20, 40);
      g.lineTo(36, 24);
      g.lineTo(40, 12);
      g.lineTo(47, 19);
      g.quadraticCurveTo(66, 20, 72, 42);
      g.quadraticCurveTo(76, 62, 70, 80);
      g.closePath();
      g.fill();
      // eye
      g.globalCompositeOperation = 'destination-out';
      g.beginPath();
      g.arc(42, 32, 3.6, 0, Math.PI * 2);
      g.fill();
      g.globalCompositeOperation = 'source-over';
      break;
    }
    case 3: // bishop: mitre with a slit
      base();
      body(16, 56);
      collar(56, 32);
      g.beginPath();
      g.ellipse(50, 38, 14, 18, 0, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.arc(50, 15, 5.5, 0, Math.PI * 2);
      g.fill();
      g.globalCompositeOperation = 'destination-out';
      g.lineWidth = 4.5;
      g.beginPath();
      g.moveTo(44, 42);
      g.lineTo(57, 29);
      g.stroke();
      g.globalCompositeOperation = 'source-over';
      break;
    case 4: // rook: tower with battlements
      base();
      g.beginPath();
      g.moveTo(32, 80);
      g.lineTo(36, 40);
      g.lineTo(64, 40);
      g.lineTo(68, 80);
      g.closePath();
      g.fill();
      g.beginPath();
      g.roundRect(28, 30, 44, 12, 2);
      g.fill();
      for (const bx of [28, 44.5, 61]) {
        g.beginPath();
        g.rect(bx, 18, 11, 13);
        g.fill();
      }
      break;
    case 5: // queen: crown of five points with balls
      base();
      body(30, 50);
      collar(50, 40);
      g.beginPath();
      g.moveTo(28, 48);
      g.lineTo(22, 22);
      g.lineTo(36, 38);
      g.lineTo(42, 16);
      g.lineTo(50, 36);
      g.lineTo(58, 16);
      g.lineTo(64, 38);
      g.lineTo(78, 22);
      g.lineTo(72, 48);
      g.closePath();
      g.fill();
      for (const [bx, by] of [
        [22, 19],
        [42, 13],
        [58, 13],
        [78, 19],
      ] as const) {
        g.beginPath();
        g.arc(bx, by, 4.5, 0, Math.PI * 2);
        g.fill();
      }
      break;
    default: // king: crown with a cross
      base();
      body(30, 50);
      collar(50, 40);
      g.beginPath();
      g.moveTo(30, 48);
      g.quadraticCurveTo(18, 30, 34, 26);
      g.quadraticCurveTo(44, 26, 50, 36);
      g.quadraticCurveTo(56, 26, 66, 26);
      g.quadraticCurveTo(82, 30, 70, 48);
      g.closePath();
      g.fill();
      g.beginPath();
      g.roundRect(46.5, 4, 7, 28, 2);
      g.fill();
      g.beginPath();
      g.roundRect(40, 11, 20, 7, 2);
      g.fill();
  }
  g.restore();
}

/** All six pieces side by side (pawn … king), `cell` px each. */
export function glyphAtlas(cell = 256): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = cell * 6;
  c.height = cell;
  const g = c.getContext('2d');
  if (!g) return c;
  const pad = cell * 0.06;
  for (let t = 1; t <= 6; t++) drawGlyph(g, t, (t - 1) * cell + pad, pad, cell - pad * 2);
  return c;
}

/** One piece as an image URL (for the promotion buttons), in the given colour. */
export function glyphUrl(type: number, color: string, size = 96): string {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  if (!g) return '';
  drawGlyph(g, type, 0, 0, size);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, size, size);
  return c.toDataURL();
}
