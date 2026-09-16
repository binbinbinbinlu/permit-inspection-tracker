import {chromium,type Page} from 'playwright';
import {redmondHome,redmondBase,normalizeEnergov,parseEnergovChecklist,type EnergovAvailable,type EnergovHistory} from '../lib/energov.ts';
import type {PermitData} from '../lib/inspections.ts';

async function idle(page:Page){
 await page.locator('#overlay').waitFor({state:'hidden'});
 if(await page.locator('#globalMessageDialog').isVisible())throw Error('Redmond dialog: '+await page.locator('#globalMessageDialog').innerText());
}
async function tableRows(page:Page,id:string):Promise<{cells:string[];url:string;requestable:boolean}[]> {
 await page.waitForLoadState('networkidle');
 const table=page.locator('#'+id);await table.waitFor();
 const panel=table.locator('..');const select=panel.locator('select[id="pageSizeList"]');
 // A checklist tab exists only when records are available. Its initial empty placeholder
 // is rendered before the request completes and must never be treated as an empty result.
 if(id==='selfServiceTable-CheckList')await panel.locator('[id="startAndEndCount"]').filter({hasText:/of\s+\d+/}).waitFor();
 if(await select.isVisible()){await select.selectOption('100');await idle(page);await page.waitForLoadState('networkidle');}
 const output=[];
 for(let pageNumber=0;pageNumber<100;pageNumber++) {
  await page.waitForFunction(({id,pageNumber})=>{
   const table=document.getElementById(id)!;const panel=table.parentElement!;
   const count=panel.querySelector('[id="startAndEndCount"]')?.textContent?.match(/(\d+)\s*-\s*(\d+)\s+of\s+(\d+)/);
   const rows=table.querySelectorAll('tbody tr');
   if(!count)return !rows.length&&Array.from(panel.querySelectorAll('h6')).some(e=>e.textContent?.includes('No records')&&(e as HTMLElement).offsetParent!==null);
   return Number(count[1])===pageNumber*100+1&&Number(count[2])===Math.min((pageNumber+1)*100,Number(count[3]))&&rows.length===Number(count[2])-Number(count[1])+1;
  },{id,pageNumber});
  const batch=await table.locator('tbody tr').evaluateAll(rows=>rows.map(row=>({cells:Array.from(row.querySelectorAll('td')).map(c=>c.textContent?.trim()||''),url:row.querySelector<HTMLAnchorElement>('a[href*="inspectionDetail"]')?.href||'',requestable:!!row.querySelector('input[type="checkbox"]:not(:disabled)')})));
  output.push(...batch);
  const next=panel.locator('a[id="link-NextPage"]');
  if(!await next.isVisible()||await next.locator('..').getAttribute('class').then(c=>c?.includes('disabled'))) {
   const total=(await panel.locator('[id="startAndEndCount"]').textContent())?.match(/of\s+(\d+)/)?.[1];
   if(total&&output.length!==Number(total))throw Error('Redmond inspection pagination is incomplete.');
   return output;
  }
  const before=await table.innerText();await next.click();await idle(page);await page.waitForLoadState('networkidle');
  await page.waitForFunction(({id,before})=>document.getElementById(id)?.innerText!==before,{id,before});
 }
 throw Error('Redmond inspection pagination exceeded its safety limit.');
}
const value=async(page:Page,id:string)=>(await page.locator('#'+id).innerText()).replace(/^[^:]+:\s*/,'').trim();

