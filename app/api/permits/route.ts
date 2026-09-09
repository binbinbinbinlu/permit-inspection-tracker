import { jurisdictions, mergeInspections, type PermitData, type Available, type Scheduled, type History } from '@/lib/inspections';
const cache = new Map<string, {data:PermitData;until:number}>();
const pending = new Map<string,Promise<PermitData>>();
async function rows(url:string):Promise<Record<string,unknown>[]> {
 const response=await fetch(url,{signal:AbortSignal.timeout(45000),headers:{Accept:'application/json'},redirect:'manual'});
 if(!response.ok) throw new Error('MyBuildingPermit is temporarily unavailable. Please try again.');
 const text=await response.text();
 if(text.length>4000000) throw new Error('The permit response is too large to load. Open the source permit.');
 let data;try{data=JSON.parse(text)}catch{throw new Error('MyBuildingPermit returned an unexpected response. Please try again.');}
 if(!Array.isArray(data)||data.some(x=>!x||typeof x!=='object')) throw new Error('MyBuildingPermit returned an unexpected response. Please try again.');
 return data;
}
async function load(city:string,number:string):Promise<PermitData> {
 const j=jurisdictions[city]; const q=new URLSearchParams({jurisdictionId:String(j),permitNumber:number});
 const [permits,available,scheduled,history]=await Promise.all([
 rows(`https://inspection.mybuildingpermit.com/api/Default/Permits?${q}&permitSearch=true`),
 rows(`https://inspection.mybuildingpermit.com/api/InspectionDetails/AvailableInspections?${q}`),
 rows(`https://inspection.mybuildingpermit.com/api/InspectionDetails/GetScheduledInspections?${q}`),
 rows(`https://permitsearch.mybuildingpermit.com/PermitDetails/PermitInspections/${encodeURIComponent(number)}/${j}`)
 ]);
 const permit=permits.find(p=>String(p.PermitNumber).replace(/\s/g,'').toUpperCase()===number.replace(/\s/g,'').toUpperCase());
 if(!permit && !history.length && !available.length && !scheduled.length) throw new Error('No permit found. Check the jurisdiction and exact permit number.');
 for(const record of [...available,...scheduled,...history]) if(typeof record.Description!=='string') throw new Error('The inspection feed format has changed. Open the source permit.');
 return {city,number:String(permit?.PermitNumber||number),project:String(permit?.ProjectName||''),address:String(permit?.Address||''),fetchedAt:new Date().toISOString(),sourceUrl:`https://permitsearch.mybuildingpermit.com/PermitDetails/${encodeURIComponent(number)}/${encodeURIComponent(city)}`,inspections:mergeInspections(available as Available[],scheduled as Scheduled[],history as History[])};
}
export async function GET(request:Request) {
 const url=new URL(request.url);const city=url.searchParams.get('city')||'';const number=(url.searchParams.get('number')||'').trim().toUpperCase();
 if(!Object.hasOwn(jurisdictions,city)||!number||number.length>60||!/^[A-Z0-9 -]+$/.test(number)) return Response.json({error:'Choose a supported jurisdiction and enter a valid permit number.'},{status:400});
 const key=`${city}:${number}`; const hit=cache.get(key);
 if(hit&&hit.until>Date.now()) return Response.json(hit.data,{headers:{'Cache-Control':'no-store'}});
 if(!pending.has(key)) {
  if(pending.size>=12) return Response.json({error:'The tracker is busy. Please try again shortly.'},{status:429});
  pending.set(key,load(city,number));
 }
 try {const data=await pending.get(key)!; if(cache.size>=50) cache.delete(cache.keys().next().value!);cache.set(key,{data,until:Date.now()+30000});return Response.json(data,{headers:{'Cache-Control':'no-store'}});}
 catch(error) {return Response.json({error:error instanceof Error?error.message:'Unable to load inspections.'},{status:502,headers:{'Cache-Control':'no-store'}});}
 finally{pending.delete(key);}
}


