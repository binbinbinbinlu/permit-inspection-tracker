import { jurisdictions, mergeInspections, type PermitData, type Available, type Scheduled, type History } from './inspections.ts';
import {parsePermitDetails} from './permit-details.ts';
async function rows(url:string):Promise<Record<string,unknown>[]> {
 const response=await fetch(url,{signal:AbortSignal.timeout(45000),headers:{Accept:'application/json'},redirect:'manual'});
 if(!response.ok) throw new Error('MyBuildingPermit is temporarily unavailable. Please try again.');
 const text=await response.text();
 if(text.length>4000000) throw new Error('The permit response is too large to load. Open the source permit.');
 let data;try{data=JSON.parse(text)}catch{throw new Error('MyBuildingPermit returned an unexpected response. Please try again.');}
 if(!Array.isArray(data)||data.some(x=>!x||typeof x!=='object')) throw new Error('MyBuildingPermit returned an unexpected response. Please try again.');
 return data;
}
export async function loadPermit(city:string,number:string):Promise<PermitData> {
 if(city==='Clyde Hill'||city==='Medina'||city==='Redmond') throw new Error('This jurisdiction’s inspections refresh through the GitHub Pages hourly sync. Open the published tracker for the latest snapshot.');
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
 const sourceUrl=`https://permitsearch.mybuildingpermit.com/PermitDetails/${encodeURIComponent(number)}/${encodeURIComponent(city)}`;
 let address=String(permit?.Address||'').trim(),project=String(permit?.ProjectName||'').trim();
 if(!address){
  const response=await fetch(sourceUrl,{signal:AbortSignal.timeout(45000),redirect:'manual'});
  if(!response.ok)throw Error('MyBuildingPermit permit details are temporarily unavailable.');
  const html=await response.text();
  if(html.length>4000000)throw Error('The permit details response is too large.');
  const details=parsePermitDetails(html,city,number);address=details.address;project=project||details.project;
 }
 return {city,number:String(permit?.PermitNumber||number),project,address,fetchedAt:new Date().toISOString(),sourceUrl,inspections:mergeInspections(available as Available[],scheduled as Scheduled[],history as History[])};
}

