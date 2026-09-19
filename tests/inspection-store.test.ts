import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {store} from '../backend/worker.ts';
import type {Operation} from '../backend/actions.ts';
test('durable SQL reservation prevents replay and another operation taking an unresolved permit',async()=>{
 const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../backend/schema.sql',import.meta.url),'utf8'));
 function statement(sql:string,args:(string|number)[]=[]){return {bind(...next:(string|number)[]){return statement(sql,next);},async first(){return db.prepare(sql).get(...args)||null;},async run(){const result=db.prepare(sql).run(...args);return {meta:{changes:Number(result.changes)}};}};}
 const adapter={prepare:statement,async batch(items:ReturnType<typeof statement>[]){db.exec('BEGIN');try{const results=[];for(const item of items)results.push(await item.run());db.exec('COMMIT');return results;}catch(e){db.exec('ROLLBACK');throw e;}}};
 const persistence=store(adapter as unknown as D1Database);
 const op={id:'one',state:'review',message:'',expires:Date.now()+60000,action:{target:{city:'Bellevue',number:'TEST',jurisdiction:1},intent:{kind:'schedule',description:'Footing',date:'2026-10-01'},body:{},label:'Mock'}} as Operation;
 try{
  await persistence.put(op);await persistence.put({...op,id:'two'});
  assert.equal(await persistence.claim('one','permit'),true);
  assert.equal((await persistence.get('one'))?.state,'submitting');
  assert.equal(await persistence.claim('one','permit'),false);
  assert.equal(await persistence.claim('two','permit'),false);
  await persistence.release('permit','two');assert.equal(await persistence.claim('two','permit'),false);
  await persistence.release('permit','one');assert.equal(await persistence.claim('two','permit'),true);
  assert.equal(await persistence.claim('one','permit'),false);
 }finally{db.close();}
});