export async function loadRedmondPermit(number:string):Promise<PermitData>{
 const username=process.env.REDMOND_USERNAME?.trim(),password=process.env.REDMOND_PASSWORD?.trim();
 if(!username||!password)throw Error('Redmond refresh requires REDMOND_USERNAME and REDMOND_PASSWORD Actions secrets.');
 const browser=await chromium.launch();let step='sign-in';
 try {
  const context=await browser.newContext();context.setDefaultTimeout(60000);
  const page=await context.newPage();page.setDefaultTimeout(60000);
  await page.goto(redmondHome,{waitUntil:'domcontentloaded'});await idle(page);
  step='opening sign-in';await page.locator('#link-LoginUnderGreetings:visible').first().click();
  await page.locator('#modalOkBtn').last().click({force:true});
  step='email verification';await page.getByRole('textbox',{name:'Email address',exact:true}).fill(username);
  await page.getByRole('button',{name:'Next',exact:true}).click();
  step='password verification';await page.getByRole('button',{name:'Select Password.',exact:true}).click();
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button',{name:'Verify',exact:true}).click();
  step='returning from sign-in';
  await page.waitForURL(url=>url.hostname==='cityofredmondwa-energovweb.tylerhost.net'&&url.hash==='#/home');
  await page.locator('#link-Greetings:visible').first().waitFor();await idle(page);
  step='permit search';
  await page.goto(redmondBase+'#/search',{waitUntil:'domcontentloaded'});await idle(page);
  await page.locator('#SearchKeyword').fill(number);await page.locator('#button-Search').click();await idle(page);
  const link=page.getByRole('link',{name:number,exact:true});await link.waitFor();
  const sourceUrl=await link.getAttribute('href');
  if(!sourceUrl||!/^#\/permit\/[a-f0-9-]+$/i.test(sourceUrl.replace(redmondBase,'')))throw Error('Redmond returned an invalid permit link.');
  const url=new URL(sourceUrl,redmondBase).href;
  step='permit details';
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(number=>document.querySelector('#focusText')?.textContent?.includes(number),number);await idle(page);
  if(!(await page.locator('#focusText').innerText()).includes(number))throw Error('Redmond returned the wrong permit.');
  const project=await value(page,'label-PermitDetail-ProjectName');
  const notice=await page.getByText('A hold currently exists on this permit.',{exact:true}).isVisible()?'A hold currently exists on this permit. Review Holds in the source portal.':'';
  step='permit location';await page.locator('#button-TabButton-Locations').click();await idle(page);
  const address=(await page.locator('#Address_State_Info_0').innerText()).replace(/\s+/g,' ').replace(/\s*,\s*/g,', ').replace(/,\s*$/,'').trim();
  step='inspection checklist';await page.locator('#button-TabButton-Inspections').click();await idle(page);
  const existing=await tableRows(page,'selfServiceTable-ExistingInspections');
  const remaining=await tableRows(page,'selfServiceTable-RemainingInspections');
  const optional=await tableRows(page,'selfServiceTable-OptionalInspections');
  const available:EnergovAvailable[]=[...remaining,...optional].map(r=>({name:r.cells[0],reinspection:r.cells[1]==='Yes',requestable:r.requestable}));
  const history:EnergovHistory[]=[];
  for(const item of existing){
   step=`inspection history ${history.length+1}/${existing.length}`;
   if(!item.url.startsWith(redmondBase+'#/inspectionDetail/inspection/'))throw Error('Redmond returned an invalid inspection link.');
   const inspectionId=item.url.split('/').at(-1);
   // Observe only this inspection's checklist read, not identity or unrelated responses.
   const checklist=page.context().waitForEvent('response',{predicate:response=>{
    if(new URL(response.url()).pathname!=='/apps/selfservice/api/energov/entity/checklist/search')return false;
    try{return response.request().postDataJSON()?.EntityId===inspectionId;}catch{return false;}
   }}).then(response=>response.json()).then(parseEnergovChecklist).catch(()=>null);
   // Open from the signed-in permit tab so Civic Access's tab-scoped session follows.
   const opened=page.waitForEvent('popup');
   await page.evaluate(url=>{window.open(url,'_blank');},item.url);
   const detail=await opened;
   try {
   await detail.waitForLoadState('domcontentloaded');
   await detail.waitForFunction(number=>document.querySelector('#focusText')?.textContent?.includes(number),item.cells[0]);await idle(detail);
   await detail.locator('#link-Greetings:visible').first().waitFor();
   await detail.waitForLoadState('networkidle');
   // The permit checklist uses workflow labels; detail pages may use different type names.
   const name=item.cells[1],status=await value(detail,'label-InspectionDetail-StatusName');
   const date=await value(detail,'label-InspectionDetail-ActualEndDate')||await value(detail,'label-InspectionDetail-ScheduledDate');
   const time=await value(detail,'label-InspectionDetail-ActualEndTime'),inspector=await value(detail,'label-InspectionDetail-AssignedInspectorName');
   const result=await checklist;
   if(!result)throw Error('Redmond checklist response was unavailable or invalid.');
   let notes=result.notes;
   if(result.loaded<result.total) {
    await detail.locator('#button-TabButton-CheckList').click();await idle(detail);
    notes=(await tableRows(detail,'selfServiceTable-CheckList')).map(r=>r.cells[3]?`${r.cells[0]}: ${r.cells[3]}`:'').filter(Boolean).join('\n');
   }
   history.push({id:item.url,name,status,date,time,inspector,notes,url:item.url});
   } finally {await detail.close();}
  }
  const inspections=normalizeEnergov(available,history);
  if(!inspections.length)throw Error('Redmond returned no inspections.');
  return {city:'Redmond',number,project,address,notice,sourceUrl:url,fetchedAt:new Date().toISOString(),inspections};
 } catch(error) {
  // Never include identity-provider URLs, tokens, or filled credentials in diagnostics.
  const kind=error instanceof Error?error.name:'Error';
  throw Error(`Redmond could not complete ${step} for ${number} (${kind}). Check source availability and saved account access.`);
 } finally {await browser.close();}
}
