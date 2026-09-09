import { jurisdictions, type PermitData } from '@/lib/inspections';
import { loadPermit } from '@/lib/permit-source';
const cache = new Map<string, {data:PermitData;until:number}>();
const pending = new Map<string,Promise<PermitData>>();
export async function GET(request:Request) {
 const url=new URL(request.url);const city=url.searchParams.get('city')||'';const number=(url.searchParams.get('number')||'').trim().toUpperCase();
 if(!Object.hasOwn(jurisdictions,city)||!number||number.length>60||!/^[A-Z0-9 -]+$/.test(number)) return Response.json({error:'Choose a supported jurisdiction and enter a valid permit number.'},{status:400});
 const key=`${city}:${number}`; const hit=cache.get(key);
 if(hit&&hit.until>Date.now()) return Response.json(hit.data,{headers:{'Cache-Control':'no-store'}});
 if(!pending.has(key)) {
  if(pending.size>=12) return Response.json({error:'The tracker is busy. Please try again shortly.'},{status:429});
  pending.set(key,loadPermit(city,number));
 }
 try {const data=await pending.get(key)!; if(cache.size>=50) cache.delete(cache.keys().next().value!);cache.set(key,{data,until:Date.now()+30000});return Response.json(data,{headers:{'Cache-Control':'no-store'}});}
 catch(error) {return Response.json({error:error instanceof Error?error.message:'Unable to load inspections.'},{status:502,headers:{'Cache-Control':'no-store'}});}
 finally{pending.delete(key);}
}



