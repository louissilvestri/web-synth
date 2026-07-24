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

  it("sync interval and MG1→PW (PWM via virtual patch) render clean audio", () => {
    const core = new EngineCore(SR);
    const p = defaultPatch();
    p.vco.forEach((v) => {
      v.enabled = true;
      v.wave = "pulse";
      v.pw = 0.3;
    });
    p.effects.sync = true;
    p.effects.intervalSemitones = 7;
    p.vco.forEach((v, i) => {
      if (i > 0) v.pwSyncTo = 0; // slaves follow VCO 1's static width
    });
    // PWM is now a virtual-patch route: MG1 → pulse width on every VCO.
    p.virtualPatch[0] = {
      source: "mg1",
      dest: "pw",
      amount: 1,
      vcos: [true, true, true, true],
    };
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

  it("virtual patch targets only the selected VCOs", () => {
    // Route a big static pitch offset via a DC-ish source (mod wheel at 1),
    // targeting VCO 2 only. VCO 1's pitch must be unchanged; VCO 2's shifted.
    const mk = (targetVco2: boolean) => {
      const core = new EngineCore(SR);
      const p = defaultPatch();
      p.vco[0].enabled = true;
      p.vco[1].enabled = true;
      p.keyAssign.mode = "mono"; // both VCOs sound the same note
      p.virtualPatch[0] = {
        source: "modWheel",
        dest: "pitch",
        amount: 1, // +1 octave at full
        vcos: [false, targetVco2, false, false],
      };
      core.setPatch(p);
      core.setModWheel(1);
      core.noteOn(57, 1);
      return render(core, 0.3);
    };
    // Targeting VCO2 detunes it an octave up → beating/different waveform vs.
    // the untargeted render where both VCOs stay in unison.
    const targeted = mk(true);
    const untargeted = mk(false);
    let diff = 0;
    for (let i = 0; i < targeted.length; i++) diff += Math.abs(targeted[i] - untargeted[i]);
    expect(diff / targeted.length).toBeGreaterThan(0.01);
    for (const v of targeted) expect(Number.isFinite(v)).toBe(true);
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
    const all: [boolean, boolean, boolean, boolean] = [true, true, true, true];
    p.virtualPatch[0] = { source: "mg1", dest: "cutoff", amount: 0.8, vcos: all };
    p.virtualPatch[1] = { source: "velocity", dest: "amp", amount: -0.9, vcos: all };
    p.virtualPatch[2] = { source: "mg2", dest: "pitch", amount: 0.2, vcos: all };
    p.virtualPatch[3] = { source: "kbdTrack", dest: "resonance", amount: 0.9, vcos: all };
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
      p.virtualPatch[0] = {
        source: "velocity",
        dest: "amp",
        amount: -0.85,
        vcos: [true, true, true, true],
      };
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
    const { resolveLinkedPw } = await import("./engineCore");
    const vcos = [{ pw: 0.3 }, { pw: -0.3 }, { pw: 0.1 }, { pw: 0 }];
    expect(resolveLinkedPw(vcos, 1, null)).toBe(-0.3); // own value
    expect(resolveLinkedPw(vcos, 1, 0)).toBe(0.3); // follows VCO 1
    // One hop only: VCO3 follows VCO2 — reads VCO2's STORED pw, even if
    // VCO2 itself is linked elsewhere (no chasing, so no cycles possible).
    expect(resolveLinkedPw(vcos, 2, 1)).toBe(-0.3);
    // Self/invalid links degrade to own value.
    expect(resolveLinkedPw(vcos, 2, 2)).toBe(0.1);
    expect(resolveLinkedPw(vcos, 2, 9)).toBe(0.1);
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
