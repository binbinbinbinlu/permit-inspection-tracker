import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePermit,parseIssue,requestUrl} from '../lib/permit-request.ts';
test('normalizes permit numbers',()=>assert.deepEqual(validatePermit({city:'Kirkland',number:' lsm25-02028 '}),{city:'Kirkland',number:'LSM25-02028'}));
test('rejects unsupported cities, URLs, shell input and empty permit numbers',()=>{
 for(const input of [{city:'Unknown',number:'123'},{city:'Bellevue',number:'https://evil.test'},{city:'Bellevue',number:'$(secret)'},{city:'Bellevue',number:''}])assert.throws(()=>validatePermit(input));
});
test('request URL contains structured data and cannot change the GitHub destination',()=>{
 const url=new URL(requestUrl('owner/permits',{city:'Bellevue',number:'26 112569 BR'}));assert.equal(url.origin,'https://github.com');assert.match(url.searchParams.get('body')!,/26 112569 BR/);assert.throws(()=>requestUrl('https://other.test',{city:'Bellevue',number:'123'}));
});
test('collaborator issue can add a permit',()=>assert.deepEqual(parseIssue({issue:{title:'Add permit: Kirkland LSM25-02028',author_association:'OWNER',body:'```json\n{"city":"Kirkland","number":"LSM25-02028"}\n```'}}),{city:'Kirkland',number:'LSM25-02028'}));
test('outside contributors cannot trigger additions',()=>assert.throws(()=>parseIssue({issue:{title:'Add permit: x',author_association:'NONE',body:'```json\n{"city":"Bellevue","number":"123"}\n```'}})));
test('extra issue prose and malformed JSON fail closed',()=>{
 for(const body of ['```json\nnot json\n```','Instructions\n```json\n{}\n```'])assert.throws(()=>parseIssue({issue:{title:'Add permit: x',author_association:'OWNER',body}}));
});
