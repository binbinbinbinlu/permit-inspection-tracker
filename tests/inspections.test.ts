import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeInspections,day} from '../lib/inspections.ts';
test('Bellevue completed result wins over same-day stale scheduled record',()=>{
 const result=mergeInspections([{Description:'514 Plumbing'}],[{Description:'514 Plumbing',InspectionDate:'2026-09-09T00:00:00'}],[{Description:'514 Plumbing',Date:'9/9/2026',Status:'Approved'}]);
 assert.equal(result.length,1);assert.equal(result[0].status,'passed');
});
test('Kirkland tooltip matches numbered catalog and versioned history',()=>{
 const result=mergeInspections([{Description:'1330 - Sewer Side',Tooltip:'PW - Sewer Side'}],[],[{Description:'PW - Sewer Side v1',Date:'7/15/2026',Status:'<FONT COLOR="#FF0000">Partial</FONT>'}]);
 assert.equal(result.length,1);assert.equal(result[0].status,'pending');assert.equal(result[0].sourceStatus,'Partial');
});
test('later corrections supersede an older pass; duplicate records are removed',()=>{
 const correction={Description:'Footing',Date:'9/8/2026',Status:'Corrections Issued'};
 const [row]=mergeInspections([],[],[{Description:'Footing',Date:'8/6/2026',Status:'Approved'},correction,correction]);
 assert.equal(row.status,'pending');assert.equal(row.history.length,2);
});
test('future reinspection supersedes pass and selects earliest upcoming appointment',()=>{
 const [row]=mergeInspections([], [{Description:'Roof',InspectionDate:'2026-09-12T00:00:00'},{Description:'Roof',InspectionDate:'2026-09-10T00:00:00'}],[{Description:'Roof',Date:'9/3/2026',Status:'Approved'}]);
 assert.equal(row.status,'pending');assert.equal(row.date,'2026-09-10');
});
test('unexplained restriction is never a pass',()=>{
 const [row]=mergeInspections([{Description:'Final',InspectionRestricted:true,RestrictionMessage:'Contact jurisdiction'}],[],[]);assert.equal(row.status,'pending');
});
test('history-only completed inspections remain included',()=>{
 const [row]=mergeInspections([],[],[{Description:'PW - Pre-con v1',Date:'3/4/2026',Status:'Passed'}]);assert.equal(row.status,'passed');assert.equal(row.name,'PW - Pre-con');
});
test('unvisited catalog item is available, not passed',()=>assert.equal(mergeInspections([{Description:'Framing'}],[],[])[0].status,'available'));
test('date-only parsing preserves source day',()=>{assert.equal(day('2026-09-10T00:00:00'),'2026-09-10');assert.equal(day('3/4/2026'),'2026-03-04');});
