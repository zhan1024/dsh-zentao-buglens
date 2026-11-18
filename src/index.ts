import { loadConfig } from './config.js'
import { Service } from './service.js'
import { startDashboard, type Dashboard } from './server.js'
import { object, str } from './model.js'
export { Service, startDashboard, loadConfig }
export type { Config, Draft, Analysis, PageEvidence, Assignment, Member } from './model.js'
export const name='dsh-zentao-buglens'
export const inject=['tools'] as const
interface Context { tools:{register(t:any):unknown};effect(fn:()=>()=>Promise<void>):unknown;logger?:{info(s:string):void} }
export function createTools(service:Service,open:()=>Promise<Dashboard>):any[]{
  const text={type:'string'}
  const tool=(suffix:string,description:string,properties:Record<string,unknown>,required:string[],fn:(v:Record<string,any>)=>Promise<unknown>)=>({
    name:`buglens_${suffix}`,description,parameters:{type:'object',properties,required,additionalProperties:false},timeoutMs:180000,
    output:{schema:{type:'object',additionalProperties:true},render:(_a:unknown,v:unknown)=>[{type:'text',text:JSON.stringify(v,null,2).slice(0,30000)}]},
    execute:async(v:unknown,exec:{signal:AbortSignal})=>{exec.signal.throwIfAborted();return fn(object(v))},
  })
  return [
    tool('open','打开禅图 BugLens 测试工作台。返回完整地址供用户粘贴截图、圈选、回答推荐问题并选择最近指派的开发同事。勿在公开渠道分享令牌地址。',{},[],async()=>({url:(await open()).url})),
    tool('create','创建测试故障草稿。后续通过工作台或 add_image 添加截图；不代表已创建禅道 Bug。',{description:text},[],async v=>({draft:await service.create(v)})),
    tool('get','查看草稿、分析、推荐问题及真实提交状态。',{draft_id:text},['draft_id'],async v=>({draft:await service.store.get(str(v.draft_id,'草稿编号'))})),
    tool('update','更新草稿内容或推荐问题答案。data_json 为 JSON 对象，可含 description、analysis、answers、product、project、openedBuild、assignedTo、collaborators。不得编造接口或根因。',{draft_id:text,data_json:text},['draft_id','data_json'],async v=>({draft:await service.update(v.draft_id,JSON.parse(v.data_json))})),
    tool('add_image','将用户提供的截图 data URL 加入草稿。推荐在工作台粘贴截图，避免在对话中传送大图。',{draft_id:text,data_url:text,note:text},['draft_id','data_url'],async v=>({draft:await service.addImage(v.draft_id,{dataUrl:v.data_url,note:v.note})})),
    tool('analyze','调用团队识图模型分析截图和页面证据，生成材料及推荐问题。先让测试同事回答关键预期，证据不足归属待定位。',{draft_id:text},['draft_id'],async v=>({draft:await service.analyze(v.draft_id)})),
    tool('candidates','推荐本人最近指派的开发同事，区分禅道操作历史、本工具成功记录与团队默认人员。sync=true 扫描当前产品的历史；结果含覆盖范围。',{draft_id:text,sync:{type:'boolean'}},['draft_id'],async v=>({candidates:await service.candidates(v.draft_id,v.sync===true)})),
    tool('export','导出 Markdown 与含原图和红框的离线 HTML 故障材料。',{draft_id:text},['draft_id'],async v=>{const r=await service.export(v.draft_id);return {markdown:r.markdown,markdownPath:r.markdownPath,htmlPath:r.htmlPath}}),
    tool('submit','仅在测试同事已要求提交且已选择负责人、产品、影响版本后，创建真实禅道 Bug、指派并上传截图及材料。重试只续传；uncertain 先核实，不重复创建。',{draft_id:text},['draft_id'],async v=>({draft:await service.submit(v.draft_id)})),
    tool('reconcile','核实不确定提交。仅提供已查实且材料编号匹配的 bug_id；retry_upload_key 只能在已确认该附件未上传时使用。',{draft_id:text,bug_id:{type:'integer'},retry_upload_key:text},['draft_id','bug_id'],async v=>({draft:await service.reconcile(v.draft_id,{bugId:v.bug_id,retryUploadKey:v.retry_upload_key})})),
  ]
}
export async function apply(ctx:Context,options:{configPath?:string}={}):Promise<void>{
  const service=new Service(await loadConfig(options.configPath));await service.init()
  let dashboard:Promise<Dashboard>|undefined
  const open=()=>dashboard??=startDashboard(service).catch(e=>{dashboard=undefined;throw e})
  ctx.effect(()=>async()=>{if(dashboard)await(await dashboard).close()})
  for(const tool of createTools(service,open))ctx.tools.register(tool)
  ctx.logger?.info('禅图 BugLens 就绪，调用 buglens_open 打开截图提单工作台。')
}
