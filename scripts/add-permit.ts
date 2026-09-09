import {readFile,writeFile} from 'node:fs/promises';
import {parseIssue} from '../lib/permit-request.ts';
const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH!,'utf8'));
const permit=parseIssue(event);
const permits=JSON.parse(await readFile('permits.json','utf8')) as {city:string;number:string}[];
if(!permits.some(p=>p.city===permit.city&&p.number===permit.number)) {
 if(permits.length>=100)throw new Error('The tracker supports at most 100 configured permits.');
 permits.push(permit);await writeFile('permits.json',JSON.stringify(permits,null,2)+'\n');
}
