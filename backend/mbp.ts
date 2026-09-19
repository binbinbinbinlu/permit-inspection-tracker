import {day, mergeInspections, type Available, type Scheduled, type History,type Inspection} from '../lib/inspections.ts';
export type Target={city:string;number:string;jurisdiction:number;sourceId?:string};
export type Offer=Available & {InspectionId:string|null;CancellationPhoneNumber:string|null;timeSlots?:{value:string;label:string}[]};
export type Booking=Scheduled & {UniqueId:string|number;InspectionType:string|null;ConfirmationNumber:string|number|null;InspectionCancellable:boolean;CancellationPhoneNumber?:string};
export type Live={available:Offer[];scheduled:Booking[];history:History[];inspections?:Inspection[];notice?:string};
export type Intent={kind:'schedule'|'cancel';description:string;date:string;bookingId?:string;name?:string;phone?:string;email?:string;message?:string;timeSlot?:string};
export type Prepared={target:Target;intent:Intent;body:Record<string,unknown>;label:string};
export interface Gateway {read(target:Target,inspection?:string):Promise<Live>;send(action:Prepared):Promise<void>;close?():Promise<void>}
const same=(a:string,b:string)=>a.trim()===b.trim();
const us=(s:string)=>{const [y,m,d]=s.split('-');return `${m}/${d}/${y}`;};
export function prepare(target:Target,intent:Intent,live:Live):Prepared {
 if(!intent||!['schedule','cancel'].includes(intent.kind)||typeof intent.description!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(intent.date))throw Error('Choose an inspection and date.');
 const base={jurisdictionId:target.jurisdiction,permitNumber:target.number};
 if(target.jurisdiction===0){
  if(intent.kind!=='schedule')throw Error('Use the source portal to cancel this inspection.');
  const offer=live.available.find(r=>same(r.Description,intent.description));
  const inspection=live.inspections?.find(r=>same(r.name,intent.description));
  if(!offer||offer.InspectionRestricted!==false||!inspection||inspection.status==='passed'||inspection.restricted)throw Error('This inspection is not available to schedule in the source portal.');
  if(live.scheduled.some(r=>same(r.Description,intent.description)))throw Error('This inspection already has a booking.');
  if(!offer.InspectionDates?.some(d=>day(d)===intent.date))throw Error('That date is no longer available. Refresh and choose another date.');
  if(offer.timeSlots?.length&&!offer.timeSlots.some(s=>s.value===intent.timeSlot))throw Error('Choose an available time slot.');
  if(!intent.name?.trim()||intent.name.length>100||!/^\d{10}$/.test(intent.phone||'')||!/^\S+@\S+\.\S+$/.test(intent.email||'')||(intent.message?.length||0)>100)throw Error('Enter a contact name, 10-digit phone number, valid email, and a message of at most 100 characters.');
  return {target,intent,label:`Schedule ${intent.description} on ${intent.date}${offer.timeSlots?.find(s=>s.value===intent.timeSlot)?" · "+offer.timeSlots.find(s=>s.value===intent.timeSlot)!.label:""}`,body:{inspectionId:offer.InspectionId}};
 }
 if(intent.kind==='cancel'){
  const row=live.scheduled.find(r=>String(r.UniqueId)===intent.bookingId&&same(r.Description,intent.description)&&day(r.InspectionDate)===intent.date);
  if(!row||row.InspectionCancellable!==true||!['string','number'].includes(typeof row.UniqueId)||!String(row.UniqueId).trim())throw Error('This inspection cannot be cancelled online. Refresh or contact the jurisdiction.');
  // MBP reads these fields as table-cell text. Bellevue can permit cancellation
  // with null confirmation/type values; its own form sends empty strings.
  return {target,intent,label:`Cancel ${row.Description} on ${intent.date}`,body:{...base,inspId:String(row.UniqueId),confirmationNumber:String(row.ConfirmationNumber??''),inspectionDetail:{InspectionType:row.InspectionType??'',Description:row.Description,InspectionDate:us(intent.date),TimeOfDay:'',MessageToInspector:'',ContactName:'',ContactPhone:'',ContactEmail:''}}};
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
export function confirmed(action:Prepared,live:Live,now=new Date()):boolean {
 if(action.intent.kind==='schedule')return live.scheduled.some(r=>same(r.Description,action.intent.description)&&day(r.InspectionDate)===action.intent.date);
 if(live.scheduled.some(r=>String(r.UniqueId)===action.intent.bookingId))return false;
 if(live.history.some(r=>same(r.Description,action.intent.description)&&day(r.Date)===action.intent.date&&/^(cancelled|canceled)$/i.test(r.Status)))return true;
 // Bellevue removes cancelled bookings without publishing a history entry.
 // Require the future slot to be requestable again, not mere absence (which
 // could also mean an inspection was completed). Use the jurisdiction's day.
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 return action.intent.date>today
  &&!live.scheduled.some(r=>same(r.Description,action.intent.description))
  &&!live.history.some(r=>same(r.Description,action.intent.description)&&day(r.Date)>=action.intent.date)
  &&live.available.some(r=>same(r.Description,action.intent.description)&&r.InspectionRestricted===false&&r.InspectionDates?.some(d=>day(d)===action.intent.date));
}
export function httpGateway(request:typeof fetch=fetch):Gateway {
 const origin='https://inspection.mybuildingpermit.com';
 async function rows(url:string){const r=await request(url,{signal:AbortSignal.timeout(45000),redirect:'manual'});if(!r.ok)throw Error('MBP is unavailable.');const data:unknown=await r.json();if(!Array.isArray(data)||data.some(r=>!r||typeof r.Description!=='string'))throw Error('MBP returned invalid inspection data.');return data;}
 return {
  async read(t){const q=new URLSearchParams({jurisdictionId:String(t.jurisdiction),permitNumber:t.number});const [available,scheduled,history]=await Promise.all([rows(`${origin}/api/InspectionDetails/AvailableInspections?${q}`),rows(`${origin}/api/InspectionDetails/GetScheduledInspections?${q}`),rows(`https://permitsearch.mybuildingpermit.com/PermitDetails/PermitInspections/${encodeURIComponent(t.number)}/${t.jurisdiction}`)]);return {available,scheduled,history};},
  async send(action){
   const query=new URLSearchParams({Jurisdiction:String(action.target.jurisdiction),JurisdictionName:action.target.city,PermitNumber:action.target.number,ProjectName:'',Address:''});
   const session=await request(`${origin}/Default/GetInspectionDetails?${query}`,{redirect:'manual',signal:AbortSignal.timeout(45000)});
   if(session.status!==302||new URL(session.headers.get('Location')||'',origin).pathname!=='/InspectionDetails')throw Error('MBP session could not be opened.');
   const cookie=session.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');
   if(!cookie)throw Error('MBP did not establish a session.');
   // One POST only. A timeout may mean MBP accepted it, so callers must reconcile, not retry.
   const r=await request(`${origin}/InspectionDetails/${action.intent.kind==='schedule'?'ScheduleInspection':'CancelInspection'}`,{method:'POST',headers:{'Content-Type':'application/json; charset=utf-8',Cookie:cookie},body:JSON.stringify(action.body),signal:AbortSignal.timeout(45000),redirect:'manual'});
   if(!r.ok)throw Error('MBP did not acknowledge the request.');
  }
 };
}

