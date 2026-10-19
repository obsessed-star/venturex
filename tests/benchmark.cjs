const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {VentureEngine} = require('../dist/engine.js');
const engine = new VentureEngine(42);
engine.advance(180);
assert.equal(engine.audit().ok,true);
const legacy=()=>JSON.stringify(engine.serialize()), optimized=()=>engine.exportJSON();
assert.equal(optimized(),legacy());
function measure(fn){for(let i=0;i<5;i++)fn();const times=[];for(let i=0;i<15;i++){const start=performance.now();fn();times.push(performance.now()-start);}return Number(times.sort((a,b)=>a-b)[7].toFixed(3));}
const before=measure(legacy),after=measure(optimized);
const report={measuredAt:new Date().toISOString(),mode:'same-engine JSON persistence comparison',node:process.version,scope:'Seed 42, 180 additional days, five warm-ups and median of 15 runs. Includes JSON conversion only; excludes disk/localStorage and UI rendering.',day:engine.day,bytes:Buffer.byteLength(optimized()),legacyMs:before,directExportMs:after,speedup:Number((before/after).toFixed(2)),identicalOutput:true};
fs.mkdirSync(path.join(__dirname,'../evidence'),{recursive:true});
fs.writeFileSync(path.join(__dirname,'../evidence/performance.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
