// Run on locally captured test frames. Never used for login or attendance.
const fs = require('node:fs/promises');
const { scoreFace } = require('../src/services/antiSpoofExperiment');

async function main() {
  const [filename, ...coords] = process.argv.slice(2);
  if (!filename || coords.length !== 4) throw new Error('Usage: node tools/test-antispoof.js image.jpg x y width height');
  const [x, y, width, height] = coords.map(Number);
  const image = await fs.readFile(filename);
  const score = await scoreFace(image, { x, y, width, height });
  console.log(JSON.stringify({ ...score, note: 'Experimental score only; not a verified liveness result.' }));
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
