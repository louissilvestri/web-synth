function sliderToGain(s){
  if(!s || s <= 0) return 0;
  const dBMin = -30;
  const curved = Math.sqrt(s);
  const dB = dBMin * (1 - curved);
  return Math.pow(10, dB / 20);
}

module.exports = { sliderToGain };