import test from 'node:test';
import assert from 'node:assert/strict';
import {withRedmondAttempts,RedmondReadError} from '../scripts/redmond-recovery.ts';

const timeout=()=>Object.assign(Error('https://identity.invalid/?token=SECRET private@example.invalid password'),{name:'TimeoutError'});
function runtime(){
 const logs:string[]=[],delays:number[]=[];let time=0;
 return {logs,delays,log:(line:string)=>logs.push(line),sleep:async(ms:number)=>{delays.push(ms);},now:()=>time+=10};
}
test('Redmond waits before a second session and retains safe first-attempt diagnostics',async()=>{
 const r=runtime();let calls=0;
 assert.equal(await withRedmondAttempts('CGP-2025-07539',step=>step('permit identity',async()=>{if(++calls===1)throw timeout();return 'fresh';}),r),'fresh');
 assert.equal(calls,2);assert.deepEqual(r.delays,[5000]);
 const events=r.logs.map(line=>JSON.parse(line));
 assert.ok(events.some(e=>e.attempt===1&&e.step==='permit identity'&&e.result==='timeout'&&e.elapsedMs>0));
 assert.ok(events.some(e=>e.attempt===2&&e.result==='ok'));
 assert.doesNotMatch(r.logs.join('\n'),/SECRET|identity.invalid|private@|password/);
});
test('exhausted Redmond retries include both failures without raw error messages',async()=>{
 const r=runtime();let calls=0;
 await assert.rejects(withRedmondAttempts('BLDG-2025-07156',step=>step(++calls===1?'login link':'permit identity',async()=>{throw timeout();}),r),error=>{
  assert.match(String(error),/attempt 1: login link \(timeout/);assert.match(String(error),/attempt 2: permit identity \(timeout/);
  assert.doesNotMatch(String(error),/SECRET|identity.invalid|private@/);return true;
 });
 assert.equal(calls,2);assert.deepEqual(r.delays,[5000]);
});
test('session expiry gets one new session; malformed data and mismatches fail without retry',async()=>{
 for(const kind of ['session-expired','permit-mismatch','failed'] as const){
  const r=runtime();let calls=0;
  await assert.rejects(withRedmondAttempts('CGP-2025-07539',step=>step('permit identity',async()=>{calls++;throw new RedmondReadError(kind);}),r));
  assert.equal(calls,kind==='session-expired'?2:1);
 }
});
test('untrusted error names and invalid permit strings do not enter diagnostics',async()=>{
 const r=runtime();
 await assert.rejects(withRedmondAttempts('SECRET@example.invalid',step=>step('browser startup',async()=>{throw Object.assign(Error('SECRET'),{name:'SECRET'});}),r),error=>{assert.doesNotMatch(String(error),/SECRET/);return true;});
 assert.doesNotMatch(r.logs.join('\n'),/SECRET/);
});
