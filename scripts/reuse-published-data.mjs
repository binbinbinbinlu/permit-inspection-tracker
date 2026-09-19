import {mkdir,readFile,writeFile} from 'node:fs/promises';

// Explicit UI-only deployment: preserve source timestamps and require every permit.
const response=await fetch('https://binbinbinbinlu.github.io/permit-inspection-tracker/data/permits.json',{cache:'no-store',signal:AbortSignal.timeout(30000)});
if(!response.ok)throw Error('Unable to load the published snapshot.');
const snapshot=await response.json();
const expected=JSON.parse(await readFile('permits.json','utf8'));
if(!Array.isArray(snapshot.permits)||snapshot.permits.length!==expected.length||expected.some(p=>{
 const matches=snapshot.permits.filter(r=>r.city===p.city&&r.number===p.number);
 return matches.length!==1||!Array.isArray(matches[0].inspections)||!Number.isFinite(Date.parse(matches[0].fetchedAt));
}))throw Error('Published snapshot does not match the tracked permits. Run a full refresh.');
await mkdir('public/data',{recursive:true});
await writeFile('public/data/permits.json',JSON.stringify(snapshot));
console.log(`Reusing ${snapshot.permits.length} published permits with original timestamps.`);
