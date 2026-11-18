import { mkdir, readFile, readdir, rename, writeFile, open, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { hash, InputError, uid, type Draft, type Assignment } from './model.js'
export class Store {
  constructor(readonly root: string) {}
  async init(): Promise<void> { for (const p of ['', 'drafts', 'images', 'exports', 'history']) await mkdir(join(this.root,p),{recursive:true,mode:0o700}) }
  id(id: string): string { if (!/^[\da-f-]{36}$/.test(id)) throw new InputError('草稿编号无效'); return id }
  async json<T>(path: string): Promise<T> { return JSON.parse(await readFile(path,'utf8')) as T }
  async atomic(path: string, value: unknown): Promise<void> {
    const temp = `${path}.${uid()}.tmp`
    await writeFile(temp,JSON.stringify(value,null,2),{mode:0o600}); await rename(temp,path)
  }
  async get(id:string): Promise<Draft> { return this.json(join(this.root,'drafts',`${this.id(id)}.json`)) }
  async save(draft:Draft): Promise<Draft> { await this.atomic(join(this.root,'drafts',`${this.id(draft.id)}.json`),draft); return draft }
  async list(): Promise<Pick<Draft,'id'|'description'|'updatedAt'|'submission'>[]> {
    const names=await readdir(join(this.root,'drafts'))
    const items=await Promise.all(names.filter(n=>n.endsWith('.json')).map(n=>this.json<Draft>(join(this.root,'drafts',n))))
    return items.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,100).map(({id,description,updatedAt,submission})=>({id,description,updatedAt,submission}))
  }
  image(id:string):string { return join(this.root,'images',`${this.id(id)}.png`) }
  async history(identity:string):Promise<Assignment[]> { try { return await this.json(join(this.root,'history',hash(identity)+'.json')) } catch(e:any) { if(e.code==='ENOENT')return [];throw e } }
  async saveHistory(identity:string,values:Assignment[]):Promise<void> {
    const merged=[...await this.history(identity),...values]
    const unique=[...new Map(merged.map(x=>[`${x.bugId}:${x.at}:${x.account}:${x.actor}`,x])).values()]
    await this.atomic(join(this.root,'history',hash(identity)+'.json'),unique.sort((a,b)=>b.at.localeCompare(a.at)).slice(0,5000))
  }
  async lock<T>(id:string,fn:()=>Promise<T>):Promise<T> {
    const path=join(this.root,'drafts',`${this.id(id)}.lock`)
    let handle
    try { handle=await open(path,'wx',0o600);await handle.writeFile(String(process.pid)) } catch(e:any) { if(e.code==='EEXIST')throw new InputError('该草稿正在处理中；若上次进程意外退出，请确认它已结束后运行 recover-lock');throw e }
    try { return await fn() } finally { await handle.close();await unlink(path) }
  }
}
