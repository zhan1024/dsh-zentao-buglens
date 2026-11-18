# 团队配置与禅道接入

管理员复制 `config.example.json` 到包目录外的私有位置。将 `BUGLENS_CONFIG` 设置为其绝对路径，再启动工作台或 DSH。配置中只存凭据的环境变量名，不存真实 Key。

```sh
export BUGLENS_CONFIG=/absolute/path/config.local.json
# 使用系统环境/凭据注入工具设置 BUGLENS_AI_KEY；不要放入仓库。
dsh-zentao-buglens open
```

Windows PowerShell 使用 `$env:BUGLENS_CONFIG = 'C:\Users\you\config.local.json'`。所有测试同事使用同一份模型网关、模型名称及团队人员规则；管理员通过机器环境统一下发访问配置。核心服务运行在各测试同事本机，未提供多人共享 Web 服务或 SSO；不要将本机接口映射到公网。

## 识图 AI

`ai.baseUrl` 填 Chat Completions 兼容 API 根地址（通常以 `/v1` 结尾），服务追加 `/chat/completions`。模型必须支持 `image_url` 图片输入和 JSON 对象输出。Key 通过 `ai.apiKeyEnv` 指定的环境变量读取。远程地址只允许 HTTPS。

图片、圈选局部、简单描述和已选页面上下文会发送到该网关。请求体和 JSON 响应默认不采集，须在扩展中开启。图片像素中的敏感信息不会被自动文本脱敏，请在上传前处理。

## 禅道身份

优先复用 `zentao-cli` 的本机登录：在自己的交互终端执行 `zentao login`，由 CLI 收集凭据。安装 CLI 可使用 `npm install -g zentao-cli`。插件通过官方 `zentao-api` 恢复已有 Profile，不把 Token 返回工作台。

`zentao.profile` 可指定 `account@https://zentao.example`；留空则用当前 Profile。也可配置 `zentao.siteUrl`、`zentao.account` 和 `zentao.tokenEnv`；若用密码，显式填 `passwordEnv`。凭据在服务端环境注入，浏览器只保存本机工作台访问令牌。

连接时核验服务端当前身份与配置账号是否相符，不相符则停止操作。数据与历史按“站点＋本人账号”隔离；同一草稿开始提交后绑定账号。

此版本使用官方 SDK 的 API v2 和版本检查：创建 Bug、用户/产品/项目列表及附件接口基线为开源 22.0 / 企业 biz13.0 / 旗舰 max8.0 / IPD ipd5.0。具体站点是否开放历史、团队、文件内嵌及自定义必填字段，必须做站点验收。旧版不会通过篡改版本绕过检查。

## 默认值与人员规则

`defaults.product`、`defaults.project` 填真实 ID；影响版本 `openedBuild` 为字符串数组，主干可用 `trunk`，其他版本必须是真实版本 ID。不要把配置示例的 0 当成可提交产品。

```json
{
  "team": [
    {"account":"frontend-account","name":"前端同事","role":"frontend","products":[123]},
    {"account":"backend-account","name":"后端同事","role":"backend","products":[123]}
  ],
  "historyDays":30,
  "historyScanLimit":200
}
```

团队规则仅补充名称、职责与产品范围，不能将不存在或当前不可访问的账号变成可指派用户。项目被选择时从项目团队获取候选人；不选项目时使用可访问用户列表。正式提交仍由禅道验证权限，工具回读主负责人。

## 存储与进程

默认目录 `~/.local/share/zentao-buglens`，可用 `BUGLENS_DATA_DIR` 覆盖。保存草稿、原图、导出文件、指派事件和启动令牌，目录权限为 0700、文本和图片为 0600。共享电脑上应使用各自操作系统账号。

`open` 后台启动本机服务；`serve` 前台启动便于管理员管理。端口默认 43921，可在配置中修改。DSH 与独立服务同时使用时应避免启动两个占用同一端口的实例。服务日志在本机数据目录 `service.log`；关闭后台进程前先保存工作，按自己的运行方式管理进程。

写入前保存创建意图，上传前保存单项状态；进程中断后凭编号和附件记录恢复。崩溃残留锁可用 `recover-lock <draft-id>` 清理，仅当原 PID 不存在时允许。`reconcile` 的详细输入见 Skill 的 references/commands.md。
