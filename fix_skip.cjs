const fs = require('fs');
let code = fs.readFileSync('src/components/PatternGuidedTrainer.tsx', 'utf8');

const oldSkip = `[currentStationIdx]: { ...(prev[currentStationIdx] || {}), was_skipped: true }`;
const newSkip = `[currentStationIdx]: { ...(prev[currentStationIdx] || { hint_level_reached: 0, hint_source: null, was_skipped: false }), was_skipped: true }`;

code = code.replace(oldSkip, newSkip);
fs.writeFileSync('src/components/PatternGuidedTrainer.tsx', code, 'utf8');
console.log('Fixed skip.');
