import {clean} from './inspections.ts';
const text=(html:string)=>clean(html).replace(/&#(x[0-9a-f]+|\d+);/gi,(_,code:string)=>String.fromCodePoint(code[0].toLowerCase()==='x'?parseInt(code.slice(1),16):Number(code))).replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/\s+/g,' ').trim();
const key=(value:string)=>value.replace(/\s/g,'').toUpperCase();
export function parsePermitDetails(html:string,city:string,number:string):{address:string;project:string}{
 const heading=[...html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)].map(m=>text(m[1])).find(s=>s.startsWith('Information for Permit #:'));
 const fields=new Map([...html.matchAll(/<tr\b[^>]*>\s*<th\b[^>]*>([\s\S]*?)<\/th>\s*<td\b[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi)].map(m=>[text(m[1]),text(m[2])]));
 if(!heading||key(heading.split('#:')[1])!==key(number)||fields.get('Jurisdiction:')!==city||!fields.has('Address:'))throw Error('MyBuildingPermit returned unexpected permit details.');
 return {address:fields.get('Address:')!,project:fields.get('Project Name:')||''};
}
