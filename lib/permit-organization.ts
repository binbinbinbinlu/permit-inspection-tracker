export type PermitSummary = {city:string;number:string;address?:string;project?:string};
export type Organization = {sort:'custom'|'number'|'city'|'address';group:'none'|'city'|'custom';order:string[];labels:Record<string,string>;groups:Record<string,string>};
export const defaults:Organization={sort:'custom',group:'none',order:[],labels:{},groups:{}};
export const permitKey=(p:PermitSummary)=>`${p.city}:${p.number}`;
export function readOrganization(raw:string|null):Organization {
 try {const value=JSON.parse(raw||'null');if(!value||typeof value!=='object')return {...defaults};
 const strings=(v:unknown):Record<string,string>=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).filter(([k,x])=>k.length<150&&typeof x==='string'&&x.length<=80)):{};
 return {sort:['custom','number','city','address'].includes(value.sort)?value.sort:'custom',group:['none','city','custom'].includes(value.group)?value.group:'none',order:Array.isArray(value.order)?[...new Set(value.order.filter((x:unknown)=>typeof x==='string'))] as string[]:[],labels:strings(value.labels),groups:strings(value.groups)};
 }catch{return {...defaults};}
}
export function organizePermits(permits:PermitSummary[],prefs:Organization){
 const ranks=new Map(prefs.order.map((k,i)=>[k,i]));const compare=(a:string,b:string)=>a.localeCompare(b,undefined,{numeric:true,sensitivity:'base'});
 const sorted=[...permits].sort((a,b)=>{
 if(prefs.sort==='custom')return (ranks.get(permitKey(a))??Infinity)-(ranks.get(permitKey(b))??Infinity)||0;
 const field=prefs.sort;return compare(a[field]||'',b[field]||'')||compare(a.number,b.number)||compare(a.city,b.city);
 });
 const groups=new Map<string,PermitSummary[]>();for(const p of sorted){const name=prefs.group==='city'?p.city:prefs.group==='custom'?(prefs.groups[permitKey(p)]?.trim()||'Ungrouped'):'';groups.set(name,[...(groups.get(name)||[]),p]);}
 return [...groups.entries()].sort(([a],[b])=>compare(a,b));
}
export function movePermit(order:string[],key:string,offset:number){const result=[...order];const index=result.indexOf(key);const target=index+offset;if(index<0||target<0||target>=result.length)return result;[result[index],result[target]]=[result[target],result[index]];return result;}
