# Feature Set

One hybrid instrument with the authentic paraphonic architecture:

> A **4-VCO bank** (Mono/Poly count, each VCO carrying the full **Model D waveform/range
> set**) → per-VCO amp VCAs → one mixer → **one shared 24 dB ladder filter** — the MP-4's
> exact topology — driven by the **Mono/Poly performance brain** (key-assign modes,
> arpeggiator, chord memory, sync/X-Mod "Effects" section).

The paraphonic choice is a feature, not a compromise: it is how the Mono/Poly works, it
gives the characteristic shared-filter sweep across held notes, and it collapses the DSP
to a single signal path. In Mono mode the instrument is effectively a 4-oscillator Model D.

## From the Moog Model D

Sources: Minimoog service/operation manuals (archive.org), polynominal.com, workrobot.com

| Feature | Detail |
|---|---|
| **VCO waveforms/ranges** | Per VCO: triangle, tri-saw ("shark"), saw, square, wide pulse, narrow pulse. Ranges: LO / 32' / 16' / 8' / 4' / 2'. VCO 2–4 detunable ±7 semitones |
| **VCO 4 special modes** | Inherits Osc-3's tricks: keyboard-track off → free-running; LO range → third mod source |
| **Mixer** | Per-source on/off + level: VCO 1–4, noise (**white/pink**) |
| **Feedback / overload** | The output→ext-in feedback trick as a **Feedback/Drive** control with soft saturation |
| **Ladder filter** | Shared 24 dB/oct transistor-ladder model, resonance to **self-oscillation**, keyboard-tracking switches (⅓ + ⅔, additive; tracks highest note) |
| **Dual contours** | Filter ADSR (with amount) on the shared VCF; amp ADSR cloned per VCO (releases overlap — authentic MP-4). Full ADSR (locked decision Q4) |
| **Controllers** | Glide (+on/off), pitch & mod wheels, mod-mix (VCO 4 ↔ noise), A-440 reference, master tune |

## From the Korg Mono/Poly

Sources: Korg owner's manual (korg.com PDF), service manual, Wikipedia, synthark.org

| Feature | Detail |
|---|---|
| **Key-assign modes** | **Mono** (4-VCO unison, detune spread) · **Poly** (round-robin, 4-note paraphony) · **Unison/Share** (dynamic redistribution) · **Chord Memory** (latched voicing, one-key transpose) |
| **"Effects" section** | Oscillator **hard sync** + **cross-modulation (X-Mod)**, VCO 1 master, Single/Double topologies, effect amount swept by EG1/MG1 |
| **Sync Interval** *(added in M2 review — Moog-style)* | 0..+24 st offset applied to synced slaves; the slave-to-master ratio is the sync timbre |
| **Arpeggiator** | Up / Down / Up-Down, **latch**, 1/2/full octave range, MG2-clocked with BPM |
| **PW/PWM** | Shared PW (±35% offset from each pulse waveform's base width) + PWM depth with MG1 source — sliders in the oscillator panel *(placement decided in M2 review)* |
| **Dual mod generators** | MG1 = general LFO (pitch/filter/PWM/fx-amount, incl. S&H); MG2 = arp clock / trigger |
| **Trigger mode** | Single/multiple retrigger — audibly reshapes chords through the shared filter EG |

## Modern layer

- **Presets**: factory bank (classic Model D + Mono/Poly recipes) + user patches, JSON
  import/export, working-patch autosave in browser storage
- **Input**: Web MIDI (Chromium) — notes, velocity, pitch bend, mod CC1, sustain CC64;
  on-screen keyboard + QWERTY as the universal fallback
- **Visuals**: oscilloscope, spectrum, VU; live signal-flow view rendered from the engine's
  own module graph (M4)
- **Output safety**: master limiter — self-oscillating resonance + 4-VCO unison protection
- **Master FX (M5)**: delay, chorus, phaser — rebuilt from scratch

## Primary sources

- Minimoog: [service notes](https://archive.org/stream/synthmanual-moog-minimoog-service-notes/moogminimoogservicenotes_djvu.txt) · [service manual PDF](https://www.vintagesynthparts.com/wp-content/uploads/2016/08/MINIMOOG-D_SERVICE_MANUAL.pdf) · [polynominal.com](https://www.polynominal.com/site/studio/gear/synth/moog_minimoog/index.html) · [workrobot.com](https://workrobot.com/music/minimoog.html)
- Mono/Poly: [owner's manual](https://cdn.korg.com/us/support/download/files/ff9c05f72700ce787eb5a8fd7e37a0d8.pdf) · [service manual](https://www.synthxl.com/wp-content/uploads/2017/12/korg-mono_poly-service-manual.pdf) · [Wikipedia](https://en.wikipedia.org/wiki/Korg_Mono/Poly) · [synthark.org](https://synthark.org/Korg/MonoPoly.html)
