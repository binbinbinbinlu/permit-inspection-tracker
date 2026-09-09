import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {loadPermit} from '../lib/permit-source.ts';
import {validatePermit} from '../lib/permit-request.ts';
const permits=(JSON.parse(await readFile('permits.json','utf8')) as unknown[]).map(validatePermit);
const results=[];
// Keep jurisdiction traffic bounded; never publish partial or fabricated results.
for(const permit of permits) {
 let result;
 for(let attempt=0;attempt<2;attempt++) {
  try {result=await loadPermit(permit.city,permit.number);break;}
  catch(error){if(attempt===1)throw error;}
 }
 results.push(result);
 console.log(`Synced ${permit.city} ${permit.number}: ${result!.inspections.length} inspection types`);
}
await mkdir('public/data',{recursive:true});
await writeFile('public/data/permits.json',JSON.stringify({generatedAt:new Date().toISOString(),permits:results}));
