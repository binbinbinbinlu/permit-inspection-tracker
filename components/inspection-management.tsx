'use client';
import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import type {Inspection,PermitData} from '../lib/inspections';
import type {Live,Intent} from '../backend/mbp';
import {normalizeContactPhone} from '../lib/contact-phone';
import {inspectionApi} from '../lib/inspection-api';
type View=Live & {inspectionScope?:string;inspections:Inspection[];fetchedAt:string;writesEnabled:boolean};
type Result={id:string;state:string;message:string;label:string;intent:Intent;expires:number};
const backend=process.env.NEXT_PUBLIC_ACTIONS_URL||'';
const ActionContext=createContext<((row:Inspection)=>ReactNode)|null>(null);
export function InspectionAction({row}:{row:Inspection}){return useContext(ActionContext)?.(row)??null;}
export function InspectionManagement({permit,onUpdate,children,enabled=true}:{permit:PermitData;children:ReactNode;enabled?:boolean;onUpdate:(data:Pick<PermitData,'inspections'|'fetchedAt'>)=>void}){
 const [key,setKey]=useState(''),[live,setLive]=useState<View|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState<Result|null>(null),[intent,setIntent]=useState<Intent|null>(null),[ack,setAck]=useState(false);
 const [unlocked,setUnlocked]=useState(false),[writesEnabled,setWritesEnabled]=useState(false);
 const dialogRef=useRef<HTMLDialogElement>(null),selectedName=useRef('');
 const actionRef=useRef<HTMLDivElement>(null),errorRef=useRef<HTMLParagraphElement>(null);
 const [openCount,setOpenCount]=useState(0);
 function openAction(next:Intent,preserveContact=false){setResult(null);setError('');setIntent(previous=>preserveContact&&previous?.kind==='schedule'&&next.kind==='schedule'&&previous.description===next.description?{...next,name:previous.name,phone:previous.phone,email:previous.email,message:previous.message}:next);setAck(false);setOpenCount(n=>n+1);}
 useEffect(()=>{const panel=actionRef.current;if(dialogRef.current?.open&&panel&&(intent||result)){panel.focus({preventScroll:true});panel.scrollIntoView({block:'start'});}},[openCount,result?.id,result?.state]);
 useEffect(()=>{if(error){errorRef.current?.focus({preventScroll:true});errorRef.current?.scrollIntoView({block:'center'});}},[error]);
 const recoveryKey=`permit-action:${permit.city}:${permit.number}`;
 async function api<T>(path:string,body?:unknown):Promise<T>{return inspectionApi<T>({base:backend,key,path,body});}
 async function read(){const data:View=await api<View>('/live?'+new URLSearchParams({city:permit.city,number:permit.number,inspection:selectedName.current,focused:'true'}));setLive(data);onUpdate({inspections:data.inspectionScope?permit.inspections.map(row=>row.name===data.inspectionScope?(data.inspections.find(next=>next.name===row.name)||row):row):data.inspections,fetchedAt:data.inspectionScope?permit.fetchedAt:data.fetchedAt});return data;}
 async function run(work:()=>Promise<void>){setBusy(true);setError('');try{await work();}catch(e){setError(e instanceof Error?e.message:'Request failed.');}finally{setBusy(false);}}
 async function loadSelection(){
  const saved=localStorage.getItem(recoveryKey);
  if(saved){const recovered=await api<Result>('/operations/'+saved);setIntent(recovered.intent);setResult(recovered);return;}
  setLive(null);
  const row=permit.inspections.find(r=>r.name===selectedName.current);
  if(row&&row.sourceStatus!=='Scheduled'&&row.status!=='passed'&&!row.restricted)openAction({kind:'schedule',description:row.name,date:'',name:'',phone:'',email:'',message:'',timeSlot:''},true);
  else setIntent(null);
  try{const fresh=await read();chooseAction(selectedName.current,fresh,true);}catch(error){setLive(null);throw error;}
 }
 async function unlock(){const access=await api<{writesEnabled:boolean}>('/access');setWritesEnabled(access.writesEnabled);setUnlocked(true);await loadSelection();}
 async function review(){if(!intent)return;const r:Result=await api<Result>('/review',{target:{city:permit.city,number:permit.number},intent});localStorage.setItem(recoveryKey,r.id);setResult(r);setAck(false);}
 async function confirm(){if(!result||!ack)return;const id=result.id;setResult({...result,state:'submitting',message:'Submitting once and checking the source portal…'});let r:Result;try{r=await api<Result>('/confirm',{id,confirm:true});}catch{setResult({...result,state:'unknown',message:'Connection lost. The request may have reached the source portal. Check the result before doing anything else.'});return;}setResult(r);if(r.state==='succeeded')await read();}
 async function check(){if(!result)return;const r:Result=await api('/operations/'+result.id);setResult(r);if(r.state==='succeeded')await read();}
 const unresolved=!!result&&['submitting','unknown'].includes(result.state);
 function chooseAction(name:string,current:View,preserveContact=false){
  const booking=current.scheduled.find(r=>r.Description===name);
  if(booking){if(!booking.InspectionCancellable)throw Error('Use the source portal or contact '+(booking.CancellationPhoneNumber||'the jurisdiction')+' to cancel.');openAction({kind:'cancel',description:name,date:booking.InspectionDate.slice(0,10),bookingId:String(booking.UniqueId)});return;}
  const row=current.inspections.find(r=>r.name===name),offer=current.available.find(r=>r.Description===name);
  if(!row||row.status==='passed'||row.restricted||!offer||offer.InspectionRestricted!==false)throw Error('This inspection is not currently available to schedule.');
  openAction({kind:'schedule',description:name,date:'',name:'',phone:'',email:'',message:'',timeSlot:''},preserveContact);
 }
 function open(row:Inspection){selectedName.current=row.name;dialogRef.current?.showModal();if(result)return;setError('');if(unlocked)void run(loadSelection);}
 function action(row:Inspection){const booking=live?.scheduled.find(r=>r.Description===row.name);const scheduled=!!booking||row.sourceStatus==='Scheduled';return <button className="inspection-action" disabled={busy||(!scheduled&&(row.status==='passed'||row.restricted))||(!!booking&&!booking.InspectionCancellable)} onClick={()=>open(row)}>{unresolved?'Check request':scheduled?'Cancel':'Schedule'}</button>;}
 if(!enabled||!backend)return <>{children}</>;
 return <ActionContext.Provider value={action}>{children}<dialog ref={dialogRef} className="inspection-management management-dialog" aria-label="Manage inspection"><button className="dialog-close" aria-label="Close inspection management" onClick={()=>dialogRef.current?.close()}>Close</button><h2>Manage inspection</h2>{busy&&<p role="status">Checking {permit.city}…</p>}<p>Review the details before confirming a change.</p>
 {!unlocked?<form onSubmit={e=>{e.preventDefault();void run(unlock);}}><label>Private management key<input type="password" autoComplete="off" value={key} onChange={e=>setKey(e.target.value)} required/></label><button disabled={busy||!key}>Unlock management</button></form>:<>
 {!live&&!busy&&!result&&<button type="button" onClick={()=>void run(loadSelection)}>Retry available dates</button>}
 {!writesEnabled&&<p role="status">Backend is in read-only mode. Submissions are disabled.</p>}
 {(intent||result)&&<div className="action-focus" ref={actionRef} tabIndex={-1} aria-label="Inspection request details">
 {intent&&!result&&<form onSubmit={e=>{e.preventDefault();void run(review);}} className="action-review"><h3>{intent.kind==='cancel'?'Review cancellation':'Choose scheduling details'}</h3><p>{permit.city} · {permit.number} · {permit.address}</p><strong>{intent.description}</strong>{intent.kind==='schedule'?<>{permit.city==='Medina'||permit.city==='Clyde Hill'?<p>Available dates come from the permit portal. Availability is checked again before submission.</p>:null}<label>Date<select aria-label="Date" required disabled={!live||busy} value={intent.date} onChange={e=>setIntent({...intent,date:e.target.value})}><option value="">{live?'Choose a date':busy?'Checking available dates...':'Dates unavailable - use Retry available dates'}</option>{live?.available.find(r=>r.Description===intent.description)?.InspectionDates?.map(d=><option key={d} value={d.slice(0,10)}>{d.slice(0,10)}</option>)}</select></label>{!!live?.available.find(r=>r.Description===intent.description)?.timeSlots?.length&&<label>Time slot<select aria-label="Time slot" required value={intent.timeSlot||''} onChange={e=>setIntent({...intent,timeSlot:e.target.value})}><option value="">Choose a time slot</option>{live?.available.find(r=>r.Description===intent.description)?.timeSlots?.map(slot=><option key={slot.value} value={slot.value}>{slot.label}</option>)}</select></label>}<label>Site contact name<input required maxLength={100} value={intent.name} onChange={e=>setIntent({...intent,name:e.target.value})}/></label><label>Phone (10 digits)<input required type="tel" autoComplete="tel-national" inputMode="tel" pattern="[0-9]{10}" title="Enter a 10-digit phone number, for example 4252240399." value={intent.phone} onInvalid={e=>e.currentTarget.setCustomValidity("Enter a 10-digit phone number, for example 4252240399.")} onChange={e=>{e.currentTarget.setCustomValidity('');setIntent({...intent,phone:normalizeContactPhone(e.target.value)});}}/></label><label>Email<input required type="email" value={intent.email} onChange={e=>setIntent({...intent,email:e.target.value})}/></label><label>Message to inspector<input maxLength={100} value={intent.message} onChange={e=>setIntent({...intent,message:e.target.value})}/></label></>:<p>{intent.date}</p>}<button disabled={busy||!live||!writesEnabled}>Review request — does not submit</button><button type="button" disabled={busy} onClick={()=>{setIntent(null);dialogRef.current?.close();}}>Back</button></form>}
 {result&&<div className="action-review" role="status"><h3>{result.label}</h3><p>{permit.city} · {permit.number} · {permit.address}</p><p>{result.message}</p>{result.state==='review'&&<><p>{result.intent.name} {result.intent.phone} {result.intent.email}</p><p>{result.intent.message}</p><label><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/>I confirm this permit, inspection, and date.</label><button disabled={busy||!ack} onClick={()=>void run(confirm)}>{result.intent.kind==='cancel'?'Confirm cancellation':'Confirm scheduling'}</button><button disabled={busy} onClick={()=>{setResult(null);setAck(false);}}>Back to edit</button></>}{unresolved&&<button disabled={busy} onClick={()=>void run(check)}>Check result (does not resubmit)</button>}{['succeeded','failed'].includes(result.state)&&<button disabled={busy} onClick={()=>{localStorage.removeItem(recoveryKey);setResult(null);setIntent(null);dialogRef.current?.close();}}>Done</button>}</div>}
 </div>}
 </>}{error&&<p ref={errorRef} tabIndex={-1} role="alert">{error}</p>}</dialog></ActionContext.Provider>;
}
