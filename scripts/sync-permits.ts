import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {loadPermit} from '../lib/permit-source.ts';
import {loadMedinaPermit} from './smartgov-source.ts';
import {loadClydeHillPermit} from './permittrax-source.ts';
import {validatePermit} from '../lib/permit-request.ts';
import type {PermitData} from '../lib/inspections.ts';
const permits=(JSON.parse(await readFile('permits.json','utf8')) as unknown[]).map(validatePermit);
const results=new Map<string,PermitData>();
// Keep jurisdiction traffic bounded; never publish partial or fabricated results.
// Check the interactive provider first so a browser failure is reported promptly.
for(const permit of [...permits].sort((a,b)=>Number(['Clyde Hill','Medina'].includes(b.city))-Number(['Clyde Hill','Medina'].includes(a.city)))) {
 let result;
 for(let attempt=0;attempt<2;attempt++) {
  try {result=await (permit.city==='Medina'?loadMedinaPermit(permit.number,permit.sourceId!):permit.city==='Clyde Hill'?loadClydeHillPermit(permit.number):loadPermit(permit.city,permit.number));break;}
  catch(error){if(attempt===1)throw error;}
 }
 results.set(`${permit.city}:${permit.number}`,result!);
 console.log(`Synced ${permit.city} ${permit.number}: ${result!.inspections.length} inspection types`);
}
await mkdir('public/data',{recursive:true});
await writeFile('public/data/permits.json',JSON.stringify({generatedAt:new Date().toISOString(),permits:permits.map(p=>results.get(`${p.city}:${p.number}`))}));
