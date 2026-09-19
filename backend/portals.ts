import type {Browser,Page} from 'playwright';
import type {Gateway,Live,Target,Prepared,Offer,Booking} from './mbp.ts';
import {day,type Inspection,type History} from '../lib/inspections.ts';
import {normalizeSmartGov,medinaPermitUrl} from '../lib/smartgov.ts';
import {normalizePermitTrax,clydeHillUrl} from '../lib/permittrax.ts';
import {redmondHome,redmondBase,normalizeEnergov} from '../lib/energov.ts';

export type PortalCredentials={username:string;password:string};
export type BrowserFactory=()=>Promise<Browser>;
const us=(date:string)=>{const [y,m,d]=date.split('-');return `${m}/${d}/${y}`;};
const offer=(name:string,id:string,dates:string[]):Offer=>({Description:name,InspectionId:id,InspectionType:'Building',InspectionDates:dates,InspectionRestricted:false,CancellationPhoneNumber:null});
function snapshot(inspections:Inspection[],available:Offer[]):Live{
 const scheduled:Booking[]=inspections.filter(r=>/^(scheduled|requested|pending inspection)$/i.test(r.sourceStatus)&&r.date).map(r=>({UniqueId:r.id,Description:r.name,InspectionDate:r.date,InspectionType:null,ConfirmationNumber:null,InspectionCancellable:false}));
 return {inspections,available,scheduled,history:inspections.flatMap(r=>r.history)};
}
export function portalGateway(launch:BrowserFactory,credentials:PortalCredentials):Gateway{
 let browser:Browser|undefined,page:Page|undefined,currentTarget:Target|undefined,currentInspection='',step='open the portal';
 async function getPage(){if(!page){browser=await launch();page=await browser.newPage();page.setDefaultTimeout(45000);}return page;}
 async function medina(t:Target,name?:string):Promise<Live>{
  const p=await getPage();await p.goto(medinaPermitUrl(t.sourceId||''),{waitUntil:'domcontentloaded'});
  if(new URL(p.url()).pathname.toLowerCase().includes('/account/login')){await p.locator('#Email').fill(credentials.username);await p.locator('#Password').fill(credentials.password);await p.getByRole('button',{name:/log in/i}).click();}
  const record=p.locator('[aria-label="Record number"] > span');await record.waitFor();if((await record.innerText()).trim()!==t.number)throw Error('Medina returned a different permit.');
  const section=p.locator('#section_InspectionsSection');if(await section.getAttribute('aria-expanded')!=='true')await section.click();
  const table=p.locator('#section_InspectionsSection_panel table');await table.waitFor();
  const rows=await table.locator('tbody > tr').evaluateAll(es=>es.map(e=>{const c=Array.from(e.querySelectorAll(':scope > td'));return {name:c[0]?.querySelector('strong')?.textContent?.trim()||'',date:c[1]?.textContent?.trim()||'',status:c[2]?.textContent?.trim()||'',canRequest:/request inspection/i.test(c[3]?.textContent||''),resultUrl:c[2]?.querySelector<HTMLAnchorElement>('a[title="Results"]')?.href||''};}));
  const inspections=normalizeSmartGov(rows),available=rows.filter(r=>r.canRequest).map(r=>offer(r.name,r.name,[]));
  const selected=rows.find(r=>r.name===name&&r.canRequest);if(!selected)return snapshot(inspections,available);
  const index=rows.indexOf(selected);await table.locator('tbody > tr').nth(index).getByRole('link',{name:/request inspection/i}).click();await p.locator('#SendRequest').waitFor();await p.locator('sg-date-picker.hydrated').waitFor();
  if(await p.locator('select[name="Case.Id"]').inputValue()!==t.sourceId)throw Error('Medina selected a different permit.');
  const id=await p.locator('select[name="Id"]').inputValue();if(!id)throw Error('Medina did not select an inspection.');
  // This is the portal's read-only availability operation, not its Save action.
  const availability=await p.evaluate(()=>new Promise<{NextOpenDate?:string}>(resolve=>{
   const portal=window as unknown as {FormSupport:{jsonAction:(action:string,callback:(data:{NextOpenDate?:string})=>void,query:string)=>void}};
   portal.FormSupport.jsonAction('GetAvailability',resolve,'CaseInspectionId='+encodeURIComponent((document.getElementById('Id') as unknown as HTMLSelectElement).value)+'&setNextOpenDate=True');
  }));
  const next=day(availability.NextOpenDate||'');if(!next)throw Error('Medina did not return an available inspection date.');
  await p.locator('select[name="CurrentInspectionOccurrence.RequestedForTimeSlot"] option').filter({hasText:'ANY AVAILABLE'}).waitFor({state:'attached'});
  const times=await p.locator('select[name="CurrentInspectionOccurrence.RequestedForTimeSlot"] option').evaluateAll(es=>es.filter(e=>(e as HTMLOptionElement).value).map(e=>({value:(e as HTMLOptionElement).value,label:e.textContent?.trim()||''})));
  const selectedOffer=available.find(r=>r.Description===name)!;Object.assign(selectedOffer,{InspectionId:id,InspectionDates:[next],timeSlots:times});
  return snapshot(inspections,available);
 }
 async function clyde(t:Target,name?:string):Promise<Live>{
  const p=await getPage();await p.addLocatorHandler(p.getByRole('button',{name:/^decline$/i}),async b=>b.click());
  await p.goto(clydeHillUrl,{waitUntil:'domcontentloaded'});await p.locator('button').filter({hasText:'CLICK TO SEARCH'}).waitFor();
  const signIn=p.locator('a').filter({hasText:/^SIGN IN$/});
  if(await signIn.count()){
   await p.locator('[data-bs-toggle=dropdown]').first().click();if(!await signIn.isVisible())await p.locator('[data-bs-toggle=dropdown]').first().click();await signIn.dispatchEvent('click');
   await p.locator('input[name="citizen_user.EmailAddress"]').fill(credentials.username);await p.locator('input[name="citizen_user.Password"]').fill(credentials.password);
   await p.locator('form').filter({has:p.locator('input[type=password]')}).locator('button').filter({hasText:/Sign In/i}).click();await p.locator('input[name="citizen_user.Password"]').waitFor({state:'hidden'});
  }
  await p.locator('button').filter({hasText:'CLICK TO SEARCH'}).click();await p.locator('input[name="citizenSearch.search_text"]').fill(t.number);await p.locator('button').filter({hasText:/^\s*SEARCH\s*$/i}).click();await p.getByRole('link',{name:t.number,exact:true}).click();
  const table=p.locator('table').filter({has:p.locator('th[title="Insp ID"]')});await table.waitFor();
  const rows=await table.locator('tbody tr').evaluateAll(es=>es.map(e=>{const c=Array.from(e.querySelectorAll('td'));return {status:c[0]?.textContent?.trim()||'',schedule:c[2]?.textContent?.trim()||'',id:c[3]?.textContent?.trim()||'',name:c[4]?.textContent?.trim()||'',canSchedule:!!c[2]?.querySelector('.bi-calendar3'),hasComments:!!c[1]?.querySelector('a'),history:[] as History[]};}));
  for(const [index,row] of rows.entries())if(row.hasComments){
   await table.locator('tbody tr').nth(index).locator('td').nth(1).getByRole('link').click();const modal=p.locator('.modal.show').filter({hasText:'COMMENTS FOR INSPECTIONS:'});await modal.waitFor();
   if(!(await modal.locator('.modal-body').innerText()).includes(row.id))throw Error('Clyde Hill returned different inspection history.');
   const attempts=await modal.locator('.modal-body > .row').evaluateAll(es=>es.map(e=>Array.from(e.children).map(c=>c.textContent?.trim()||'')));
   for(const [date,status,notes] of attempts){if(!day(date)||!status)throw Error('Clyde Hill inspection history is incomplete.');row.history.push({Description:row.name,Date:date,Status:status,Notes:notes==='-- NO COMMENT --'?'':notes});}
   await modal.getByRole('button',{name:'Close',exact:true}).first().click();await modal.waitFor({state:'hidden'});
  }
  const inspections=normalizePermitTrax(rows),available=rows.filter(r=>r.canSchedule).map(r=>offer(r.name,r.id,[]));
  for(const [index,row] of rows.entries()){const booked=day(row.schedule);if(booked&&!row.canSchedule&&row.schedule!=='COMPLETE'){inspections[index].sourceStatus='Scheduled';inspections[index].status='pending';inspections[index].date=booked;}}
  const selected=rows.find(r=>r.name===name&&r.canSchedule);if(selected){await table.locator('tbody tr').nth(rows.indexOf(selected)).locator('.bi-calendar3').click();const modal=p.locator('.modal.show');await modal.waitFor();const text=await modal.innerText();if(!text.includes(t.number)||!text.includes(selected.id))throw Error('Clyde Hill selected a different inspection.');const rawDate=await modal.locator('input').first().inputValue();const next=day(rawDate)||(Number.isFinite(Date.parse(rawDate+' 12:00:00 GMT'))?new Date(rawDate+' 12:00:00 GMT').toISOString().slice(0,10):'');if(!next)throw Error('Clyde Hill did not return an available date.');available.find(r=>r.InspectionId===selected.id)!.InspectionDates=[next];}
  return snapshot(inspections,available);
 }
 async function read(t:Target,inspection?:string){
  currentTarget=t;currentInspection=inspection||'';step='open the portal';
  try{return t.city==='Medina'?await medina(t,inspection):t.city==='Clyde Hill'?await clyde(t,inspection):await redmond(t,inspection);}
  catch(error){if(error instanceof Error&&/^(Clyde Hill|Medina|Redmond|Secure browser)/.test(error.message))throw error;throw Error(`${t.city} could not ${step}. Check source availability and account access. Nothing was submitted.`);}
 }
 async function redmond(t:Target,name?:string):Promise<Live>{
  const p=await getPage();await p.goto(redmondHome,{waitUntil:'domcontentloaded'});
  const idle=async()=>{await p.locator('#overlay').waitFor({state:'hidden'});};await idle();
  if(!await p.locator('#link-Greetings:visible').count()){
   step='open sign-in';await p.locator('#link-LoginUnderGreetings:visible').first().click();await p.locator('#modalOkBtn').last().click({force:true});step='enter the account email';await p.getByRole('textbox',{name:'Email address',exact:true}).fill(credentials.username);await p.getByRole('button',{name:'Next',exact:true}).click();step='open password verification';await p.getByRole('button',{name:'Select Password.',exact:true}).click();step='verify sign-in';await p.locator('input[type=password]').fill(credentials.password);await p.getByRole('button',{name:'Verify',exact:true}).click();step='return from sign-in';await p.waitForURL(u=>u.hostname==='cityofredmondwa-energovweb.tylerhost.net'&&u.hash==='#/home');await p.locator('#link-Greetings:visible').first().waitFor();
  }
  const ids:Record<string,string>={'BLDG-2025-07156':'654d0ef4-261a-4286-9797-b5035c2fc40c','CGP-2025-07539':'b08eaa7a-8fed-4149-a825-6e0f32f35119'};
  step='load permit details';if(ids[t.number])await p.goto(redmondBase+'#/permit/'+ids[t.number],{waitUntil:'domcontentloaded'});
  else{await p.goto(redmondBase+'#/search',{waitUntil:'domcontentloaded'});await idle();await p.locator('#SearchKeyword').fill(t.number);await p.locator('#button-Search').click();await p.getByRole('link',{name:t.number,exact:true}).click();}
  step='verify the permit number';await p.waitForFunction(n=>document.querySelector('#focusText')?.textContent?.includes(n),t.number);await idle();step='open the inspections tab';await p.locator('#button-TabButton-Inspections').click();await idle();step='load the inspection tables';await p.locator('#selfServiceTable-RemainingInspections').waitFor({state:'attached'});step='load the request tab';await p.locator('a').filter({hasText:/^\s*Request Inspections\s*$/}).first().waitFor();await p.waitForLoadState('networkidle');
  const history:Parameters<typeof normalizeEnergov>[1]=[],available:Offer[]=[],choices:Parameters<typeof normalizeEnergov>[0]=[];
  async function rows(id:string,tab:string){step='read '+tab.toLowerCase();
   const link=p.locator('a').filter({hasText:new RegExp('^\\s*'+tab+'\\s*$')}).first();if(!await link.count())return [];await link.waitFor();
   await link.click();await idle();await p.waitForLoadState('networkidle');const table=p.locator('#'+id);await table.waitFor();
   const panel=table.locator('..'),size=panel.locator('select[id="pageSizeList"]');if(await size.isVisible()){await size.selectOption('100');await idle();await p.waitForLoadState('networkidle');}
   await p.waitForFunction(id=>{const table=document.getElementById(id);if(!table)return false;const panel=table.parentElement!;const count=panel.querySelector('[id="startAndEndCount"]')?.textContent?.match(/(\d+)\s*-\s*(\d+)\s+of\s+(\d+)/);const n=table.querySelectorAll('tbody tr').length;return count?Number(count[1])===1&&n===Number(count[2])&&Number(count[2])===Math.min(100,Number(count[3])):n===0&&Array.from(panel.querySelectorAll('h6')).some(e=>e.textContent?.includes('No records')&&(e as HTMLElement).offsetParent!==null);},id);
   const rows=await table.locator('tbody tr').evaluateAll(es=>es.map(e=>({cells:Array.from(e.querySelectorAll('td')).map(c=>c.textContent?.trim()||''),url:e.querySelector<HTMLAnchorElement>('a[href*="inspectionDetail"]')?.href||'',requestable:!!e.querySelector('input[type=checkbox]:not(:disabled)')})));
   const counter=panel.locator('[id="startAndEndCount"]');const count=await counter.count()?await counter.textContent():null;const total=count?.match(/of\s+(\d+)/)?.[1];if(total&&Number(total)!==rows.length)throw Error('Redmond returned an incomplete checklist.');return rows;
  }
  for(const r of await rows('selfServiceTable-ExistingInspections','Existing Inspections'))if(r.cells.length>=5)history.push({id:r.url||r.cells[0],name:r.cells[1],status:r.cells[2],date:r.cells[4]||r.cells[3],time:'',inspector:r.cells[5]||'',notes:'',url:r.url});
  let selectedTable='',selectedIndex=-1;
  for(const [id,tab] of [['selfServiceTable-RemainingInspections','Request Inspections'],['selfServiceTable-OptionalInspections','Optional Inspections']]){
   const items=await rows(id,tab);for(const [index,r] of items.entries()){
    choices.push({name:r.cells[0],reinspection:r.cells[1]==='Yes',requestable:r.requestable});if(r.requestable){available.push(offer(r.cells[0],r.cells[0],[]));if(r.cells[0]===name){selectedTable=id;selectedIndex=index;}}
   }
  }
  const inspections=normalizeEnergov(choices,history);if(!inspections.length){throw Error('Redmond returned no inspections.');}
  if(selectedTable&&selectedIndex>=0){step='open the request form';await p.locator('a').filter({hasText:selectedTable.includes('Remaining')?/^\s*Request Inspections\s*$/:/^\s*Optional Inspections\s*$/}).first().click();await idle();const table=p.locator('#'+selectedTable);await table.locator('tbody tr').nth(selectedIndex).locator('input[type=checkbox]').check();await p.locator(selectedTable.includes('Remaining')?'#button-SubmitRemainingInspections':'#button-SubmitOptionalInspections').click();await p.locator('#FieldContactName').waitFor();await p.locator('#RequestDate').waitFor();
   if(!(await p.locator('body').innerText()).includes('#'+t.number))throw Error('Redmond selected a different permit.');
   const calendar=p.locator('table[role=grid]').first();await calendar.waitFor({state:'attached'});
   const dates=await calendar.evaluate(e=>{const title=document.getElementById(e.getAttribute('aria-labelledby')||'')?.textContent?.trim()||'';const base=new Date('1 '+title+' 12:00:00 GMT');if(!Number.isFinite(base.getTime()))return [];const prefix=base.getUTCFullYear()+'-'+String(base.getUTCMonth()+1).padStart(2,'0')+'-';return Array.from(e.querySelectorAll('td[role=gridcell]')).filter(c=>c.getAttribute('aria-disabled')==='false'&&!c.querySelector('.text-muted')&&c.querySelector('button:not(:disabled)')).map(c=>prefix+c.textContent!.trim().padStart(2,'0'));});
   if(!dates.length)throw Error('Redmond has no available dates in the displayed month.');available.find(r=>r.Description===name)!.InspectionDates=dates;
  }
  return snapshot(inspections,available);
 }
 return {read,async send(action:Prepared){
  const p=page;if(!p||currentTarget?.number!==action.target.number||currentTarget.city!==action.target.city||currentInspection!==action.intent.description)throw Error('Scheduling session is missing.');
  await submitPortalForm(p,action);
 },async close(){await browser?.close();}};
}

