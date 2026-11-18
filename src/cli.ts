#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { readFile, readdir, cp, mkdir, unlink, open as openFile } from 'node:fs/promises'
import { join, resolve, dirname } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { loadConfig } from './config.js'
import { Service } from './service.js'
import { startDashboard } from './server.js'
const args=process.argv.slice(2),command=args[0] || 'open'
const root=fileURLToPath(new URL('../',import.meta.url))
const output=(v:unknown)=>console.log(JSON.stringify(v,null,2))
function openBrowser(url:string):void {
  const cmd=process.platform==='darwin'?'open':process.platform==='win32'?'cmd':'xdg-open'
  const child=spawn(cmd,process.platform==='win32'?['/c','start','',url]:[url],{stdio:'ignore',detached:true});child.on('error',()=>{});child.unref()
}
async function input():Promise<any>{let s='';for await(const part of process.stdin){s+=part;if(s.length>18000000)throw new Error('输入过大')}return JSON.parse(s||'{}')}
async function main():Promise<void>{
  if(['help','--help','-h'].includes(command))return console.log(`禅图 BugLens v0.1.0 — 截图到禅道 Bug\n\n用法：dsh-zentao-buglens <命令>\n  open                     后台启动工作台并打开浏览器\n  serve [--open]            前台运行本机核心服务\n  create                    从 stdin JSON 创建草稿\n  get <id>                  查看草稿\n  update <id>               从 stdin JSON 修改草稿\n  add-image <id> <path>      加入本机截图文件\n  analyze <id>              调用团队识图模型\n  candidates <id> [--sync]   最近本人指派与团队成员\n  export <id>               导出材料\n  submit <id>               创建/续传真实禅道 Bug\n  reconcile <id>            从 stdin JSON 核实不确定提交\n  install-skill [--target <目录>]  安装独立 Skill\n  extension-path            输出配套扩展目录\n  recover-lock <id>          已确认原进程结束后清理锁\n\n配置：BUGLENS_CONFIG=/绝对路径/config.local.json\n数据目录：BUGLENS_DATA_DIR。凭据仅通过服务端环境变量或已有 zentao login 配置读取。`)
  if(command==='extension-path')return output({path:join(root,'extension')})
  if(command==='install-skill'){
    const index=args.indexOf('--target'),parent=index>=0?resolve(args[index+1]||''):join(homedir(),'.agents','skills')
    const target=join(parent,'zentao-buglens');await mkdir(parent,{recursive:true})
    try{await mkdir(target)}catch{throw new Error('目标 Skill 已存在，请先保留个人修改后选择其他目录')}
    const source=join(root,'skills','zentao-buglens')
    for(const name of await readdir(source))await cp(join(source,name),join(target,name),{recursive:true,force:false,errorOnExist:true})
    return output({installed:true,path:target})
  }
  const config=await loadConfig(),service=new Service(config);await service.init()
  if(command==='serve'){const dashboard=await startDashboard(service);console.log(`禅图 BugLens\n${dashboard.url}\n本机私有数据：${service.store.root}`);if(args.includes('--open'))openBrowser(dashboard.url);for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{void dashboard.close().then(()=>process.exit(0))});return}
  if(command==='open'){
    const runtime=join(config.dataDir,'runtime.json')
    const running=async()=>{try{const r=JSON.parse(await readFile(runtime,'utf8'));const ping=await fetch(r.origin+'/api/drafts',{headers:{Authorization:`Bearer ${r.token}`},signal:AbortSignal.timeout(1000)});return ping.ok?r:undefined}catch{return undefined}}
    let r=await running()
    if(!r){
      const log=await openFile(join(config.dataDir,'service.log'),'a',0o600)
      const child=spawn(process.execPath,[fileURLToPath(import.meta.url),'serve'],{env:process.env,stdio:['ignore',log.fd,log.fd],detached:true});child.unref();await log.close()
      for(let i=0;i<30&&!r;i++){await new Promise(resolve=>setTimeout(resolve,200));r=await running()}
    }
    if(!r)throw new Error('工作台启动失败，请运行 serve 查看诊断')
    openBrowser(r.url);return output({url:r.url})
  }
  const id=args[1] || ''
  if(command==='recover-lock'){
    const path=join(service.store.root,'drafts',service.store.id(id)+'.lock'),pid=Number(await readFile(path,'utf8'))
    try{process.kill(pid,0);throw new Error('原进程仍存在，不能清理锁')}catch(e:any){if(e.code!=='ESRCH')throw e}
    await unlink(path);return output({recovered:true})
  }
  if(command==='create')return output(await service.create(await input()))
  if(command==='get')return output(await service.store.get(id))
  if(command==='update')return output(await service.update(id,await input()))
  if(command==='add-image'){
    const path=resolve(args[2]||''),buffer=await readFile(path),ext=path.toLowerCase().split('.').pop(),mime=ext==='jpg'||ext==='jpeg'?'jpeg':ext==='webp'?'webp':'png'
    return output(await service.addImage(id,{dataUrl:`data:image/${mime};base64,${buffer.toString('base64')}`}))
  }
  if(command==='analyze')return output(await service.analyze(id))
  if(command==='candidates')return output(await service.candidates(id,args.includes('--sync')))
  if(command==='export'){const r=await service.export(id);return output({markdownPath:r.markdownPath,htmlPath:r.htmlPath})}
  if(command==='submit')return output(await service.submit(id))
  if(command==='reconcile')return output(await service.reconcile(id,await input()))
  throw new Error('未知命令，请运行 --help')
}
main().catch(e=>{console.error(JSON.stringify({error:e instanceof Error?e.message:'执行失败'}));process.exitCode=1})
