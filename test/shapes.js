// Synthetic doodles in canvas space (y down), used to exercise the sketch
// recogniser without a browser or a pointing device.

function line(a, b, steps = 40) {
  return Array.from({ length: steps + 1 }, (_, i) => ({
    x: a.x + ((b.x - a.x) * i) / steps,
    y: a.y + ((b.y - a.y) * i) / steps,
  }));
}

function path(points) {
  const out = [];
  for (let i = 0; i < points.length - 1; i += 1) out.push(...line(points[i], points[i + 1]));
  return out;
}

function ring(cx, cy, r, steps = 80) {
  return Array.from({ length: steps + 1 }, (_, i) => ({
    x: cx + r * Math.cos((i / steps) * Math.PI * 2),
    y: cy + r * Math.sin((i / steps) * Math.PI * 2),
  }));
}

export const SHAPES = {
  mountain: [path([{ x: 0, y: 100 }, { x: 50, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }])],
  house: [
    path([
      { x: 20, y: 100 },
      { x: 20, y: 35 },
      { x: 80, y: 35 },
      { x: 80, y: 100 },
      { x: 20, y: 100 },
    ]),
    path([{ x: 20, y: 35 }, { x: 50, y: 0 }, { x: 80, y: 35 }]),
  ],
  tower: [
    path([
      { x: 85, y: 200 },
      { x: 85, y: 0 },
      { x: 115, y: 0 },
      { x: 115, y: 200 },
      { x: 85, y: 200 },
    ]),
  ],
  pagoda: [
    path([{ x: 10, y: 120 }, { x: 10, y: 90 }, { x: 90, y: 90 }, { x: 90, y: 120 }, { x: 10, y: 120 }]),
    path([{ x: 22, y: 90 }, { x: 22, y: 50 }, { x: 78, y: 50 }, { x: 78, y: 90 }]),
    path([{ x: 34, y: 50 }, { x: 34, y: 14 }, { x: 66, y: 14 }, { x: 66, y: 50 }]),
    path([{ x: 34, y: 14 }, { x: 50, y: 0 }, { x: 66, y: 14 }]),
  ],
  dome: [ring(50, 50, 50)],
  squiggle: [
    path([{ x: 0, y: 50 }, { x: 25, y: 20 }, { x: 50, y: 60 }, { x: 75, y: 20 }, { x: 100, y: 55 }]),
  ],
};

export { line, path, ring };
