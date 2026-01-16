import { Voice } from './js/voice.js';
import { sliderToGain } from './js/utils.js';

// Voice implementation moved to ./js/voice.js; utils available from ./js/utils.js



class Synth {
  constructor(){
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.8;
    this.analyser = this.ctx.createAnalyser(); this.analyser.fftSize = 2048;
    this.master.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    this.controls = this._readControls();

    // Start VU meter
    this._startVUMeter();    // Start oscilloscope (draws waveform from the same analyser)
    this._startOscilloscope();
    // Noise source -> shared output (we'll connect it into each voice so it's gated by AMP ADSR)
    this.noiseOutput = this.ctx.createGain();
    this.noiseOutput.gain.value = 1.0; // overall noise bus
    this._createAndStartNoise();
    // NOTE: do NOT connect noiseOutput directly to master; noise will be routed into each voice's filter -> envGain chain

    this.voices = new Map();
    this.maxVoices = 6;

    // LFO configuration and max depths (units: cents, Hz, or normalized)
    this.lfoMax = {
      oscPitch: 1200,     // cents (±12 semitones)
      oscDetune: 120,     // cents
      oscLevel: 1.0,      // gain units
      filterCutoff: 5000, // Hz
      filterQ: 10,        // Q units
      mix: 0.5            // normalized mix modulation cap
    };

    this.lfoTargetsEnabled = new Set(); // e.g., 'oscA_pitch', 'filter_cutoff', etc.

    this._setupLFO();
    this._createEffects();
    try{ if(typeof this._enableExperimentalPhaser === 'function') this._enableExperimentalPhaser(true); }catch(e){}
    this._buildUI();
  }

  _readControls(){
    return {
      oscA: {wave:'sawtooth', detune:0, level:0.8},
      oscB: {wave:'sawtooth', detune:0, level:0.6},
      mix:0.5,
      noiseLevel:0,
      filter: {type:'lowpass', cutoff:1500, Q:1, envAmt:0},
      ampADSR: {a:0.01,d:0.2,s:0.8,r:0.5},
      filterADSR: {a:0.01,d:0.2,s:0.8,r:0.5},
      lfo: {rate:5, depth:0}
    };
  }

  _setupLFO(){
    this.lfo = this.ctx.createOscillator();
    this.lfo.type = 'sine';
    this.lfo.frequency.value = this.controls.lfo.rate;
    this.lfo.start();
  }

  // convert slider (0..1) to an exponential gain (dB scale)
  _sliderToGain(s){
    // Delegates to shared utility for testability
    return sliderToGain(s);
  }

  // create continuous noise buffer and start it
  _createAndStartNoise(){
    const ctx = this.ctx;
    // 2 seconds of white noise
    const sampleRate = ctx.sampleRate || 44100;
    const length = sampleRate * 2;
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for(let i=0;i<length;i++) data[i] = (Math.random() * 2 - 1) * 0.25; // modest level
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(this.noiseOutput);
    try{ src.start(); }catch(e){/* ignore if audio suspended */}
    this._noiseSource = src;
  }

  // start VU meter animation loop
  _startVUMeter(){
    try{
      this._vuBuf = new Uint8Array(this.analyser.fftSize || 2048);
      this._vuRunning = true;
      const meters = document.querySelectorAll('#vu_meter .vu-led');
      const update = ()=>{
        if(!this._vuRunning) return;
        this.analyser.getByteTimeDomainData(this._vuBuf);
        // compute RMS
        let sum = 0;
        for(let i=0;i<this._vuBuf.length;i++){
          const v = (this._vuBuf[i] - 128)/128; sum += v*v;
        }
        const rms = Math.sqrt(sum / this._vuBuf.length);
        // map rms to 0..1 (rough scaling)
        const level = Math.min(1, rms * 3.5);
        // determine LED count (6 LEDs)
        const ledCount = Math.floor(level * 6 + 0.0001);
        meters.forEach((m, idx)=>{
          const n = idx + 1; // bottom is index 0 (we used column-reverse)
          m.classList.remove('on','green','yellow','red');
          if(n <= ledCount){
            // color mapping: bottom 4 green, 5 yellow, 6 red
            if(n <= 4) m.classList.add('on','green');
            else if(n === 5) m.classList.add('on','yellow');
            else m.classList.add('on','red');
          }
        });
        this._vuRafId = requestAnimationFrame(update);
      };
      this._vuRafId = requestAnimationFrame(update);
    }catch(e){}
  }

