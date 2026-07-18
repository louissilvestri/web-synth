import type { EngineMessage } from "../core/messages";
import { EngineCore } from "../paraphonic/engineCore";

/**
 * Thin AudioWorklet wrapper around EngineCore: message handling in, mono
 * render out. All DSP lives in the (worklet-agnostic, unit-tested) core.
 * Bundled to public/worklet/processor.js by scripts/build-worklet.mjs.
 */

/* AudioWorkletGlobalScope ambient declarations (not in the DOM lib). */
declare const sampleRate: number;
declare function registerProcessor(
  name: string,
  ctor: new () => unknown,
): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}

class ParaphonicProcessor extends AudioWorkletProcessor {
  private readonly core = new EngineCore(sampleRate);

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent<EngineMessage>) => {
      const m = e.data;
      switch (m.type) {
        case "noteOn":
          this.core.noteOn(m.note, m.velocity);
          break;
        case "noteOff":
          this.core.noteOff(m.note);
          break;
        case "setPatch":
          this.core.setPatch(m.patch);
          break;
        case "allNotesOff":
          this.core.allNotesOff();
          break;
      }
    };
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const channels = outputs[0];
    if (!channels?.length) return true;
    this.core.process(channels[0]);
    for (let c = 1; c < channels.length; c++) channels[c].set(channels[0]);
    return true;
  }
}

registerProcessor("paraphonic-engine", ParaphonicProcessor);