// Only execute() may call this in production, after the durable single-submit claim.
export async function submitPortalForm(p:Page,action:Prepared){
  const i=action.intent;if(i.kind!=='schedule')throw Error('Cancellation is only supported for MBP.');
  if(action.target.city==='Medina'){
   if(await p.locator('select[name="Case.Id"]').inputValue()!==action.target.sourceId||await p.locator('#Id').inputValue()!==action.body.inspectionId)throw Error('The selected inspection changed.');
   await p.locator('input[name="CurrentInspectionOccurrence.RequestedFor"]').fill(us(i.date));await p.locator('input[name="CurrentInspectionOccurrence.RequestedFor"]').press('Tab');
   await p.locator('select[name="CurrentInspectionOccurrence.RequestedForTimeSlot"]').selectOption(i.timeSlot||'');
   await p.locator('#Comments').fill(`${i.name} | ${i.phone} | ${i.email}\n${i.message||''}`);
   // The only mutation; called solely after the durable confirmation claim.
   await Promise.all([p.waitForNavigation({waitUntil:'domcontentloaded'}),p.locator('#SendRequest').click()]);return;
  }
  if(action.target.city==='Clyde Hill'){
   const modal=p.locator('.modal.show');const raw=await modal.locator('input').first().inputValue();if(new Date(raw+' 12:00:00 GMT').toISOString().slice(0,10)!==i.date)throw Error('Clyde Hill availability changed.');await modal.locator('button').filter({hasText:/CONTINUE/}).click();await p.locator('input[name="eventItem.InspectionContact"]').waitFor();const text=await modal.innerText();if(!text.includes(action.target.number)||!text.includes(String(action.body.inspectionId)))throw Error('Clyde Hill selected a different inspection.');await p.locator('input[name="eventItem.InspectionContact"]').fill(i.name!);await p.locator('input[name="eventItem.InspectionPhone"]').fill(i.phone!);await p.locator('textarea[name="eventItem.EventComment"]').fill(i.email+' '+(i.message||''));await modal.locator('button').filter({hasText:/^SCHEDULE INSPECTION\s*$/}).click();await p.locator('input[name="eventItem.InspectionContact"]').waitFor({state:'hidden'});return;
  }
  if(action.target.city==='Redmond'){
   await p.locator('#FieldContactName').fill(i.name!);await p.locator('#FieldContactPhone').fill(i.phone!);await p.locator('#RequestDate').fill(us(i.date));await p.locator('#RequestDate').press('Tab');await p.locator('#Comments').fill(i.email+' '+(i.message||''));await Promise.all([p.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).hostname==='cityofredmondwa-energovweb.tylerhost.net'),p.locator('#button-Submit').click()]);await p.waitForLoadState('networkidle');return;
  }
  throw Error('Unsupported scheduling source.');

}
