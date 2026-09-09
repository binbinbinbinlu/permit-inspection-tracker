export type Status = 'available' | 'pending' | 'passed';
export type Available = { Description: string; InspectionType?: string; InspectionDates?: string[]; InspectionRestricted?: boolean; RestrictionMessage?: string; Tooltip?: string };
export type Scheduled = { Description: string; InspectionDate: string };
export type History = { Description: string; Date: string; Status: string; Staff?: string; Notes?: string; DocumentUrl?: string | null };
export type Inspection = { id: string; name: string; category: string; status: Status; sourceStatus: string; date: string; dates: string[]; restricted: boolean; restriction: string; history: History[] };
export type PermitData = { number: string; city: string; project: string; address: string; fetchedAt: string; sourceUrl: string; inspections: Inspection[] };
export const jurisdictions: Record<string, number> = { Auburn:24, Bellevue:1, Burien:11, Edmonds:23, 'Federal Way':25, Issaquah:3, Kenmore:4, 'King County':20, Kirkland:5, 'Mercer Island':6, Sammamish:7, Snoqualmie:9 };
export const clean = (s: unknown) => String(s ?? '').replace(/<[^>]*>/g, '').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').trim();
const key = (s: string) => clean(s).replace(/\s+v\d+$/i,'').replace(/[^a-z0-9]/gi,'').toLowerCase();
// Compare calendar dates without interpreting a jurisdiction's midnight as UTC.
export function day(s: string): string {
 const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
 if(iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
 const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
 return us ? `${us[3]}-${us[1].padStart(2,'0')}-${us[2].padStart(2,'0')}` : '';
}
export function passed(status: string) { return /^(approved|passed|pass|job conference completed|completed)$/i.test(clean(status)); }
export function mergeInspections(available: Available[], scheduled: Scheduled[], history: History[]): Inspection[] {
 const rows = new Map<string, Inspection>(); const aliases = new Map<string,string>();
 for(const item of available) {
  const id=key(item.Description); if(!id) continue;
  rows.set(id,{id,name:clean(item.Description),category:clean(item.InspectionType)||'Other inspections',status:'available',sourceStatus:'Available to request',date:'',dates:(item.InspectionDates||[]).map(day).filter(Boolean),restricted:!!item.InspectionRestricted,restriction:clean(item.RestrictionMessage),history:[]});
  aliases.set(id,id); if(item.Tooltip) aliases.set(key(item.Tooltip),id);
 }
 const find = (description:string) => {
  const id=aliases.get(key(description))||key(description);
  if(!rows.has(id)) rows.set(id,{id,name:clean(description).replace(/\s+v\d+$/i,''),category:'Other inspections',status:'pending',sourceStatus:'',date:'',dates:[],restricted:false,restriction:'',history:[]});
  return rows.get(id)!;
 };
 for(const item of history) {
  const h={...item,Description:clean(item.Description),Status:clean(item.Status),Notes:clean(item.Notes),Staff:clean(item.Staff),Date:day(item.Date)};
  const row=find(h.Description);
  // Some jurisdictions return the same inspection record twice.
  if(!row.history.some(x=>x.Date===h.Date&&x.Status===h.Status&&x.Notes===h.Notes&&x.Description===h.Description)) row.history.push(h);
 }
 for(const row of rows.values()) {
  row.history.sort((a,b)=>b.Date.localeCompare(a.Date)||Number(passed(b.Status))-Number(passed(a.Status)));
  const latest=row.history[0];
  if(latest) {row.status=passed(latest.Status)?'passed':/^(cancelled|canceled)$/i.test(latest.Status)&&aliases.has(row.id)?'available':'pending';row.sourceStatus=latest.Status;row.date=latest.Date;}
  else if(row.restricted) {row.status=/inspection record being approved/i.test(row.restriction)?'passed':'pending';row.sourceStatus=row.status==='passed'?'Approved by jurisdiction':'Restricted — review source';}
 }
 const upcoming = new Map<string,string>();
 for(const item of scheduled) {
  const row=find(item.Description);const date=day(item.InspectionDate);
  // A completed result supersedes the scheduling feed, which can lag on the same day.
  if(!row.history.length || date>row.history[0].Date) {
   const prior=upcoming.get(row.id);if(!prior||date<prior)upcoming.set(row.id,date);
  }
 }
 for(const [id,date] of upcoming) {const row=rows.get(id)!;row.status='pending';row.sourceStatus='Scheduled';row.date=date;}
 return [...rows.values()].sort((a,b)=>a.category.localeCompare(b.category)||a.name.localeCompare(b.name,undefined,{numeric:true}));
}
