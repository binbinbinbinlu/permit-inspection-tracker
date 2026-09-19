import {day, mergeInspections, type Available, type Scheduled, type History} from '../lib/inspections.ts';
export type Target={city:string;number:string;jurisdiction:number};
export type Offer=Available & {InspectionId:string|null;CancellationPhoneNumber:string|null};
export type Booking=Scheduled & {UniqueId:string|number;InspectionType:string;ConfirmationNumber:string|number;InspectionCancellable:boolean;CancellationPhoneNumber?:string};
export type Live={available:Offer[];scheduled:Booking[];history:History[]};
export type Intent={kind:'schedule'|'cancel';description:string;date:string;bookingId?:string;name?:string;phone?:string;email?:string;message?:string};
export type Prepared={target:Target;intent:Intent;body:Record<string,unknown>;label:string};
export interface Gateway {read(target:Target):Promise<Live>;send(action:Prepared):Promise<void>}
const same=(a:string,b:string)=>a.trim()===b.trim();
const us=(s:string)=>{const [y,m,d]=s.split('-');return `${m}/${d}/${y}`;};
export function prepare(target:Target,intent:Intent,live:Live):Prepared {
 if(!intent||!['schedule','cancel'].includes(intent.kind)||typeof intent.description!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(intent.date))throw Error('Choose an inspection and date.');
 const base={jurisdictionId:target.jurisdiction,permitNumber:target.number};
 if(intent.kind==='cancel'){
  const row=live.scheduled.find(r=>String(r.UniqueId)===intent.bookingId&&same(r.Description,intent.description)&&day(r.InspectionDate)===intent.date);
  if(!row||!row.InspectionCancellable||!row.ConfirmationNumber)throw Error('This inspection cannot be cancelled online. Refresh or contact the jurisdiction.');
  return {target,intent,label:`Cancel ${row.Description} on ${intent.date}`,body:{...base,inspId:row.UniqueId,confirmationNumber:row.ConfirmationNumber,inspectionDetail:{InspectionType:row.InspectionType,Description:row.Description,InspectionDate:us(intent.date),TimeOfDay:'',MessageToInspector:'',ContactName:'',ContactPhone:'',ContactEmail:''}}};
 }
 const row=live.available.find(r=>same(r.Description,intent.description));
 const normalized=mergeInspections(live.available,live.scheduled,live.history).find(r=>same(r.name,intent.description));
 if(!row||row.InspectionRestricted!==false||normalized?.status==='passed')throw Error('Passed or restricted inspections cannot be scheduled.');
 if(!row.InspectionDates?.some(d=>day(d)===intent.date))throw Error('That date is no longer available. Refresh and choose another date.');
 if(live.scheduled.some(r=>same(r.Description,intent.description)))throw Error('This inspection already has a booking. Review it before scheduling again.');
 if(!intent.name?.trim()||intent.name.length>100||!/^\d{10}$/.test(intent.phone||'')||!/^\S+@\S+\.\S+$/.test(intent.email||'')||(intent.email?.length||0)>254)throw Error('Enter a name, 10-digit phone number, and valid email.');
 if((intent.message?.length||0)>100||/[&\[\]{}#']/.test(intent.message||''))throw Error('Inspector messages must be at most 100 characters and cannot contain & [ ] { } # or apostrophes.');
 return {target,intent,label:`Schedule ${row.Description} on ${intent.date}`,body:{...base,inspectionDetails:[{InspectionType:row.InspectionType,Description:row.Description,InspectionId:row.InspectionId,CancellationPhoneNumber:row.CancellationPhoneNumber,InspectionDate:us(intent.date),TimeOfDay:'',MessageToInspector:intent.message||'',ContactName:intent.name.trim(),ContactPhone:Number(intent.phone),ContactEmail:intent.email}]}};
}
export function confirmed(action:Prepared,live:Live):boolean {
 if(action.intent.kind==='schedule')return live.scheduled.some(r=>same(r.Description,action.intent.description)&&day(r.InspectionDate)===action.intent.date);
 // Absence alone is not proof of cancellation: an inspector may have completed it.
 return !live.scheduled.some(r=>String(r.UniqueId)===action.intent.bookingId)&&live.history.some(r=>same(r.Description,action.intent.description)&&day(r.Date)===action.intent.date&&/^(cancelled|canceled)$/i.test(r.Status));
}
export function httpGateway(request:typeof fetch=fetch):Gateway {
 const origin='https://inspection.mybuildingpermit.com';
 async function rows(url:string){const r=await request(url,{signal:AbortSignal.timeout(45000),redirect:'error'});if(!r.ok)throw Error('MBP is unavailable.');const data:unknown=await r.json();if(!Array.isArray(data)||data.some(r=>!r||typeof r.Description!=='string'))throw Error('MBP returned invalid inspection data.');return data;}
 return {
  async read(t){const q=new URLSearchParams({jurisdictionId:String(t.jurisdiction),permitNumber:t.number});const [available,scheduled,history]=await Promise.all([rows(`${origin}/api/InspectionDetails/AvailableInspections?${q}`),rows(`${origin}/api/InspectionDetails/GetScheduledInspections?${q}`),rows(`https://permitsearch.mybuildingpermit.com/PermitDetails/PermitInspections/${encodeURIComponent(t.number)}/${t.jurisdiction}`)]);return {available,scheduled,history};},
  async send(action){
   const query=new URLSearchParams({Jurisdiction:String(action.target.jurisdiction),JurisdictionName:action.target.city,PermitNumber:action.target.number,ProjectName:'',Address:''});
   const session=await request(`${origin}/Default/GetInspectionDetails?${query}`,{redirect:'manual',signal:AbortSignal.timeout(45000)});
   if(session.status!==302||new URL(session.headers.get('Location')||'',origin).pathname!=='/InspectionDetails')throw Error('MBP session could not be opened.');
   const cookie=session.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');
   if(!cookie)throw Error('MBP did not establish a session.');
   // One POST only. A timeout may mean MBP accepted it, so callers must reconcile, not retry.
   const r=await request(`${origin}/InspectionDetails/${action.intent.kind==='schedule'?'ScheduleInspection':'CancelInspection'}`,{method:'POST',headers:{'Content-Type':'application/json; charset=utf-8',Cookie:cookie},body:JSON.stringify(action.body),signal:AbortSignal.timeout(45000),redirect:'error'});
   if(!r.ok)throw Error('MBP did not acknowledge the request.');
  }
 };
}
