const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'lib', 'sliderToGain.cjs');
const dest = path.join(__dirname, '..', 'public', 'js', 'sliderToGain.js');

try{
  const content = fs.readFileSync(src, 'utf8');
  // extract function definition
  const fnMatch = content.match(/function\s+sliderToGain\s*\([^)]*\)\s*\{[\s\S]*?\n\}/);
  let fn = '';
  if(fnMatch) fn = fnMatch[0];
  else {
    // fallback implementation
    fn = `function sliderToGain(s){\n  if(!s || s <= 0) return 0;\n  const dBMin = -30;\n  const curved = Math.sqrt(s);\n  const dB = dBMin * (1 - curved);\n  return Math.pow(10, dB / 20);\n}`;
  }
  const esm = fn.replace(/^function\s+sliderToGain/, 'export function sliderToGain');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, esm + '\n', 'utf8');
  console.log('Synced sliderToGain to', dest);
} catch (err){
  console.error('Failed to sync sliderToGain:', err);
  process.exit(1);
}