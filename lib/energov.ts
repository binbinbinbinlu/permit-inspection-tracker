import {day,passed,type Inspection,type Status} from './inspections.ts';
export const redmondHome='https://cityofredmondwa-energovweb.tylerhost.net/apps/selfservice#/home';
export const redmondBase=redmondHome.split('#')[0];
export type EnergovAvailable={name:string;reinspection:boolean;requestable:boolean};
export type EnergovHistory={id:string;name:string;status:string;date:string;time:string;inspector:string;notes:string;url:string};
const key=(s:string)=>s.trim().replace(/\s+/g,' ').toLowerCase();
const resolved=(s:string)=>passed(s)||/^Inspection Not Required$/i.test(s);
function timestamp(item:EnergovHistory){
 const match=item.time.match(/(\d+):(\d+)\s*(AM|PM)/i);
 const minutes=match?((Number(match[1])%12)+(match[3].toUpperCase()==='PM'?12:0))*60+Number(match[2]):0;
 return day(item.date)+String(minutes).padStart(4,'0');
}
export function normalizeEnergov(available:EnergovAvailable[],history:EnergovHistory[]):Inspection[]{
 const groups=new Map<string,{available?:EnergovAvailable;history:EnergovHistory[]}>();
 for(const item of available){if(!item.name)throw Error('Redmond inspection name is missing.');groups.set(key(item.name),{available:item,history:[]});}
 const seen=new Set<string>();
 for(const item of history){
  if(!item.id||!item.name||!item.status||(resolved(item.status)&&!day(item.date)))throw Error('Redmond inspection result is incomplete.');
  if(seen.has(item.id))throw Error('Redmond inspection pagination returned duplicate records.');seen.add(item.id);
  const id=key(item.name),group=groups.get(id)||{history:[]};group.history.push(item);groups.set(id,group);
 }
 return [...groups.entries()].map(([id,group])=>{
  group.history.sort((a,b)=>timestamp(b).localeCompare(timestamp(a)));
  const latest=group.history[0],a=group.available;
  let status:Status=latest?(resolved(latest.status)?'passed':'pending'):a?.requestable&&!a.reinspection?'available':'pending';
  if(a?.reinspection)status='pending';
  return {id,name:a?.name||latest.name,category:'Redmond inspections',status,sourceStatus:a?.reinspection&&(!latest||resolved(latest.status))?'Reinspection required':latest?.status||(a?.requestable?'Available to request':'Review source'),date:latest?day(latest.date):'',dates:[],restricted:!!a&&!a.requestable,restriction:a&&!a.requestable?'Scheduling is restricted. Review the source permit.':'',history:group.history.map(h=>({Description:h.name,Status:h.status,Date:day(h.date),Staff:h.inspector,Notes:h.notes,DocumentUrl:h.url}))};
 });
}
