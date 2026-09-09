import test from 'node:test';
import assert from 'node:assert/strict';
import {loadPermit} from '../lib/permit-source.ts';
test('combines all four feeds and URL-encodes permit numbers',async()=>{
 const original=globalThis.fetch;const urls:string[]=[];
 globalThis.fetch=(async(input:unknown)=>{const url=String(input);urls.push(url);let body:unknown=[];
 if(url.includes('/Default/Permits?'))body=[{PermitNumber:'26 112569 BR',ProjectName:'Project',Address:'Address'}];
 if(url.includes('/AvailableInspections?'))body=[{Description:'Footing'}];
 if(url.includes('/PermitInspections/'))body=[{Description:'Footing',Date:'9/9/2026',Status:'Approved'}];
 return Response.json(body);}) as typeof fetch;
 try{const result=await loadPermit('Bellevue','26 112569 BR');assert.equal(urls.length,4);assert.ok(urls.some(u=>u.includes('26%20112569%20BR')));assert.equal(result.inspections[0].status,'passed');assert.equal(result.project,'Project');}finally{globalThis.fetch=original;}
});
test('one upstream failure rejects the whole snapshot',async()=>{
 const original=globalThis.fetch;globalThis.fetch=(async()=>new Response('Unavailable',{status:503})) as typeof fetch;
 try{await assert.rejects(loadPermit('Bellevue','123'),/temporarily unavailable/);}finally{globalThis.fetch=original;}
});
test('login HTML cannot masquerade as empty inspection data',async()=>{
 const original=globalThis.fetch;globalThis.fetch=(async()=>new Response('<html>Log in</html>')) as typeof fetch;
 try{await assert.rejects(loadPermit('Bellevue','123'),/unexpected response/);}finally{globalThis.fetch=original;}
});
