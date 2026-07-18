export default function Home() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "var(--pad)",
      }}
    >
      <div className="card" style={{ maxWidth: 480, padding: 24 }}>
        <h1 className="card__title">Web Synth v2</h1>
        <p className="card__text measure">
          A hybrid paraphonic synthesizer — Minimoog Model D voice, Korg
          Mono/Poly performance brain. Rebuilt from the ground up on Next.js
          and AudioWorklet DSP.
        </p>
        <p className="u-mono u-muted" style={{ fontSize: "var(--fs-sm)" }}>
          M0 · scaffold — engine lands in M1
        </p>
      </div>
    </main>
  );
}
