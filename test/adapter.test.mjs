import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { connect,assignmentsFromBug } from '../dist/zentao.js'

test('官方 SDK HTTP 适配：认证身份、服务版本、人员、实名历史、创建及文件上传',async()=>{
 const requests=[];let owner='qa',token='fixture-token',large=false
 const response=(res,data)=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(data))}
 const server=createServer((req,res)=>{const parts=[];req.on('data',p=>parts.push(p));req.on('end',()=>{
  requests.push({url:req.url,method:req.method,token:req.headers.token,body:Buffer.concat(parts).toString()})
  const url=new URL(req.url,'http://localhost'),path=url.pathname
  if(url.searchParams.get('mode')==='getconfig')return response(res,{version:'22.5',systemMode:'ALM',sprintConcept:'sprint',requestType:'PATH_INFO',requestFix:'-',moduleVar:'m',methodVar:'f',viewVar:'t',sessionVar:'zentaosid'})
  if(path==='/api.php/v2/user')return response(res,{profile:{account:owner}})
  if(path==='/api.php/v2/users'){
   const first=[{id:1,account:'qa',realname:'测试甲'},{id:2,account:'front',realname:'开发王'},{id:3,account:'back',realname:'开发李'},{id:4,account:'dup1',realname:'重名'},{id:5,account:'dup2',realname:'重名'}]
   const users=large?(Number(url.searchParams.get('pageID')||1)===1?[...first,...Array.from({length:995},(_,i)=>({id:i+6,account:'user'+i,realname:'成员'+i}))]:[{id:1001,account:'qa2',realname:'测试甲'}]):first
   return response(res,{users,pager:{recTotal:large?1001:5,pageID:Number(url.searchParams.get('pageID')||1),recPerPage:1000}})
  }
  if(path==='/api.php/v2/products')return response(res,{products:[{id:1,name:'产品一'}]})
  if(path==='/api.php/v2/bugs/43')return response(res,{id:43,title:'fixture',steps:'body',openedBy:{account:'qa'},assignedTo:{account:'front'},actions:[{actor:'测试甲',date:new Date().toISOString(),action:'assigned',extra:'开发王',history:[{field:'assignedTo',new:'front'}]},{actor:'重名',date:new Date().toISOString(),history:[{field:'assignedTo',new:'back'}]}]})
  if(path==='/api.php/v2/products/1/bugs')return response(res,{bugs:[{id:43}],pager:{recTotal:1,pageID:1,recPerPage:100}})
  if(path==='/api.php/v2/bugs'&&req.method==='POST')return response(res,{id:43})
  if(path==='/api.php/v2/files'&&req.method==='POST')return response(res,{id:7,url:'/file-read-7.png'})
  res.writeHead(404);res.end('{}')
 })})
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 process.env.BUGLENS_ADAPTER_TOKEN=token
 const config={zentao:{siteUrl:`http://127.0.0.1:${server.address().port}`,account:'qa',tokenEnv:'BUGLENS_ADAPTER_TOKEN'}}
 try{
  const z=await connect(config);await z.check();assert.equal((await z.products())[0].id,1);assert.equal((await z.members(0)).length,5)
  const bug=await z.getBug(43),history=assignmentsFromBug(bug,'qa',1);assert.equal(history.length,1);assert.equal(history[0].account,'front')
  assert.equal((await z.listBugs(1)).bugs[0].id,43)
  assert.equal(await z.createBug({product:1,project:0,openedBuild:['trunk'],assignedTo:'front',analysis:{title:'测试'},description:'测试'},'正文'),43)
  const file=await z.upload(43,'fixture.png',Buffer.from('abc'),'image/png');assert.equal(file.id,7);assert.match(file.url,/file-read-7/)
  const upload=requests.find(r=>r.url==='/api.php/v2/files');assert.match(upload.body,/objectType/);assert.match(upload.body,/bug/);assert.match(upload.body,/43/)
  assert.ok(requests.filter(r=>r.url.includes('/api.php/v2/')).every(r=>r.token===token))
  large=true;const big=await connect(config);assert.equal((await big.members(0)).length,1001)
  assert.equal(assignmentsFromBug(await big.getBug(43),'qa',1).length,0,'第二页的同名用户必须阻止实名误匹配')
  owner='other';await assert.rejects(connect(config),/身份.*不匹配/)
 }finally{delete process.env.BUGLENS_ADAPTER_TOKEN;server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
})
