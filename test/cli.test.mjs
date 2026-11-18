import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

test('独立 CLI 安装 Skill 无需 DSH，保留已存在技能和用户修改',async()=>{
 const target=await mkdtemp(join(tmpdir(),'buglens-skill-install-'))
 try{
  const cli=resolve('dist/cli.js'),run=promisify(execFile)
  const {stdout}=await run(process.execPath,[cli,'install-skill','--target',target],{cwd:tmpdir()})
  assert.equal(JSON.parse(stdout).installed,true)
  const installed=join(target,'zentao-buglens','SKILL.md')
  assert.equal(await readFile(installed,'utf8'),await readFile('skills/zentao-buglens/SKILL.md','utf8'))
  await writeFile(installed,'用户自定义内容')
  await assert.rejects(run(process.execPath,[cli,'install-skill','--target',target]),/已存在/)
  assert.equal(await readFile(installed,'utf8'),'用户自定义内容')
 }finally{await rm(target,{recursive:true,force:true})}
})
