# 开发、打包、发布、投稿与下载

本项目交付两个入口：npm/DSH 插件 `dsh-zentao-buglens`，以及独立 Agent Skill `zentao-buglens`。浏览器扩展是配套取证组件。

## 核心开发

核心服务统一管理草稿、图片、识图调用、禅道身份与操作、材料导出和可恢复提单。CLI、Skill、DSH 和扩展均使用同一套规则。配置与凭据放在仓库外。界面逻辑采用原生 JavaScript，扩展采用 Manifest V3。

```sh
npm ci
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
DSH_BIN=/path/to/dsh npm run test:dsh
git diff --check
```

单元/接口测试使用本地确定性模型与禅道模拟服务器。浏览器测试运行真实 Chromium、加载真实扩展，通过浏览器扩展动作授予当前页权限后截图。DSH 测试安装实际 tarball，用本地流式模型调用已注册工具。模拟接口成功不等于已验证某个私有禅道站点。

## 两种安装包与配套扩展

```sh
npm run package:assets
```

生成 npm tarball、`zentao-buglens-skill-<版本>.zip`、`buglens-browser-extension-<版本>.zip` 和 SHA256SUMS。核查包内含 DSH patch、编译后的 CLI、工作台、Skill 和扩展；不含用户截图、配置、测试私有数据或凭据。

## npm 与 GitHub

代码验证后提交、创建固定版本标签，再上传同一份 tarball：

```sh
git add .
git diff --cached --check
git commit -m 'feat: release BugLens DSH plugin and independent skill'
# 首次发布时创建仓库，已有 origin 则跳过此行。
gh repo create zhan1024/dsh-zentao-buglens --public --source . --remote origin
git push -u origin main
git tag -a v0.1.0 -m '禅图 BugLens v0.1.0'
git push origin v0.1.0
npm run package:assets
npm publish artifacts/dsh-zentao-buglens-0.1.0.tgz --access public
gh release create v0.1.0 artifacts/*.tgz artifacts/*.zip artifacts/SHA256SUMS --verify-tag --title '禅图 BugLens v0.1.0' --notes-file docs/RELEASE-NOTES.md
```

如果登录过期，执行 `npm login --auth-type=web`，由账号本人在 npm 官方页面完成授权和安全验证。不得把 Key、密码或验证码写进项目或聊天。发布后匿名下载比对校验值，在空目录使用固定版本 CLI，并从公开 npm 包重新跑 DSH 安装测试。

Skill ZIP 可独立下载，也可通过固定 npm 包的 `install-skill` 命令安装到宿主 skills 目录；安装 Skill 不要求用户先安装 DSH。支持 GitHub 技能发现的平台可以索引本仓库 `skills/zentao-buglens/SKILL.md`，索引状态需另外核实。

Skills CLI 的 GitHub 安装命令为 `npx skills add zhan1024/dsh-zentao-buglens --skill zentao-buglens -a codex -g`。skills.sh 通过真实安装的匿名统计发现技能；不伪造安装量，不把安装成功当成排行榜已展示。

## 应用市场投稿

DSHMarket 的公开目录使用 `awesome-dsh-plugin/awesome-dsh-plugin` 投稿格式：新增唯一 YAML 条目，包含仓库、明确名称、类别、双语介绍、固定版本 Release tarball 及图标。先跑目录的 schema 校验，再提交 PR。仓库年龄、人工审核和镜像更新可能导致等待；PR 创建不等于公开收录。

dshplugin.io 使用其公开投稿渠道，DeepseekPlugin 使用其投稿页面。按各站实时规则提交，保持名称和固定版本一致。浏览器扩展 ZIP 不等于 Chrome Web Store/Edge Add-ons 正式上架；两个商店另需发布者账号和审核。

公开状态与证据在 `PUBLISHED-VERIFICATION.md` 中记录，区分已发布、已投稿、待审核和已公开收录。

## 用户下载

```sh
# DSH 插件
dsh plugin --profile web add dsh-zentao-buglens@0.1.0

# 独立 Skill
npx --yes dsh-zentao-buglens@0.1.0 install-skill

# 独立本机工作台
npx --yes dsh-zentao-buglens@0.1.0 open
```

固定版本、标签和校验值用于追溯，不移动已经公开的 Release 标签。后续更改使用新版本，更新现有市场条目，避免重复投稿。
