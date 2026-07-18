import type { EngineMessage } from "../core/messages";
import type { Patch } from "../core/patch";
import { defaultPatch } from "../core/patch";

/**
 * Main-thread host for the engine. Owns the AudioContext (created lazily on
 * a user gesture — required by autoplay policy) and the worklet node, and
 * exposes a message-based API. React never touches any of this directly;
 * the patch store calls it.
 */
export class AudioEngineHost {
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private patch: Patch = defaultPatch();

  get running(): boolean {
    return this.ctx?.state === "running" && this.node !== null;
  }

  /** Idempotent. Call from a user-gesture handler. */
  async init(): Promise<void> {
    if (this.node) {
      await this.ctx?.resume();
      return;
    }
    this.ctx = new AudioContext({ latencyHint: "interactive" });
    // Relative URL: resolves under the site root in dev and under the
    // /web-synth basePath on GitHub Pages alike.
    await this.ctx.audioWorklet.addModule("worklet/processor.js");
    this.node = new AudioWorkletNode(this.ctx, "paraphonic-engine", {
      numberOfInputs: 0,
      outputChannelCount: [2],
    });
    // Meter tap: worklet → analyser → destination (scope/spectrum/VU read here).
    this.analyserNode = this.ctx.createAnalyser();
    this.analyserNode.fftSize = 2048;
    this.analyserNode.smoothingTimeConstant = 0.6;
    this.node.connect(this.analyserNode);
    this.analyserNode.connect(this.ctx.destination);
    await this.ctx.resume();
    this.send({ type: "setPatch", patch: this.patch });
    if (process.env.NODE_ENV === "development") {
      // Dev-only debug handle for console poking and automated verification.
      (window as unknown as Record<string, unknown>).__wsEngine = this;
    }
  }

  /** Meter tap for visualizations; null until init(). */
  get analyser(): AnalyserNode | null {
    return this.analyserNode;
  }

  private send(message: EngineMessage): void {
    this.node?.port.postMessage(message);
  }

  noteOn(note: number, velocity = 1): void {
    this.send({ type: "noteOn", note, velocity });
  }

  noteOff(note: number): void {
    this.send({ type: "noteOff", note });
  }

  allNotesOff(): void {
    this.send({ type: "allNotesOff" });
  }

  setPatch(patch: Patch): void {
    this.patch = patch;
    this.send({ type: "setPatch", patch });
  }

  async dispose(): Promise<void> {
    this.node?.disconnect();
    this.node = null;
    await this.ctx?.close();
    this.ctx = null;
  }
}

/** Module singleton — one audio engine per page. */
export const audioEngine = new AudioEngineHost();
