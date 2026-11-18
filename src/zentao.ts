import { ZentaoClient, request, getProfile } from 'zentao-api'
import { InputError, now, type Assignment, type Config, type Draft, type Member } from './model.js'
export interface BugRecord { id:number; title?:string; steps?:string; assignedTo?:any; openedBy?:any; files?:any; actions?:any[]; [key:string]:any }
export interface Gateway {
  identity:string; account:string; site:string;
  check():Promise<unknown>; products():Promise<any[]>; projects():Promise<any[]>; builds(project:number):Promise<any[]>; members(project:number):Promise<Member[]>;
  getBug(id:number):Promise<BugRecord>; listBugs(product:number,page?:number):Promise<{bugs:BugRecord[];total?:number}>;
  createBug(d:Draft,steps:string):Promise<number>; updateBody(id:number,steps:string):Promise<void>;
  upload(id:number,name:string,data:Buffer,mime:string):Promise<{id:number;url?:string}>;
  bugUrl(id:number):string;
}
export const accountOf=(v:any):string=>typeof v==='string'?v:typeof v?.account==='string'?v.account:''
function unwrap(v:any):any { if(v?.status==='fail'||v?.status==='failed'||v?.result==='fail')throw new Error('禅道拒绝请求：请检查字段、权限及服务版本'); return v?.bug ?? v?.data ?? v }
export async function connect(config:Config):Promise<Gateway> {
  const z=config.zentao
  let client:ZentaoClient,account=z.account || process.env.ZENTAO_ACCOUNT || ''
  const site=z.siteUrl || process.env.ZENTAO_URL
  if(site) {
    const token=process.env[z.tokenEnv || 'ZENTAO_TOKEN']
    const password=z.passwordEnv?process.env[z.passwordEnv]:undefined
    client=new ZentaoClient({baseUrl:site,token,timeout:30000})
    if(!token && password && account)await client.login(account,password)
    else if(!token)throw new InputError('请在本机配置禅道凭据，或使用 zentao login 登录；无需在聊天发送密码')
  } else {
    const profile=await getProfile(z.profile || undefined)
    if(!profile)throw new InputError('尚未登录禅道。请在自己的终端执行 zentao login，或配置站点与凭据环境变量')
    account=profile.account
    client=await ZentaoClient.fromProfile(profile.key,{activate:false})
  }
  if(!account)throw new InputError('缺少当前禅道账号；用于隔离本人指派历史')
  const origin=new URL(client.siteUrl)
  if(origin.protocol!=='https:' && !['localhost','127.0.0.1','[::1]'].includes(origin.hostname))throw new InputError('远程禅道必须使用 HTTPS')
  const call=async(name:string,params:Record<string,unknown>={})=>{
    const result:any=await request(name,params,{client,throwOnFail:true,autoFill:true})
    return unwrap(result)
  }
  let current:any
  try{current=unwrap(await client.get('/user'))}catch(e:any){if(e?.status!==404&&e?.details?.status!==404&&!(e?.message||'').includes('404'))throw e;current=unwrap(await client.get('/users/0'))}
  const authenticated=accountOf(current?.profile ?? current?.user ?? current)
  if(!authenticated||authenticated!==account)throw new InputError('禅道认证身份与所配置账号不匹配，请重新登录；已停止读取个人历史和写入')
  const list=async(name:string,params:Record<string,unknown>={}):Promise<any[]>=>{
    const all:any[]=[],seen=new Set<string>()
    for(let page=1;page<=100;page++){
      const result:any=await request(name,{...params,pageID:page,recPerPage:1000},{client,throwOnFail:true,autoFill:true})
      const value=unwrap(result),items=Array.isArray(value)?value:Object.values(value||{})
      const signature=JSON.stringify(items.map((u:any)=>u.id??u.account??u))
      if(items.length&&seen.has(signature))throw new InputError('禅道目录未正确分页，已停止使用不完整人员或产品列表')
      seen.add(signature);all.push(...items)
      const total=Number(result?.pager?.total)
      if(!items.length||(Number.isFinite(total)?all.length>=total:items.length<1000))return all
    }
    throw new InputError('禅道目录超过分页上限，请限制账号可访问范围后重试')
  }
  let directory:any[]|undefined
  const users=async():Promise<any[]>=>{
    if(directory)return directory
    directory=await list('user')
    return directory!
  }
  const resolveActor=(v:any,all:any[]):any=>{
    if(v&&typeof v==='object'&&v.account)return v
    const matches=all.filter(u=>u.account===v||u.realname===v)
    return matches.length===1?{account:matches[0].account}:undefined
  }
  const gateway:Gateway={
    site:client.siteUrl,account,identity:`${client.siteUrl}|${account}`,
    check:async()=>{const info=await client.getZentaoConfig({forceRefresh:true});return {version:info.version}},
    products:async()=>await list('product'),
    projects:async()=>await list('project',{browseType:'all'}),
    builds:async(project)=>await list('build',{project}),
    members:async(project)=>{
      const items=project?await list('project/team',{projectID:project}):await users()
      return items.filter((u:any)=>accountOf(u)&&u.deleted!==true&&u.deleted!=='1'&&u.deleted!==1&&u.status!=='closed'&&u.status!=='forbidden').map((u:any)=>({account:accountOf(u),name:u.realname || u.name || accountOf(u),active:true}))
    },
    getBug:async(id)=>{
      const bug=unwrap(await client.get(`/bugs/${id}`))
      if(Array.isArray(bug.actions)){
        const all=await users().catch(()=>[])
        bug.actions=bug.actions.map((a:any)=>({...a,actor:resolveActor(a.actor,all),extra:a.action==='assigned'?resolveActor(a.extra,all):a.extra}))
      }
      return bug
    },
    listBugs:async(product,page=1)=>{
      const raw:any=await request('bug',{product,pageID:page,recPerPage:100,orderBy:'id_desc'},{client,raw:true,throwOnFail:true})
      const val=unwrap(raw)
      return {bugs:Array.isArray(val)?val:val.bugs || [],total:val.pager?.recTotal || val.total}
    },
    createBug:async(d,steps)=>{
      const bug:any=await call('bug/create',{productID:d.product,title:d.analysis?.title || d.description,openedBuild:d.openedBuild,project:d.project||undefined,assignedTo:d.assignedTo,severity:d.analysis?.severity || 3,pri:d.analysis?.priority || 3,type:'codeerror',steps})
      if(!Number.isSafeInteger(Number(bug?.id))||Number(bug.id)<=0)throw new Error('创建返回缺少 Bug 编号，需先核实结果')
      return Number(bug.id)
    },
    updateBody:async(id,steps)=>{await call('bug/update',{bugID:id,steps})},
    upload:async(id,name,data,mime)=>{
      const file:any=await call('file/create',{objectType:'bug',objectID:id,file:{data,filename:name,contentType:mime}})
      if(!Number(file?.id))throw new Error('上传返回缺少附件编号')
      let url=file.url?new URL(file.url,client.siteUrl+'/'):undefined
      if(url && url.origin!==new URL(client.siteUrl).origin)url=undefined
      return {id:Number(file.id),url:url?.toString()}
    },
    bugUrl:id=>`${client.siteUrl}/bug-view-${id}.html`,
  }
  return gateway
}
export function assignmentsFromBug(bug:BugRecord,actor:string,product:number):Assignment[] {
  const output:Assignment[]=[]
  for(const a of bug.actions || []) {
    if(accountOf(a.actor)!==actor)continue
    const at=String(a.date || a.time || '')
    if(!Number.isFinite(Date.parse(at)))continue
    const changes=Array.isArray(a.history)?a.history:Array.isArray(a.histories)?a.histories:[]
    for(const h of changes) {
      if(String(h.field).toLowerCase()!=='assignedto')continue
      const target=accountOf(h.new ?? h.newValue)
      if(target&&target!=='closed')output.push({account:target,at:new Date(at).toISOString(),bugId:bug.id,product,source:'zentao',actor})
    }
    // Creation is only attributable when the original assignment is explicitly in the action history.
    if(a.action==='assigned' && accountOf(a.extra) && !changes.length) {
      output.push({account:accountOf(a.extra),at:new Date(at).toISOString(),bugId:bug.id,product,source:'zentao',actor})
    }
  }
  return output
}
