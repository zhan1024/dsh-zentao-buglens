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
