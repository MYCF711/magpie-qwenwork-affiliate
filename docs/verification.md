# 验证记录

更新时间：2026-11-21（Asia/Shanghai）。本页区分离线测试、公开接口和真实账号验收。

## 1. 离线与静态门禁

| 项目 | 命令 | 结果 |
|---|---|---|
| 全量测试 | `npm test` | 451 pass / 0 fail |
| 入口契约 | `node --test tests/mount.test.mjs tests/qwenwork-intl.test.mjs` | 13 pass；双 Provider、国际设备流、CN 默认值与 MIT 署名 |
| 账号复用 | `node --test tests/qwenwork-import.test.mjs` | 8 pass；发现、UID 去重、最新凭据、flow callback、旋转续期同步 |
| 自动签到 | `node --test tests/campaign.test.mjs` | 9 pass |
| 合规 | `node scripts/check.mjs` | 48 pass / 0 warning / 0 fail（双 Provider 增加 3 项） |
| 错误码 | `npm run check:errors` | 0 fail |
| User-Agent | `npm run check:ua` | 0 fail / 0 warning |
| 文档时效 | `node scripts/check-docs.mjs` | 4 pass / 0 fail |
| 隐私 | `node scripts/privacy-scan.mjs` | PASS，0 处 |

公开仓库不包含 `tests/`、`.github/` 或本机凭据；测试文件仅保留在本机。

## 2. 安装链接

- HTTP 200，无重定向；自定义下载文件名不改变文件内容。
- 文件大小：422,465,936 B。
- SHA256：`55f98707afcefe4ebea2b86a8061de968bbccc55534066dee64af58baa943453`。
- Authenticode Valid，主体 `DingTalk Technology Co., Ltd.`；内层 `QwenWorkCN.exe` 签名一致。
- 插件运行不依赖该安装包，也不启动桌面客户端。

## 3. 固定渠道与设备授权

```text
GET /attribution/query?attribution_id=xingdoukejidownload162
→ 200，source_type=fixed
```

设备授权使用 `/users/sign-in → oauth_callback` 两段式流程。新登录不再展示渠道输入，固定写入规范化渠道 `xingdoukejidownload162`；传入其它渠道或环境变量也不会覆盖。

## 4. 三个账号最终套餐与积分

三个独立账号均通过官方 `account-context` 与 `wallets` 回读，HTTP 均为 200：

| 账号 | 最终套餐 | 月度积分 | 当前总余额 | 下一次刷新 |
|---|---|---:|---:|---|
| `****6710` | `qwen-office-basic` / 个人基础版 | 500 | 503.8529 | 2026-12-20 21:08:07（UTC+8） |
| `****8051` | `qwen-office-basic` / 个人基础版 | 500 | 504.8287 | 2026-12-21 01:42:33（UTC+8） |
| `****0632` | `qwen-office-basic` / 个人基础版 | 500 | 504.9673 | 2026-12-21 01:42:45（UTC+8） |

总余额由 500 月度积分与原有长期积分构成。`qwenwork#d2ur33` 与 `qwenwork-affiliate` 是同一个 `****6710` 账号，不计为第四个独立账号。

## 5. 自动签到与身份切换

```text
读取 account-context
→ 已是 qwen-office-basic：跳过

claim → ensure
→ should_redirect=true
→ POST /api/v1/adapter/auth/switch {"target":"c"}
→ materials + SHA256
→ session / turn 上报
→ claim
```

- 真实回放 session / turn 均 HTTP 200。
- 官方 claim 先返回 `202 processing`，随后 `200 succeeded`。
- 全程未调用模型，未消耗模型 tokens。
- 三个账号再次签到：第一次只读一次套餐，第二次命中账号缓存且零额外网络请求。
- processing 通过 `until` 交宿主复查；插件不创建额外定时器。

## 6. 已有账号复用

- 只读取本机 Magpie `plugin:qwenwork` 的登录索引和凭据。
- 已在 `qwenwork-affiliate` 中存在的 UID 不再显示复用入口。
- 复用 authorize 立即返回 `opened=true` 的 flow，callback 返回原 OAuth / device 字段，固定渠道重新写入，聊天 refresh token 不变。
- `accountId` 使用掩码昵称，UID 仍只作身份键。
- 复用过程不发网络请求；点击时重新读取最新凭据，添加后由现有自动签到完成会员领取。
- 续期优先采用同一 UID 的最新有效凭据；旋转旧链后同步相关 QwenWork 记录，独立新链不覆盖。

## 7. 国际版与上游许可

- PR #1 原始改动为 4 个文件、40 行新增；审查后保留设备包装字段和独立具名导出，补齐测试、发布文档及许可证署名。
- 国际 Provider 为 `qwenwork-intl`，显示名“千问办公国际版 QwenWork Intl”；不接国内固定渠道、已有账号复用或桌面会员活动。
- 有效 PKCE 参数实测 `gateway.qwenwork.ai/device/selectAccounts` 返回 302，Location 为 `qwenwork.ai/oauth2/auth`；待授权 poll 返回 404 `{}`。
- 本机没有国际版账号，因此未独立复验登录后的模型目录和聊天；PR 作者报告的登录与聊天 200 不作为本机实测证据。
- 协议上游为 `magpie-community/plugins/packages/qoder@0.2.71`（MIT），再往上为 `ufec/CLIProxyAPI`（MIT）。
- `LICENSE` 已改为实际署名 `MYCF711 and contributors`；`NOTICE.md` 保留 Gyl1219 / PR #1 和上游署名，并随附两份完整 MIT 许可。
- Free 账号的 700 积分来自官方 500 注册奖励与 200 每日登录奖励；`quota.remaining` 是真实任务额度，不是装饰字段。
- 三个模型目录均返回 `price_factor=0`，但相同代码题实测扣费：Pro `0.0205`、Standard `0.0051`、Flagship `0.0522`。0.4.4 起国际版不再显示“免费”，未知倍率以 rate 0 留空，不套企业 BYOK 的 1X / 2X / 3X。

## 8. 回滚

```bash
magpie plugin rm magpie-qwenwork-affiliate
```

只移除本插件及其账号，不删除原 `qwenwork` 渠道，不修改全局代理。迁移前备份：`research/account-migration-backup-2026-11-20T17-30-53-327Z/`。
