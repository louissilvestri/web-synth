import type { Patch } from "./patch";

/**
 * UI → worklet message protocol. Discrete events go over the MessagePort;
 * continuously swept values will graduate to AudioParams when the control
 * surface lands (M2).
 */
export type EngineMessage =
  | { type: "noteOn"; note: number; velocity: number }
  | { type: "noteOff"; note: number }
  | { type: "setPatch"; patch: Patch }
  | { type: "allNotesOff" };
