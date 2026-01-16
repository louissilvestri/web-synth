export function sliderToGain(s){
  // Gentler curve: use sqrt(s) and a smaller dynamic range so low settings are audible
  if(!s || s <= 0) return 0;
  const dBMin = -30; // lower bound in dB (less attenuation than before)
  const curved = Math.sqrt(s); // emphasize low end
  const dB = dBMin * (1 - curved); // when s=1 => 0dB, s small => near dBMin
  return Math.pow(10, dB / 20);
}
