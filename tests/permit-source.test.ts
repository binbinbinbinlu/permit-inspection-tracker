import test from 'node:test';
import assert from 'node:assert/strict';
import {loadPermit} from '../lib/permit-source.ts';
import {parsePermitDetails} from '../lib/permit-details.ts';
const detail=(number='LSM25-02028',city='Kirkland',address='12429  NE 70TH ST')=>`<h2 class="panel-title">Information for Permit #: ${number} </h2><table><tr><th>Project Name:</th><td>Cottages &amp; site</td></tr><tr><th>Jurisdiction:</th><td>${city}</td></tr><tr><th>Address:</th><td>${address}</td></tr></table>`;
test('missing search metadata falls back to the exact permit detail address',async()=>{
 const original=globalThis.fetch;const urls:string[]=[];
 globalThis.fetch=(async(input:unknown)=>{const url=String(input);urls.push(url);
 if(url.endsWith('/LSM25-02028/Kirkland'))return new Response(detail());
 return Response.json(url.includes('AvailableInspections')?[{Description:'Site inspection'}]:[]);
 }) as typeof fetch;
 try{const result=await loadPermit('Kirkland','LSM25-02028');assert.equal(result.address,'12429 NE 70TH ST');assert.equal(result.project,'Cottages & site');assert.equal(result.inspections.length,1);assert.equal(urls.length,5);}finally{globalThis.fetch=original;}
});
test('permit detail fallback validates number, jurisdiction, and address field',()=>{
 assert.throws(()=>parsePermitDetails(detail('OTHER'),'Kirkland','LSM25-02028'),/unexpected/);
 assert.throws(()=>parsePermitDetails(detail('LSM25-02028','Bellevue'),'Kirkland','LSM25-02028'),/unexpected/);
 assert.throws(()=>parsePermitDetails('<html>Sign in</html>','Kirkland','LSM25-02028'),/unexpected/);
 assert.throws(()=>parsePermitDetails(detail().replace('Address:','Parcel:'),'Kirkland','LSM25-02028'),/unexpected/);
 assert.equal(parsePermitDetails(detail('LSM25-02028','Kirkland',''),'Kirkland','LSM25-02028').address,'');
});
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
