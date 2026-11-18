# 共用 CLI

先用 `dsh-zentao-buglens --help` 确认命令。本文件中的编号和账号均为示例，不能直接提交到真实业务。

```sh
printf '%s' '{"description":"保存提示成功，刷新后数据消失"}' | dsh-zentao-buglens create
dsh-zentao-buglens add-image <draft-id> /absolute/path/screenshot.png
dsh-zentao-buglens analyze <draft-id>
dsh-zentao-buglens candidates <draft-id> --sync
```

推荐答案写入：

```json
{"answers":{"q1":"保存成功后，新客户应该出现在列表"}}
```

将 JSON 通过 stdin 传入 `update <draft-id>`，不要在 shell 中拼接未经转义的用户描述。字段还包括 `product`、`project`、`openedBuild`（真实版本 ID 字符串数组）、`assignedTo`（真实账号）、`collaborators`、`analysis`。修改完整 analysis 时，先 get 并保留现有字段，用户确认预期后设 `expectedSource: "user"`。

`submit` 返回草稿对象，`submission.status`：

| 状态 | 含义 |
| --- | --- |
| creating | 创建意图已落盘，尚未完整回读 |
| uncertain | 创建结果未知；重试先查已有记录，不再直接 POST |
| uploading | Bug 已创建，正在附加材料 |
| partial | 部分附件或正文验证未完成 |
| done | 编号、负责人、正文及全部上传步骤已验证 |

若创建超时且自动查找未定位，用户在禅道找到材料编号后，用 `reconcile <draft-id>` 输入 `{"bugId":真实编号}`。工具必须验证创建人和材料编号。若已经确认某个不确定附件未上传，可同时输入 `retryUploadKey`，随后再次 submit 补传。

`recover-lock` 仅在进程不存在时清除崩溃残留锁；不要手工删除仍被使用的锁。草稿开始提交后冻结内容，改内容应新建草稿，避免上传快照前后不一致。
