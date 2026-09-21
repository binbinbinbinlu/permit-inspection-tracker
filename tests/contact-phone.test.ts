import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeContactPhone} from '../lib/contact-phone.ts';

test('contact phone accepts digits, pasted formatting and US country codes',()=>{
 for(const input of ['4252240399',' 4252240399 ','(425) 224-0399','425.224.0399','\u200B4252240399\u00A0','+1 (425) 224-0399','14252240399']){
  assert.equal(normalizeContactPhone(input),'4252240399');
 }
});

test('contact phone does not silently convert invalid input into a valid number',()=>{
 for(const input of ['','425224039','42522403999','4252240399 ext 2','abc4252240399','+44 4252240399']){
  assert.equal(/^[0-9]{10}$/.test(normalizeContactPhone(input)),false);
 }
});
