import {chromium} from 'playwright';
import {medinaPermitUrl,normalizeSmartGov} from '../lib/smartgov.ts';
import type {PermitData} from '../lib/inspections.ts';

export async function loadMedinaPermit(number:string,sourceId:string):Promise<PermitData> {
 const sourceUrl=medinaPermitUrl(sourceId);
 const username=process.env.MEDINA_USERNAME?.trim(),password=process.env.MEDINA_PASSWORD?.trim();
 if(!username||!password)throw new Error('Medina refresh requires MEDINA_USERNAME and MEDINA_PASSWORD GitHub Actions secrets.');
 const browser=await chromium.launch();
 try {
  const page=await browser.newPage();page.setDefaultTimeout(45000);
  await page.goto(sourceUrl,{waitUntil:'domcontentloaded'});
  if(new URL(page.url()).pathname.toLowerCase().includes('/account/login')) {
   await page.locator('#Email').fill(username);
   await page.locator('#Password').fill(password);
   await page.getByRole('button',{name:/log in/i}).click();
  }
  const record=page.locator('[aria-label="Record number"] > span');
  await record.waitFor();
  if((await record.innerText()).trim().toUpperCase()!==number.toUpperCase())throw new Error('The Medina link does not match the requested permit number.');
  for(const id of ['section_ProjectSection','section_InspectionsSection']) {
   const button=page.locator('#'+id);
   if(await button.getAttribute('aria-expanded')!=='true')await button.click();
  }
  await page.locator('#ProjectName').waitFor();
  const project=await page.locator('#ProjectName').inputValue();
  const address=await page.locator('#section_ProjectSection_panel table').first().locator('tr').evaluateAll(rows=>rows.slice(1,3).map(r=>r.querySelector('td')?.textContent?.trim()).filter(Boolean).join(', '));
  const table=page.locator('#section_InspectionsSection_panel table');await table.waitFor();
  const rows=await table.locator('tbody > tr').evaluateAll(elements=>elements.map(el=>{
   const cells=Array.from(el.querySelectorAll(':scope > td'));
   return {name:cells[0]?.querySelector('strong')?.textContent?.trim()||'',date:cells[1]?.textContent?.trim()||'',status:cells[2]?.textContent?.trim()||'',canRequest:!!cells[3]?.textContent?.match(/request inspection/i),resultUrl:cells[2]?.querySelector<HTMLAnchorElement>('a[title="Results"]')?.href||''};
  }));
  const inspections=normalizeSmartGov(rows);
  const required=Number((await page.locator('#section_InspectionsSection_info').innerText()).match(/(\d+) required inspections/i)?.[1]||0);
  if(!inspections.length||inspections.length<required)throw new Error('Medina returned an incomplete inspection checklist.');
  return {city:'Medina',number,project,address,sourceUrl,fetchedAt:new Date().toISOString(),inspections};
 } catch(error) {
  // Do not let browser diagnostics expose filled login fields or session information.
  if(error instanceof Error&&/^(The Medina link|Medina returned|Medina inspection)/.test(error.message))throw error;
  throw new Error('Medina SmartGov could not load the permit. Check the saved credentials, account access, and source availability.');
 } finally {await browser.close();}
}
