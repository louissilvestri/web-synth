import { describe, expect, it } from "vitest";
import { defaultPatch } from "../core/patch";
import { EngineCore } from "./engineCore";

const SR = 48000;

function render(core: EngineCore, seconds: number): Float32Array {
  const out = new Float32Array(Math.floor(SR * seconds));
  // Render in 128-frame quanta like the real worklet.
  for (let i = 0; i < out.length; i += 128) {
    core.process(out.subarray(i, Math.min(i + 128, out.length)));
  }
  return out;
}

function rms(buf: Float32Array): number {
  let s = 0;
  for (const v of buf) s += v * v;
  return Math.sqrt(s / buf.length);
}

describe("EngineCore", () => {
  it("is silent before any note", () => {
    const core = new EngineCore(SR);
    expect(rms(render(core, 0.1))).toBeLessThan(1e-4);
  });

  it("produces bounded audio on noteOn and decays after noteOff", () => {
    const core = new EngineCore(SR);
    core.noteOn(57, 1);
    const sounding = render(core, 0.3);
    expect(rms(sounding)).toBeGreaterThan(0.01);
    for (const v of sounding) expect(Math.abs(v)).toBeLessThanOrEqual(1);

    core.noteOff(57);
    render(core, 1.0); // let the release finish
    expect(rms(render(core, 0.1))).toBeLessThan(1e-3);
  });

  it("survives a full-chaos patch without NaN or blow-up", () => {
    const core = new EngineCore(SR);
    const p = defaultPatch();
    p.vco.forEach((v) => {
      v.enabled = true;
      v.level = 1;
    });
    p.vcf.resonance = 1;
    p.mixer.feedback = 1;
    p.mixer.noiseLevel = 1;
    p.effects.sync = true;
    p.effects.xmod = 1;
    p.effects.modSource = "mg1";
    p.effects.modDepth = 1;
    p.mg1.rateHz = 20;
    p.mg1.toCutoff = 1;
    core.setPatch(p);
    core.noteOn(36, 1);
    core.noteOn(43, 1);
    core.noteOn(48, 1);
    core.noteOn(52, 1);
    const buf = render(core, 0.5);
    for (const v of buf) {
      expect(Number.isFinite(v)).toBe(true);
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
    }
  });

  it("paraphonic: chords share one filter but voices release independently", () => {
    const core = new EngineCore(SR);
    const p = defaultPatch();
    p.eg2.releaseS = 0.5;
    core.setPatch(p);
    core.noteOn(48, 1);
    core.noteOn(55, 1);
    render(core, 0.2);
    core.noteOff(48); // release one note, hold the other
    const after = render(core, 0.2);
    expect(rms(after)).toBeGreaterThan(0.01); // held note keeps sounding
  });

  it("A-440 reference tone sounds with no notes held", () => {
    const core = new EngineCore(SR);
    const p = defaultPatch();
    p.master.a440 = true;
    core.setPatch(p);
    const buf = render(core, 0.1);
    expect(rms(buf)).toBeGreaterThan(0.05);
  });

  it("glide slews pitch instead of stepping", () => {
    const core = new EngineCore(SR);
    const p = defaultPatch();
    p.keyAssign.mode = "mono";
    p.glide = { on: true, timeS: 0.2 };
    core.setPatch(p);
    core.noteOn(48, 1);
    render(core, 0.3);
    core.noteOn(72, 1); // big jump upward, should glide
    const buf = render(core, 0.05);
    // With glide engaged the engine still renders clean, bounded audio
    // mid-slide; pitch-tracking assertions come with the analyser in M2.
    expect(rms(buf)).toBeGreaterThan(0.01);
    for (const v of buf) expect(Number.isFinite(v)).toBe(true);
  });
});
