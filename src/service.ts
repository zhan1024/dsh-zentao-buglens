import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import { analyze } from './ai.js'
import { Store } from './store.js'
import { html, markdown } from './report.js'
import { accountOf, assignmentsFromBug, connect, type Gateway, type BugRecord } from './zentao.js'
import { uid, now, object, str, positive, strings, redact, validatePage, normalizeAnalysis, InputError, type Config, type Draft, type ImageEvidence, type Region, type Assignment } from './model.js'

export class Service {
  readonly store:Store
  private gateway?:Promise<Gateway>
  constructor(readonly config:Config, gateway?:Gateway) { this.store=new Store(config.dataDir);if(gateway)this.gateway=Promise.resolve(gateway) }
  async init():Promise<void>{await this.store.init()}
  async zentao():Promise<Gateway>{ return this.gateway ??=connect(this.config).catch(e=>{this.gateway=undefined;throw e}) }
  async status():Promise<unknown>{
    let identity,connected=false,version,error
    try{const z=await this.zentao();version=await z.check();identity=z.identity;connected=true}catch(e){error=this.error(e)}
    return {aiConfigured:!!this.config.ai&&!!process.env[this.config.ai.apiKeyEnv],zentao:{connected,identity,version,error},defaults:this.config.defaults}
  }
  error(e:unknown):string {
    let text=e instanceof Error?e.message:String(e)
    // Never echo provider credentials or SDK request bodies into UI/logs.
    for(const key of [this.config.ai?.apiKeyEnv,this.config.zentao.tokenEnv,this.config.zentao.passwordEnv,'ZENTAO_TOKEN','ZENTAO_PASSWORD']) {
      const secret=key?process.env[key]:undefined;if(secret)text=text.split(secret).join('[REDACTED]')
    }
    return redact(text).slice(0,800)
  }
  async create(input:unknown):Promise<Draft>{
    const v=object(input),t=now()
    const d:Draft={id:uid(),revision:1,createdAt:t,updatedAt:t,description:redact(str(v.description ?? '','问题描述')),images:[],answers:{},product:this.config.defaults.product,project:this.config.defaults.project,openedBuild:[...this.config.defaults.openedBuild],assignedTo:'',collaborators:[]}
    if(v.page)d.page=validatePage(v.page)
    return this.store.save(d)
  }
  async update(id:string,input:unknown):Promise<Draft>{
    return this.store.lock(id,async()=>{
      const d=await this.store.get(id),v=object(input)
      if(d.submission)throw new InputError('已开始提交的草稿已冻结；请完成补传或新建草稿')
      if(v.description!==undefined)d.description=redact(str(v.description,'问题描述'))
      if(v.product!==undefined)d.product=positive(v.product,'产品')
      if(v.project!==undefined)d.project=positive(v.project,'项目',true)
      if(v.openedBuild!==undefined){d.openedBuild=strings(v.openedBuild,20);if(!d.openedBuild.length||d.openedBuild.some(x=>!x.trim()))throw new InputError('至少选择一个影响版本')}
      if(v.assignedTo!==undefined)d.assignedTo=str(v.assignedTo,'负责人',100)
      if(v.collaborators!==undefined)d.collaborators=strings(v.collaborators,20)
      if(v.page)d.page=validatePage(v.page)
      if(v.analysis)d.analysis=normalizeAnalysis(v.analysis)
      if(v.answers) {
        for(const [key,value] of Object.entries(object(v.answers))) {
          const answer=redact(str(value,'答案'))
          d.answers[key]=answer
          const q=d.analysis?.questions.find(q=>q.id===key)
          if(q&&d.analysis) {
            if(q.field==='ownership') {
              const map:Record<string,string>={'前端':'frontend','后端':'backend','前后端共同':'both','待定位':'unknown'}
              const ownership=map[answer]||answer
              if(['frontend','backend','both','unknown'].includes(ownership))d.analysis.ownership=ownership as any
            } else if(q.field==='steps')d.analysis.steps=answer.split('\n').filter(Boolean)
            else { (d.analysis as any)[q.field]=answer;if(q.field==='expected')d.analysis.expectedSource='user' }
          }
        }
      }
      if(v.imageOrder) {
        const ids=strings(v.imageOrder,8)
        if(ids.length!==d.images.length||new Set(ids).size!==ids.length||ids.some(x=>!d.images.some(i=>i.id===x)))throw new InputError('图片排序必须包含全部图片且不重复')
        d.images=ids.map(id=>d.images.find(x=>x.id===id)!)
      }
      if(v.image) {
        const im=d.images.find(x=>x.id===v.image.id);if(!im)throw new InputError('未找到图片')
        if(v.image.note!==undefined)im.note=redact(str(v.image.note,'图片说明',1000))
        if(v.image.regions!==undefined)im.regions=this.regions(v.image.regions,im)
      }
      d.revision++;d.updatedAt=now();return this.store.save(d)
    })
  }
  regions(value:unknown,img:ImageEvidence):Region[]{
    if(!Array.isArray(value)||value.length>8)throw new InputError('选区数量不能超过8')
    return value.map(r=>{
      const b={x:positive(r.x,'x',true),y:positive(r.y,'y',true),width:positive(r.width,'宽度'),height:positive(r.height,'高度')}
      if(b.x+b.width>img.width||b.y+b.height>img.height)throw new InputError('选区超出图片边界')
      return b
    })
  }
  async addImage(id:string,input:unknown):Promise<Draft>{
    return this.store.lock(id,async()=>{
      const d=await this.store.get(id),v=object(input)
      if(d.submission)throw new InputError('提交中的草稿不能修改图片')
      if(d.images.length>=8)throw new InputError('每份草稿最多8张图片')
      const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(str(v.dataUrl,'图片',16000000))
      if(!match)throw new InputError('请粘贴 PNG、JPEG 或 WebP 图片')
      const bytes=Buffer.from(match[2]!,'base64')
      if(bytes.length>10*1024*1024)throw new InputError('单张图片不能超过10MB')
      const image=sharp(bytes,{limitInputPixels:30000000}).rotate()
      const buffer=await image.png().toBuffer(),meta=await sharp(buffer).metadata()
      const im:ImageEvidence={id:uid(),filename:'',mime:'image/png',width:meta.width!,height:meta.height!,note:redact(str(v.note??'','说明',1000)),regions:[],at:now()}
      im.filename=`buglens-${im.id}.png`;if(v.regions)im.regions=this.regions(v.regions,im)
      await writeFile(this.store.image(im.id),buffer,{mode:0o600});d.images.push(im);d.revision++;d.updatedAt=now()
      return this.store.save(d)
    })
  }
  async removeImage(id:string,imageId:string):Promise<Draft>{
    return this.store.lock(id,async()=>{const d=await this.store.get(id);if(d.submission)throw new InputError('草稿已冻结');d.images=d.images.filter(x=>x.id!==imageId);d.revision++;return this.store.save(d)})
  }
  async analyze(id:string):Promise<Draft>{
    return this.store.lock(id,async()=>{
      const d=await this.store.get(id)
      if(d.submission)throw new InputError('已提交草稿不能重新分析')
      if(!d.images.length&&!d.description.trim())throw new InputError('请先粘贴截图或填写问题描述')
      const analysis=await analyze(d,this.config,this.store)
      d.analysis=analysis;d.answers={};d.revision++;d.updatedAt=now();return this.store.save(d)
    })
  }
  async candidates(id:string,sync=false):Promise<unknown>{
    const d=await this.store.get(id),z=await this.zentao()
    const members=await z.members(d.project)
    const team=new Map(this.config.team.map(m=>[m.account,m]))
    const allowed=members.filter(m=>m.active!==false&&team.get(m.account)?.active!==false&&(!team.get(m.account)?.products?.length||team.get(m.account)!.products!.includes(d.product))).map(m=>({...m,...team.get(m.account),active:true}))
    let coverage:any={synced:false,scanned:0,scope:`当前产品 ${d.product}；最近 ${this.config.historyDays} 天`,complete:false}
    if(sync&&d.product) {
      const cutoff=Date.now()-this.config.historyDays*86400000
      const collected:Assignment[]=[];let scanned=0,page=1,hasActions=false,complete=false
      try {
        while(scanned<this.config.historyScanLimit) {
          const list=await z.listBugs(d.product,page++)
          for(const item of list.bugs) {
            if(scanned>=this.config.historyScanLimit)break
            const bug=await z.getBug(item.id);scanned++;hasActions ||=Array.isArray(bug.actions)
            collected.push(...assignmentsFromBug(bug,z.account,d.product).filter(a=>Date.parse(a.at)>=cutoff))
          }
          if(list.bugs.length<100||(list.total!==undefined&&scanned>=list.total)){complete=true;break}
        }
        await this.store.saveHistory(z.identity,collected)
        coverage={...coverage,synced:true,scanned,complete,historyAvailable:hasActions,message:hasActions?'按可访问 Bug 的真实操作历史同步；显示扫描范围':'此站点未返回可核验的操作历史；使用本工具成功指派记录及团队预设'}
      } catch(e) { coverage={...coverage,scanned,error:this.error(e)} }
    }
    const cutoff=Date.now()-this.config.historyDays*86400000
    const history=(await this.store.history(z.identity)).filter(a=>a.product===d.product&&a.actor===z.account&&Date.parse(a.at)>=cutoff)
    const recent=allowed.map(m=>{const events=history.filter(a=>a.account===m.account).sort((a,b)=>b.at.localeCompare(a.at));return {...m,lastAssignedAt:events[0]?.at,count:events.length,source:events[0]?.source,bugId:events[0]?.bugId}}).filter(m=>m.lastAssignedAt).sort((a,b)=>b.lastAssignedAt!.localeCompare(a.lastAssignedAt!)).slice(0,10)
    return {identity:z.identity,recent,team:allowed,coverage}
  }
  async export(id:string):Promise<{markdown:string;html:string;markdownPath:string;htmlPath:string}>{
    const d=await this.store.get(id),md=markdown(d),page=await html(d,this.store)
    const markdownPath=join(this.store.root,'exports',`${d.id}.md`),htmlPath=join(this.store.root,'exports',`${d.id}.html`)
    await writeFile(markdownPath,md,{mode:0o600});await writeFile(htmlPath,page,{mode:0o600})
    return {markdown:md,html:page,markdownPath,htmlPath}
  }
  async findCreated(d:Draft,z:Gateway):Promise<BugRecord|undefined>{
    const found:BugRecord[]=[]
    // No title-only match: require our immutable draft marker and the current creator.
    for(let p=1;p<=10;p++) {
      const {bugs}=await z.listBugs(d.product,p)
      for(const row of bugs) {
        if(accountOf(row.openedBy)&&accountOf(row.openedBy)!==z.account)continue
        const bug=await z.getBug(row.id)
        if(accountOf(bug.openedBy)===z.account&&String(bug.steps||'').includes(`BugLens-ID: ${d.id}`))found.push(bug)
      }
      if(bugs.length<100)break
    }
    if(found.length>1)throw new Error('发现多个相同材料编号的 Bug，需人工核实，已停止自动操作')
    return found[0]
  }
  async submit(id:string):Promise<Draft>{
    return this.store.lock(id,async()=>{
      const d=await this.store.get(id),z=await this.zentao()
      if(d.identity&&d.identity!==z.identity)throw new InputError('草稿绑定的禅道身份已变化，请切回原账号继续')
      if(!d.analysis?.title||!d.analysis.actual||!d.analysis.expected)throw new InputError('请先生成并补全标题、实际结果和预期结果')
      if(!d.product||!d.openedBuild.length||!d.assignedTo)throw new InputError('请选择产品、影响版本和负责人')
      const members=await z.members(d.project)
      for(const account of [d.assignedTo,...d.collaborators])if(!members.some(m=>m.account===account&&m.active!==false))throw new InputError(`所选成员 ${account} 已失效或不在可访问团队中`)
      if(d.submission?.status==='done')return d
      d.identity=z.identity
      if(!d.submission) {
        d.submission={marker:`BugLens-ID: ${d.id}`,status:'creating',snapshotRevision:d.revision,uploads:[]}
        await this.store.save(d)
      } else if(!d.submission.bugId) {
        const existing=await this.findCreated(d,z)
        if(!existing){d.submission.status='uncertain';d.submission.error='创建结果仍无法确认；已停止重复创建，请在禅道搜索材料编号并通过 reconcile 提供确认后的 Bug 编号';return this.store.save(d)}
        d.submission.bugId=existing.id
      }
      const s=d.submission
      if(!s.bugId) {
        try{s.bugId=await z.createBug(d,await html(d,this.store,{}));s.url=z.bugUrl(s.bugId);await this.store.save(d)}
        catch(e){s.status='uncertain';s.error=this.error(e);await this.store.save(d);return d}
      }
      const bug=await z.getBug(s.bugId)
      if(accountOf(bug.assignedTo)!==d.assignedTo||!String(bug.steps||'').includes(s.marker))throw new Error('禅道详情未匹配负责人或材料编号；已停止补传，请核实')
      s.url=z.bugUrl(s.bugId);s.status='uploading';s.error=undefined
      if(!s.assignedAt){s.assignedAt=now();await this.store.save(d)}
      await this.store.saveHistory(z.identity,[{account:d.assignedTo,actor:z.account,product:d.product,bugId:s.bugId,at:s.assignedAt,source:'plugin'}])
      const remote:Record<string,string>={}
      const sameSite=(value:string|undefined):string|undefined=>{try{const u=new URL(value!,z.site+'/');return value&&u.origin===new URL(z.site).origin?u.toString():undefined}catch{return undefined}}
      const files=Array.isArray(bug.files)?bug.files:Object.values(bug.files||{})
      const attach=async(key:string,filename:string,data:Buffer,mime:string)=>{
        let state=s.uploads.find(u=>u.key===key)
        if(!state){state={key,filename,status:'pending'};s.uploads.push(state)}
        if(state.status==='uploading'||state.status==='uncertain') {
          const existing:any=files.find((f:any)=>f.title===filename||f.name===filename||f.fileName===filename)
          if(existing?.id){state.fileId=Number(existing.id);state.url=sameSite(existing.url);state.status='done'}
          else{state.status='uncertain';state.error='上次上传结果未知；未重复上传，请核实附件或使用 reconcile';await this.store.save(d);return state}
        }
        if(state.status==='done'){state.url=sameSite(state.url);return state}
        state.status='uploading';state.error=undefined;await this.store.save(d)
        try{const file=await z.upload(s.bugId!,filename,data,mime);state.fileId=file.id;state.url=sameSite(file.url);state.status='done'}
        catch(e){state.status='uncertain';state.error=this.error(e)}
        await this.store.save(d);return state
      }
      for(const im of d.images) {
        const bytes=await readFile(this.store.image(im.id))
        const result=await attach(im.id,im.filename,bytes,'image/png')
        if(result.url)remote[im.id]=result.url
        if(im.regions.length) {
          const rects=im.regions.map(r=>`<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" fill="none" stroke="#ed263b" stroke-width="4"/>`).join('')
          const marked=await sharp(bytes).composite([{input:Buffer.from(`<svg width="${im.width}" height="${im.height}">${rects}</svg>`)}]).png().toBuffer()
          const annotation=await attach(im.id+'-marked',im.filename.replace('.png','-marked.png'),marked,'image/png')
          if(annotation.url)remote[im.id]=annotation.url
        }
      }
      await attach('material-md',`buglens-${d.id}.md`,Buffer.from(markdown(d)),'text/markdown')
      await attach('material-html',`buglens-${d.id}.html`,Buffer.from(await html(d,this.store)),'text/html')
      try {
        const body=await html(d,this.store,remote)
        await z.updateBody(s.bugId,body)
        const verified=await z.getBug(s.bugId)
        const attachments=Array.isArray(verified.files)?verified.files:Object.values(verified.files||{})
        s.attachmentsVerified=s.uploads.every(u=>u.fileId&&attachments.some((f:any)=>Number(f.id)===u.fileId))
        s.bodyVerified=accountOf(verified.assignedTo)===d.assignedTo&&String(verified.steps||'').includes(s.marker)&&Object.values(remote).every(url=>String(verified.steps).includes(url.replace(/&/g,'&amp;'))||String(verified.steps).includes(url))
        if(!s.bodyVerified)throw new Error('正文回读未通过，请检查禅道富文本过滤规则')
        if(!s.attachmentsVerified)throw new Error('部分附件未在 Bug 详情中核实关联；已保存上传结果，请检查文件接口权限后继续核实')
      }catch(e){s.bodyVerified=false;s.error=this.error(e)}
      const missingInline=d.images.some(im=>!remote[im.id])
      s.status=s.uploads.every(u=>u.status==='done')&&s.bodyVerified&&s.attachmentsVerified&&!missingInline?'done':'partial'
      if(missingInline&&!s.error)s.error='部分附件未返回可验证的同站点图片地址，正文嵌图尚未完成；请检查禅道文件接口'
      d.updatedAt=now();return this.store.save(d)
    })
  }
  async reconcile(id:string,input:unknown):Promise<Draft>{
    return this.store.lock(id,async()=>{
      const d=await this.store.get(id),v=object(input),z=await this.zentao()
      if(!d.submission||d.identity!==z.identity)throw new InputError('没有此账号待核实的提交')
      const bugId=positive(v.bugId || d.submission.bugId,'Bug编号'),bug=await z.getBug(bugId)
      if(!String(bug.steps||'').includes(d.submission.marker)||accountOf(bug.openedBy)!==z.account)throw new InputError('Bug材料编号或创建人不匹配')
      d.submission.bugId=bugId
      if(v.retryUploadKey) {
        const state=d.submission.uploads.find(x=>x.key===v.retryUploadKey)
        if(!state||state.status!=='uncertain')throw new InputError('该附件不处于待核实状态')
        state.status='pending';state.error=undefined
      }
      return this.store.save(d)
    })
  }
}
