import type {Page} from 'playwright';
import {redmondHome} from '../lib/energov.ts';

type Step = 'browser startup' | 'home navigation' | 'home reload' | 'sign-in readiness' |
 'login link' | 'sign-in confirmation' | 'email entry' | 'email next' |
 'password selection' | 'password entry' | 'password verify' | 'sign-in return' |
 'signed-in readiness' | 'permit search' | 'permit search entry' | 'permit search result' |
 'details navigation' | 'details reload' | 'permit identity' | 'details overlay' | 'details source dialog' |
 'project field' | 'permit location' | 'inspection checklist' | 'inspection history' | 'normalization';
type Kind = 'timeout' | 'session-expired' | 'source-dialog' | 'selector-ambiguity' | 'permit-mismatch' | 'failed';
export class RedmondReadError extends Error {
 readonly kind:Kind;
 constructor(kind:Kind){super(`Redmond read ${kind}.`);this.kind=kind;}
}
const kindOf=(error:unknown):Kind=>error instanceof RedmondReadError?error.kind:error instanceof Error&&error.name==='TimeoutError'?'timeout':error instanceof Error&&error.message.includes('strict mode violation')?'selector-ambiguity':'failed';
export const pause=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
type Runtime={sleep:(ms:number)=>Promise<void>;log:(message:string)=>void;now:()=>number};
const defaults:Runtime={sleep:pause,log:message=>console.log(message),now:Date.now};
export type ReadStep=<T>(step:Step,operation:()=>Promise<T>)=>Promise<T>;

// Only the scheduled read adapter uses this helper. Never wrap a booking/cancellation.
// Messages are constructed from fixed labels: no upstream message, URL, DOM, or error stack.
export async function withRedmondAttempts<T>(number:string,read:(step:ReadStep)=>Promise<T>,runtime:Runtime=defaults):Promise<T>{
 const permit=/^[A-Z]+-\d{4}-\d{5}$/.test(number)?number:'invalid-permit';
 const failures:string[]=[];
 for(let attempt=1;attempt<=2;attempt++){
  const started=runtime.now();let current:Step='browser startup';
  const step:ReadStep=async(name,operation)=>{
   current=name;const start=runtime.now();
   try{const result=await operation();runtime.log(JSON.stringify({source:'Redmond',permit,attempt,step:name,result:'ok',elapsedMs:runtime.now()-start}));return result;}
   catch(error){runtime.log(JSON.stringify({source:'Redmond',permit,attempt,step:name,result:kindOf(error),elapsedMs:runtime.now()-start}));throw error;}
  };
  try{const result=await read(step);runtime.log(JSON.stringify({source:'Redmond',permit,attempt,result:'ok',elapsedMs:runtime.now()-started}));return result;}
  catch(error){
   const kind=kindOf(error);failures.push(`attempt ${attempt}: ${current} (${kind}, ${runtime.now()-started}ms)`);
   if(attempt===2||!['timeout','session-expired','source-dialog'].includes(kind))throw Error(`Redmond could not refresh ${permit}; ${failures.join('; ')}. Check source availability and saved account access.`);
   runtime.log(JSON.stringify({source:'Redmond',permit,attempt,result:'retry',delayMs:5000}));
   await runtime.sleep(5000);
  }
 }
 throw Error('Redmond read attempts exhausted.');
}

// One read-only reload in the existing tab preserves Civic Access's tab-scoped session.
// A full fresh-browser retry is still bounded by withRedmondAttempts.
async function recoverNavigation<T>(read:(reload:boolean)=>Promise<T>,sleep:(ms:number)=>Promise<void>){
 try{return await read(false);}
 catch(error){if(kindOf(error)!=='timeout')throw error;await sleep(2000);return read(true);}
}

export async function openRedmondSignIn(page:Page,step:ReadStep,sleep=pause):Promise<'email'|'signed-in'>{
 return recoverNavigation(async reload=>{
  await step(reload?'home reload':'home navigation',()=>reload?page.reload({waitUntil:'domcontentloaded'}):page.goto(redmondHome,{waitUntil:'domcontentloaded'}));
  const email=page.getByRole('textbox',{name:'Email address',exact:true});
  const signedIn=page.locator('#link-Greetings:visible').first();
  const login=page.locator('#link-LoginUnderGreetings:visible').first();
  const confirmation=page.locator('#modalOkBtn:visible').last();
  let clickedLogin=false,clickedConfirmation=false;
  for(let transition=0;transition<3;transition++){
   // The portal may skip its confirmation modal or restore an existing session.
   let ready=email.or(signedIn);
   if(!clickedConfirmation)ready=ready.or(confirmation);
   if(!clickedLogin&&!clickedConfirmation)ready=ready.or(login);
   await step('sign-in readiness',()=>ready.first().waitFor());
   if(await email.isVisible())return 'email';
   if(await signedIn.isVisible())return 'signed-in';
   if(!clickedConfirmation&&await confirmation.isVisible()){
    await step('sign-in confirmation',()=>confirmation.click());clickedConfirmation=true;
   }else if(!clickedLogin&&!clickedConfirmation){
    await step('login link',()=>login.click());clickedLogin=true;
   }
  }
  throw new RedmondReadError('failed');
 },sleep);
}

export async function openRedmondDetails(page:Page,url:string,number:string,step:ReadStep,sleep=pause):Promise<string>{
 return recoverNavigation(async reload=>{
  // A navigation timeout may leave the tab on its previous route. In that case,
  // reopen the validated destination rather than repeatedly reloading the old page.
  await step(reload?'details reload':'details navigation',()=>reload&&page.url()===url?page.reload({waitUntil:'domcontentloaded'}):page.goto(url,{waitUntil:'domcontentloaded'}));
  await step('permit identity',async()=>{
   const focus=page.locator('#focusText:visible');
   const login=page.locator('#link-LoginUnderGreetings:visible').first();
   await focus.or(login).first().waitFor();
   if(await login.isVisible())throw new RedmondReadError('session-expired');
   // Match the whole permit token, not a substring of a different permit number.
   await page.waitForFunction(()=>Boolean(document.querySelector('#focusText')?.textContent?.match(/\b[A-Z]+-\d{4}-\d{5}\b/)));
   const tokens=(await focus.innerText()).match(/\b[A-Z]+-\d{4}-\d{5}\b/g)||[];
   if(tokens.length!==1||tokens[0]!==number)throw new RedmondReadError('permit-mismatch');
  });
  await step('details overlay',async()=>{
   await page.locator('#overlay').waitFor({state:'hidden'});
  });
  await step('details source dialog',()=>checkRedmondSourceDialog(page));
  return step('project field',async()=>(await page.locator('#label-PermitDetail-ProjectName').innerText()).replace(/^[^:]+:\s*/,'').trim());
 },sleep);
}

// A source message means this read is not trustworthy, even if the permit heading
// loaded. Do not dismiss it or expose its potentially private text in diagnostics.
// Restart once in a fresh browser; persistent messages still fail the entire sync.
export async function checkRedmondSourceDialog(page:Page):Promise<void>{
 if(await page.locator('#globalMessageDialog:visible').count())throw new RedmondReadError('source-dialog');
}
