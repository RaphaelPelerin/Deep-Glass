import { describe, expect, it } from 'vitest';
import { bend, lensMap, rimProfile, slope, surface, type LensShape } from '../src/lens';

const pane: LensShape = { width: 200, height: 100, radius: 30, bezel: 20, thickness: 10, ior: 1.5, magnify: 1 };
const at = (map: ReturnType<typeof lensMap>, x: number, y: number) => {
  const k = (y * map.width + x) * 4;
  return { dx: (map.data[k] / 255 - 0.5) * map.scale, dy: (map.data[k + 1] / 255 - 0.5) * map.scale };
};

describe('surface', () => {
  it('rises from the edge to flat', () => {
    expect(surface(0)).toBe(0);
    expect(surface(1)).toBe(1);
    expect(surface(0.5)).toBeGreaterThan(0.5);
    expect(slope(1)).toBe(0);
    expect(slope(0.01)).toBeGreaterThan(slope(0.5));
  });
});

describe('bend', () => {
  it('is strongest at the edge, and fades to nothing where the top turns flat', () => {
    const along = [0, 0.1, 0.2, 0.4, 0.7, 1].map((t) => bend(t, pane));
    for (let i = 1; i < along.length; i++) expect(along[i]).toBeLessThan(along[i - 1]);
    expect(along[0]).toBeGreaterThan(pane.thickness);
    expect(bend(1, pane)).toBeCloseTo(0, 6);
  });

  it('grows with the thickness, and vanishes without refraction (ior 1)', () => {
    expect(bend(0.2, { ...pane, thickness: 30 })).toBeGreaterThan(bend(0.2, pane));
    expect(bend(0.2, { ...pane, ior: 1 })).toBeCloseTo(0, 6);
  });
});

describe('rimProfile', () => {
  it('never folds the view back (no mirrored copies at the rim)', () => {
    for (const thickness of [4, 10, 40, 200]) {
      const rim = rimProfile({ bezel: 20, thickness, ior: 1.5 }, 256);
      const step = 20 / 256;
      for (let i = 1; i < rim.length; i++) {
        expect(i * step + rim[i]).toBeGreaterThan((i - 1) * step + rim[i - 1]);
      }
    }
  });

  it('keeps within the rim, and ends flat', () => {
    const rim = rimProfile({ bezel: 20, thickness: 200, ior: 1.5 }, 256);
    expect(rim[0]).toBeLessThanOrEqual(16 + 1e-6);
    expect(rim[256]).toBeCloseTo(0, 6);
  });
});

describe('lensMap', () => {
  const map = lensMap(pane);

  it('has one pixel per CSS px, or fewer', () => {
    expect([map.width, map.height]).toEqual([200, 100]);
    expect(lensMap(pane, 0.5).width).toBe(100);
    expect(map.scale).toBeGreaterThan(0);
  });

  it('leaves the flat middle alone', () => {
    const { dx, dy } = at(map, 100, 50);
    expect(Math.abs(dx)).toBeLessThan(map.scale / 255);
    expect(Math.abs(dy)).toBeLessThan(map.scale / 255);
  });

  it('bends the rim inwards, along the normal', () => {
    const left = at(map, 4, 50);
    const right = at(map, 195, 50);
    const top = at(map, 100, 4);
    expect(left.dx).toBeGreaterThan(0.5);
    expect(right.dx).toBeLessThan(-0.5);
    expect(top.dy).toBeGreaterThan(0.5);
    expect(Math.abs(left.dy)).toBeLessThan(map.scale / 255 + 1e-9);
    // a corner bends towards the middle diagonally
    const corner = at(map, 12, 12);
    expect(corner.dx).toBeGreaterThan(0);
    expect(corner.dy).toBeGreaterThan(0);
  });

  it('is symmetric', () => {
    const a = at(map, 10, 30);
    const b = at(map, 189, 30);
    expect(a.dx).toBeCloseTo(-b.dx, 0);
    expect(a.dy).toBeCloseTo(b.dy, 0);
  });

  it('magnifies towards the center as a loupe', () => {
    const loupe = lensMap({ ...pane, magnify: 1.5, bezel: 1 }, 1);
    const p = at(loupe, 150, 50);
    // 50px right of the center, sampled at 50 / 1.5: pulled ~16.7px back towards the middle
    expect(p.dx).toBeCloseTo(-16.5, 0);
  });

  it('copes with tiny and pill-shaped panes', () => {
    const pill = lensMap({ ...pane, width: 60, height: 24, radius: 999, bezel: 40 });
    expect(pill.width).toBe(60);
    expect(Number.isFinite(pill.scale)).toBe(true);
    expect(lensMap({ ...pane, width: 1, height: 1 }).data.length).toBe(4);
  });
});
