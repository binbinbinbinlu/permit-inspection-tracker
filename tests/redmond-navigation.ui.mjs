// All network requests are fulfilled locally. No portal, login, or booking is contacted.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {openRedmondSignIn,openRedmondDetails,withRedmondAttempts} from '../scripts/redmond-recovery.ts';
import {redmondHome,resolveRedmondPermitUrl} from '../lib/energov.ts';
const browser=await chromium.launch();
const number='CGP-2025-07539';
const url=await resolveRedmondPermitUrl(number,async()=>null);
const email='<label>Email address<input></label>';
const greeting='<a id="link-Greetings">Signed in</a>';
const details=()=>`${greeting}<h1 id="focusText">Permit ${number}</h1><div id="label-PermitDetail-ProjectName">Project: Mock project</div>`;
let verified=0;
async function scenario(name,html,check){
 const context=await browser.newContext({serviceWorkers:'block'});const page=await context.newPage();
 page.setDefaultTimeout(1200);page.setDefaultNavigationTimeout(3000);
 const steps=[],delays=[];let visits=0;
 await context.route('**/*',route=>route.fulfill({contentType:'text/html',body:html(++visits)}));
 const step=async(name,operation)=>{steps.push(name);return operation();};
 const sleep=async ms=>{delays.push(ms);};
 try{await check({page,step,sleep,steps,delays,visits:()=>visits});verified++;console.log('Mock Redmond verified:',name);}
 finally{await context.close();}
}
try{
 for(const modal of [true,false])await scenario(`login ${modal?'with':'without'} confirmation`,()=>`<a id="link-LoginUnderGreetings" href="#" onclick='document.body.innerHTML=${JSON.stringify(modal?`<button id="modalOkBtn" onclick='document.body.innerHTML=${JSON.stringify(email)}'>OK</button>`:email).replaceAll("'",'&#39;')};return false'>Login</a>`,async({page,step,sleep,steps,delays})=>{
  assert.equal(await openRedmondSignIn(page,step,sleep),'email');assert.equal(steps.includes('sign-in confirmation'),modal);assert.deepEqual(delays,[]);
 });
 await scenario('already signed in',()=>greeting,async({page,step,sleep,steps})=>{
  assert.equal(await openRedmondSignIn(page,step,sleep),'signed-in');assert.ok(!steps.includes('login link'));
 });
 await scenario('confirmation appears after login starts',()=>`<a id="link-LoginUnderGreetings" href="#" onclick='this.remove();setTimeout(()=>{document.body.innerHTML=${JSON.stringify(`<button id="modalOkBtn" onclick='document.body.innerHTML=${JSON.stringify(email)}'>OK</button>`).replaceAll("'",'&#39;')}},150);return false'>Login</a>`,async({page,step,sleep,steps})=>{
  assert.equal(await openRedmondSignIn(page,step,sleep),'email');assert.ok(steps.includes('sign-in confirmation'));
 });
 await scenario('missing login link recovers after one reload',visit=>visit===1?'<p>Loading</p>':email,async({page,step,sleep,steps,delays,visits})=>{
  assert.equal(await openRedmondSignIn(page,step,sleep),'email');assert.deepEqual(delays,[2000]);assert.ok(steps.includes('home reload'));assert.equal(visits(),2);
 });
 await scenario('missing confirmation fails within retry bound',()=>'<a id="link-LoginUnderGreetings" href="#" onclick="this.remove();return false">Login</a>',async({page,step,sleep,delays,visits})=>{
  await assert.rejects(openRedmondSignIn(page,step,sleep),{name:'TimeoutError'});assert.deepEqual(delays,[2000]);assert.equal(visits(),2);
 });
 for(const missing of ['identity','overlay','project'])await scenario(`details ${missing} timeout recovers in same tab`,visit=>visit===1?(missing==='identity'?greeting:missing==='overlay'?details()+'<div id="overlay">Busy</div>':greeting+`<h1 id="focusText">${number}</h1>`):details(),async({page,step,sleep,delays,steps,visits})=>{
  await page.addInitScript(()=>{sessionStorage.setItem('session-test',sessionStorage.getItem('session-test')||'preserved');});
  assert.equal(await openRedmondDetails(page,url,number,step,sleep),'Mock project');assert.deepEqual(delays,[2000]);assert.ok(steps.includes('details reload'));assert.equal(visits(),2);assert.equal(await page.evaluate(()=>sessionStorage.getItem('session-test')),'preserved');
 });
 await scenario('persistent details failure stops after one reload',()=>greeting,async({page,step,sleep,visits,delays})=>{
  await assert.rejects(openRedmondDetails(page,url,number,step,sleep),{name:'TimeoutError'});assert.equal(visits(),2);assert.deepEqual(delays,[2000]);
 });
 await scenario('navigation timeout on previous route reopens requested permit',()=>details(),async({page,step,sleep,delays})=>{
  await page.goto(redmondHome);const goto=page.goto.bind(page);let calls=0;
  page.goto=async(...args)=>{if(++calls===1)throw Object.assign(Error('Mock timeout'),{name:'TimeoutError'});return goto(...args);};
  assert.equal(await openRedmondDetails(page,url,number,step,sleep),'Mock project');assert.equal(page.url(),url);assert.equal(calls,2);assert.deepEqual(delays,[2000]);
 });
 await scenario('expired session requests fresh login instead of reloading details',()=>'<a id="link-LoginUnderGreetings">Login</a>',async({page,step,sleep,delays})=>{
  await assert.rejects(openRedmondDetails(page,url,number,step,sleep),{kind:'session-expired'});assert.deepEqual(delays,[]);
 });
 await scenario('wrong permit never becomes a valid snapshot',()=>details().replace(number,'CGP-2025-07530'),async({page,step,sleep,delays})=>{
  await assert.rejects(openRedmondDetails(page,url,number,step,sleep),{kind:'permit-mismatch'});assert.deepEqual(delays,[]);
 });
 await scenario('timeout then portal dialog retries in a fresh session',visit=>visit===1?greeting:visit===2?details()+'<div id="globalMessageDialog">SECRET private source message</div>':details(),async({page,steps,delays,sleep})=>{
  const logs=[];let attempts=0;
  const result=await withRedmondAttempts(number,async step=>{
   attempts++;
   // The real reader creates a fresh browser per attempt; use a fresh page here,
   // retaining the mocked context route so every request stays intercepted.
   const attemptPage=attempts===1?page:await page.context().newPage();
   attemptPage.setDefaultTimeout(1200);
   try{return await openRedmondDetails(attemptPage,url,number,async(name,op)=>{steps.push(name);return step(name,op);},sleep);}
   finally{if(attemptPage!==page)await attemptPage.close();}
  },{sleep,log:line=>logs.push(line),now:Date.now});
  assert.equal(result,'Mock project');assert.equal(attempts,2);assert.deepEqual(delays,[2000,5000]);
  assert.ok(logs.some(line=>JSON.parse(line).result==='source-dialog'));assert.doesNotMatch(logs.join('\n'),/SECRET|private source message/);
 });
 await scenario('hidden dialog template does not reject healthy details',()=>details()+'<div id="globalMessageDialog" style="display:none">Hidden</div>',async({page,step,sleep,delays})=>{
  assert.equal(await openRedmondDetails(page,url,number,step,sleep),'Mock project');assert.deepEqual(delays,[]);
 });
 await scenario('duplicate dialog templates still report a visible source error',()=>details()+'<div id="globalMessageDialog" style="display:none">Hidden</div><div id="globalMessageDialog">SECRET</div>',async({page,step,sleep,delays})=>{
  await assert.rejects(openRedmondDetails(page,url,number,step,sleep),{kind:'source-dialog'});assert.deepEqual(delays,[]);
 });
 console.log(`Verified ${verified} Redmond navigation scenarios.`);
}finally{await browser.close();}
