/**
 * Web MIDI input host. Chromium-only (Firefox/Safari lack support) — the
 * on-screen keyboard + QWERTY remain the universal fallback.
 *
 * Handles: note on/off (velocity 0 = off, running status implied by the
 * browser), pitch bend (14-bit), CC1 mod wheel, CC64 sustain.
 */

export interface MidiHandlers {
  noteOn: (note: number, velocity: number) => void;
  noteOff: (note: number) => void;
  pitchBend: (value: number) => void; // −1..1
  modWheel: (value: number) => void; // 0..1
  sustain: (on: boolean) => void;
  /** Called on any incoming message from the active device (activity LED). */
  activity?: () => void;
}

export interface MidiDevice {
  id: string;
  name: string;
}

export class MidiInput {
  private access: MIDIAccess | null = null;
  private selectedId: string | "all" = "all";
  private onDevicesChanged: ((devices: MidiDevice[]) => void) | null = null;

  constructor(private readonly handlers: MidiHandlers) {}

  static get supported(): boolean {
    return typeof navigator !== "undefined" && "requestMIDIAccess" in navigator;
  }

  async init(onDevicesChanged: (devices: MidiDevice[]) => void): Promise<void> {
    if (!MidiInput.supported || this.access) return;
    this.onDevicesChanged = onDevicesChanged;
    this.access = await navigator.requestMIDIAccess({ sysex: false });
    this.access.onstatechange = () => this.rebind();
    this.rebind();
  }

  get devices(): MidiDevice[] {
    if (!this.access) return [];
    return [...this.access.inputs.values()].map((i) => ({
      id: i.id,
      name: i.name ?? i.id,
    }));
  }

  select(id: string | "all"): void {
    this.selectedId = id;
    this.rebind();
  }

  private rebind(): void {
    if (!this.access) return;
    for (const input of this.access.inputs.values()) {
      input.onmidimessage =
        this.selectedId === "all" || input.id === this.selectedId
          ? (e) => this.onMessage(e)
          : null;
    }
    this.onDevicesChanged?.(this.devices);
  }

  private onMessage(e: MIDIMessageEvent): void {
    const data = e.data;
    if (!data || data.length === 0) return;
    const status = data[0] & 0xf0;
    const h = this.handlers;
    h.activity?.();
    switch (status) {
      case 0x90: // note on (velocity 0 = note off)
        if (data[2] === 0) h.noteOff(data[1]);
        else h.noteOn(data[1], data[2] / 127);
        break;
      case 0x80:
        h.noteOff(data[1]);
        break;
      case 0xe0: {
        // 14-bit pitch bend, center 8192
        const v = (data[2] << 7) | data[1];
        h.pitchBend((v - 8192) / 8192);
        break;
      }
      case 0xb0:
        if (data[1] === 1) h.modWheel(data[2] / 127);
        else if (data[1] === 64) h.sustain(data[2] >= 64);
        else if (data[1] === 123) {
          // All Notes Off
          h.sustain(false);
        }
        break;
    }
  }

  dispose(): void {
    if (!this.access) return;
    for (const input of this.access.inputs.values()) input.onmidimessage = null;
    this.access.onstatechange = null;
    this.access = null;
  }
}