  _startOscilloscope(){
    try{
      const canvas = document.getElementById('oscilloscope');
      if(!canvas) return;
      const ctx = canvas.getContext('2d');
      this._oscBuf = new Uint8Array(this.analyser.fftSize || 2048);
      this._oscRunning = true;

      // bind zoom buttons (kept as a fallback in case UI already exists)
      const zoomBtns = document.querySelectorAll('.osc-zoom-btn');
      zoomBtns.forEach(b=>{ b.addEventListener('click', ()=>{ const axis = b.dataset.axis; const zm = b.dataset.zoom; this._changeOscZoom(axis, zm); }); });

      // continuous press support: mouse down to zoom repeatedly
      let _zoomInterval = null;
      const down = (ev)=>{ const b = ev.currentTarget; const axis = b.dataset.axis; const zm = b.dataset.zoom; _zoomInterval = setInterval(()=> this._changeOscZoom(axis, zm), 120); };
      const up = ()=>{ if(_zoomInterval){ clearInterval(_zoomInterval); _zoomInterval = null; } };
      zoomBtns.forEach(b=>{ b.addEventListener('mousedown', down); b.addEventListener('mouseup', up); b.addEventListener('mouseleave', up); b.addEventListener('touchstart', down); b.addEventListener('touchend', up); });

      const draw = ()=>{
        if(!this._oscRunning) return;
        this.analyser.getByteTimeDomainData(this._oscBuf);
        const now = performance.now();

        // Auto-scaling in draw loop (responsive + throttled)
        try{
          if(this._oscAutoEnabled && this._oscAutoEnabled.y){
            // update Y every frame for immediacy
            let max = 0;
            for(let i=0;i<this._oscBuf.length;i++){ const v = Math.abs((this._oscBuf[i]-128)/128); if(v>max) max = v; }
            if(max < 1e-4) this._oscZoomY = 1; else this._oscZoomY = Math.max(0.25, Math.min(32, (1 / max) * 0.9));
          }
          if(this._oscAutoEnabled && this._oscAutoEnabled.x){
            // throttle X auto to ~350ms
            if(!this._lastAutoX || (now - this._lastAutoX) > 350){ this._autoScaleX(); this._lastAutoX = now; }
          }
        }catch(e){}

        const dpr = window.devicePixelRatio || 1;
        const W = Math.max(1, Math.floor(canvas.clientWidth * dpr));
        const H = Math.max(1, Math.floor(canvas.clientHeight * dpr));
        if(canvas.width !== W || canvas.height !== H){ canvas.width = W; canvas.height = H; }
        ctx.clearRect(0,0,canvas.width,canvas.height);
        // background subtle
        ctx.fillStyle = 'rgba(0,0,0,0)';
        ctx.fillRect(0,0,canvas.width,canvas.height);

        // determine visible window based on horizontal zoom
        const bufLen = this._oscBuf.length;
        let zoomX = Number(this._oscZoomX);
        if(!isFinite(zoomX) || zoomX <= 0) zoomX = 1;
        zoomX = Math.max(0.25, zoomX);
        const winLen = Math.max(4, Math.floor(bufLen / zoomX));
        const start = Math.max(0, Math.floor((bufLen - winLen) / 2));

        // draw waveform using windowed samples mapped to pixel columns
        ctx.lineWidth = 2 * dpr;
        ctx.strokeStyle = '#7CFF6B';
        ctx.beginPath();
        const centerY = canvas.height / 2;
        let ampScale = Number(this._oscZoomY);
        if(!isFinite(ampScale) || ampScale <= 0) ampScale = 1;
        ampScale = Math.max(0.25, ampScale);
        const samplesPerPixel = winLen / Math.max(1, canvas.width);
        for(let x=0;x<canvas.width;x++){
          const idx = Math.min(bufLen-1, Math.floor(start + x * samplesPerPixel));
          const sample = this._oscBuf[idx] || 128;
          const v = (sample - 128) / 128; // -1..1
          const y = centerY + v * centerY * 0.95 * ampScale;
          if(x===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
        }
        ctx.stroke();

        // draw zoom readout
        try{
          ctx.fillStyle = 'rgba(124,255,107,0.9)';
          ctx.font = `${12 * dpr}px monospace`;
          const zx = (this._oscZoomX || 1).toFixed(2); const zy = (this._oscZoomY || 1).toFixed(2);
          ctx.fillText(`X:${zx} Y:${zy}`, 4 * dpr, 12 * dpr);
        }catch(e){}

        this._oscRafId = requestAnimationFrame(draw);
      };
      this._oscRafId = requestAnimationFrame(draw);
    }catch(e){}
  }

  // create simple Phase, Delay and Chorus effect chains and wire into master
  _createEffects(){
    const ctx = this.ctx;
    this.effects = {};

    // Phase: allpass -> allpass -> stereo panner
    this.effects.phase = {};
    this.effects.phase.input = ctx.createGain();
    this.effects.phase.allpass1 = ctx.createBiquadFilter(); this.effects.phase.allpass1.type = 'allpass';
    this.effects.phase.allpass2 = ctx.createBiquadFilter(); this.effects.phase.allpass2.type = 'allpass';
    this.effects.phase.panner = ctx.createStereoPanner();
    this.effects.phase.wet = ctx.createGain(); this.effects.phase.wet.gain.value = 0;

    this.effects.phase.input.connect(this.effects.phase.allpass1);
    this.effects.phase.allpass1.connect(this.effects.phase.allpass2);
    this.effects.phase.allpass2.connect(this.effects.phase.panner);
    this.effects.phase.panner.connect(this.effects.phase.wet);
    this.effects.phase.wet.connect(this.master);

    // experimental phaser (created only when user enables it) — kept separate to avoid breaking existing behavior
    this.effects.phase.experimental = null;

    this._enableExperimentalPhaser = (enable)=>{
      try{
        if(enable){
          if(this.effects.phase.experimental) return;
          const ph = {};
          ph.input = this.ctx.createGain();
          ph.stages = 6;
          ph.allpasses = [];
          let prev = ph.input;
          const base = 600;
          for(let i=0;i<ph.stages;i++){
            const ap = this.ctx.createBiquadFilter(); ap.type = 'allpass'; ap.frequency.value = base + i*200; prev.connect(ap); prev = ap; ph.allpasses.push(ap);
          }
          ph.panner = this.ctx.createStereoPanner(); ph.wet = this.ctx.createGain(); ph.wet.gain.value = 0;
          prev.connect(ph.panner); ph.panner.connect(ph.wet); ph.wet.connect(this.master);
          // feedback
          ph.feedback = this.ctx.createGain(); ph.feedback.gain.value = 0.25; try{ prev.connect(ph.feedback); ph.feedback.connect(ph.input); }catch(e){}
          // lfo
          ph.lfo = this.ctx.createOscillator(); ph.lfo.type = 'sine'; ph.lfo.frequency.value = this.controls.lfo.rate || 0.25;
          ph.lfoGain = this.ctx.createGain(); ph.lfoGain.gain.value = 200;
          ph.lfo.connect(ph.lfoGain);
          for(const ap of ph.allpasses){ try{ ph.lfoGain.connect(ap.frequency); }catch(e){} }
          try{ ph.lfo.start(); }catch(e){}
          this.effects.phase.experimental = ph;
          // route phase input to phaser input
          try{ this.effects.phase.input.disconnect(); }catch(e){}
          try{ this.effects.phase.input.connect(ph.input); }catch(e){}
          // mute original simple phase wet
          try{ this.effects.phase.wet.gain.setValueAtTime(0, this.ctx.currentTime); }catch(e){}
        } else {
          if(!this.effects.phase.experimental) return;
          const ph = this.effects.phase.experimental;
          try{ if(ph.lfo) try{ ph.lfo.stop(); }catch(e){} }catch(e){}
          try{ if(ph.lfoGain) ph.lfoGain.disconnect(); }catch(e){}
          try{ if(ph.feedback) ph.feedback.disconnect(); }catch(e){}
          try{ for(const ap of ph.allpasses) ap.disconnect(); }catch(e){}
          try{ ph.panner.disconnect(); ph.wet.disconnect(); }catch(e){}
          // restore original routing
          try{ this.effects.phase.input.disconnect(); }catch(e){}
          try{ this.effects.phase.input.connect(this.effects.phase.allpass1); }catch(e){}
          try{ this.effects.phase.wet.gain.setValueAtTime(0, this.ctx.currentTime); }catch(e){}
          this.effects.phase.experimental = null;
        }
      }catch(e){ console.error('Experimental phaser error', e); }
    };

    // Delay: simple feedback delay
    this.effects.delay = {};
    this.effects.delay.input = ctx.createGain();
    this.effects.delay.delay = ctx.createDelay(5.0);
    this.effects.delay.feedback = ctx.createGain(); this.effects.delay.feedback.gain.value = 0.25;
    this.effects.delay.wet = ctx.createGain(); this.effects.delay.wet.gain.value = 0;

    this.effects.delay.input.connect(this.effects.delay.delay);
    this.effects.delay.delay.connect(this.effects.delay.feedback);
    this.effects.delay.feedback.connect(this.effects.delay.delay);
    this.effects.delay.delay.connect(this.effects.delay.wet);
    this.effects.delay.wet.connect(this.master);

    // Chorus: ensemble chorus + per-voice mode
    this.effects.chorus = {};
    this.effects.chorus.input = ctx.createGain();
    this.effects.chorus.wet = ctx.createGain(); this.effects.chorus.wet.gain.value = 0;
    this.effects.chorus.voices = [];
    this.effects.chorus.baseDelay = 0.01; // 10ms base
    this.effects.chorus.depth = 0.007; // modulation depth
    this.effects.chorus.perVoice = false; // when true, each synth voice gets its own small chorus

    this.effects.chorus.input.connect(this.effects.chorus.wet); // dry route through wet for simple mix
    // normalization output gain (we measure RMS here and adjust this gain)
    this.effects.chorus.output = ctx.createGain(); this.effects.chorus.output.gain.value = 1.0;
    this.effects.chorus.wet.connect(this.effects.chorus.output);
    this.effects.chorus.output.connect(this.master);
    // analyser for RMS measurement (parallel branch; does not alter routing)
    this.effects.chorus.analyser = ctx.createAnalyser(); this.effects.chorus.analyser.fftSize = 1024;
    this.effects.chorus.output.connect(this.effects.chorus.analyser);
    this.effects.chorus._normTargetRms = 0.12; // target RMS (linear)
    // clamp normalization gain more tightly to avoid level spikes
    this.effects.chorus._normClamp = { min: 0.6, max: 1.2 }; // clamp normalization gain (approx -4.4dB .. +1.6dB)
    this.effects.chorus._normBuf = new Float32Array(this.effects.chorus.analyser.fftSize);

    // defaults
    this.setPhaseLevel(0);
    this.setPhaseWidth(0.5);
    this.setDelayLevel(0);
    this.setDelayRate(0.3);
    this.setChorusLevel(0);
    this.setChorusVoices(2);

    // start chorus RMS normalization loop
    try{ this._startChorusRMSNormalization(); }catch(e){}



    // setup VU meter sample buffer
    this._vuBuf = new Uint8Array(this.analyser.frequencyBinCount || 1024);
  }

  // Phase control
  setPhaseLevel(v){
    if(this.effects && this.effects.phase){
      try{ this.effects.phase.wet.gain.setValueAtTime(v, this.ctx.currentTime); }catch(e){}
      // if experimental phaser exists, apply wet there as well
      try{ if(this.effects.phase.experimental) this.effects.phase.experimental.wet.gain.setValueAtTime(v, this.ctx.currentTime); }catch(e){}
    }
  }

  setPhaseWidth(w){
    if(this.effects && this.effects.phase){
      const pan = (w*2 - 1);
      try{ this.effects.phase.panner.pan.setValueAtTime(pan, this.ctx.currentTime); }catch(e){}
      const now = this.ctx.currentTime;
      const base = 300 + w * 1700; // map width to base freq
      const depth = 50 + w * 600;
      const fb = 0.15 + w * 0.6;
      try{ if(this.effects.phase.allpass1) this.effects.phase.allpass1.frequency.setValueAtTime(base, now); }catch(e){}
      try{ if(this.effects.phase.allpass2) this.effects.phase.allpass2.frequency.setValueAtTime(base*1.5, now); }catch(e){}
      // apply to experimental phaser if present
      try{ if(this.effects.phase.experimental){ for(let i=0;i<this.effects.phase.experimental.allpasses.length;i++){ const ap = this.effects.phase.experimental.allpasses[i]; const stageFreq = base * (1 + i * 0.18); try{ ap.frequency.setValueAtTime(stageFreq, now); }catch(e){} } }
      }catch(e){}
      try{ if(this.effects.phase.experimental && this.effects.phase.experimental.lfoGain) this.effects.phase.experimental.lfoGain.gain.setValueAtTime(depth, now); }catch(e){}
      try{ if(this.effects.phase.experimental && this.effects.phase.experimental.feedback) this.effects.phase.experimental.feedback.gain.setValueAtTime(Math.min(0.95, fb), now); }catch(e){}
    }
  }

  // Delay control
  setDelayLevel(v){ if(this.effects && this.effects.delay) this.effects.delay.wet.gain.setValueAtTime(v, this.ctx.currentTime); }
  setDelayRate(r){ if(this.effects && this.effects.delay){ const t = Math.max(0.001, r * 0.8); this.effects.delay.delay.delayTime.setValueAtTime(t, this.ctx.currentTime); } }

  // Chorus control - dynamic voices (global ensemble or per-voice mode)
  setChorusLevel(v){ if(this.effects && this.effects.chorus) this.effects.chorus.wet.gain.setValueAtTime(v, this.ctx.currentTime); }
  setChorusVoices(n){ if(!this.effects || !this.effects.chorus) return; n = Math.max(1, Math.min(6, Math.round(n)));
    // interpret 6 as "per-voice mode"
    if(n === 6){
      this.effects.chorus.perVoice = true;
      // tear down any existing global voices
      if(this.effects.chorus.voices){ for(const pv of this.effects.chorus.voices){ try{ pv.lfo.stop(); }catch(e){} try{ pv.delay.disconnect(); pv.panner.disconnect(); }catch(e){} } }
      this.effects.chorus.voices = [];
      // rewire existing active synth voices into per-voice chorus chains
      try{ for(const v of this.voices.values()){ try{ v.envGain.disconnect(this.effects.chorus.input); }catch(e){} try{ const per = this._createPerVoiceChorusForVoice(v); if(per && per.input){ v.envGain.connect(per.input); v.perVoiceChorus = per; } }catch(e){} } }catch(e){}
      return;
    } else {
      // switching back to global chorus: remove any per-voice chorus chains
      this.effects.chorus.perVoice = false;
      try{ for(const v of this.voices.values()){ try{ if(v.perVoiceChorus){ for(const pv of v.perVoiceChorus.voices){ try{ pv.lfo.stop(); }catch(e){} try{ pv.delay.disconnect(); pv.panner.disconnect(); }catch(e){} } try{ v.perVoiceChorus.input.disconnect(); }catch(e){} try{ v.perVoiceChorus.wet.disconnect(); }catch(e){} delete v.perVoiceChorus; } }catch(e){} try{ v.envGain.connect(this.effects.chorus.input); }catch(e){} } }catch(e){}
    }

    // stop existing voices cleanly and rebuild
    if(this.effects.chorus.voices){ for(const pv of this.effects.chorus.voices){ try{ pv.lfo.stop(); }catch(e){} try{ pv.delay.disconnect(); pv.panner.disconnect(); }catch(e){} } }
    this.effects.chorus.voices = [];

    const spread = 0.6; // static pan spread
    for(let i=0;i<n;i++){
      const delay = this.ctx.createDelay(0.2);
      const lfo = this.ctx.createOscillator(); lfo.type = 'sine';
      const lfoGain = this.ctx.createGain(); lfoGain.gain.setTargetAtTime(this.effects.chorus.depth, this.ctx.currentTime, 0.05);
        // tie chorus LFO rate to global LFO (small per-voice detune for richness)
        const baseFactor = 0.2 + i * 0.08 + (Math.random()*0.02 - 0.01);
        try{ lfo.frequency.setTargetAtTime(Math.max(0.001, this.controls.lfo.rate * baseFactor), this.ctx.currentTime, 0.05); }catch(e){ lfo.frequency.value = Math.max(0.001, this.controls.lfo.rate * baseFactor); }
        lfo.connect(lfoGain); lfoGain.connect(delay.delayTime);
        const panner = this.ctx.createStereoPanner();
        // static pan across the stereo field, then add LFO-linked modulation
        const staticPan = (n===1) ? 0 : ((i/(n-1))*2 -1) * spread;
        try{ panner.pan.setValueAtTime(staticPan, this.ctx.currentTime); }catch(e){}
        // pan modulation gain controlled by global LFO depth (spread)
        const panGain = this.ctx.createGain(); panGain.gain.setTargetAtTime((this.controls.lfo.depth/100) * 0.8, this.ctx.currentTime, 0.05);
        try{ this.lfo.connect(panGain); panGain.connect(panner.pan); }catch(e){}
        // routing
        this.effects.chorus.input.connect(delay);
        delay.connect(panner);
        panner.connect(this.effects.chorus.wet);
        try{ lfo.start(); }catch(e){}
        this.effects.chorus.voices.push({idx:i,delay,lfo,lfoGain,panner,panGain});
      }
    }

  // apply a smoothed chorus modulation depth update across active global & per-voice chains
  setChorusDepth(d){
    if(!this.effects || !this.effects.chorus) return;
    this.effects.chorus.depth = d;
    const now = this.ctx.currentTime;
    try{
      if(this.effects.chorus.voices){ for(const pv of this.effects.chorus.voices){ try{ pv.lfoGain.gain.setTargetAtTime(d, now, 0.05); }catch(e){} } }
      for(const v of this.voices.values()){
        if(v.perVoiceChorus && v.perVoiceChorus.voices){ for(const pv of v.perVoiceChorus.voices){ try{ pv.lfoGain.gain.setTargetAtTime(d, now, 0.05); }catch(e){} } }
      }
    }catch(e){}
  }

  // keep chorus voice LFOs in sync with global LFO rate (smoothed)
  setChorusRate(r){
    if(!this.effects || !this.effects.chorus) return;
    const now = this.ctx.currentTime;
    try{
      if(this.effects.chorus.voices){
        for(const pv of this.effects.chorus.voices){
          const factor = 0.2 + (pv.idx||0) * 0.08 + (Math.random()*0.02 - 0.01);
          try{ pv.lfo.frequency.setTargetAtTime(Math.max(0.001, r * factor), now, 0.05); }catch(e){ pv.lfo.frequency.value = Math.max(0.001, r * factor); }
        }
      }
      for(const v of this.voices.values()){
        if(v.perVoiceChorus && v.perVoiceChorus.voices){
          for(const pv of v.perVoiceChorus.voices){
            const factor = 0.18 + (pv.idx||0) * 0.03 + (Math.random()*0.02 - 0.01);
            try{ pv.lfo.frequency.setTargetAtTime(Math.max(0.001, r * factor), now, 0.05); }catch(e){ pv.lfo.frequency.value = Math.max(0.001, r * factor); }
          }
        }
      }
    }catch(e){}
  }

  // RMS-based chorus normalization helpers
  _startChorusRMSNormalization(){
    try{ if(this._chorusNormInterval) return; const fn = ()=>{ this._measureAndApplyChorusNorm(); }; this._chorusNormInterval = setInterval(fn, 50); // run ~20Hz
      // ensure cleanup on page unload
      try{ window.addEventListener('unload', ()=>{ try{ this._stopChorusRMSNormalization(); }catch(e){} }); }catch(e){}
    }catch(e){}
  }

  _stopChorusRMSNormalization(){ try{ if(this._chorusNormInterval){ clearInterval(this._chorusNormInterval); delete this._chorusNormInterval; } }catch(e){}
  }

  _measureAndApplyChorusNorm(){
    try{
      if(!this.effects || !this.effects.chorus || !this.effects.chorus.analyser) return;
      const an = this.effects.chorus.analyser; const buf = this.effects.chorus._normBuf; an.getFloatTimeDomainData(buf);
      let sum = 0; for(let i=0;i<buf.length;i++){ const v = buf[i]; sum += v*v; }
      const rms = Math.sqrt(sum / buf.length) || 1e-8;
      // desired target scaled by user wet level so slider still behaves as expected
      const targetRmsEffective = this.effects.chorus._normTargetRms * (this.effects.chorus.wet ? this.effects.chorus.wet.gain.value : 1);
      let requiredGain = targetRmsEffective / rms;
      // clamp to avoid extreme boosts/cuts
      requiredGain = Math.max(this.effects.chorus._normClamp.min, Math.min(this.effects.chorus._normClamp.max, requiredGain));
      // smooth target application
      try{ this.effects.chorus.output.gain.setTargetAtTime(requiredGain, this.ctx.currentTime, 0.08); }catch(e){ this.effects.chorus.output.gain.value = requiredGain; }
    }catch(e){}
  }

  // Attach LFO nodes to a new voice and connect according to enabled targets
  _attachLFOToVoice(voice){
    const c = this.controls;
    const ctx = this.ctx;
    const t = this.lfoMax;

    // create gain nodes for all possible targets
    voice.lfoNodes.oscA_pitch = ctx.createGain();
    voice.lfoNodes.oscA_detune = ctx.createGain();
    voice.lfoNodes.oscA_level = ctx.createGain();
    voice.lfoNodes.oscB_pitch = ctx.createGain();
    voice.lfoNodes.oscB_detune = ctx.createGain();
    voice.lfoNodes.oscB_level = ctx.createGain();
    voice.lfoNodes.filter_cutoff = ctx.createGain();
    voice.lfoNodes.filter_q = ctx.createGain();
    // two mix nodes (one that adds to A, one that subtracts from B)
    voice.lfoNodes.mixA = ctx.createGain();
    voice.lfoNodes.mixB = ctx.createGain();

    // set gains according to current LFO depth
    this._updateLFONodeGain(voice.lfoNodes.oscA_pitch, (c.lfo.depth/100)*t.oscPitch);
    this._updateLFONodeGain(voice.lfoNodes.oscA_detune, (c.lfo.depth/100)*t.oscDetune);
    this._updateLFONodeGain(voice.lfoNodes.oscA_level, (c.lfo.depth/100)*t.oscLevel);
    this._updateLFONodeGain(voice.lfoNodes.oscB_pitch, (c.lfo.depth/100)*t.oscPitch);
    this._updateLFONodeGain(voice.lfoNodes.oscB_detune, (c.lfo.depth/100)*t.oscDetune);
    this._updateLFONodeGain(voice.lfoNodes.oscB_level, (c.lfo.depth/100)*t.oscLevel);
    this._updateLFONodeGain(voice.lfoNodes.filter_cutoff, (c.lfo.depth/100)*t.filterCutoff);
    this._updateLFONodeGain(voice.lfoNodes.filter_q, (c.lfo.depth/100)*t.filterQ);
    // mix: use symmetrical +/- scaling (mixA positive, mixB negative)
    this._updateLFONodeGain(voice.lfoNodes.mixA, (c.lfo.depth/100)*t.mix);
    this._updateLFONodeGain(voice.lfoNodes.mixB, -(c.lfo.depth/100)*t.mix);

    // ensure per-voice noise level matches current global noiseLevel
    if(voice.noiseGain) voice.noiseGain.gain.setValueAtTime(this.controls.noiseLevel, this.ctx.currentTime);

    // connect nodes to destination AudioParams
    voice.lfoNodes.oscA_pitch.connect(voice.oscA.detune);
    voice.lfoNodes.oscA_detune.connect(voice.oscA.detune);
    voice.lfoNodes.oscA_level.connect(voice.gA.gain);
    voice.lfoNodes.oscB_pitch.connect(voice.oscB.detune);
    voice.lfoNodes.oscB_detune.connect(voice.oscB.detune);
    voice.lfoNodes.oscB_level.connect(voice.gB.gain);
    voice.lfoNodes.filter_cutoff.connect(voice.filter.frequency);
    voice.lfoNodes.filter_q.connect(voice.filter.Q);
    voice.lfoNodes.mixA.connect(voice.gA.gain);
    voice.lfoNodes.mixB.connect(voice.gB.gain);

    // connect the global LFO to enabled nodes for this voice
    for(const target of this.lfoTargetsEnabled){
      if(target === 'mix'){
        // connect to both mix nodes
        this.lfo.connect(voice.lfoNodes.mixA);
        this.lfo.connect(voice.lfoNodes.mixB);
      } else if(voice.lfoNodes[target]){
        this.lfo.connect(voice.lfoNodes[target]);
      }
    }
  }

  _detachLFOFromVoice(voice){
    // disconnect any LFO connections and free nodes
    try{
      for(const key in voice.lfoNodes){
        try{ this.lfo.disconnect(voice.lfoNodes[key]); }catch(e){}
        try{ voice.lfoNodes[key].disconnect(); }catch(e){}
        delete voice.lfoNodes[key];
      }
      // disconnect per-voice noise gain
      try{ if(voice.noiseGain){ this.noiseOutput.disconnect(voice.noiseGain); voice.noiseGain.disconnect(); delete voice.noiseGain; } }catch(e){}
      // disconnect any effect routing
      try{
        if(voice.envGain){
          if(this.effects){
            try{ voice.envGain.disconnect(this.effects.phase.input); }catch(e){}
            try{ voice.envGain.disconnect(this.effects.delay.input); }catch(e){}
            try{ voice.envGain.disconnect(this.effects.chorus.input); }catch(e){}
            // clean up per-voice chorus if present
            try{ if(voice.perVoiceChorus){ for(const pv of voice.perVoiceChorus.voices){ try{ pv.lfo.stop(); }catch(e){} try{ pv.delay.disconnect(); pv.panner.disconnect(); }catch(e){} } try{ voice.perVoiceChorus.input.disconnect(); }catch(e){} try{ voice.perVoiceChorus.wet.disconnect(); }catch(e){} delete voice.perVoiceChorus; } }catch(e){}
          }
        }
      }catch(e){}
    }catch(e){}
  }

  _updateLFONodeGain(node, value){
    if(!node || !node.gain) return;
    node.gain.setValueAtTime(value, this.ctx.currentTime);
  }

  _updateLFODepth(){
    const c = this.controls; const t = this.lfoMax;
    for(const v of this.voices.values()){
      if(!v.lfoNodes) continue;
      this._updateLFONodeGain(v.lfoNodes.oscA_pitch, (c.lfo.depth/100)*t.oscPitch);
      this._updateLFONodeGain(v.lfoNodes.oscA_detune, (c.lfo.depth/100)*t.oscDetune);
      this._updateLFONodeGain(v.lfoNodes.oscA_level, (c.lfo.depth/100)*t.oscLevel);
      this._updateLFONodeGain(v.lfoNodes.oscB_pitch, (c.lfo.depth/100)*t.oscPitch);
      this._updateLFONodeGain(v.lfoNodes.oscB_detune, (c.lfo.depth/100)*t.oscDetune);
      this._updateLFONodeGain(v.lfoNodes.oscB_level, (c.lfo.depth/100)*t.oscLevel);
      this._updateLFONodeGain(v.lfoNodes.filter_cutoff, (c.lfo.depth/100)*t.filterCutoff);
      this._updateLFONodeGain(v.lfoNodes.filter_q, (c.lfo.depth/100)*t.filterQ);
      this._updateLFONodeGain(v.lfoNodes.mixA, (c.lfo.depth/100)*t.mix);
      this._updateLFONodeGain(v.lfoNodes.mixB, -(c.lfo.depth/100)*t.mix);
    }
    // update chorus pan modulation amplitudes (spread) to follow LFO depth
    if(this.effects && this.effects.chorus){
      const panAmp = (c.lfo.depth/100) * 0.8;
      try{
        if(this.effects.chorus.voices){ for(const pv of this.effects.chorus.voices){ if(pv.panGain && pv.panGain.gain) pv.panGain.gain.setTargetAtTime(panAmp, this.ctx.currentTime, 0.05); } }
        // update any per-voice chorus pieces attached to active voices
        for(const v of this.voices.values()){ if(v.perVoiceChorus && v.perVoiceChorus.voices){ for(const pv of v.perVoiceChorus.voices){ if(pv.panGain && pv.panGain.gain) pv.panGain.gain.setTargetAtTime((c.lfo.depth/100) * 0.6, this.ctx.currentTime, 0.05); } } }
      }catch(e){}
    }
  }

  _changeOscZoom(axis, dir){
    // axis: 'x'|'y', dir: 'in'|'out' — use small additive steps for momentary presses
    const delta = 0.1;

    let curX = Number(this._oscZoomX); if(!isFinite(curX)) curX = 1;
    let curY = Number(this._oscZoomY); if(!isFinite(curY)) curY = 1;

    if(axis === 'x'){
      curX += (dir === 'in' ? delta : -delta);
      curX = Math.max(0.25, Math.min(32, curX));
    } else {
      curY += (dir === 'in' ? delta : -delta);
      curY = Math.max(0.25, Math.min(32, curY));
    }

    // commit sanitized values
    this._oscZoomX = curX;
    this._oscZoomY = curY;

    // visual feedback: update readout and canvas data attribute
    try{
      const c = document.getElementById('oscilloscope'); if(c) c.setAttribute('data-zoom', `x:${curX.toFixed(2)} y:${curY.toFixed(2)}`);
    }catch(e){}
  }

  _bindOscZoomControls(){
    try{
      const zoomBtns = document.querySelectorAll('.osc-zoom-btn');
      if(!zoomBtns || zoomBtns.length === 0) return;
      // single click (per-button handlers) — momentary single-step change
      zoomBtns.forEach(b=>{ b.addEventListener('click', (ev)=>{ ev.preventDefault(); ev.stopPropagation(); b.classList.add('pressed'); b.setAttribute('aria-pressed','true'); const axis = b.dataset.axis; const zm = b.dataset.zoom; this._changeOscZoom(axis, zm); setTimeout(()=>{ b.classList.remove('pressed'); b.setAttribute('aria-pressed','false'); }, 140); }); });

      // remove continuous-press behavior: momentary only (no intervals)

      // Delegated event as fallback in case per-button handlers miss (e.g., DOM changes)
      this._oscZoomDelegatedClick = (e)=>{ const btn = e.target.closest && e.target.closest('.osc-zoom-btn'); if(!btn) return; e.preventDefault(); e.stopPropagation(); btn.classList.add('pressed'); btn.setAttribute('aria-pressed','true'); this._changeOscZoom(btn.dataset.axis, btn.dataset.zoom); setTimeout(()=>{ btn.classList.remove('pressed'); btn.setAttribute('aria-pressed','false'); }, 140); };
      document.addEventListener('click', this._oscZoomDelegatedClick);

        // Auto-scaling toggles: set flags, actual work happens in draw loop (throttled)
      try{
        this._oscAutoEnabled = { x: false, y: false };
        this._lastAutoX = 0; this._lastAutoY = 0;
        const autoX = document.getElementById('osc_auto_x');
        const autoY = document.getElementById('osc_auto_y');
        if(autoX){ autoX.addEventListener('change',(e)=>{ this._oscAutoEnabled.x = !!e.target.checked; if(this._oscAutoEnabled.x) this._autoScaleX(); }); }
        if(autoY){ autoY.addEventListener('change',(e)=>{ this._oscAutoEnabled.y = !!e.target.checked; if(this._oscAutoEnabled.y) this._autoScaleY(); }); }
      }catch(e){}

    }catch(e){/* ignore */}
  }

  setLfoTarget(target, enabled){
    if(enabled) this.lfoTargetsEnabled.add(target); else this.lfoTargetsEnabled.delete(target);
    // attach/detach for active voices
    for(const v of this.voices.values()){
      if(!v.lfoNodes) continue;
      if(target === 'mix'){
        // connect/disconnect to both mix nodes
        if(enabled){ this.lfo.connect(v.lfoNodes.mixA); this.lfo.connect(v.lfoNodes.mixB); }
        else { try{ this.lfo.disconnect(v.lfoNodes.mixA); }catch(e){} try{ this.lfo.disconnect(v.lfoNodes.mixB); }catch(e){} }
        continue;
      }
      const node = v.lfoNodes[target];
      if(!node) continue;
      if(enabled){ this.lfo.connect(node); } else { try{ this.lfo.disconnect(node); }catch(e){} }
    }
  }

  noteOn(note){
    const now = this.ctx.currentTime;
    if(this.voices.size >= (this.maxVoices)){
      // steal oldest
      const firstKey = this.voices.keys().next().value;
      this.noteOff(firstKey);
    }
    const v = new Voice(this.ctx, this.master, this.controls, this);
    const freq = 440 * Math.pow(2, (note - 69)/12);
    v.start(freq, now, this.controls.ampADSR, this.controls.filterADSR, this.controls);

    this.voices.set(note, v);
  }

  noteOff(note){
    const now = this.ctx.currentTime;
    const v = this.voices.get(note);
    if(!v) return;
    v.release(now, this.controls.ampADSR, this.controls.filterADSR);
    // cleanup after release time
    const r = this.controls.ampADSR.r;
    setTimeout(()=>{ this._detachLFOFromVoice(v); }, (r+0.2)*1000);
    this.voices.delete(note);
  }

  connectUIControls(){
    // Master
    const masterGain = document.getElementById('masterGain');
    masterGain.addEventListener('input', (e)=>{ this.master.gain.value = parseFloat(e.target.value); });

    // Polyphony controls (seven-seg display + up/down LED buttons)
    const polyDisplay = document.getElementById('poly_display');
    const polyUp = document.getElementById('poly_up');
    const polyDown = document.getElementById('poly_down');
    const segmentMap = {
      '0': ['a','b','c','d','e','f'],
      '1': ['b','c'],
      '2': ['a','b','g','e','d'],
      '3': ['a','b','g','c','d'],
      '4': ['f','g','b','c'],
      '5': ['a','f','g','c','d'],
      '6': ['a','f','g','c','d','e'],
      '7': ['a','b','c'],
      '8': ['a','b','c','d','e','f','g']
    };
    const setDigit = (digitEl, num)=>{
      const segs = digitEl.querySelectorAll('.seg');
      const on = segmentMap[num] || [];
      segs.forEach(s=>{ s.classList.toggle('on', on.includes(s.classList[1])); });
    };
    const updatePolyDisplay = ()=>{
      if(!polyDisplay) return;
      const value = Math.max(1, Math.min(8, this.maxVoices));
      const digits = polyDisplay.querySelectorAll('.digit');
      const ch = String(value);
      setDigit(digits[0], ch);
    };
    if(polyUp){ polyUp.addEventListener('click', ()=>{ this.maxVoices = Math.min(8, this.maxVoices + 1); updatePolyDisplay(); }); }
    if(polyDown){ polyDown.addEventListener('click', ()=>{ this.maxVoices = Math.max(1, this.maxVoices - 1); updatePolyDisplay(); }); }
    // initialize display
    updatePolyDisplay();

    // Osc controls (now single-choice checkbox groups for waves)
    document.querySelectorAll('.single-choice[data-group="oscA_wave"]').forEach(cb=>{
      cb.addEventListener('change', (e)=>{
        const group = 'oscA_wave';
        if(cb.checked){
          document.querySelectorAll(`.single-choice[data-group="${group}"]`).forEach(other=>{ if(other!==cb) other.checked = false; });
          this.controls.oscA.wave = cb.value;
          for(const v of this.voices.values()){ v.oscA.type = cb.value; }
        } else {
          const any = Array.from(document.querySelectorAll(`.single-choice[data-group="${group}"]`)).some(n=>n.checked);
          if(!any) cb.checked = true; // keep at least one selected
        }
      });
    });
    document.querySelectorAll('.single-choice[data-group="oscB_wave"]').forEach(cb=>{
      cb.addEventListener('change', (e)=>{
        const group = 'oscB_wave';
        if(cb.checked){
          document.querySelectorAll(`.single-choice[data-group="${group}"]`).forEach(other=>{ if(other!==cb) other.checked = false; });
          this.controls.oscB.wave = cb.value;
          for(const v of this.voices.values()){ v.oscB.type = cb.value; }
        } else {
          const any = Array.from(document.querySelectorAll(`.single-choice[data-group="${group}"]`)).some(n=>n.checked);
          if(!any) cb.checked = true;
        }
      });
    });

    document.getElementById('oscA_detune').addEventListener('input',(e)=>{ this.controls.oscA.detune = parseFloat(e.target.value); for(const v of this.voices.values()){ v.oscA.detune.setValueAtTime(this.controls.oscA.detune, this.ctx.currentTime); } });
    document.getElementById('oscB_detune').addEventListener('input',(e)=>{ this.controls.oscB.detune = parseFloat(e.target.value); for(const v of this.voices.values()){ v.oscB.detune.setValueAtTime(this.controls.oscB.detune, this.ctx.currentTime); } });
    document.getElementById('oscA_level').addEventListener('input',(e)=>{ this.controls.oscA.level = parseFloat(e.target.value); this._updateAllVoicesLevels(); });
    document.getElementById('oscB_level').addEventListener('input',(e)=>{ this.controls.oscB.level = parseFloat(e.target.value); this._updateAllVoicesLevels(); });

    document.getElementById('osc_mix').addEventListener('input',(e)=>{ this.controls.mix = parseFloat(e.target.value); this._updateAllVoicesLevels(); });

    // LFO
    document.getElementById('lfo_rate').addEventListener('input',(e)=>{ this.controls.lfo.rate = parseFloat(e.target.value); this.lfo.frequency.value = this.controls.lfo.rate; try{ if(this.effects && this.effects.phase && this.effects.phase.experimental && this.effects.phase.experimental.lfo){ this.effects.phase.experimental.lfo.frequency.setValueAtTime(this.controls.lfo.rate, this.ctx.currentTime); } }catch(ex){} try{ this.setChorusRate(this.controls.lfo.rate); }catch(ex){} });
    document.getElementById('lfo_depth').addEventListener('input',(e)=>{ this.controls.lfo.depth = parseFloat(e.target.value); this._updateLFODepth(); });
    document.querySelectorAll('.lfo_target').forEach(cb=>{
      cb.addEventListener('change',(e)=>{ this.setLfoTarget(cb.value, cb.checked); });
    });

    // Noise level
    const noise = document.getElementById('noise_level');
    if(noise){ noise.addEventListener('input',(e)=>{ this.controls.noiseLevel = parseFloat(e.target.value); // update all active voices noise gain
        const g = this._sliderToGain(this.controls.noiseLevel);
        for(const v of this.voices.values()){ if(v.noiseGain) v.noiseGain.gain.setValueAtTime(g, this.ctx.currentTime); }
      }); }

    // Effects controls
    const phaseL = document.getElementById('phase_level');
    if(phaseL) phaseL.addEventListener('input',(e)=>{ this.setPhaseLevel(parseFloat(e.target.value)); });
    const phaseW = document.getElementById('phase_width');
    if(phaseW) phaseW.addEventListener('input',(e)=>{ this.setPhaseWidth(parseFloat(e.target.value)); });

    const delayL = document.getElementById('delay_level');
    if(delayL) delayL.addEventListener('input',(e)=>{ this.setDelayLevel(parseFloat(e.target.value)); });
    const delayR = document.getElementById('delay_rate');
    if(delayR) delayR.addEventListener('input',(e)=>{ this.setDelayRate(parseFloat(e.target.value)); });

    const chorusL = document.getElementById('chorus_level');
    if(chorusL) chorusL.addEventListener('input',(e)=>{ this.setChorusLevel(parseFloat(e.target.value)); });
    const chorusV = document.getElementById('chorus_voices');
    if(chorusV) chorusV.addEventListener('input',(e)=>{ this.setChorusVoices(parseFloat(e.target.value)); });

    // Filter (single-choice checkboxes for type)
    document.querySelectorAll('.single-choice[data-group="filter_type"]').forEach(cb=>{
      cb.addEventListener('change',(e)=>{
        const group = 'filter_type';
        if(cb.checked){
          document.querySelectorAll(`.single-choice[data-group="${group}"]`).forEach(other=>{ if(other!==cb) other.checked = false; });
          this.controls.filter.type = cb.value;
          for(const v of this.voices.values()){ v.filter.type = cb.value; }
        } else {
          const any = Array.from(document.querySelectorAll(`.single-choice[data-group="${group}"]`)).some(n=>n.checked);
          if(!any) cb.checked = true;
        }
      });
    });
    document.getElementById('filter_cutoff').addEventListener('input',(e)=>{ this.controls.filter.cutoff = parseFloat(e.target.value); for(const v of this.voices.values()){ v.filter.frequency.setValueAtTime(this.controls.filter.cutoff, this.ctx.currentTime); } });
    document.getElementById('filter_q').addEventListener('input',(e)=>{ this.controls.filter.Q = parseFloat(e.target.value); for(const v of this.voices.values()){ v.filter.Q.setValueAtTime(this.controls.filter.Q, this.ctx.currentTime); } });
    document.getElementById('filter_env_amt').addEventListener('input',(e)=>{ this.controls.filter.envAmt = parseFloat(e.target.value); });

    // ADSR
    ['amp_a','amp_d','amp_s','amp_r'].forEach((id, i)=>{
      document.getElementById(id).addEventListener('input',(e)=>{
        const v = parseFloat(e.target.value);
        if(id==='amp_a') this.controls.ampADSR.a = v;
        if(id==='amp_d') this.controls.ampADSR.d = v;
        if(id==='amp_s') this.controls.ampADSR.s = v;
        if(id==='amp_r') this.controls.ampADSR.r = v;
      });
    });
    ['f_a','f_d','f_s','f_r'].forEach((id, i)=>{
      document.getElementById(id).addEventListener('input',(e)=>{
        const v = parseFloat(e.target.value);
        if(id==='f_a') this.controls.filterADSR.a = v;
        if(id==='f_d') this.controls.filterADSR.d = v;
        if(id==='f_s') this.controls.filterADSR.s = v;
        if(id==='f_r') this.controls.filterADSR.r = v;
      });
    });
  }

  _updateAllVoicesLevels(){
    for(const v of this.voices.values()){
      v.gA.gain.setValueAtTime(this.controls.oscA.level * (1 - this.controls.mix), this.ctx.currentTime);
      v.gB.gain.setValueAtTime(this.controls.oscB.level * this.controls.mix, this.ctx.currentTime);
    }
  }

  _buildUI(){
    this.connectUIControls();
    this._buildKeyboard();
    // bind oscilloscope zoom controls after UI is ready
    this._bindOscZoomControls();
  }

  _buildKeyboard(){
    const keys = [
      'Z','S','X','D','C','V','G','B','H','N','J','M',
      'Q','2','W','3','E','R','5','T','6','Y','7','U'
    ];
    const baseMidi = 48; // C3
    const container = document.getElementById('keyboard');
    keys.forEach((k, i)=>{
      const key = document.createElement('div');
      key.className = 'key';
      key.textContent = k;
      key.dataset.note = baseMidi + i;
      key.addEventListener('mousedown', ()=>{ this.noteOn(parseInt(key.dataset.note)); key.classList.add('active'); });
      key.addEventListener('mouseup', ()=>{ this.noteOff(parseInt(key.dataset.note)); key.classList.remove('active'); });
      key.addEventListener('mouseleave', ()=>{ this.noteOff(parseInt(key.dataset.note)); key.classList.remove('active'); });
      container.appendChild(key);
    });

    window.addEventListener('keydown', (e)=>{
      if(e.repeat) return;
      const idx = keys.indexOf(e.key.toUpperCase());
      if(idx >= 0){ const note = baseMidi + idx; this.noteOn(note); this._highlightKey(note, true); }
    });
    window.addEventListener('keyup', (e)=>{
      const idx = keys.indexOf(e.key.toUpperCase());
      if(idx >= 0){ const note = baseMidi + idx; this.noteOff(note); this._highlightKey(note, false); }
    });

    // focus to capture keyboard
    container.tabIndex = 0; container.addEventListener('click', ()=>{ container.focus(); if(this.ctx.state === 'suspended') this.ctx.resume(); });

    // bind MIDI controls (button/select)
    this._bindMIDIControls();

    // bind osc zoom controls (ensures handlers added after dom construction)
    this._bindOscZoomControls();
  }

  _bindMIDIControls(){
    const btn = document.getElementById('midi_enable');
    const sel = document.getElementById('midi_inputs');
    const status = document.getElementById('midi_status');
    if(!btn || !status) return;
    btn.addEventListener('click', async ()=>{
      if(!navigator.requestMIDIAccess){ status.textContent = 'MIDI not supported'; return; }
      status.textContent = 'Requesting...';
      await this._requestMIDI();
    });
    if(sel){ sel.addEventListener('change', (e)=>{
      const id = e.target.value; if(!this.midi || !this.midi.access) return;
      // detach previous
      if(this.midi.input && typeof this.midi.input.onmidimessage === 'function') this.midi.input.onmidimessage = null;
      // if user selected 'none' (empty string), clear selection
      if(!id){ this.midi.input = null; const status = document.getElementById('midi_status'); if(status) status.textContent = 'None'; return; }
      const input = this.midi.access.inputs.get(id);
      if(input){ this.midi.input = input; input.onmidimessage = (ev)=> this._onMIDIMessage(ev); const status = document.getElementById('midi_status'); if(status) status.textContent = ''; }
    }); }
  }

  async _requestMIDI(){
    try{
      const access = await navigator.requestMIDIAccess({ sysex: false });
      this.midi = { access, input: null };
      // populate inputs
      this._updateMIDIDevices();
      access.onstatechange = ()=> this._updateMIDIDevices();
      // auto-select first input if available
      const it = access.inputs.values().next();
      const sel = document.getElementById('midi_inputs');
      if(!it.done){ const first = it.value; this.midi.input = first; first.onmidimessage = (ev)=> this._onMIDIMessage(ev); const status = document.getElementById('midi_status'); if(status) status.textContent = ''; if(sel){ sel.value = first.id; sel.style.display = ''; } }
      else { const status = document.getElementById('midi_status'); if(status) status.textContent = 'None'; if(sel) sel.style.display = ''; }
    }catch(e){ const status = document.getElementById('midi_status'); if(status) status.textContent = 'Permission denied'; }
  }

  _updateMIDIDevices(){
    if(!this.midi || !this.midi.access) return;
    const sel = document.getElementById('midi_inputs');
    if(!sel) return;
    // clear and add explicit 'None' option
    sel.innerHTML = '';
    const none = document.createElement('option'); none.value = ''; none.textContent = 'None'; sel.appendChild(none);
    for(const input of this.midi.access.inputs.values()){
      const opt = document.createElement('option'); opt.value = input.id; opt.textContent = input.name || input.manufacturer || input.id; sel.appendChild(opt);
    }
    sel.style.display = '';
    const status = document.getElementById('midi_status');
    if(this.midi.input){ sel.value = this.midi.input.id; if(status) status.textContent = (this.midi.input.name || this.midi.input.id); }
    else { sel.value = ''; if(status) status.textContent = 'None'; }
  }

  _onMIDIMessage(ev){
    const data = ev.data; const status = data[0] & 0xf0; const note = data[1]; const value = data[2];
    if(status === 0x90){ // note on (velocity>0)
      if(value > 0){ this.noteOn(note); this._highlightKey(note, true); }
      else { this.noteOff(note); this._highlightKey(note, false); }
    } else if(status === 0x80){ // note off
      this.noteOff(note); this._highlightKey(note, false);
    } else if(status === 0xB0){ // control change
      // map CCs: 7->master, 74->filter cutoff, 1->lfo depth
      if(note === 7){ const v = value/127; const el = document.getElementById('masterGain'); if(el){ el.value = v; this.master.gain.value = v; } }
      else if(note === 74){ const norm = value/127; const min = 20, max = 20000; const cutoff = Math.round(min * Math.pow(max/min, norm)); const el = document.getElementById('filter_cutoff'); if(el){ el.value = cutoff; this.controls.filter.cutoff = cutoff; for(const v of this.voices.values()){ if(v.filter) v.filter.frequency.setValueAtTime(cutoff, this.ctx.currentTime); } } }
      else if(note === 1){ const v = Math.round((value/127)*100); const el = document.getElementById('lfo_depth'); if(el){ el.value = v; this.controls.lfo.depth = v; this._updateLFODepth(); } }
    }
  }

  _highlightKey(note, on){
    const keys = document.querySelectorAll('#keyboard .key');
    keys.forEach(k=>{ if(parseInt(k.dataset.note)===note){ if(on) k.classList.add('active'); else k.classList.remove('active'); }});
  }

  // Dispose/cleanup to stop audio, animation loops, and free resources
  dispose(){
    // stop VU meter loop
    try{ this._vuRunning = false; if(this._vuRafId) cancelAnimationFrame(this._vuRafId); }catch(e){}
    // stop and disconnect noise source
    try{
      if(this._noiseSource){ try{ this._noiseSource.stop(); }catch(e){} try{ this._noiseSource.disconnect(); }catch(e){} }
      try{ if(this.noiseOutput){ this.noiseOutput.disconnect(); } }catch(e){}
      delete this._noiseSource;
    }catch(e){}
    // release voices
    try{
      for(const v of this.voices.values()){ try{ v.release(this.ctx.currentTime, this.controls.ampADSR, this.controls.filterADSR); }catch(e){} }
      this.voices.clear();
    }catch(e){}

    // cleanup MIDI handlers
    try{
      if(this.midi && this.midi.input && typeof this.midi.input.onmidimessage === 'function') this.midi.input.onmidimessage = null;
      if(this.midi && this.midi.access && typeof this.midi.access.onstatechange === 'function') this.midi.access.onstatechange = null;
      delete this.midi;
    }catch(e){}

    // cleanup osc zoom delegated handler
    try{ if(this._oscZoomDelegatedClick) document.removeEventListener('click', this._oscZoomDelegatedClick); delete this._oscZoomDelegatedClick; }catch(e){}

    // cleanup auto scale intervals
    try{ if(this._oscAutoIntervals){ if(this._oscAutoIntervals.x) clearInterval(this._oscAutoIntervals.x); if(this._oscAutoIntervals.y) clearInterval(this._oscAutoIntervals.y); delete this._oscAutoIntervals; } }catch(e){}

    // cleanup experimental phaser if present
    try{ if(this.effects && this.effects.phase && this.effects.phase.experimental){ try{ if(this.effects.phase.experimental.lfo) this.effects.phase.experimental.lfo.stop(); }catch(e){} try{ if(this.effects.phase.experimental.lfoGain) this.effects.phase.experimental.lfoGain.disconnect(); }catch(e){} try{ if(this.effects.phase.experimental.feedback) this.effects.phase.experimental.feedback.disconnect(); }catch(e){} } }catch(e){}

    // close audio context
    try{ if(this.ctx && typeof this.ctx.close === 'function'){ this.ctx.close().catch(()=>{}); } }catch(e){}
  }
}

window.addEventListener('load', ()=>{
  const synth = new Synth();
  // expose to console for tinkering
  window.synth = synth;
  // ensure cleanup on page unload to release audio resources and stop animation loops
  window.addEventListener('beforeunload', ()=>{ try{ if(window.synth && typeof window.synth.dispose === 'function'){ window.synth.dispose(); } }catch(e){} });
});