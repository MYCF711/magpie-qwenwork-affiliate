# 更新记录

## 0.4.3 — 2026-11-21

**新增 QwenWork 国际版并补齐上游许可署名**

- 合并并整理 Gyl1219 的 PR #1：新增 `qwenwork-intl`，显示名“千问办公国际版 QwenWork Intl”
- 国际设备流使用独立 `deviceWeb / deviceClientId / deviceRedirect`，国内站点默认值保持不变
- 国际版不接国内固定渠道、账号复用或桌面会员活动，两个具名导出各自维护登录态
- 修正 LICENSE 实际署名为 `MYCF711 and contributors`，NOTICE 保留 PR 贡献者与上游来源
- 随附 `magpie-community/plugins` 和 CLIProxyAPI 的完整 MIT 许可文本
- 新增多 Provider、国际设备流、CN 默认值与许可证回归测试；公开仓库仍不含测试或 CI

## 0.4.2 — 2026-11-21

**恢复正常插件显示名**

- 显示名统一为“千问办公 QwenWork”
- 免费领个人基础版与500月度积分仅保留在 README 功能说明，不再塞进插件名称
- 同步供应商入口、注册信息、包元数据和交接文档

## 0.4.1 — 2026-11-21

**复用凭据新鲜度与旋转续期协调**

- 点击复用时重新读取原 provider 最新凭据，不使用发现账号时的旧快照
- 原凭据被移除或 UID 变化时返回 failed，不回退旧 Token
- 目标账号续期前优先采用同一 UID 的最新有效凭据
- 旋转 refresh token 后同步同一旧链上的 QwenWork 记录；独立刷新过的新链不被覆盖
- 新增最新凭据、失效回退与续期同步回归测试

## 0.4.0 — 2026-11-21

**精简账号入口，支持复用已有 QwenWork 登录**

- 显示名改为“千问办公免费领基础会员+500积分 QwenWork Free Basic”
- 移除全部插件选项、第三方收益平台登录、卡片、查询模块和奖励命令
- 渠道固定为所有者渠道，登录页不再要求填写渠道、短信验证码或额外 Token
- 新增本机已有 `qwenwork` 账号发现与 UID 去重，复用凭据时不重新打开浏览器
- 复用账号后由 Magpie 自动签到或每账号“立即签到”自动完成基础版领取
- 复用时写入掩码 `accountId`，避免卡片显示整段内部账号 ID
- 公开仓库只保留插件本体，不包含测试、CI 或本机凭据

## 0.3.1 — 2026-11-21

- `auth.checkin` 支持每日自动签到和每账号立即签到
- 基础版已开通时只读套餐并跳过，不重复 claim / ensure / replay
- `should_redirect=true` 时自动切换个人身份，processing 由宿主按 until 复查
- `****8051`、`****0632` 均已开通个人基础版并获得 500 月度积分

## 0.3.0 — 2026-11-20

- 默认活动改为官方案例校验与回放，不再要求模型 qualification probe
- 官方案例包 SHA256 变化时停止，不提交旧证据
- 真实回放 session / turn 均 HTTP 200，claim 最终返回 succeeded
- 首个账号回读个人基础版，领取过程未消耗模型 tokens

## 0.2.0 — 2026-11-20

- 接入首次桌面活动资格、任务状态和领取接口
- 修正活动请求 Content-Type 与失败限频
- 旧 SSE 内层 402 改按额度错误处理，不误标登录失效

## 0.1.0 — 2026-11-20

- 从 `magpie-plugin-scaffold` `v0.3.14` 生成，九个钩子齐全
- 复用 `@magpie-community/opencode-qoder-auth@0.2.71` 的设备授权、模型和续期协议
- 按官方两段式 `/users/sign-in → oauth_callback` 保留固定渠道
- 核验安装包同源性与 DingTalk 有效签名，并使用官方应用图标
