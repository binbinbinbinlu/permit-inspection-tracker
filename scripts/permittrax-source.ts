import {chromium} from 'playwright';
import {clydeHillUrl,normalizePermitTrax,type PermitTraxRow} from '../lib/permittrax.ts';
import {day,type PermitData} from '../lib/inspections.ts';

// PermitTrax uses server-rendered Blazor interactions rather than a public JSON feed.
// This reader runs only in the refresh job and never clicks scheduling controls.
export async function loadClydeHillPermit(number:string):Promise<PermitData> {
 if(!/^BLD\d{4}-\d{4}$/i.test(number)) throw new Error('Enter a Clyde Hill building permit such as BLD2025-0125.');
 const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage();
  page.setDefaultTimeout(60000);
  // Consent can arrive after navigation, including while the search form is opening.
  await page.addLocatorHandler(page.getByRole('button',{name:/^decline$/i}),async button=>{await button.click();});
  await page.goto(clydeHillUrl,{waitUntil:'domcontentloaded'});
  await page.locator('button').filter({hasText:'CLICK TO SEARCH'}).waitFor();
  // First-time visitors may have a consent dialog hiding the page from accessibility.
  const decline=page.getByRole('button',{name:'Decline',exact:true});
  if(await decline.isVisible()) await decline.click();
  await page.getByRole('button',{name:/click to search/i}).click();
  await page.locator('input[name="citizenSearch.search_text"]').fill(number);
  await page.locator('button').filter({hasText:/^\s*SEARCH\s*$/i}).click();
  const match=page.getByRole('link',{name:number,exact:true});
  await match.waitFor();
  const cells=await match.locator('xpath=ancestor::tr').locator('td').allTextContents();
  if(cells.length<4||cells[0].trim()!==number) throw new Error('PermitTrax returned an unexpected search result.');
  const project=cells[2].trim(),address=cells[3].trim();
  await match.click();
  const table=page.locator('table').filter({has:page.locator('th[title="Insp ID"]')});
  await table.waitFor();
  const rows=await table.locator('tbody tr').evaluateAll(elements=>elements.map(el=>{
   const cells=Array.from(el.querySelectorAll('td'));
   return {status:cells[0]?.textContent?.trim()||'',schedule:cells[2]?.textContent?.trim()||'',
    id:cells[3]?.textContent?.trim()||'',name:cells[4]?.textContent?.trim()||'',
    canSchedule:!!cells[2]?.querySelector('.bi-calendar3'),hasComments:!!cells[1]?.querySelector('a')};
  }));
  if(!rows.length) throw new Error('PermitTrax returned no inspection checklist.');
  const inspections:PermitTraxRow[]=[];
  for(let index=0;index<rows.length;index++) {
   const row=rows[index];
   const history:PermitTraxRow['history']=[];
   if(row.hasComments) {
    await table.locator('tbody tr').nth(index).locator('td').nth(1).getByRole('link').click();
    const modal=page.locator('.modal.show').filter({hasText:'COMMENTS FOR INSPECTIONS:'});
    await modal.waitFor();
    const heading=await modal.locator('.modal-body').innerText();
    if(!heading.includes(row.id)) throw new Error('PermitTrax opened the wrong inspection history.');
    const attempts=await modal.locator('.modal-body > .row').evaluateAll(elements=>elements.map(el=>Array.from(el.children).map(c=>c.textContent?.trim()||'')));
    if(!attempts.length) throw new Error('PermitTrax inspection history is missing.');
    for(const [date,status,notes] of attempts) {
     if(!day(date)||!status) throw new Error('PermitTrax inspection history format changed.');
     history.push({Description:row.name,Date:date,Status:status,Notes:notes==='-- NO COMMENT --'?'':notes});
    }
    await modal.getByRole('button',{name:'Close',exact:true}).first().click();
    await modal.waitFor({state:'hidden'});
   }
   inspections.push({...row,history});
  }
  return {city:'Clyde Hill',number,project,address,sourceUrl:clydeHillUrl,fetchedAt:new Date().toISOString(),inspections:normalizePermitTrax(inspections)};
 } finally {await browser.close();}
}
