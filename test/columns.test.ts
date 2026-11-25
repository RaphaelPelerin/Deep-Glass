import { describe, expect, it } from 'vitest';
import { fitColumns, resizeColumn } from '../src/columns';

const no = [false, false, false];
const mins = [80, 80, 80];

describe('resizeColumn', () => {
  it('moves an edge between two columns while the table fits', () => {
    expect(resizeColumn([200, 200, 200], mins, no, 0, 50, 600)).toEqual([250, 150, 200]);
    expect(resizeColumn([200, 200, 200], mins, no, 0, -50, 600)).toEqual([150, 250, 200]);
  });
  it('takes from the next ones down to their minimum, then grows', () => {
    expect(resizeColumn([200, 200, 200], mins, no, 0, 180, 600)).toEqual([380, 80, 140]);
    expect(resizeColumn([200, 200, 200], mins, no, 0, 300, 600)).toEqual([500, 80, 80]);
  });
  it('leaves fixed columns alone', () => {
    expect(resizeColumn([200, 60, 200], mins, [false, true, false], 0, 50, 460)).toEqual([250, 60, 150]);
    expect(resizeColumn([200, 200, 60], mins, [false, false, true], 1, 50, 460)).toEqual([200, 250, 60]);
    // nobody to take the room left
    expect(resizeColumn([200, 200, 60], mins, [false, false, true], 1, -50, 460)).toEqual([200, 200, 60]);
  });
  it('only changes one column of a table that scrolls, until it fits', () => {
    expect(resizeColumn([300, 300, 300], mins, no, 0, 50, 600)).toEqual([350, 300, 300]);
    expect(resizeColumn([300, 300, 300], mins, no, 0, -100, 600)).toEqual([200, 300, 300]);
    expect(resizeColumn([400, 150, 150], mins, no, 0, -200, 600)).toEqual([200, 250, 150]);
  });
  it('stops at the minimum, and never widens a column already under it', () => {
    expect(resizeColumn([200, 200, 200], mins, no, 0, -500, 600)).toEqual([80, 320, 200]);
    expect(resizeColumn([60, 200, 200], mins, no, 0, -10, 460)).toEqual([60, 200, 200]);
  });
});

describe('fitColumns', () => {
  it('follows the room in proportion', () => {
    expect(fitColumns([100, 200, 300], mins, no, 1200)).toEqual([200, 400, 600]);
    expect(fitColumns([100, 60, 300], mins, [false, true, false], 860)).toEqual([200, 60, 600]);
  });
  it('holds at the minimums', () => {
    expect(fitColumns([100, 200, 300], mins, no, 380)).toEqual([80, 120, 180]);
    expect(fitColumns([100, 200, 300], mins, no, 100)).toEqual([80, 80, 80]);
  });
});
