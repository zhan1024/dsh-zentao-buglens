# 禅图 BugLens 0.1.0 · 发布验证

验证日期：2026-11-18。本文件区分代码验证、公开发布和第三方目录收录；投稿成功不表示已经收录。

## 两个独立交付

- DSH 插件 / npm CLI：`dsh-zentao-buglens@0.1.0`。
- 独立 Agent Skill：`zentao-buglens`，源码位于 `skills/zentao-buglens`，Release 提供独立 ZIP。不要求安装 DSH。
- 配套浏览器扩展：Chrome/Edge Manifest V3，可下载 ZIP 后以开发者模式加载。本次未申请 Chrome Web Store / Edge Add-ons 审核。

仓库：<https://github.com/zhan1024/dsh-zentao-buglens>。

## 代码验证

- TypeScript 类型检查通过。
- 14 项单元与接口测试通过，包括实际官方 SDK 到本地 HTTP 禅道 fixture 的适配、分页与重名隔离、凭据文本脱敏、创建和上传超时恢复、附件关联核实、独立 Skill 安装及保留用户修改。
- 真实 Chromium 工作台及真实加载扩展测试：截图、圈选、AI 推荐问答、负责人选择、导出及模拟禅道提单；检查移动布局溢出和控制台错误。
- 真实 DSH 从打包产物安装，注册 10 个工具，确定性模型完成 `buglens_create` → `buglens_get`。
- Skill frontmatter 与资源结构校验；独立安装与独立 ZIP 内容核验。

工作台宣传截图来自本地模拟客户管理页面，不含真实业务数据。模型和禅道写入测试均为本地模拟服务，未向真实禅道创建演示 Bug。测试不证明模型诊断质量，也不证明某个私有禅道站点的字段、权限、历史和附件过滤规则已经兼容。

## 下载与复核

公开版本发布后，可在 npm 查询固定版本，并从 GitHub `v0.1.0` Release 下载同一份 npm tarball、Skill ZIP、扩展 ZIP 和 `SHA256SUMS`：

```sh
npm view dsh-zentao-buglens@0.1.0 version dist.integrity --registry=https://registry.npmjs.org/
gh release view v0.1.0 --repo zhan1024/dsh-zentao-buglens
```

DSH 安装、Skill 独立安装以及团队配置见仓库中文 README。开发、打包、发布、上传和下载全过程见 `DEVELOP-PUBLISH.md`。

第三方目录以各站公开页面、投稿 PR/Issue 和审核结果为准；未经验证不标记“已上架”。后续核验状态追加在本文件。

## 已执行的公开发布与投稿

截至北京时间 2026-11-18：

| 入口 | 已核验状态 | 链接 |
| --- | --- | --- |
| npm | `0.1.0` 发布成功；标准 tarball 地址已匿名下载并校验通过，空目录与空缓存 CLI、公开 npm 包的 DSH 安装均通过 | <https://www.npmjs.com/package/dsh-zentao-buglens> |
| GitHub Release | 已发布；tarball、独立 Skill ZIP、扩展 ZIP、SHA256SUMS 均已匿名下载并与本地逐字节比对 | <https://github.com/zhan1024/dsh-zentao-buglens/releases/tag/v0.1.0> |
| skills.sh | 独立 Skill 详情页已公开，可读到完整 Skill 和安装命令；通用 CLI 从公开 GitHub 安装成功 | <https://skills.sh/zhan1024/dsh-zentao-buglens/zentao-buglens> |
| DeepseekPlugin | 自动收录完成，公开详情展示本插件介绍与固定版本安装命令 | <https://deepseekplugin.org/plugins/submitted?slug=zhan1024-2f-dsh-2d-zentao-2d-buglens> |
| DSHMarket 目录源 | 已提交唯一 YAML 条目，真实上游 schema 校验通过；PR 为 OPEN，检查仍在运行，公开目录与安装索引暂未包含本插件 | <https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/16476> |
| dshplugin.io | 已通过其公开 Submit plugin 渠道新建投稿 Issue，等待维护者处理 | <https://github.com/tjsdyy/dshplugin/issues/53> |

DSHMarket 仓库创建满一天要求：仓库创建于 UTC 2026-11-18 04:00:40，即北京时间 2026-11-18 12:00:40。不早于北京时间 **2026-11-19 12:00:40** 达到时间门槛，达到时间也不等于已通过审核或完成镜像同步。不修改旧插件的投稿，不重复建 PR，不伪造仓库年龄。

DSHMarket 首页明确标注数据来自 awesome-dsh-plugin，CI 每日刷新，并说明市场安装索引为同一份 format 1 文档。本次核验 <https://awesome-dsh-plugin.com/plugins.json> 和 <https://dshmarket.com/index.json> 均返回 HTTP 200，均未找到 `dsh-zentao-buglens`。因此沿用上一个插件的「上游目录 PR → 审核合并 → 目录构建 → 镜像与安装索引同步 → 公开搜索及安装复验」流程，当前不能宣称已可在 DSHMarket 搜索下载。

dshplugin.io 投稿 Issue 为 OPEN，尚无维护者评论。本次命令行请求其首页返回 HTTP 403，不能用该请求证明站内搜索结果；目前已确认的是投稿成功，公开收录仍待核实。

GitHub 公开 CI 在 Ubuntu / Node.js 24 上通过：<https://github.com/zhan1024/dsh-zentao-buglens/actions/runs/44234717832>。公开 GitHub Release tarball 和公开 npm 包分别安装到空白 DSH profile，10 个工具及 create → get 实际调用通过。早期 npm CDN 404 缓存已过期，普通匿名下载恢复并核验，记录见本地 `artifacts/public-npm-verification.json`。

安装 Skill 到本机 `~/.agents/skills/zentao-buglens` 已成功，通用 Skills CLI 与项目自带安装器均验证过；独立 ZIP 内容与源码一致。本机现有其他 Skill、原 Frontend Replay 插件及 WeKnora 业务代码未作修改。

## 固定产物校验值

```text
c76ccfbccb3f89235146951a16841e5da48822cf0a416727ffebe3781bd5dabe  dsh-zentao-buglens-0.1.0.tgz
3a453df510a96cae7e5d4a9e2a50d39b274458035af6ff99eaaa2184b0089b85  zentao-buglens-skill-0.1.0.zip
673072f7b4fb5effc771c0f4b3e7966c316b89c336271c1443948a9526b38ea2  buglens-browser-extension-0.1.0.zip
```

npm `dist.integrity`：

```text
sha512-QroiGddxTe1kyC/TiZKGbxVivNPixng8g0Dj309H668Dbv3lqxRNGvuUf0V2hEdDJ4dNWPfF7zK4807MNDQreg==
```

后续仅追加发布核验文档，不移动 `v0.1.0` 标签、不替换固定 Release 附件。功能修订使用新版本。
