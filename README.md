# 千问办公 QwenWork

功能包括：免费领个人基础版与 500 月度积分、复用本机已有 QwenWork 账号、自动签到，以及脱离桌面客户端使用模型。

独立的 Magpie / OpenCode 供应商插件：不安装、不启动千问办公桌面客户端，通过官方 HTTP API 使用模型、复用本机已有账号，并在手动或自动签到时领取个人基础版与 500 月度积分。

> 2026-11-21 实测：本机三个独立 QwenWork 账号均为 `qwen-office-basic / 个人基础版`，每个账号均有 500 月度积分。已完成账号再次签到只读套餐并跳过，不重复回放。证据见 [验证记录](./docs/verification.md)。

## 功能

- **脱离桌面客户端**：设备授权、模型目录、会话签发和会员活动均通过官方 HTTP API 完成。
- **复用已有账号**：自动发现本机 Magpie 已登录的 `qwenwork` 账号，按 UID 去重；复用时不重新打开浏览器。
- **自动领取会员**：复用或新授权账号后，由 Magpie 的每日自动签到或每账号“立即签到”调用插件 `auth.checkin`。
- **完成自动跳过**：`qwen-office-basic` 且订阅有效时只读套餐，不再调用 claim、ensure 或 replay。
- **个人身份自动切换**：`should_redirect=true` 时调用官方 `/api/v1/adapter/auth/switch`，后续活动使用个人身份 token。
- **零模型消耗领取**：使用官方 materials 中的固定案例，校验 SHA256 后上报 session / turn，不生成模型答案。
- **无插件选项**：渠道与会员任务内置，界面不显示额外开关，也不要求填写其它平台账号。

## 国际版

`qwenwork-intl`（千问办公国际版 QwenWork Intl）接入 `qwenwork.ai` 与 `gateway.qwenwork.ai`，使用国际站自己的设备包装字段。国际版不接国内固定渠道、已有账号复用或桌面会员活动，账号与国内版完全隔离。

国际版积分是任务使用额度：Free 计划包含注册奖励和每日登录奖励。目录中的 `price_factor=0` 不代表不扣积分，因此插件不把三个模型标成“免费”；未确认的倍率留空。

## 安装

```bash
magpie plugin add MYCF711/magpie-qwenwork-affiliate
```

本机已有 `qwenwork` 账号时，在添加账号页面选择对应的 **Reuse QwenWork · 账号名**。没有可复用账号时，选择 **Sign in with QwenWork**，在官方页面完成授权。

已经复用或新开通的账号无需每日重复操作；宿主负责签到调度，插件不创建额外定时器。

## 自动签到流程

```text
读取 account-context
→ 已是个人基础版：跳过

claim
→ 已完成：结束
→ 未完成：ensure

should_redirect=true
→ adapter/auth/switch（target=c）

materials + SHA256
→ 官方案例 session / turn 上报
→ claim
→ processing 时由宿主按 until 复查
```

只有官方 claim 返回 `succeeded`，或套餐接口确认个人基础版已生效，才记为已领取。`eligible`、`processing` 和网络错误都不会冒充到账。

## 本机验证

| 账号 | 套餐 | 月度积分 | 当前总余额 |
|---|---|---:|---:|
| `****6710` | 个人基础版 | 500 | 503.8529 |
| `****8051` | 个人基础版 | 500 | 504.8287 |
| `****0632` | 个人基础版 | 500 | 504.9673 |

- Provider：`qwenwork-affiliate`（内部 ID，仅为兼容现有账号）
- 动态模型目录：13 个模型
- 三个账号均有独立凭据与固定渠道字段
- 全量测试与静态门禁见 [验证记录](./docs/verification.md)
- Magpie `/v1/models`：HTTP 200；全局代理保持 `direct`

## 文件

- `index.mjs`：九钩装配、账号复用与自动签到入口
- `src/campaign.mjs`：会员状态、个人身份切换、官方案例回放与 claim
- `src/vendor/qoder.mjs`：设备授权、模型和聊天协议基线
- `docs/protocol.md`：协议与判据
- `docs/verification.md`：离线、生产接口和真实账号验收

## 回滚

```bash
magpie plugin rm magpie-qwenwork-affiliate
```

回滚只移除本插件及其账号，不删除原 `qwenwork` 渠道，也不修改全局代理。账号复用前的本机备份路径记录在交接文档中。
