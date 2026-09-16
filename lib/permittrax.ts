import {day, type History, type Inspection, type Status} from './inspections.ts';

export const clydeHillUrl='https://clydehill_wa.permittrax.com/citizen/Home/CLYDEHIL_L/PERMIT';
export type PermitTraxRow={id:string;name:string;status:string;schedule:string;canSchedule:boolean;history:History[]};

export function normalizePermitTrax(rows:PermitTraxRow[]):Inspection[] {
 const seen=new Set<string>();
 return rows.map(row=>{
  if(!row.id||!row.name||seen.has(row.id)) throw new Error('PermitTrax returned an invalid or duplicate inspection.');
  seen.add(row.id);
  // The source lists newest attempts first; preserve that order for same-day attempts.
  const history=row.history.map(h=>({...h,Date:day(h.Date)})).sort((a,b)=>b.Date.localeCompare(a.Date));
  const latest=history[0];
  const complete=/^DONE$/i.test(row.status)&&/^COMPLETE$/i.test(row.schedule);
  const available=!row.status&&!row.schedule&&row.canSchedule;
  const approved=!latest||/^(INSPECTION APPROVED|APPROVED|PASSED|COMPLETED)$/i.test(latest.Status);
  const status:Status=complete&&approved?'passed':available&&(!latest||/^(CANCELED|CANCELLED)$/i.test(latest.Status))?'available':'pending';
  return {id:row.id,name:row.name,category:'Building inspections',status,
   sourceStatus:latest?.Status||row.status||row.schedule||(available?'Available to request':'Review source'),
   date:latest?.Date||day(row.schedule),dates:[],restricted:!complete&&!available,
   restriction:!complete&&!available?[row.status,row.schedule].filter(Boolean).join(' · '):'',history};
 });
}
