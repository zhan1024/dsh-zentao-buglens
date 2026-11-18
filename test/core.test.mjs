import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fixture, png, ready, modelServer, analysis } from './helpers.mjs'
import { assignmentsFromBug } from '../dist/zentao.js'
import { validatePage, redact } from '../dist/model.js'
import { startDashboard } from '../dist/server.js'

test('多图、圈选、排序与离线带图材料',async()=>{const f=await fixture();try{
 let d=await ready(f.service);const dataUrl='data:image/png;base64,'+(await png()).toString('base64')
 d=await f.service.addImage(d.id,{dataUrl,note:'新增客户表单'});const first=d.images[0].id
 d=await f.service.addImage(d.id,{dataUrl,note:'刷新后列表'})
 d=await f.service.update(d.id,{image:{id:first,regions:[{x:20,y:30,width:100,height:80}],note:'保存按钮'},imageOrder:[d.images[1].id,first]})
 assert.equal(d.images[1].note,'保存按钮');assert.equal(d.images[1].regions.length,1)
 await assert.rejects(f.service.update(d.id,{image:{id:first,regions:[{x:790,y:0,width:30,height:30}]}}),/超出/)
 const report=await f.service.export(d.id);assert.match(report.html,/data:image\/png;base64/);assert.match(report.html,/border:3px/);assert.match(report.markdown,/前端事项/);assert.match(await readFile(report.htmlPath,'utf8'),/刷新后列表/)
}finally{await f.cleanup()}})

test('截图模型实际收到原图与局部放大；推荐答案写回并保留待定位',async()=>{const model=await modelServer();process.env.BUGLENS_TEST_KEY='not-a-real-secret';const f=await fixture({ai:{baseUrl:model.url,model:'fixture-vision',apiKeyEnv:'BUGLENS_TEST_KEY'}});try{
 let d=await f.service.create({description:'保存后数据消失'});d=await f.service.addImage(d.id,{dataUrl:'data:image/png;base64,'+(await png()).toString('base64'),regions:[{x:30,y:40,width:160,height:80}]})
 d=await f.service.analyze(d.id)
 assert.equal(d.analysis.ownership,'unknown');assert.equal(model.requests[0].messages[1].content.filter(p=>p.type==='image_url').length,2)
 d=await f.service.update(d.id,{answers:{q1:'新增客户出现在列表'}})
 assert.equal(d.analysis.expectedSource,'user');assert.equal(d.analysis.expected,'新增客户出现在列表')
 model.setResponse('oops');await assert.rejects(f.service.analyze(d.id),/JSON/)
}finally{delete process.env.BUGLENS_TEST_KEY;await f.cleanup();await model.close()}})

test('历史只计本人真实指派，不将当前处理人视为历史，按产品和身份隔离',async()=>{const f=await fixture();try{
 const d=await ready(f.service),date=new Date().toISOString()
 f.gateway.records.set(1,{id:1,product:1,assignedTo:{account:'back'},actions:[{actor:'qa',date,action:'edited',history:[{field:'assignedTo',new:'front'}]},{actor:'other',date,history:[{field:'assignedTo',new:'back'}]}]})
 f.gateway.records.set(2,{id:2,product:1,assignedTo:{account:'back'},actions:[]})
 let p=await f.service.candidates(d.id,true);assert.equal(p.recent.length,1);assert.equal(p.recent[0].account,'front');assert.equal(p.recent[0].source,'zentao')
 const raw=assignmentsFromBug({id:4,actions:[{actor:'qa',date,action:'assigned',extra:{account:'back'}}]},'qa',1);assert.equal(raw[0].account,'back')
 await f.service.store.saveHistory(f.gateway.identity,[{account:'back',actor:'qa',product:99,at:date,bugId:5,source:'plugin'}])
 p=await f.service.candidates(d.id);assert.equal(p.recent.length,1)
 f.gateway.identity='https://other.example|qa';p=await f.service.candidates(d.id);assert.equal(p.recent.length,0)
}finally{await f.cleanup()}})

test('创建、指派、正文嵌图、原图/圈选图/两种材料完整上传',async()=>{const f=await fixture();try{
 let d=await ready(f.service);d=await f.service.addImage(d.id,{dataUrl:'data:image/png;base64,'+(await png()).toString('base64'),regions:[{x:10,y:10,width:100,height:80}]})
 d=await f.service.submit(d.id);assert.equal(d.submission.status,'done');assert.equal(d.submission.uploads.length,4);assert.equal(f.gateway.creates,1)
 const bug=await f.gateway.getBug(d.submission.bugId);assert.equal(bug.assignedTo.account,'front');assert.match(bug.steps,/<img/);assert.match(bug.steps,/协作人/)
 assert.equal((await f.service.submit(d.id)).submission.status,'done');assert.equal(f.gateway.creates,1)
 await assert.rejects(f.service.update(d.id,{description:'不能改'}),/冻结/)
}finally{await f.cleanup()}})

test('创建响应超时后先查材料编号，不重复创建',async()=>{const f=await fixture();try{
 const draft=await ready(f.service);f.gateway.failCreate=true
 let d=await f.service.submit(draft.id);assert.equal(d.submission.status,'uncertain');assert.equal(f.gateway.creates,1)
 d=await f.service.submit(d.id);assert.equal(d.submission.status,'done');assert.equal(f.gateway.creates,1)
}finally{await f.cleanup()}})

