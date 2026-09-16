import {day,passed,type Inspection,type History} from './inspections.ts';
export const medinaHome='https://ci-medina-wa.smartgovcommunity.com/Public/Home';
export function medinaPermitUrl(id:string) {
 if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id))throw new Error('Enter a valid Medina permit link.');
 return `https://ci-medina-wa.smartgovcommunity.com/Permitting/PermitLandingPage/Index/${id.toLowerCase()}`;
}
export function medinaPermitId(link:string) {
 const url=new URL(link);
 if(url.origin!=='https://ci-medina-wa.smartgovcommunity.com')throw new Error('Use the Medina SmartGov permit link.');
 const id=url.pathname.match(/^\/Permitting\/PermitLandingPage\/Index\/([a-f0-9-]+)\/?$/i)?.[1]||'';
 medinaPermitUrl(id);return id.toLowerCase();
}
export type SmartGovRow={name:string;date:string;status:string;canRequest:boolean;resultUrl:string};
export function normalizeSmartGov(items:SmartGovRow[]):Inspection[] {
 const grouped=new Map<string,SmartGovRow[]>();
 for(const item of items){
  if(!item.name||((item.date||item.status)&&(!day(item.date)||!item.status)))throw new Error('Medina inspection data is incomplete.');
  const key=item.name.trim().toLowerCase();grouped.set(key,[...(grouped.get(key)||[]),item]);
 }
 return [...grouped.entries()].map(([id,rows])=>{
  const history:History[]=rows.filter(r=>r.status).map(r=>({Description:r.name,Date:day(r.date),Status:r.status,DocumentUrl:r.resultUrl||null})).sort((a,b)=>b.Date.localeCompare(a.Date));
  const latest=history[0];const available=rows.some(r=>r.canRequest);
  return {id,name:rows[0].name,category:'Building inspections',status:latest?(passed(latest.Status)?'passed':available&&/^cancell?ed$/i.test(latest.Status)?'available':'pending'):available?'available':'pending',sourceStatus:latest?.Status||(available?'Available to request':'Review source'),date:latest?.Date||'',dates:[],history,restricted:!available&&!latest,restriction:''};
 });
}
