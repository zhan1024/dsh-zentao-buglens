import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtemp,writeFile,rm,readFile,mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join,resolve } from 'node:path'
const root=resolve('.'),home=await mkdtemp(join(tmpdir(),'buglens-dsh-')),requests=[]
async function command(bin,args,env={}){return new Promise((resolve,reject)=>{const child=spawn(bin,args,{cwd:root,env:{...process.env,...env},stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d);const timer=setTimeout(()=>child.kill(),180000);child.on('error',reject);child.on('close',code=>{clearTimeout(timer);resolve({code,stdout,stderr})})})}
const emit=(res,model,delta,finish_reason=null)=>res.write(`data: ${JSON.stringify({id:'chatcmpl-buglens',object:'chat.completion.chunk',created:Math.floor(Date.now()/1000),model,choices:[{index:0,delta,finish_reason}]})}\n\n`)
function tool(res,model,name,args){emit(res,model,{role:'assistant',content:null,tool_calls:[{index:0,id:'call_'+name,type:'function',function:{name,arguments:''}}]});emit(res,model,{tool_calls:[{index:0,function:{arguments:JSON.stringify(args)}}]});emit(res,model,{},'tool_calls');res.end('data: [DONE]\n\n')}
const model=createServer((req,res)=>{const parts=[];req.on('data',d=>parts.push(d));req.on('end',()=>{try{const v=JSON.parse(Buffer.concat(parts)),messages=v.messages||[],called=messages.filter(m=>m.role==='assistant').flatMap(m=>(m.tool_calls||[]).map(t=>t.function.name)),results=messages.filter(m=>m.role==='tool').map(m=>typeof m.content==='string'?m.content:(m.content||[]).map(p=>p.text||'').join('\n'));requests.push(v);res.writeHead(200,{'Content-Type':'text/event-stream'});if(!called.includes('buglens_create'))return tool(res,v.model,'buglens_create',{description:'DSH 打包安装集成测试：保存后数据消失'});const id=/"id"\s*:\s*"([\da-f-]{36})"/.exec(results.join('\n'))?.[1];if(!called.includes('buglens_get')&&id)return tool(res,v.model,'buglens_get',{draft_id:id});emit(res,v.model,{role:'assistant',content:'BUGLENS_DSH_COMPLETE'});emit(res,v.model,{},'stop');res.end('data: [DONE]\n\n')}catch(e){res.writeHead(500);res.end(String(e))}})})
let tarball
try{
 await new Promise(resolve=>model.listen(0,'127.0.0.1',resolve))
 const config=join(home,'config.json');await writeFile(config,JSON.stringify({dataDir:join(home,'data'),port:0}))
 const pack=await command('npm',['pack','--json','--loglevel=error']);assert.equal(pack.code,0,pack.stderr);const packed=JSON.parse(pack.stdout.slice(pack.stdout.indexOf('[')))[0];tarball=join(root,packed.filename)
 for(const path of ['dist/index.js','dist/cli.js','ui/index.html','extension/manifest.json','skills/zentao-buglens/SKILL.md','cordis.patch.yml','LICENSE'])assert.ok(packed.files.some(f=>f.path===path),'缺少 '+path)
 assert.ok(!packed.files.some(f=>f.path.includes('config.local')||f.path.startsWith('test/')||f.path.startsWith('artifacts/')))
 const bin=process.env.DSH_BIN||'/tmp/dsh-repro-harness/node_modules/.bin/dsh'
 const env={DSH_HOME:home,BUGLENS_CONFIG:config,DSH_TELEMETRY_MODE:'OFF',DSH_PERMISSION_MODE:'danger-full-access',BUGLENS_DSH_TEST_KEY:'fixture'}
 const installed=await command(bin,['plugin','--profile','headless','add',process.env.BUGLENS_PLUGIN_SPEC||tarball],env);assert.equal(installed.code,0,installed.stderr)
 const patch=[{id:'agent-default-model',config:{provider:'buglens-test',model:'fixture'}},{id:'llm-pi-ai',config:{providers:{'buglens-test':{displayName:'BugLens deterministic fixture',apiKeyEnv:'BUGLENS_DSH_TEST_KEY',api:'openai-completions',baseURL:`http://127.0.0.1:${model.address().port}/v1`,models:[{id:'fixture',name:'fixture',contextWindow:65536,maxTokens:4096}]}}}},{id:'session-telemetry-otel',disabled:true}]
 await writeFile(join(home,'profiles','headless','cordis.patch.yml'),JSON.stringify(patch))
 const run=await command(bin,['headless','创建故障草稿，再读取草稿，报告完成；不要提交真实禅道 Bug。'],env)
 assert.equal(run.code,0,run.stderr);assert.match(run.stdout,/BUGLENS_DSH_COMPLETE/)
 const offered=requests[0].tools.map(t=>t.function.name)
 for(const suffix of ['open','create','get','update','add_image','analyze','candidates','export','submit','reconcile'])assert.ok(offered.includes('buglens_'+suffix),'缺少工具 '+suffix)
 const files=(await import('node:fs/promises')).readdir
 assert.equal((await files(join(home,'data','drafts'))).filter(f=>f.endsWith('.json')).length,1)
 console.log('PASS: npm 打包产物安装到真实 DSH；10 个工具已注册；模型完成 create → get；未访问真实禅道。')
}finally{model.closeAllConnections();await new Promise(resolve=>model.close(resolve));await rm(home,{recursive:true,force:true});if(tarball)await rm(tarball,{force:true})}