test('上传响应超时核实已有附件；重试不重复上传已完成项',async()=>{const f=await fixture();try{
 let d=await ready(f.service);f.gateway.failUpload=true
 d=await f.service.submit(d.id);assert.equal(d.submission.status,'partial');const count=f.gateway.uploads.length
 d=await f.service.submit(d.id);assert.equal(d.submission.status,'done');assert.equal(f.gateway.uploads.length,count)
}finally{await f.cleanup()}})

test('找不到创建结果时停住，不以相同标题重新建单',async()=>{const f=await fixture();try{
 let d=await ready(f.service);f.gateway.createBug=async()=>{f.gateway.creates++;throw Error('请求超时')}
 d=await f.service.submit(d.id);assert.equal(d.submission.status,'uncertain')
 d=await f.service.submit(d.id);assert.equal(d.submission.status,'uncertain');assert.equal(f.gateway.creates,1)
}finally{await f.cleanup()}})

test('正文失败可恢复；账号改变后禁止继续原提交',async()=>{const f=await fixture();try{
 let d=await ready(f.service);f.gateway.failBody=true;d=await f.service.submit(d.id);assert.equal(d.submission.status,'partial');const n=f.gateway.uploads.length
 f.gateway.failBody=false;d=await f.service.submit(d.id);assert.equal(d.submission.status,'done');assert.equal(f.gateway.uploads.length,n)
 assert.equal((await f.service.store.history(f.gateway.identity)).length,1,'恢复补传不能伪造新的指派事件')
 f.gateway.identity='https://zentao.example|other';await assert.rejects(f.service.submit(d.id),/身份已变化/)
}finally{await f.cleanup()}})

test('附件必须在 Bug 详情核实关联，恢复的外站 URL 不能嵌入正文',async()=>{const f=await fixture();try{
 let d=await ready(f.service);d=await f.service.addImage(d.id,{dataUrl:'data:image/png;base64,'+(await png()).toString('base64')})
 const original=f.gateway.getBug.bind(f.gateway);let hide=true
 f.gateway.getBug=async id=>{const bug=await original(id);if(hide)bug.files=[];return bug}
 d=await f.service.submit(d.id);assert.equal(d.submission.status,'partial');assert.equal(d.submission.attachmentsVerified,false)
 hide=false;d=await f.service.submit(d.id);assert.equal(d.submission.status,'done');assert.equal(d.submission.attachmentsVerified,true)
 const second=await ready(f.service);await f.service.addImage(second.id,{dataUrl:'data:image/png;base64,'+(await png()).toString('base64')})
 f.gateway.failUpload=true;let pending=await f.service.submit(second.id)
 f.gateway.records.get(pending.submission.bugId).files[0].url='https://untrusted.example/private.png'
 pending=await f.service.submit(second.id);assert.equal(pending.submission.status,'partial');assert.ok(!f.gateway.records.get(pending.submission.bugId).steps.includes('untrusted.example'))
}finally{await f.cleanup()}})

test('文本脱敏覆盖含空格及转义字符的凭据，不残留 Cookie 或 Bearer 尾部',()=>{
 const input=JSON.stringify({password:'two word secret',token:'abc"xyz',ok:'visible'})+'\nAuthorization: Bearer first second\nCookie: sid=one; auth=two'
 const output=redact(input)
 for(const secret of ['word secret','xyz','first','second','sid=one','auth=two'])assert.ok(!output.includes(secret),output)
 assert.match(output,/visible/)
})

test('停用人员与缺少必要材料不能提交；并发锁防止重复操作',async()=>{const f=await fixture();try{
 const empty=await f.service.create({description:'图片问题'});await assert.rejects(f.service.submit(empty.id),/先生成/)
 const d=await ready(f.service);await f.service.store.lock(d.id,async()=>{await assert.rejects(f.service.submit(d.id),/正在处理中/)})
 f.gateway.members=async()=>[];await assert.rejects(f.service.submit(d.id),/失效/);assert.equal(f.gateway.creates,0)
}finally{await f.cleanup()}})

test('本机 API 要求令牌与正确来源；目录穿越不可读',async()=>{const f=await fixture();const server=await startDashboard(f.service,0);try{
 let r=await fetch(server.origin+'/api/drafts');assert.equal(r.status,401)
 r=await fetch(server.origin+'/api/drafts',{headers:{Authorization:'Bearer '+server.token,Origin:'https://evil.example'}});assert.equal(r.status,403)
 r=await fetch(server.origin+'/api/drafts',{headers:{Authorization:'Bearer '+server.token}});assert.equal(r.status,200)
 r=await fetch(server.origin+'/api/status',{headers:{Authorization:'Bearer '+server.token,Origin:'chrome-extension://'+'a'.repeat(32)}});assert.equal(r.status,200);assert.equal(r.headers.get('access-control-allow-origin'),'chrome-extension://'+'a'.repeat(32))
 r=await fetch(server.origin+'/package.json');assert.equal(r.status,404)
 assert.match(redact('{"token":"abc"}'),/REDACTED/)
 const p=validatePage({url:'https://example.com/?token=secret',traces:[{kind:'request',at:new Date().toISOString(),url:'https://api.example/?password=p',requestBody:'{"token":"x"}'}]});assert.ok(!p.url.includes('secret'));assert.ok(!p.traces[0].requestBody.includes('"x"'))
}finally{await server.close();await f.cleanup()}})
