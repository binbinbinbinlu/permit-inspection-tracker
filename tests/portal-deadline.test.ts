import test from 'node:test';
import assert from 'node:assert/strict';
import {withDeadline,PortalReadTimeout,finishPortalSession} from '../backend/deadline.ts';

test('stalled portal read returns a safe timeout rather than waiting indefinitely',async()=>{
 await assert.rejects(withDeadline(new Promise(()=>{}),10,new PortalReadTimeout()),/No inspection was submitted/);
});
test('completed reads retain their results and source errors',async()=>{
 assert.equal(await withDeadline(Promise.resolve('available'),100,new PortalReadTimeout()),'available');
 await assert.rejects(withDeadline(Promise.reject(Error('Source unavailable')),100,new PortalReadTimeout()),/Source unavailable/);
});
test('response is not blocked by browser cleanup and cleanup is still scheduled',async()=>{
 let cleanup:Promise<unknown>|undefined;let closeStarted=false;let release!:()=>void;
 const closed=new Promise<void>(resolve=>{release=resolve;});
 await finishPortalSession(async()=>{closeStarted=true;await closed;},{waitUntil(work){cleanup=work;}});
 assert.equal(closeStarted,true);assert.ok(cleanup);release();await cleanup;
});
test('hung or rejected browser cleanup is bounded without losing the response',async()=>{
 await finishPortalSession(async()=>{throw Error('Browser disconnected');});
 await finishPortalSession(()=>new Promise(()=>{}),undefined,10);
});
