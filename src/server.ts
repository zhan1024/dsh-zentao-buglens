import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { readFile, writeFile, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { InputError, object, positive } from './model.js'
import type { Service } from './service.js'

export interface Dashboard { url:string; origin:string; token:string; close():Promise<void> }
const ui=fileURLToPath(new URL('../ui/',import.meta.url))
function send(res:ServerResponse,status:number,value:unknown,type='application/json; charset=utf-8'):void {res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value))}
async function body(req:IncomingMessage):Promise<any>{
  const chunks:Buffer[]=[];let length=0
  for await(const chunk of req){length+=chunk.length;if(length>18*1024*1024)throw new InputError('请求体过大');chunks.push(chunk)}
  return object(JSON.parse(Buffer.concat(chunks).toString()||'{}'))
}
export async function startDashboard(service:Service,port=service.config.port):Promise<Dashboard>{
  const token=randomBytes(32).toString('hex');let origin=''
  const server=createServer((req,res)=>{void(async()=>{
    if(req.headers.host!==new URL(origin).host)return send(res,403,{error:'Host 无效'})
    const requestOrigin=req.headers.origin
    const allowed=!requestOrigin||requestOrigin===origin||/^chrome-extension:\/\/[a-p]{32}$/.test(requestOrigin)
    if(!allowed)return send(res,403,{error:'来源无效'})
    if(requestOrigin?.startsWith('chrome-extension://')){
      res.setHeader('Access-Control-Allow-Origin',requestOrigin);res.setHeader('Vary','Origin')
      res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');res.setHeader('Access-Control-Allow-Methods','GET, POST, PATCH, DELETE, OPTIONS')
    }
    if(req.method==='OPTIONS'){res.writeHead(204);return res.end()}
    const url=new URL(req.url||'/',origin),path=url.pathname
    if(path.startsWith('/api/')){
      const actual=Buffer.from((req.headers.authorization||'').replace(/^Bearer /,'')),expected=Buffer.from(token)
      if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return send(res,401,{error:'请使用完整工作台地址配对（含 #token=），不要分享此地址'})
      if(path==='/api/status'&&req.method==='GET')return send(res,200,await service.status())
      if(path==='/api/catalog'&&req.method==='GET'){
        const z=await service.zentao(),kind=url.searchParams.get('kind'),project=Number(url.searchParams.get('project')||0)
        if(kind==='products')return send(res,200,await z.products())
        if(kind==='projects')return send(res,200,await z.projects())
        if(kind==='builds')return send(res,200,await z.builds(positive(project,'项目')))
        throw new InputError('未知目录类型')
      }
      if(path==='/api/drafts'&&req.method==='GET')return send(res,200,await service.store.list())
      if(path==='/api/drafts'&&req.method==='POST')return send(res,201,await service.create(await body(req)))
      const match=/^\/api\/drafts\/([\da-f-]{36})(?:\/(.*))?$/.exec(path)
      if(match){
        const id=match[1]!,action=match[2]
        if(!action&&req.method==='GET')return send(res,200,await service.store.get(id))
        if(!action&&req.method==='PATCH')return send(res,200,await service.update(id,await body(req)))
        if(action==='images'&&req.method==='POST')return send(res,200,await service.addImage(id,await body(req)))
        if(action?.startsWith('images/')&&req.method==='DELETE')return send(res,200,await service.removeImage(id,action.slice(7)))
        if(action==='analyze'&&req.method==='POST')return send(res,200,await service.analyze(id))
        if(action==='candidates'&&req.method==='GET')return send(res,200,await service.candidates(id,url.searchParams.get('sync')==='1'))
        if(action==='export'&&req.method==='GET')return send(res,200,await service.export(id))
        if(action==='submit'&&req.method==='POST')return send(res,200,await service.submit(id))
        if(action==='reconcile'&&req.method==='POST')return send(res,200,await service.reconcile(id,await body(req)))
        if(action?.startsWith('image/')&&req.method==='GET'){
          const d=await service.store.get(id),im=d.images.find(x=>x.id===action.slice(6))
          if(!im)throw new InputError('没有该图片')
          return send(res,200,await readFile(service.store.image(im.id)),'image/png')
        }
      }
      return send(res,404,{error:'接口不存在'})
    }
    const staticFiles:Record<string,string>={'/':'index.html','/app.js':'app.js','/style.css':'style.css'}
    if(req.method!=='GET'||!staticFiles[path])return send(res,404,'Not found','text/plain')
    res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'")
    return send(res,200,await readFile(join(ui,staticFiles[path]!)),path.endsWith('.js')?'text/javascript; charset=utf-8':path.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8')
  })().catch(e=>send(res,e instanceof InputError?400:(e as any)?.code==='ENOENT'?404:500,{error:service.error(e)}))})
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve)})
  const address=server.address();if(!address||typeof address==='string')throw new Error('无法绑定工作台')
  origin=`http://127.0.0.1:${address.port}`
  const url=`${origin}/#token=${token}`
  await writeFile(join(service.store.root,'runtime.json'),JSON.stringify({origin,token,url,pid:process.pid}),{mode:0o600})
  return {url,origin,token,close:async()=>{server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));await rm(join(service.store.root,'runtime.json'),{force:true})}}
}
