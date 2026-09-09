import { jurisdictions } from './inspections.ts';
export function validatePermit(input:unknown):{city:string;number:string} {
 if(!input||typeof input!=='object')throw new Error('Permit request must be an object.');
 const {city,number}=input as Record<string,unknown>;
 if(typeof city!=='string'||!Object.hasOwn(jurisdictions,city)||typeof number!=='string')throw new Error('Invalid jurisdiction or permit number.');
 const normalized=number.trim().toUpperCase();
 if(!normalized||normalized.length>60||!/^[A-Z0-9 -]+$/.test(normalized))throw new Error('Invalid permit number.');
 return {city,number:normalized};
}
export function requestUrl(repository:string,permit:{city:string;number:string}) {
 if(!/^[\w.-]+\/[\w.-]+$/.test(repository))throw new Error('GitHub repository is not configured.');
 const value=validatePermit(permit);
 return `https://github.com/${repository}/issues/new?${new URLSearchParams({title:`Add permit: ${value.city} ${value.number}`,body:'```json\n'+JSON.stringify(value,null,2)+'\n```'})}`;
}
export function parseIssue(event:unknown) {
 const data=event as {issue?:{title?:string;body?:string;author_association?:string}};
 if(!['OWNER','MEMBER','COLLABORATOR'].includes(data.issue?.author_association||''))throw new Error('Only repository collaborators can add tracked permits.');
 if(!data.issue?.title?.startsWith('Add permit: '))throw new Error('Not a permit request.');
 const match=data.issue.body?.match(/^```json\s*\n([\s\S]*?)\n```\s*$/);
 if(!match)throw new Error('Expected a JSON permit request.');
 return validatePermit(JSON.parse(match[1]));
}
