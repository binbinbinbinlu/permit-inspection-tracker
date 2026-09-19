import {portalGateway} from './portals.ts';
import permits from '../permits.json' with {type:'json'};
import {jurisdictions,mergeInspections} from '../lib/inspections.ts';
import {httpGateway,prepare,type Intent,type Target,type Gateway} from './mbp.ts';
import {execute,reconcile,type Operation,type Store} from './actions.ts';
type Env={DB:D1Database;ADMIN_TOKEN:string;ALLOWED_ORIGIN:string;WRITES_ENABLED?:string;BROWSER?:Fetcher;PORTAL_CREDENTIALS?:string};
export function store(db:D1Database):Store{return {
 async get(id){const row=await db.prepare('SELECT data FROM operations WHERE id=?').bind(id).first<{data:string}>();return row?JSON.parse(row.data):null;},
 async put(op){await db.prepare('INSERT INTO operations(id,state,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,data=excluded.data').bind(op.id,op.state,JSON.stringify(op)).run();},
 async claim(id,key){
  // D1 batch is atomic. Only a review-state operation may reserve this permit.
  const results=await db.batch([db.prepare("INSERT OR IGNORE INTO locks(permit,operation) SELECT ?,id FROM operations WHERE id=? AND state='review'").bind(key,id),db.prepare("UPDATE operations SET state='submitting',data=json_set(data,'$.state','submitting') WHERE id=? AND state='review' AND EXISTS(SELECT 1 FROM locks WHERE permit=? AND operation=?)").bind(id,key,id)]);
  return results[1].meta.changes===1;
 },
 async release(key,id){await db.prepare('DELETE FROM locks WHERE permit=? AND operation=?').bind(key,id).run();}
};}
function target(value:unknown):Target {const v=value as {city?:unknown;number?:unknown};const permit=v&&permits.find(p=>p.city===v.city&&p.number===v.number);if(!permit||typeof v.city!=='string'||typeof v.number!=='string'||!(v.city in jurisdictions))throw Error('Choose a tracked permit.');return {city:v.city,number:v.number,jurisdiction:jurisdictions[v.city],...('sourceId' in permit?{sourceId:permit.sourceId}: {})};}

const publicOperation=(op:Operation)=>({id:op.id,state:op.state,message:op.message,label:op.action.label,target:op.action.target,intent:op.action.intent,expires:op.expires});
export default {async fetch(request:Request,env:Env):Promise<Response>{
 const origin=request.headers.get('Origin');
 const headers={'Access-Control-Allow-Origin':env.ALLOWED_ORIGIN,'Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Cache-Control':'no-store','Vary':'Origin'};
 const json=(body:unknown,status=200)=>Response.json(body,{status,headers});
 if(origin!==env.ALLOWED_ORIGIN)return json({error:'Origin not allowed.'},403);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 const token=request.headers.get('Authorization')?.replace(/^Bearer /,'');
 if(!env.ADMIN_TOKEN||env.ADMIN_TOKEN.length<32||!token||token.length>200)return json({error:'Unlock inspection management first.'},401);
 const digest=async(s:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
 const [a,b]=await Promise.all([digest(token),digest(env.ADMIN_TOKEN)]);let difference=0;for(let i=0;i<a.length;i++)difference|=a[i]^b[i];if(difference)return json({error:'Invalid access key.'},401);
 const mbp=httpGateway();let portal:Gateway|undefined;
 function adapter(t:Target){if(t.jurisdiction!==0)return mbp;if(!env.BROWSER||!env.PORTAL_CREDENTIALS)throw Error('Secure portal scheduling is not configured.');if(!portal)portal=portalGateway(async()=>{const {launch}=await import('@cloudflare/playwright');try{return await launch(env.BROWSER!) as unknown as import('playwright').Browser;}catch(error){const message=error instanceof Error?error.message:'';if(message.includes('Rate limit exceeded')){await new Promise(resolve=>setTimeout(resolve,21000));return await launch(env.BROWSER!) as unknown as import('playwright').Browser;}throw Error(message.includes('time limit exceeded')?'Secure browser daily allowance reached. No request was submitted. Try again after the allowance resets.':'Secure browser could not start. No request was submitted.');}},JSON.parse(env.PORTAL_CREDENTIALS));return portal;}
 const gateway:Gateway={read:(t,name)=>adapter(t).read(t,name),send:action=>adapter(action.target).send(action)};
 const storage=store(env.DB),url=new URL(request.url);
 try{
  if(request.method==='GET'&&url.pathname==='/live'){
   const t=target(Object.fromEntries(url.searchParams));const inspection=url.searchParams.get('inspection')||undefined;if(inspection&&inspection.length>300)throw Error('Invalid inspection name.');const live=await gateway.read(t,inspection);return json({...live,inspections:live.inspections||mergeInspections(live.available,live.scheduled,live.history),fetchedAt:new Date().toISOString(),writesEnabled:env.WRITES_ENABLED==='true'});
  }
  if(request.method==='GET'&&/^\/operations\/[a-f0-9-]{36}$/.test(url.pathname)){
   const op=await storage.get(url.pathname.split('/').at(-1)!);return op?json(publicOperation(await reconcile(op,storage,gateway))):json({error:'Request not found.'},404);
  }
  if(request.method!=='POST'||!['/review','/confirm'].includes(url.pathname))return json({error:'Not found.'},404);
  if(env.WRITES_ENABLED!=='true')return json({error:'Scheduling is not enabled on this backend.'},503);
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'JSON required.'},415);
  const raw=await request.text();if(raw.length>4096)return json({error:'Request too large.'},413);
  const body=JSON.parse(raw);
  if(url.pathname==='/review'){
   const t=target(body.target);const intent=body.intent as Intent;
   if(!intent||Object.entries(intent).some(([k,v])=>!['kind','description','date','bookingId','name','phone','email','message','timeSlot'].includes(k)||typeof v!=='string'||v.length>300))throw Error('Invalid inspection request.');
   const action=prepare(t,intent,await gateway.read(t,intent.description));const op:Operation={id:crypto.randomUUID(),action,state:'review',message:'Review details. Nothing has been submitted.',expires:Date.now()+5*60*1000};await storage.put(op);return json(publicOperation(op));
  }
  if(body.confirm!==true||typeof body.id!=='string'||! /^[a-f0-9-]{36}$/.test(body.id))throw Error('Explicit confirmation is required.');
  return json(publicOperation(await execute(body.id,storage,gateway)));
 }catch(error){return json({error:error instanceof Error?error.message:'Unable to complete the request.'},400);}finally{await portal?.close?.().catch(()=>{});}
}};
