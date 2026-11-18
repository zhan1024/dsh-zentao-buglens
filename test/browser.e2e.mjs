import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fixture,modelServer,png } from './helpers.mjs'
import { startDashboard } from '../dist/server.js'

test('真实浏览器：粘贴截图→圈选→AI选项→负责人→禅道完整提单',async()=>{
 const model=await modelServer();process.env.BUGLENS_E2E_KEY='fixture';const f=await fixture({ai:{baseUrl:model.url,model:'test-vision',apiKeyEnv:'BUGLENS_E2E_KEY'}}),server=await startDashboard(f.service,0)
 const browser=await chromium.launch({headless:true})
 try{
  const page=await browser.newPage({viewport:{width:1536,height:1100}})
  const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.goto(server.url);await page.getByPlaceholder('例如：新增客户点保存提示成功，但刷新后看不到这条客户').fill('新增客户保存提示成功，刷新后数据消失')
  await page.locator('#files').setInputFiles({name:'screenshot.png',mimeType:'image/png',buffer:await png()})
  await page.locator('#canvas').waitFor({state:'visible'})
  assert.equal(await page.locator('#description').inputValue(),'新增客户保存提示成功，刷新后数据消失')
  await page.locator('#files').setInputFiles({name:'second.png',mimeType:'image/png',buffer:await png()})
  await page.waitForFunction(()=>document.querySelectorAll('[data-image]').length===2)
  await page.locator('#description').fill('临时修改描述不得丢失')
  await page.locator('#remove-image').click();await page.waitForFunction(()=>document.querySelectorAll('[data-image]').length===1)
  assert.equal(await page.locator('#description').inputValue(),'临时修改描述不得丢失')
  await page.locator('#description').fill('新增客户保存提示成功，刷新后数据消失')
  const box=await page.locator('#canvas').boundingBox();await page.mouse.move(box.x+20,box.y+20);await page.mouse.down();await page.mouse.move(box.x+140,box.y+85);await page.mouse.up()
  await page.locator('#image-note').fill('刷新后列表未出现新客户')
  await page.locator('#save-image').click();await page.getByText('圈选和说明已保存。',{exact:true}).waitFor()
  await page.locator('#analyze').click();await page.locator('#questions').waitFor({state:'visible'})
  await page.getByRole('button',{name:'新增客户出现在列表',exact:true}).click();await page.locator('#save-answers').click()
  await page.locator('#questions').waitFor({state:'hidden'})
  assert.equal(await page.locator('#expected').inputValue(),'新增客户出现在列表')
  await page.locator('#assignee').selectOption('front');await page.locator('#collaborators').selectOption(['back']);await page.locator('#ownership').selectOption('both')
  await mkdir('artifacts',{recursive:true});await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'artifacts/workbench-desktop.png',fullPage:true})
  const downloadPromise=page.waitForEvent('download');await page.locator('#export').click();const download=await downloadPromise;assert.match(download.suggestedFilename(),/\.html$/)
  await page.locator('#submit').click();await page.getByText('Bug 已创建、指派并完成材料上传。',{exact:true}).waitFor()
  const d=(await f.service.store.list())[0],saved=await f.service.store.get(d.id)
  assert.equal(saved.submission.status,'done');assert.equal(saved.images[0].regions.length,1);assert.equal(f.gateway.creates,1);assert.equal(saved.analysis.ownership,'both')
  assert.equal(model.requests[0].messages[1].content.filter(p=>p.type==='image_url').length,2)
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/workbench-mobile.png',fullPage:true})
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
  assert.deepEqual(errors,[])
 }finally{await browser.close();await server.close();await model.close();await f.cleanup();delete process.env.BUGLENS_E2E_KEY}
})

test('真实 Chromium 扩展：配对、采集当前页面及截图到草稿',async()=>{
 const f=await fixture(),server=await startDashboard(f.service,0)
 const extension=resolve('extension')
 const context=await chromium.launchPersistentContext('',{channel:'chromium',headless:true,args:['--enable-unsafe-extension-debugging',`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]})
 try{
  let [worker]=context.serviceWorkers();if(!worker)worker=await context.waitForEvent('serviceworker')
  // Messages originate from extension pages in normal use.
  const id=worker.url().split('/')[2],popup=await context.newPage()
  await popup.goto(`chrome-extension://${id}/popup.html`)
  await popup.locator('#connection').fill(server.url);await popup.locator('#pair').click();await popup.getByText('已保存本机配对。工作台重启后请使用新地址重新配对。').waitFor()
  const target=await context.newPage();await target.goto(server.origin)
  // Use an ordinary page with no application token as the test target.
  await target.bringToFront()
  const browserCdp=await context.browser().newBrowserCDPSession()
  const {targetInfos}=await browserCdp.send('Target.getTargets',{filter:[{type:'tab',exclude:false},{exclude:true}]})
  const tabTarget=targetInfos.find(t=>t.url===target.url())
  assert.ok(tabTarget,JSON.stringify(targetInfos))
  await browserCdp.send('Extensions.triggerAction',{id,targetId:tabTarget.targetId})
  const recording=await popup.evaluate(()=>chrome.runtime.sendMessage({type:'record',includeBodies:false}));assert.equal(recording.ok,true,JSON.stringify(recording))
  await target.evaluate(async()=>{console.error('buglens-fixture-error');await fetch('/fixture-request')})
  const result=await popup.evaluate(()=>chrome.runtime.sendMessage({type:'capture',description:'当前页面截图测试'}))
  assert.equal(result.ok,true,JSON.stringify(result))
  const d=await f.service.store.get(result.value.draftId)
  assert.equal(d.images.length,1);assert.equal(d.page.url,server.origin+'/');assert.match(d.page.title,/BugLens/)
  assert.ok(d.page.traces.some(t=>t.kind==='console'&&t.text.includes('buglens-fixture-error')))
  await popup.evaluate(()=>chrome.runtime.sendMessage({type:'stop'}))
 }finally{await context.close();await server.close();await f.cleanup()}
})
