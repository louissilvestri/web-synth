"use client";

import { useEffect, useRef } from "react";
import { audioEngine } from "../../engine/host/audioEngine";
import { useSynthStore } from "../state/store";

/**
 * Oscilloscope + spectrum + VU, drawn from the host's analyser tap.
 * Draws only while powered and the tab is visible; honors
 * prefers-reduced-motion by freezing to a single static frame per second.
 */
export function Meters() {
  const power = useSynthStore((s) => s.power);
  const scopeRef = useRef<HTMLCanvasElement>(null);
  const specRef = useRef<HTMLCanvasElement>(null);
  const vuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (power !== "on") return;
    const analyser = audioEngine.analyser;
    const scope = scopeRef.current?.getContext("2d");
    const spec = specRef.current?.getContext("2d");
    if (!analyser || !scope || !spec) return;

    const wave = new Float32Array(analyser.fftSize);
    const freq = new Uint8Array(analyser.frequencyBinCount);
    const css = getComputedStyle(document.documentElement);
    const accent = css.getPropertyValue("--accent").trim() || "#4c8dff";
    const muted = css.getPropertyValue("--muted").trim() || "#9aa1a8";
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let raf = 0;
    let interval: ReturnType<typeof setInterval> | undefined;
    // Persists across frames: the smoothed auto-scale gain (a simple AGC).
    let scopeGain = 1;

    /** First rising zero-crossing at/after `from`, or -1. */
    const risingCross = (from: number, to: number): number => {
      for (let i = Math.max(1, from); i < to; i++) {
        if (wave[i - 1] < 0 && wave[i] >= 0) return i;
      }
      return -1;
    };

    const draw = () => {
      const sw = scope.canvas.width;
      const sh = scope.canvas.height;
      analyser.getFloatTimeDomainData(wave);
      scope.clearRect(0, 0, sw, sh);

      // --- Trigger: lock the trace to a rising zero-crossing so it stops
      //     drifting. Then span ~3 estimated periods so any pitch shows a
      //     readable few cycles (horizontal auto-scale). ---
      const half = wave.length >> 1;
      const trig = Math.max(0, risingCross(1, half));
      const next = risingCross(trig + 1, wave.length);
      const period = next > trig ? next - trig : 0;
      let span = period > 0 ? period * 3 : wave.length;
      span = Math.min(span, wave.length - trig);
      span = Math.max(span, 64);

      // --- Vertical auto-scale: fill ~90% of the height, fast to shrink
      //     (never clip), slow to grow (no pumping); gated so the noise
      //     floor isn't magnified during silence. ---
      let peak = 1e-4;
      for (let i = trig; i < trig + span; i++) {
        const a = Math.abs(wave[i]);
        if (a > peak) peak = a;
      }
      const target = peak < 0.003 ? 1 : Math.min(25, Math.max(1, 0.9 / peak));
      scopeGain += (target - scopeGain) * (target < scopeGain ? 0.5 : 0.05);

      scope.strokeStyle = accent;
      scope.lineWidth = 1.5;
      scope.beginPath();
      for (let j = 0; j < span; j++) {
        const x = (j / span) * sw;
        const v = Math.max(-1, Math.min(1, wave[trig + j] * scopeGain));
        const y = sh / 2 - v * sh * 0.46;
        if (j === 0) scope.moveTo(x, y);
        else scope.lineTo(x, y);
      }
      scope.stroke();

      const fw = spec.canvas.width;
      const fh = spec.canvas.height;
      analyser.getByteFrequencyData(freq);
      spec.clearRect(0, 0, fw, fh);
      spec.fillStyle = muted;
      const bars = 48;
      for (let b = 0; b < bars; b++) {
        // log-spaced bins so the display matches how pitch is heard
        const i = Math.floor((freq.length - 1) * (Math.exp(b / bars) - 1) / (Math.E - 1));
        const h = (freq[i] / 255) * fh;
        spec.fillRect((b / bars) * fw, fh - h, fw / bars - 1, h);
      }

      let sum = 0;
      for (const v of wave) sum += v * v;
      const rms = Math.sqrt(sum / wave.length);
      const vu = vuRef.current;
      if (vu) {
        const pct = Math.min(100, rms * 250);
        vu.style.width = `${pct}%`;
        vu.style.background = pct > 85 ? "var(--alert)" : "var(--accent)";
        vu.parentElement?.setAttribute("aria-valuenow", String(Math.round(pct)));
      }
    };

    if (reduced) {
      draw();
      interval = setInterval(draw, 1000);
    } else {
      const loop = () => {
        if (!document.hidden) draw();
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }
    return () => {
      cancelAnimationFrame(raf);
      if (interval) clearInterval(interval);
    };
  }, [power]);

  return (
    <section className="card panel" aria-label="Meters">
      <h2 className="panel__title">Output</h2>
      <canvas ref={scopeRef} className="meter__canvas" width={280} height={72} aria-label="Oscilloscope" />
      <canvas ref={specRef} className="meter__canvas" width={280} height={48} aria-label="Spectrum" />
      <div
        className="meter__vu"
        role="meter"
        aria-label="Output level"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={0}
      >
        <div ref={vuRef} className="meter__vu-fill" />
      </div>
    </section>
  );
}
