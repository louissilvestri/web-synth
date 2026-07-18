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

    const draw = () => {
      const sw = scope.canvas.width;
      const sh = scope.canvas.height;
      analyser.getFloatTimeDomainData(wave);
      scope.clearRect(0, 0, sw, sh);
      scope.strokeStyle = accent;
      scope.lineWidth = 1.5;
      scope.beginPath();
      for (let i = 0; i < wave.length; i++) {
        const x = (i / wave.length) * sw;
        const y = sh / 2 - wave[i] * sh * 0.48;
        if (i === 0) scope.moveTo(x, y);
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
