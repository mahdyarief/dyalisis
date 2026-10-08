import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
const evaluate = fn => page.evaluate(fn);
const check = (name, condition) => { assert.ok(condition, name); console.log('PASS', name); };
try {
  await page.goto(pathToFileURL(resolve('dist/index.html')).href);
  await page.waitForFunction(() => [...document.querySelectorAll('div')].some(e => e._cyreg?.cy?.nodes().length));
  await evaluate(() => { window.cyTest = [...document.querySelectorAll('div')].find(e => e._cyreg?.cy)._cyreg.cy; });
  await page.waitForFunction(() => cyTest.nodes().some(n => Math.abs(n.position().x) > 10));
  await page.getByTitle('Fit all', { exact: true }).click();
  for (const kind of ['leaf', 'compound', 'background']) {
    const start = await evaluate(() => { const cy = cyTest; cy.zoom(0.6); const n = cy.nodes().filter(n => !n.isParent())[0]; cy.center(n); return true; });
    const point = await page.evaluate(kind => {
      const cy = cyTest, rect = cy.container().getBoundingClientRect();
      const n = cy.nodes().filter(n => !n.isParent())[0], p = n.renderedPosition(), b = n.parent().renderedBoundingBox();
      const local = kind === 'leaf' ? p : kind === 'compound' ? {x:b.x1+5,y:b.y1+5} : {x:cy.width()-10,y:cy.height()/2};
      return {x:rect.left+local.x,y:rect.top+local.y,pan:{...cy.pan()},pos:{...n.position()}};
    }, kind);
    await page.mouse.move(point.x, point.y); await page.mouse.down(); await page.mouse.move(point.x+55, point.y+35,{steps:12}); await page.mouse.up();
    const after = await evaluate(() => ({pan:cyTest.pan(),pos:cyTest.nodes().filter(n=>!n.isParent())[0].position()}));
    check(kind+' drag pans without moving leaf', Math.abs(after.pan.x-point.pan.x)>20 && Math.abs(after.pos.x-point.pos.x)<0.01);
  }
  const snapshot = () => evaluate(() => ({zoom:cyTest.zoom(),pan:{...cyTest.pan()},positions:cyTest.nodes().map(n=>[n.id(),n.position().x,n.position().y])}));
  const before = await snapshot(); await page.locator('input').first().fill('order'); await page.locator('input').first().fill('');
  const afterSearch = await snapshot();
  console.log('search camera', before.zoom, afterSearch.zoom, before.pan, afterSearch.pan);
  console.log('search positions', before.positions.filter((p,i) => JSON.stringify(p) !== JSON.stringify(afterSearch.positions[i])).slice(0,4));
  check('search preserves camera and positions', JSON.stringify(before)===JSON.stringify(afterSearch));
  check('toolbar stays simple', await page.getByRole('button', {name:/^(Back|Forward|Fokus|Jelajah|Susun ulang|Explorer|Tetangga)$/}).count() === 0);
  await evaluate(() => { cyTest.stop(); cyTest.zoom(0.3); cyTest.nodes().filter(n=>n.data('type')==='feature')[0].emit('tap'); });
  await page.waitForFunction(() => Math.abs(cyTest.zoom()-0.3)>0.01);
  await page.waitForFunction(() => !cyTest.animated());
  check('canvas selection frames at least four processes without deep zoom', await evaluate(() => {
    const visible = cyTest.nodes().filter(n => {
      if (n.data('type') !== 'feature') return false;
      const b = n.renderedBoundingBox();
      return b.x1 >= 0 && b.y1 >= 0 && b.x2 <= cyTest.width() && b.y2 <= cyTest.height();
    });
    return visible.length >= 4 && cyTest.zoom() <= 1.2;
  }));
  const domains = await evaluate(() => cyTest.nodes().filter(n=>n.data('type')==='module').slice(0,2).map(n=>({key:n.data('domain'),label:n.data('label')})));
  await page.getByTitle('Filter graf per domain, level, atau catatan').click();
  const filters = page.locator('div.absolute').filter({has:page.getByText('Domain',{exact:true})});
  for (const domain of domains) await filters.getByRole('button',{name:domain.label,exact:true}).click();
  check('dua domain aktif bersamaan', await filters.locator('[aria-pressed="true"]').count()===2);
  check('graf memuat kedua domain', await page.evaluate(keys => keys.every(key => cyTest.nodes().some(n=>n.data('type')==='feature' && n.data('domain')===key)) && cyTest.nodes().filter(n=>n.data('type')==='feature').every(n=>keys.includes(n.data('domain'))), domains.map(d=>d.key)));
  await filters.getByRole('button',{name:'Fitur',exact:true}).click();
  await filters.getByRole('button',{name:'Aksi',exact:true}).click();
  await page.waitForFunction(()=>cyTest.nodes().some(n=>n.data('type')==='action'));
  check('dua level aktif bersamaan', await filters.getByRole('button',{name:'Fitur',exact:true}).getAttribute('aria-pressed')==='true' && await filters.getByRole('button',{name:'Aksi',exact:true}).getAttribute('aria-pressed')==='true');
  await filters.getByRole('button',{name:domains[0].label,exact:true}).click();
  check('membatalkan satu domain mempertahankan lainnya', await filters.getByRole('button',{name:domains[1].label,exact:true}).getAttribute('aria-pressed')==='true');
  await filters.getByRole('button',{name:'Reset semua filter',exact:true}).click();
  check('reset menghapus seluruh pilihan', await filters.locator('[aria-pressed="true"]').count()===0);
  await page.getByTitle('Filter graf per domain, level, atau catatan').click();
  await page.getByTitle('Tampilkan/sembunyikan level Aksi (L3)', {exact:true}).click();
  const moduleLabel = await evaluate(() => cyTest.nodes().filter(n=>n.data('type')==='module')[0].data('label'));
  await page.locator('input').first().fill(moduleLabel);
  const explorer = page.getByLabel('Module and feature explorer');
  const choices = explorer.locator('button').filter({hasNotText:/Collapse|Expand/});
  await explorer.getByRole('button',{name:'Collapse',exact:true}).first().click();
  check('collapsed cross-module edges remain', await evaluate(() => cyTest.edges().some(e=>e.source().data('type')==='module'||e.target().data('type')==='module')));
  await explorer.getByRole('button',{name:'Expand',exact:true}).first().click();
  await page.emulateMedia({reducedMotion:'reduce'}); await page.waitForFunction(()=>cyTest.nodes()[0].pstyle('transition-duration').pfValue===0);
  check('runtime reduced motion disables graph transitions', true);
  await page.setViewportSize({width:390,height:844}); await choices.first().click();
  const sheet = page.locator('aside'); check('mobile compact sheet', (await sheet.boundingBox()).height<=181);
  check('compact has no blocking backdrop', await page.locator('div.fixed.inset-0.bg-black\\/40').count()===0);
  await page.getByRole('button',{name:'Perluas detail',exact:true}).click();
  await page.waitForFunction(() => document.querySelector('aside').getBoundingClientRect().height > 400);
  check('sheet expands', (await sheet.boundingBox()).height>400);
  check('no runtime errors', errors.length===0); console.log('Browser regression checks complete.');
} finally { await browser.close(); }
