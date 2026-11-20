# MAINTENANCE.md —— 维护台账

## 身份

| 项 | 值 |
|---|---|
| 仓库 | `MYCF711/magpie-qwenwork-affiliate`（GitHub 公开仓库） |
| 显示名 | 千问办公 QwenWork |
| 当前版本 | `0.4.4` |
| Provider | `qwenwork-affiliate`（国内，内部 ID 保留兼容）、`qwenwork-intl`（国际，无渠道或会员活动） |
| 定位 | 脱离千问办公客户端的模型供应商、已有账号复用与基础版自动领取 |

## 基线

- 脚手架：`MYCF711/magpie-plugin-scaffold` `v0.3.14`。
- 千问协议：`@magpie-community/opencode-qoder-auth@0.2.71`。
- 会员活动：官方首次桌面激活规则，见 `docs/protocol.md`。

## 当前状态（2026-11-21）

- 三个独立账号均为个人基础版，各有 500 月度积分。
- 已完成账号自动签到只读套餐并跳过，不重复回放。
- 插件无额外选项，无第三方平台登录或收益卡片。
- 支持发现本机已有 `qwenwork` 账号，按 UID 去重复用。
- 公开仓库不包含测试、CI 或本机凭据；本地测试保留在 `tests/` 并由 `.gitignore` 排除。

## 验证

- 全量测试与 45 项合规检查结果见 `docs/verification.md`。
- 账号、钱包、套餐接口均 HTTP 200。
- 新 Provider 动态目录 13 个模型。
- Magpie `/v1/models` HTTP 200，全局 `proxy=direct`。
- 两个旧账号迁移前备份：`research/account-migration-backup-2026-11-20T17-30-53-327Z/`。

## 硬约束

- 不伪造注册、对话、下载、支付或资格判定。
- 不批量注册，不绕验证码或活动状态。
- 不在 URL、日志、测试快照或文档中写 Token。
- 不改千问安装包，不改 Magpie 全局代理，不重启 DSH，不关闭 Magpie。
- 账号复用只读本机 Magpie 已有 QwenWork 凭据，按 UID 去重，不上传凭据。

## 接手最短路径

1. 阅读 `README.md`、`docs/protocol.md` 与 `docs/verification.md`。
2. 本地运行 `npm test`。
3. 用 mock 验收入口：`node --test tests/mount.test.mjs tests/qwenwork-import.test.mjs tests/campaign.test.mjs`。
4. 真实账号优先选择已有账号复用，再执行一次立即签到验证自动领取与去重。
