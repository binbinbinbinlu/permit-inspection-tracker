// Every non-local request is intercepted. These tests cannot reach any permit portal.
import {createServer} from 'vite';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
process.env.NEXT_PUBLIC_ACTIONS_URL='https://mock-backend.invalid';
const server=await createServer({configFile:'vite.pages.config.ts',server:{host:'127.0.0.1',port:4198,strictPort:true}});await server.listen();
const browser=await chromium.launch();
try{
 for(const outcome of ['succeeded','failed','unknown']){
  const context=await browser.newContext();const page=await context.newPage();let submits=0;let operation;let scheduled=[];let checks=0;
  const inspections=[{id:'footing',name:'Footing',category:'Building',status:'available',sourceStatus:'Available to request',date:'',dates:['2026-10-01'],restricted:false,restriction:'',history:[]},{id:'final',name:'Final',category:'Building',status:'passed',sourceStatus:'Passed',date:'2026-09-01',dates:[],restricted:true,restriction:'Approved',history:[]}];
  inspections.push(...Array.from({length:40},(_,i)=>({...inspections[1],id:'passed-'+i,name:'Completed inspection '+i})));
  const permit={city:'Bellevue',number:'26 112569 BR',address:'Mock address',project:'Mock project',fetchedAt:new Date().toISOString(),sourceUrl:'https://example.invalid',inspections};
  await context.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());
   const json=data=>route.fulfill({json:data,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'}});
   if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS'}});
   if(u.pathname==='/data/permits.json')return json({permits:[permit]});
   if(u.hostname==='mock-backend.invalid'){
    if(u.pathname==='/live')return json({available:[{Description:'Footing',InspectionDates:['2026-10-01'],InspectionRestricted:false}],scheduled,history:[],inspections,fetchedAt:permit.fetchedAt,writesEnabled:true});
    if(u.pathname==='/review'){operation={id:'mock-operation',state:'review',intent:req.postDataJSON().intent,label:'Mock inspection request',message:'Review details. Nothing has been submitted.'};return json(operation);}
    if(u.pathname==='/confirm'){submits++;operation.state=outcome;operation.message=outcome==='succeeded'?(operation.intent.kind==='cancel'?'Cancelled — confirmed in MBP.':'Scheduled — confirmed in MBP.'):outcome==='failed'?'Date unavailable. Nothing was submitted.':'Result not confirmed. Do not repeat the request.';if(outcome==='succeeded')scheduled=operation.intent.kind==='cancel'?[]:[{UniqueId:'mock-booking',Description:'Footing',InspectionDate:'2026-10-01',InspectionCancellable:true}];return json(operation);}
    if(u.pathname.startsWith('/operations/')){checks++;return json(operation);}
   }
   if(u.hostname==='127.0.0.1')return route.continue();
   throw Error('Unexpected external request blocked: '+u.hostname);
  });
  await page.goto('http://127.0.0.1:4198');await page.getByLabel('Private management key').fill('mock-only-key');await page.getByRole('button',{name:'Unlock management'}).click();
  const rows=page.locator('.management-row');assert.equal(await rows.filter({hasText:'Final'}).getByRole('button',{name:'Schedule',exact:true}).isDisabled(),true);
  await rows.filter({hasText:'Footing'}).getByRole('button',{name:'Schedule',exact:true}).click();
  await page.waitForFunction(()=>{const panel=document.querySelector('.action-focus');if(!panel)return false;const box=panel.getBoundingClientRect();return document.activeElement===panel&&box.top>=0&&box.top<innerHeight;});
  assert.equal(submits,0);
  await page.getByLabel('Date',{exact:true}).selectOption('2026-10-01');await page.getByLabel('Site contact name').fill('Mock Contact');await page.getByLabel('Phone (10 digits)').fill('2065550100');await page.getByLabel('Email',{exact:true}).fill('mock@example.invalid');await page.getByRole('button',{name:'Review request — does not submit'}).click();
  const confirm=page.getByRole('button',{name:'Confirm scheduling'});await confirm.waitFor();assert.equal(submits,0);assert.equal(await confirm.isDisabled(),true);
  await page.getByRole('checkbox').check();await confirm.click();await page.getByText(operation.message,{exact:true}).waitFor();assert.equal(submits,1);
  if(outcome==='unknown'){await page.getByRole('button',{name:'Check result (does not resubmit)'}).click();assert.equal(submits,1);assert.equal(checks,1);assert.equal(await rows.filter({hasText:'Footing'}).getByRole('button',{name:'Schedule',exact:true}).isDisabled(),true);}
  if(outcome==='succeeded'){await page.getByRole('button',{name:'Done',exact:true}).click();await page.getByRole('button',{name:'Review cancellation'}).click();await page.waitForFunction(()=>{const p=document.querySelector('.action-focus');return p===document.activeElement&&p.getBoundingClientRect().top<innerHeight;});await page.getByRole('button',{name:'Review request — does not submit'}).click();await page.getByRole('button',{name:'Confirm cancellation'}).waitFor();assert.equal(submits,1);assert.equal(await page.getByRole('button',{name:'Confirm cancellation'}).isDisabled(),true);await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Confirm cancellation'}).click();await page.getByText('Cancelled — confirmed in MBP.',{exact:true}).waitFor();assert.equal(submits,2);}
  console.log('Mock UI verified:',outcome);await context.close();
 }
}finally{await browser.close();await server.close();}
