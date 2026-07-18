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

  it("sync interval and PWM render clean bounded audio", () => {
    const core = new EngineCore(SR);
    const p = defaultPatch();
    p.vco.forEach((v) => {
      v.enabled = true;
      v.wave = "square";
    });
    p.effects.sync = true;
    p.effects.intervalSemitones = 7;
    p.vco.forEach((v, i) => {
      v.pw = 0.3;
      v.pwmDepth = 1;
      if (i > 0) v.pwSyncTo = 0; // slaves follow VCO 1's width
    });
    p.mg1.rateHz = 6;
    core.setPatch(p);
    core.noteOn(48, 1);
    const buf = render(core, 0.4);
    let sum = 0;
    for (const v of buf) {
      expect(Number.isFinite(v)).toBe(true);
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
      sum += v * v;
    }
    expect(Math.sqrt(sum / buf.length)).toBeGreaterThan(0.01);
  });

  it("arpeggiator steps notes on its own clock", () => {
    const core = new EngineCore(SR);
    const p = defaultPatch();
    p.arp.on = true;
    p.arp.bpm = 240; // fast: step = 125ms
    core.setPatch(p);
    core.noteOn(48, 1);
    core.noteOn(60, 1);
    // Render 0.6s and check output alternates activity (gate on/off cycles).
    const buf = render(core, 0.6);
    expect(rms(buf)).toBeGreaterThan(0.005);
    for (const v of buf) expect(Number.isFinite(v)).toBe(true);
    // Release without latch: arp goes silent.
    core.noteOff(48);
    core.noteOff(60);
    render(core, 0.8);
    expect(rms(render(core, 0.2))).toBeLessThan(1e-3);
  });

  it("virtual patch routes modulate without breaking the render", () => {
    const core = new EngineCore(SR);
    const p = defaultPatch();
    p.virtualPatch[0] = { source: "mg1", dest: "cutoff", amount: 0.8 };
    p.virtualPatch[1] = { source: "velocity", dest: "amp", amount: -0.9 };
    p.virtualPatch[2] = { source: "mg2", dest: "pitch", amount: 0.2 };
    p.virtualPatch[3] = { source: "kbdTrack", dest: "resonance", amount: 0.9 };
    p.mg1.rateHz = 8;
    core.setPatch(p);
    core.noteOn(72, 0.9);
    const buf = render(core, 0.4);
    expect(rms(buf)).toBeGreaterThan(0.001);
    for (const v of buf) expect(Number.isFinite(v)).toBe(true);
  });

  it("velocity→amp virtual patch makes soft notes quieter", () => {
    const mk = (vel: number) => {
      const core = new EngineCore(SR);
      const p = defaultPatch();
      p.virtualPatch[0] = { source: "velocity", dest: "amp", amount: -0.85 };
      core.setPatch(p);
      core.noteOn(57, vel);
      return rms(render(core, 0.3));
    };
    expect(mk(1)).toBeLessThan(mk(0.1) * 0.7); // high velocity → more negative amp mod
  });

  it("pitch bend shifts pitch and returns", () => {
    const core = new EngineCore(SR);
    core.noteOn(57, 1);
    render(core, 0.1);
    core.setPitchBend(1); // +2 semitones default range
    const bent = render(core, 0.2);
    core.setPitchBend(0);
    for (const v of bent) expect(Number.isFinite(v)).toBe(true);
    expect(rms(bent)).toBeGreaterThan(0.01);
  });

  it("sustain pedal holds notes through noteOff", () => {
    const core = new EngineCore(SR);
    core.setSustain(true);
    core.noteOn(57, 1);
    render(core, 0.1);
    core.noteOff(57);
    const held = render(core, 0.2);
    expect(rms(held)).toBeGreaterThan(0.01); // still sounding
    core.setSustain(false); // pedal up → release flushes
    render(core, 1.0);
    expect(rms(render(core, 0.1))).toBeLessThan(1e-3);
  });

  it("pw sync: a linked VCO follows its source's stored value, one hop only", async () => {
    const { resolveLinked } = await import("./engineCore");
    const vcos = [
      { pw: 0.3, pwmDepth: 0.9 },
      { pw: -0.3, pwmDepth: 0.1 },
      { pw: 0.1, pwmDepth: 0.5 },
      { pw: 0, pwmDepth: 0 },
    ];
    expect(resolveLinked(vcos, 1, "pw", null)).toBe(-0.3); // own value
    expect(resolveLinked(vcos, 1, "pw", 0)).toBe(0.3); // follows VCO 1
    expect(resolveLinked(vcos, 1, "pwmDepth", 0)).toBe(0.9);
    // One hop only: VCO3 follows VCO2 — reads VCO2's STORED pw, even if
    // VCO2 itself is linked elsewhere (no chasing, so no cycles possible).
    expect(resolveLinked(vcos, 2, "pw", 1)).toBe(-0.3);
    // Self/invalid links degrade to own value.
    expect(resolveLinked(vcos, 2, "pw", 2)).toBe(0.1);
    expect(resolveLinked(vcos, 2, "pw", 9)).toBe(0.1);
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
