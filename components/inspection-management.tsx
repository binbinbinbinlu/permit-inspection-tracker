'use client';
import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import type {Inspection,PermitData} from '../lib/inspections';
import type {Live,Intent} from '../backend/mbp';
type View=Live & {inspections:Inspection[];fetchedAt:string;writesEnabled:boolean};
type Result={id:string;state:string;message:string;label:string;intent:Intent;expires:number};
const backend=process.env.NEXT_PUBLIC_ACTIONS_URL||'';
const ActionContext=createContext<((row:Inspection)=>ReactNode)|null>(null);
export function InspectionAction({row}:{row:Inspection}){return useContext(ActionContext)?.(row)??null;}
export function InspectionManagement({permit,onUpdate,children,enabled=true}:{permit:PermitData;children:ReactNode;enabled?:boolean;onUpdate:(data:Pick<PermitData,'inspections'|'fetchedAt'>)=>void}){
 const [key,setKey]=useState(''),[live,setLive]=useState<View|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState<Result|null>(null),[intent,setIntent]=useState<Intent|null>(null),[ack,setAck]=useState(false);
 const dialogRef=useRef<HTMLDialogElement>(null),selectedName=useRef('');
 const actionRef=useRef<HTMLDivElement>(null),errorRef=useRef<HTMLParagraphElement>(null);
 const [openCount,setOpenCount]=useState(0);
 function openAction(next:Intent){setResult(null);setError('');setIntent(next);setAck(false);setOpenCount(n=>n+1);}
 useEffect(()=>{const panel=actionRef.current;if(dialogRef.current?.open&&panel&&(intent||result)){panel.focus({preventScroll:true});panel.scrollIntoView({block:'start'});}},[openCount,result?.id,result?.state]);
 useEffect(()=>{if(error){errorRef.current?.focus({preventScroll:true});errorRef.current?.scrollIntoView({block:'center'});}},[error]);
 const recoveryKey=`permit-action:${permit.city}:${permit.number}`;
 async function api<T>(path:string,body?:unknown):Promise<T>{const response=await fetch(backend+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${key}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(110000)});const data=await response.json() as T & {error?:string};if(!response.ok)throw Error(data.error||'Backend request failed.');return data;}
 async function read(){const data:View=await api<View>('/live?'+new URLSearchParams({city:permit.city,number:permit.number}));setLive(data);onUpdate({inspections:data.inspections,fetchedAt:data.fetchedAt});return data;}
 async function run(work:()=>Promise<void>){setBusy(true);setError('');try{await work();}catch(e){setError(e instanceof Error?e.message:'Request failed.');}finally{setBusy(false);}}
 async function unlock(){const fresh=await read();const saved=localStorage.getItem(recoveryKey);if(saved){const recovered=await api<Result>('/operations/'+saved);setIntent(recovered.intent);setResult(recovered);}else chooseAction(selectedName.current,fresh);}
 async function review(){if(!intent)return;const r:Result=await api<Result>('/review',{target:{city:permit.city,number:permit.number},intent});localStorage.setItem(recoveryKey,r.id);setResult(r);setAck(false);}
 async function confirm(){if(!result||!ack)return;const id=result.id;setResult({...result,state:'submitting',message:'Submitting once and checking MBP…'});try{const r:Result=await api<Result>('/confirm',{id,confirm:true});setResult(r);if(r.state==='succeeded')await read();}catch{setResult({...result,state:'unknown',message:'Connection lost. The request may have reached MBP. Check the result before doing anything else.'});}}
 async function check(){if(!result)return;const r:Result=await api('/operations/'+result.id);setResult(r);if(r.state==='succeeded')await read();}
 const unresolved=!!result&&['submitting','unknown'].includes(result.state);
 function chooseAction(name:string,current:View){
  const booking=current.scheduled.find(r=>r.Description===name);
  if(booking){if(!booking.InspectionCancellable)throw Error('Contact '+(booking.CancellationPhoneNumber||'the jurisdiction')+' to cancel.');openAction({kind:'cancel',description:name,date:booking.InspectionDate.slice(0,10),bookingId:String(booking.UniqueId)});return;}
  const row=current.inspections.find(r=>r.name===name),offer=current.available.find(r=>r.Description===name);
  if(!row||row.status==='passed'||row.restricted||!offer||offer.InspectionRestricted!==false)throw Error('This inspection is not currently available to schedule.');
  openAction({kind:'schedule',description:name,date:'',name:'',phone:'',email:'',message:''});
 }
 function open(row:Inspection){selectedName.current=row.name;dialogRef.current?.showModal();if(result)return;setError('');if(live)void run(async()=>chooseAction(row.name,await read()));}
 function action(row:Inspection){const booking=live?.scheduled.find(r=>r.Description===row.name);const scheduled=!!booking||row.sourceStatus==='Scheduled';return <button className="inspection-action" disabled={busy||(!scheduled&&(row.status==='passed'||row.restricted))||(!!booking&&!booking.InspectionCancellable)} onClick={()=>open(row)}>{unresolved?'Check request':scheduled?'Cancel':'Schedule'}</button>;}
 if(!enabled||!backend)return <>{children}</>;
 return <ActionContext.Provider value={action}>{children}<dialog ref={dialogRef} className="inspection-management management-dialog" aria-label="Manage inspection"><button className="dialog-close" aria-label="Close inspection management" onClick={()=>dialogRef.current?.close()}>Close</button><h2>Manage inspection</h2><p>Review the details before confirming a change.</p>
 {!live?<form onSubmit={e=>{e.preventDefault();void run(unlock);}}><label>Private management key<input type="password" autoComplete="off" value={key} onChange={e=>setKey(e.target.value)} required/></label><button disabled={busy||!key}>Unlock management</button></form>:<>
 {!live.writesEnabled&&<p role="status">Backend is in read-only mode. Submissions are disabled.</p>}
 {(intent||result)&&<div className="action-focus" ref={actionRef} tabIndex={-1} aria-label="Inspection request details">
 {intent&&!result&&<form onSubmit={e=>{e.preventDefault();void run(review);}} className="action-review"><h3>{intent.kind==='cancel'?'Review cancellation':'Choose scheduling details'}</h3><p>{permit.city} · {permit.number} · {permit.address}</p><strong>{intent.description}</strong>{intent.kind==='schedule'?<><label>Date<select aria-label="Date" required value={intent.date} onChange={e=>setIntent({...intent,date:e.target.value})}><option value="">Choose a date</option>{live.available.find(r=>r.Description===intent.description)?.InspectionDates?.map(d=><option key={d} value={d.slice(0,10)}>{d.slice(0,10)}</option>)}</select></label><label>Site contact name<input required maxLength={100} value={intent.name} onChange={e=>setIntent({...intent,name:e.target.value})}/></label><label>Phone (10 digits)<input required inputMode="tel" pattern="[0-9]{10}" value={intent.phone} onChange={e=>setIntent({...intent,phone:e.target.value})}/></label><label>Email<input required type="email" value={intent.email} onChange={e=>setIntent({...intent,email:e.target.value})}/></label><label>Message to inspector<input maxLength={100} value={intent.message} onChange={e=>setIntent({...intent,message:e.target.value})}/></label></>:<p>{intent.date}</p>}<button disabled={busy||!live.writesEnabled}>Review request — does not submit</button><button type="button" disabled={busy} onClick={()=>{setIntent(null);dialogRef.current?.close();}}>Back</button></form>}
 {result&&<div className="action-review" role="status"><h3>{result.label}</h3><p>{permit.city} · {permit.number} · {permit.address}</p><p>{result.message}</p>{result.state==='review'&&<><p>{result.intent.name} {result.intent.phone} {result.intent.email}</p><p>{result.intent.message}</p><label><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/>I confirm this permit, inspection, and date.</label><button disabled={busy||!ack} onClick={()=>void run(confirm)}>{result.intent.kind==='cancel'?'Confirm cancellation':'Confirm scheduling'}</button><button disabled={busy} onClick={()=>{setResult(null);setAck(false);}}>Back to edit</button></>}{unresolved&&<button disabled={busy} onClick={()=>void run(check)}>Check result (does not resubmit)</button>}{['succeeded','failed'].includes(result.state)&&<button disabled={busy} onClick={()=>{localStorage.removeItem(recoveryKey);setResult(null);setIntent(null);dialogRef.current?.close();}}>Done</button>}</div>}
 </div>}
 </>}{error&&<p ref={errorRef} tabIndex={-1} role="alert">{error}</p>}</dialog></ActionContext.Provider>;
}
