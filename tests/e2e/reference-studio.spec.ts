import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {mkdir} from 'node:fs/promises';
import {login,navigate,switchLanguage} from './helpers';
import {translate as t} from '../../packages/i18n/src/business';

test('Counter staff inspect dimensioned drawings in three languages without changing stock',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await login(page,'sales');await switchLanguage(page,'en');await navigate(page,'catalog');
  await page.getByRole('button',{name:t('en','partStudio')}).click();
  const dialog=page.getByRole('dialog').last();
  const range=dialog.getByRole('slider');
  const canvas=dialog.locator('canvas');
  const picture=()=>canvas.evaluate((c: HTMLCanvasElement)=>c.toDataURL());
  const before=await picture();
  await dialog.getByRole('button',{name:t('en','viewTop')}).click();
  await expect(range).toHaveValue('90');
  await expect.poll(async()=>await picture()!==before).toBe(true);
  await range.focus();await range.press('ArrowDown');await expect(range).toHaveValue('89');
  for(const [lang,width] of [['fr',1024],['en',390],['ar',320]] as const){
    await page.setViewportSize({width,height:844});
    await switchLanguage(page,lang);
    await expect(range).toHaveValue('89');
    await expect(dialog.getByRole('combobox')).toHaveValue('07215');
    await expect(dialog.getByRole('link',{name:t(lang,'febiApplication')})).toBeVisible();
    await expect(dialog.locator('.drawing-sizes strong')).toHaveCount(3);
    expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
    const findings=await new AxeBuilder({page}).include('dialog[open]').withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
    expect(findings.violations.map(v=>v.id)).toEqual([]);
  }
  const thickness=dialog.locator('.drawing-sizes button').last();
  await thickness.click();await expect(thickness).toHaveAttribute('aria-pressed','true');await expect(range).toHaveValue('0');
  await dialog.getByRole('button',{name:t('ar','viewOblique')}).click();await expect(thickness).toHaveAttribute('aria-pressed','false');
  await mkdir('docs/evidence/assortment',{recursive:true});
  await dialog.screenshot({path:'docs/evidence/assortment/reference-studio-ar.png'});
  await dialog.getByRole('combobox').selectOption('11431740045');
  await expect(dialog.getByRole('link',{name:t('ar','bmwApplication')})).toBeVisible();
  await expect(range).toHaveValue('32');
  await dialog.getByRole('button',{name:t('ar','viewEdge')}).click();
  await expect(range).toHaveValue('0');
});
