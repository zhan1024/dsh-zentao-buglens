import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Service } from '../dist/service.js'
import { createServer } from 'node:http'
import sharp from 'sharp'
export const analysis={title:'【客户管理】保存成功后客户未出现在列表',uiPath:'客户管理 → 客户列表 → 新增客户 → 保存',steps:['打开新增客户弹窗','点击保存','刷新客户列表'],actual:'提示成功但列表中没有新客户',expected:'保存后应能查看新增客户',expectedSource:'inferred',ownership:'unknown',confidence:'low',reasons:['截图显示成功提示；缺少数据持久化证据'],frontendActions:['核对提交参数及列表刷新'],backendActions:['核对保存结果'],unknowns:['是否已成功持久化'],severity:3,priority:3,questions:[{field:'expected',prompt:'保存后应该出现什么？',options:['新增客户出现在列表','跳转客户详情']}]}
export class FakeGateway {
 identity='https://zentao.example|qa';account='qa';site='https://zentao.example';records=new Map();uploads=[];creates=0;failCreate=false;failUpload=false;failBody=false
 async check(){return {version:'22.5'}}
 async products(){return[{id:1,name:'客户管理'}]}
 async projects(){return[{id:2,name:'客户平台'}]}
 async builds(){return[{id:3,name:'1.0'}]}
 async members(){return[{account:'front',name:'前端小王',active:true},{account:'back',name:'后端小李',active:true}]}
 async listBugs(product,page=1){return{bugs:page===1?[...this.records.values()].filter(b=>b.product===product):[],total:this.records.size}}
 async getBug(id){const v=this.records.get(id);if(!v)throw Error('404');return structuredClone(v)}
 async createBug(d,steps){this.creates++;const id=42+this.creates;this.records.set(id,{id,product:d.product,title:d.analysis.title,steps,assignedTo:{account:d.assignedTo},openedBy:{account:this.account},files:[],actions:[]});if(this.failCreate)throw Error('模拟：创建已经成功但响应超时');return id}
 async updateBody(id,steps){if(this.failBody)throw Error('正文暂不可用');this.records.get(id).steps=steps}
 async upload(id,filename,data,mime){const file={id:this.uploads.length+100,title:filename,url:this.site+'/file-read-'+(this.uploads.length+100)+'.png',bytes:data.length,mime};this.uploads.push(file);this.records.get(id).files.push(file);if(this.failUpload){this.failUpload=false;throw Error('模拟：上传已经成功但响应超时')}return file}
 bugUrl(id){return this.site+'/bug-view-'+id+'.html'}
}
export async function fixture(extra={}){
 const root=await mkdtemp(join(tmpdir(),'buglens-test-'))
 const config={dataDir:root,port:0,zentao:{},defaults:{product:1,project:2,openedBuild:['trunk']},team:[],historyDays:30,historyScanLimit:200,...extra}
 const gateway=new FakeGateway(),service=new Service(config,gateway);await service.init()
 return {root,config,gateway,service,cleanup:()=>rm(root,{recursive:true,force:true})}
}
export async function png(){return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="#f5f7fa"/><rect width="165" height="500" fill="#20374c"/><g font-family="sans-serif" fill="#dce4ee" font-size="15"><text x="25" y="43">客户运营平台</text><text x="25" y="105">工作台</text><text x="25" y="158" fill="#92dbc7">客户管理</text><text x="25" y="204">订单管理</text></g><g font-family="sans-serif" fill="#334155"><text x="190" y="42" font-size="13">客户管理  /  客户列表</text><text x="190" y="104" font-size="24">客户列表</text><rect x="190" y="140" width="580" height="305" rx="8" fill="white"/><rect x="635" y="84" width="125" height="34" rx="5" fill="#247966"/><text x="651" y="107" font-size="13" fill="white">＋ 新增客户</text><rect x="210" y="165" width="230" height="33" rx="4" fill="#f8fafc" stroke="#dde3e9"/><text x="224" y="188" font-size="12" fill="#94a3b8">搜索客户名称</text><path d="M210 228H750" stroke="#e2e8f0"/><text x="220" y="252" font-size="13">客户名称</text><text x="425" y="252" font-size="13">联系人</text><text x="630" y="252" font-size="13">创建时间</text><text x="430" y="341" font-size="16" fill="#94a3b8">暂无客户数据</text><text x="210" y="476" font-size="11" fill="#94a3b8">本地模拟测试页面 · 非真实业务数据</text><rect x="352" y="16" width="218" height="39" rx="6" fill="#e6f5e9" stroke="#b9dec1"/><text x="374" y="41" font-size="14" fill="#218449">✓ 客户已保存成功</text></g></svg>`)).png().toBuffer()}
export async function ready(service){let d=await service.create({description:'保存成功但刷新后没有客户'});d=await service.update(d.id,{analysis,assignedTo:'front',collaborators:['back']});return d}
export async function modelServer(){
 const requests=[];let response=analysis
 const server=createServer((req,res)=>{const chunks=[];req.on('data',c=>chunks.push(c));req.on('end',()=>{requests.push(JSON.parse(Buffer.concat(chunks)));res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{message:{content:typeof response==='string'?response:JSON.stringify(response)}}]}))})})
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 return {url:`http://127.0.0.1:${server.address().port}/v1`,requests,setResponse:r=>response=r,close:()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve)})}
}
