import {prepare,confirmed,type Gateway,type Prepared} from './mbp.ts';
export type State='review'|'submitting'|'succeeded'|'failed'|'unknown';
export type Operation={id:string;action:Prepared;state:State;message:string;expires:number};
export interface Store {get(id:string):Promise<Operation|null>;put(op:Operation):Promise<void>;claim(id:string,key:string):Promise<boolean>;release(key:string,id:string):Promise<void>}
const lockKey=(op:Operation)=>`${op.action.target.city}:${op.action.target.number}`;
export async function execute(id:string,store:Store,gateway:Gateway):Promise<Operation>{
 const op=await store.get(id);if(!op)throw Error('Review request not found.');
 if(op.state!=='review')return op;
 if(op.expires<Date.now())throw Error('Review expired. Refresh and review the request again.');
 if(!await store.claim(id,lockKey(op)))throw Error('Another request for this permit is unresolved. Check its result first.');
 // Claim is durable before any external side effect; duplicate clicks cannot send twice.
 op.state='submitting';op.message='Checking current MBP availability…';
 try{const live=await gateway.read(op.action.target);op.action=prepare(op.action.target,op.action.intent,live);}
 catch(error){op.state='failed';op.message=(error instanceof Error?error.message:'Unable to validate the request.')+' Nothing was submitted.';await store.put(op);await store.release(lockKey(op),op.id);return op;}
 op.message='Submission started. Do not submit it again.';await store.put(op);
 try{await gateway.send(op.action);}catch{/* May already have been accepted; never automatically retry. */}
 op.state='unknown';op.message='Result not confirmed. Do not repeat the request. Check MBP or contact the jurisdiction.';await store.put(op);
 return reconcile(op,store,gateway);
}
export async function reconcile(op:Operation,store:Store,gateway:Gateway):Promise<Operation>{
 if(!['submitting','unknown'].includes(op.state))return op;
 try{if(confirmed(op.action,await gateway.read(op.action.target))){op.state='succeeded';op.message=op.action.intent.kind==='schedule'?'Scheduled — confirmed in MBP.':'Cancelled — confirmed in MBP.';await store.put(op);await store.release(lockKey(op),op.id);}}catch{/* Preserve uncertainty and the durable lock. */}
 return op;
}
