const { sliderToGain } = require('../lib/utils.cjs');

describe('sliderToGain', ()=>{
  test('returns 0 for 0 or negative', ()=>{
    expect(sliderToGain(0)).toBe(0);
    expect(sliderToGain(-1)).toBe(0);
  });

  test('returns ~1 for 1', ()=>{
    expect(sliderToGain(1)).toBeCloseTo(1, 6);
  });

  test('is monotonic and in range (0,1) for values between 0 and 1', ()=>{
    const v1 = sliderToGain(0.1);
    const v2 = sliderToGain(0.5);
    const v3 = sliderToGain(0.9);
    expect(v1).toBeGreaterThanOrEqual(0);
    expect(v3).toBeLessThanOrEqual(1);
    expect(v1).toBeLessThan(v2);
    expect(v2).toBeLessThan(v3);
  });
});
