export class Voice {
  constructor(ctx, destination, controls, synth){
    this.ctx = ctx;
    this.controls = controls;
    this.synth = synth;

    this.oscA = ctx.createOscillator();
    this.oscB = ctx.createOscillator();
    this.oscA.type = controls.oscA.wave;
    this.oscB.type = controls.oscB.wave;
    this.oscA.detune.value = controls.oscA.detune;
    this.oscB.detune.value = controls.oscB.detune;

    this.gA = ctx.createGain(); this.gB = ctx.createGain();
    // initial levels applied with mix
    this.gA.gain.value = controls.oscA.level * (1 - controls.mix);
    this.gB.gain.value = controls.oscB.level * controls.mix;

    this.filter = ctx.createBiquadFilter();
    this.filter.type = controls.filter.type;
    this.filter.frequency.value = controls.filter.cutoff;
    this.filter.Q.value = controls.filter.Q;

    this.envGain = ctx.createGain(); this.envGain.gain.value = 0;

    // routing
    this.oscA.connect(this.gA); this.oscB.connect(this.gB);
    this.gA.connect(this.filter); this.gB.connect(this.filter);

    // per-voice noise gain: connected from synth.noiseOutput so noise hits the same filter and env
    this.noiseGain = ctx.createGain(); this.noiseGain.gain.value = 0;
    if(this.synth && this.synth.noiseOutput) this.synth.noiseOutput.connect(this.noiseGain);
    this.noiseGain.connect(this.filter);

    this.filter.connect(this.envGain);
    this.envGain.connect(destination);

    // route voice output to global effects inputs so effects are applied post-AMP ADSR
    if(this.synth && this.synth.effects){
      try{ if(this.synth.effects.phase && this.synth.effects.phase.input) this.envGain.connect(this.synth.effects.phase.input); }catch(e){}
      try{ if(this.synth.effects.delay && this.synth.effects.delay.input) this.envGain.connect(this.synth.effects.delay.input); }catch(e){}
      try{
        if(this.synth.effects.chorus){
          if(this.synth.effects.chorus.perVoice && this.synth._createPerVoiceChorusForVoice){
            try{ const per = this.synth._createPerVoiceChorusForVoice(this); if(per && per.input){ this.envGain.connect(per.input); this.perVoiceChorus = per; } }catch(e){}
          } else {
            try{ if(this.synth.effects.chorus.input) this.envGain.connect(this.synth.effects.chorus.input); }catch(e){}
          }
        }
      }catch(e){}
    }

    // LFO nodes for this voice (created but only connected if synth enables them)
    this.lfoNodes = {};

    this.started = false;

    // set up LFO nodes (synth will connect/disconnect based on enabled targets)
    this.synth._attachLFOToVoice(this);
  }

  start(noteFreq, now, ampADSR, filterADSR, controls){
    if(!this.started){
      this.oscA.start(now); this.oscB.start(now); this.started = true;
    }
    // set types & detune in case changed
    this.oscA.type = controls.oscA.wave; this.oscB.type = controls.oscB.wave;
    this.oscA.detune.value = controls.oscA.detune; this.oscB.detune.value = controls.oscB.detune;

    // apply levels taking mix into account
    this.gA.gain.value = controls.oscA.level * (1 - controls.mix);
    this.gB.gain.value = controls.oscB.level * controls.mix;

    this.oscA.frequency.setValueAtTime(noteFreq, now);
    this.oscB.frequency.setValueAtTime(noteFreq, now);
    // set per-voice noise level (routed through the same filter & amp env)
    if(this.noiseGain){ const g = this.synth._sliderToGain(controls.noiseLevel); this.noiseGain.gain.setValueAtTime(g, now); }

    // amp ADSR
    const a = ampADSR.a, d = ampADSR.d, s = ampADSR.s;
    const sustainLevel = s;
    this.envGain.gain.cancelScheduledValues(now);
    this.envGain.gain.setValueAtTime(0, now);
    this.envGain.gain.linearRampToValueAtTime(1, now + a);
    this.envGain.gain.linearRampToValueAtTime(sustainLevel, now + a + d);

    // filter envelope applied by scheduling cutoff freq changes
    const baseCutoff = controls.filter.cutoff;
    const envAmt = controls.filter.envAmt;
    const fA = filterADSR.a, fD = filterADSR.d, fS = filterADSR.s;
    this.filter.frequency.cancelScheduledValues(now);
    this.filter.frequency.setValueAtTime(baseCutoff, now);
    const peak = baseCutoff + envAmt;
    this.filter.frequency.linearRampToValueAtTime(peak, now + fA);
    this.filter.frequency.linearRampToValueAtTime(baseCutoff + envAmt * fS, now + fA + fD);
  }

  release(now, ampADSR, filterADSR){
    const r = ampADSR.r;
    this.envGain.gain.cancelScheduledValues(now);
    this.envGain.gain.setValueAtTime(this.envGain.gain.value, now);
    this.envGain.gain.linearRampToValueAtTime(0, now + r);

    // schedule stop slightly after release and detach LFO nodes
    setTimeout(()=>{
      try{ this.oscA.stop(); this.oscB.stop(); }catch(e){}
      this.synth._detachLFOFromVoice(this);
    }, (r+0.1)*1000);
  }
}
