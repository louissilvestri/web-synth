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
      const draw = ()=>{
        if(!this._oscRunning) return;
        this.analyser.getByteTimeDomainData(this._oscBuf);
        const dpr = window.devicePixelRatio || 1;
        const W = Math.max(1, Math.floor(canvas.clientWidth * dpr));
        const H = Math.max(1, Math.floor(canvas.clientHeight * dpr));
        if(canvas.width !== W || canvas.height !== H){ canvas.width = W; canvas.height = H; }
        ctx.clearRect(0,0,canvas.width,canvas.height);
        // background subtle
        ctx.fillStyle = 'rgba(0,0,0,0)';
        ctx.fillRect(0,0,canvas.width,canvas.height);
        // draw waveform
        ctx.lineWidth = 2 * dpr;
        ctx.strokeStyle = '#7CFF6B';
        ctx.beginPath();
        const centerY = canvas.height / 2;
        const slice = canvas.width / this._oscBuf.length;
        for(let i=0;i<this._oscBuf.length;i++){
          const v = (this._oscBuf[i] - 128) / 128; // -1..1
          const x = i * slice;
          const y = centerY + v * centerY * 0.95;
          if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
        }
        ctx.stroke();
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

    // Chorus: multiple modulated short delays
    this.effects.chorus = {};
    this.effects.chorus.input = ctx.createGain();
    this.effects.chorus.wet = ctx.createGain(); this.effects.chorus.wet.gain.value = 0;
    this.effects.chorus.voices = [];
    this.effects.chorus.baseDelay = 0.01; // 10ms base
    this.effects.chorus.depth = 0.007; // modulation depth

    this.effects.chorus.input.connect(this.effects.chorus.wet); // dry route through wet for simple mix
    this.effects.chorus.wet.connect(this.master);

    // defaults
    this.setPhaseLevel(0);
    this.setPhaseWidth(0.5);
    this.setDelayLevel(0);
    this.setDelayRate(0.3);
    this.setChorusLevel(0);
    this.setChorusVoices(2);

    // setup VU meter sample buffer
    this._vuBuf = new Uint8Array(this.analyser.frequencyBinCount || 1024);
  }

  // Phase control
  setPhaseLevel(v){ if(this.effects && this.effects.phase) this.effects.phase.wet.gain.setValueAtTime(v, this.ctx.currentTime); }
  setPhaseWidth(w){ if(this.effects && this.effects.phase){ const pan = (w*2 - 1); this.effects.phase.panner.pan.setValueAtTime(pan, this.ctx.currentTime); const freq = 500 + w*3000; this.effects.phase.allpass1.frequency.setValueAtTime(freq, this.ctx.currentTime); this.effects.phase.allpass2.frequency.setValueAtTime(freq*1.5, this.ctx.currentTime); } }

  // Delay control
  setDelayLevel(v){ if(this.effects && this.effects.delay) this.effects.delay.wet.gain.setValueAtTime(v, this.ctx.currentTime); }
  setDelayRate(r){ if(this.effects && this.effects.delay){ const t = Math.max(0.001, r * 0.8); this.effects.delay.delay.delayTime.setValueAtTime(t, this.ctx.currentTime); } }

  // Chorus control - dynamic voices
  setChorusLevel(v){ if(this.effects && this.effects.chorus) this.effects.chorus.wet.gain.setValueAtTime(v, this.ctx.currentTime); }
  setChorusVoices(n){ if(!this.effects || !this.effects.chorus) return; n = Math.max(1, Math.min(4, Math.round(n)));
    // stop existing voices
    if(this.effects.chorus.voices){
      for(const pv of this.effects.chorus.voices){ try{ pv.lfo.stop(); }catch(e){} try{ pv.delay.disconnect(); }catch(e){} }
    }
    this.effects.chorus.voices = [];
    for(let i=0;i<n;i++){
      const delay = this.ctx.createDelay(0.2);
      const lfo = this.ctx.createOscillator(); lfo.type = 'sine';
      const lfoGain = this.ctx.createGain(); lfoGain.gain.value = this.effects.chorus.depth;
      lfo.frequency.value = 0.2 + i*0.15;
      lfo.connect(lfoGain); lfoGain.connect(delay.delayTime);
      // route
      this.effects.chorus.input.connect(delay);
      delay.connect(this.effects.chorus.wet);
      try{ lfo.start(); }catch(e){}
      this.effects.chorus.voices.push({delay,lfo,lfoGain});
    }
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
    document.getElementById('lfo_rate').addEventListener('input',(e)=>{ this.controls.lfo.rate = parseFloat(e.target.value); this.lfo.frequency.value = this.controls.lfo.rate; });
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
      const id = e.target.value; if(!this.midi || !this.midi.access) return; // detach previous
      if(this.midi.input && typeof this.midi.input.onmidimessage === 'function') this.midi.input.onmidimessage = null;
      const input = this.midi.access.inputs.get(id);
      if(input){ this.midi.input = input; input.onmidimessage = (ev)=> this._onMIDIMessage(ev); }
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
      if(!it.done){ const first = it.value; this.midi.input = first; first.onmidimessage = (ev)=> this._onMIDIMessage(ev); const status = document.getElementById('midi_status'); if(status) status.textContent = 'Connected: ' + first.name; const sel = document.getElementById('midi_inputs'); if(sel){ sel.value = first.id; sel.style.display = ''; } }
      else { const status = document.getElementById('midi_status'); if(status) status.textContent = 'No MIDI inputs'; const sel = document.getElementById('midi_inputs'); if(sel) sel.style.display = 'none'; }
    }catch(e){ const status = document.getElementById('midi_status'); if(status) status.textContent = 'Permission denied'; }
  }

  _updateMIDIDevices(){
    if(!this.midi || !this.midi.access) return;
    const sel = document.getElementById('midi_inputs');
    if(!sel) return;
    // clear
    sel.innerHTML = '';
    for(const input of this.midi.access.inputs.values()){
      const opt = document.createElement('option'); opt.value = input.id; opt.textContent = input.name || input.manufacturer || input.id; sel.appendChild(opt);
    }
    if(this.midi.input){ sel.value = this.midi.input.id; sel.style.display = ''; const status = document.getElementById('midi_status'); if(status) status.textContent = 'Connected: ' + (this.midi.input.name || this.midi.input.id); }
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