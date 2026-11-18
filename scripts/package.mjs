import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url)))
const root=fileURLToPath(new URL('../',import.meta.url))
await mkdir(join(root,'artifacts'),{recursive:true})
for(const [folder,name]of [['extension',`buglens-browser-extension-${pkg.version}.zip`],['skills',`zentao-buglens-skill-${pkg.version}.zip`]]){
 const result=spawnSync('python3',['-c','import os,sys,zipfile\nroot,out=sys.argv[1:]\nwith zipfile.ZipFile(out,"w",zipfile.ZIP_DEFLATED) as z:\n for d,_,fs in os.walk(root):\n  for f in sorted(fs):\n   p=os.path.join(d,f);z.write(p,os.path.relpath(p,root))',join(root,folder),join(root,'artifacts',name)],{stdio:'inherit'})
 if(result.status!==0)throw Error('打包失败')
}
const r=spawnSync('npm',['pack','--pack-destination','artifacts','--loglevel=error'],{cwd:root,stdio:'inherit'})
if(r.status!==0)throw Error('npm pack 失败')
const {readdir}=await import('node:fs/promises')
const files=(await readdir(join(root,'artifacts'))).filter(f=>f.endsWith('.zip')||f.endsWith('.tgz'))
const sums=[]
for(const name of files)sums.push(createHash('sha256').update(await readFile(join(root,'artifacts',name))).digest('hex')+'  '+name)
await writeFile(join(root,'artifacts','SHA256SUMS'),sums.join('\n')+'\n')
console.log('已生成 DSH/npm 安装包、独立 Skill 包及浏览器扩展包。')
