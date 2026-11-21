# 协议还原与计算依据

采集日期：2026-11-20（Asia/Shanghai）。本文件只记录公开 HTTP 响应、官方文档和公开客户端 / 网站脚本的静态证据。服务端是否认可某个渠道、账号或订单，不能由本地脚本预先保证。

## 1. 下载链接

原始对象：

```text
https://assets.qwenwork.cn/release/latest/qwenworkcn-setup-x64.exe
```

用户链接额外携带：

```text
response-content-disposition=attachment;filename=qwenworkcn-xingdoukejiDownload162_setup-x64.exe
```

实测无重定向，HTTP 200；去掉该参数后 ETag、Content-Length、CRC64 相同。该参数是对象存储的响应头覆盖，只改变保存文件名，不改变二进制，也不是授权凭证。

| 项 | 值 |
|---|---|
| 大小 | 422,465,936 B |
| SHA256 | `55f98707afcefe4ebea2b86a8061de968bbccc55534066dee64af58baa943453` |
| 签名 | Authenticode Valid |
| 主体 | DingTalk Technology Co., Ltd. |
| 内层程序 | QwenWorkCN.exe，同一有效签名 |

## 2. 下载归因

公开官网下载脚本 `journey-GqgLqwes.js` 的 URL 构造函数：

```js
url.searchParams.set(
  "response-content-disposition",
  `attachment;filename=qwenworkcn-${attributionId}_setup-${arch}.exe`,
)
```

这证明文件名可以承载 `attributionId` 的文本，但不证明安装包会读取它。安装包静态分析没有找到该字符串或按自身文件名归因的逻辑。

`attribution_id` 与事件 UUID 是两种字段：

- `attribution_id`：`/^[a-zA-Z0-9_-]{1,64}$/`；
- `event_id` / landing event：8-4-4-4-12 UUID。

因此 `xingdoukejiDownload162` 符合网页输入的字符约束；桌面 Growth 还有更严格的规范化与校验：非 `ad...` 渠道须匹配 `^[a-z][a-z0-9-]{0,63}$`，分发渠道先转小写并把非法字符替换为下划线。本插件采用同样的 `normalizeDistributionChannel()`，得到 `xingdoukejidownload162`。

官方桌面客户端的非 `website` 渠道链路：

```text
updater.cfg buildChannel / installerChannel
  → resolveEffectiveDistChannel()
  → buildQoderWorkLoginUrl()
      /users/sign-in?biz_variant=qoderwork
        &utm_source=affiliate&utm_medium=<normalizedChannel>&utm_campaign=online
        &oauth_callback=<原 /device/selectAccounts?...>
  → 302 回设备授权
  → qwenwork-growth.dingtalk.com
```

设备申请 URL 有严格 query 白名单，直接加 `attribution_id` / UTM 会返回 `INVALID_DEVICE_FLOW`，所以必须保留上述外层入口。

2026-11-20 实测：

- 原大小写 `xingdoukejiDownload162` 查询 `/attribution/query` → HTTP 400 `INVALID_ARGUMENT`；
- 规范化 `xingdoukejidownload162` → HTTP 200：

```json
{
  "attribution_id": "xingdoukejidownload162",
  "source_type": "fixed",
  "utm_source": "xingdoukeji",
  "tracking_params": {
    "utm_source": "xingdoukeji",
    "utm_content": "download162"
  }
}
```

- 外层 `/users/sign-in` → HTTP 302，Location 为原 `/device/selectAccounts?...`。

本插件选择官方登录 URL 入口，不修改 `updater.cfg`，也不改写安装包。

## 3. 设备登录与真实任务

公开 QwenWork 协议：

| 用途 | 值 |
|---|---|
| Gateway | `https://gateway.qwenwork.cn` |
| Client ID | `e883ade2-e6e3-4d6d-adf7-f92ceff5fdcb` |
| Redirect URI | `qwenwork-cn://` |
| 授权页 | `/device/selectAccounts` |
| 轮询 | `/api/v1/deviceToken/poll` |
| 续期 | `/api/v1/deviceToken/refresh`，个人账号 `target: "c"` |
| 账号 / 会员 / 积分 | `/api/v1/adapter/user/account-context?include=user,plan,quota` |
| 钱包 | `/api/v1/adapter/user/wallets` |
| 对话 | `/algo/api/v2/service/pro/sse/agent_chat_generation` |

设备 token 同时就是聊天 token。插件通过同一协议发送用户真实对话；不会为了“激活”自动发送一条假任务。

## 4. Growth 事件

公开脚本中的上报地址：

```text
POST https://qwenwork-growth.dingtalk.com/attribution/report
```

事件族包括：

- `landing_visited`
- `download_started`
- `login_succeeded`
- `registration_succeeded`
- `conversation_started`
- `order_created`
- `payment_succeeded`

登录 / 注册事件的数据字段为 `{user_id}`；支付事件带订单、实付金额和币种。上报依赖官方页面 baxia 运行时生成的 `bx-ua` / `bx-umidtoken` / `bx_et`，插件不离线复算、不绕过。

公开脚本中未发现 `download_completed`；有效活跃由服务端统计，不能靠前端点灯伪造。

## 5. 可复现公开查询

```bash
curl -fsSL 'https://docs.qwenwork.cn/activity/desktop-activation-benefit'
curl -fsSL 'https://qwenwork.cn/pricing'
```

本插件的单元测试另外使用 mock 验证请求头、URL、业务 401、计算公式与缺字段语义，不需要真实账号。

## 6. QwenWork 2.1.0 活动与零模型回放

普通聊天主链路已改为 `POST https://gateway.qwenwork.cn/api/desktop-sessions` 签发 MaaS 凭据，再请求 `<base_url>/v1/chat/completions` 或 `/v1/messages`。该链路的 `balance_insufficient` 是额度/计费拒绝；插件的首次桌面活动不再依赖这条付费模型路径。

首次桌面活动是独立的 marketing 流程，生产 origin 是 **`https://qwenwork.cn`**。插件按最小消耗顺序执行：

```text
GET https://gateway.qwenwork.cn/api/v1/adapter/user/account-context?include=plan
→ qwen-office-basic 且已订阅：跳过，不再 claim / ensure / replay

POST /api/marketing/benefits/claim
→ 已 succeeded / processing：结束，不重复回放
→ 其它错误：查 ensure

POST /api/marketing/eligibility/ensure
→ 仅 eligible 继续
→ should_redirect=true 时：

POST https://gateway.qwenwork.cn/api/v1/adapter/auth/switch
{"target":"c"}
→ 取新 access_token，后续 replay / claim 改用个人身份

GET /api/marketing/materials?campaign_id=<campaign_id>
→ 找到固定官方案例，核对 file.sha256

GET <官方 case_url>
→ 再次计算案例包 SHA256

POST /api/desktop-sessions/report
→ session_type=super，ISO 时间，真实案例名称

POST /api/desktop-sessions/turns/report
→ status=completed，stop_reason=end_turn，真实案例 prompt

POST /api/marketing/benefits/claim
→ processing / succeeded
```

生产 campaign_id 为 `hd_33f905bd-111b-4ce1-832b-01f1b06b306e`。服务端不接受 `session_type=replay`，只接受 `super / memory_organization`；turn 的可选 `custom_context` 也不接受自定义 replay 字段，因此插件不发送这些额外字段。

已领取后 `ensure` 会变为 `ineligible`，所以先用套餐识别已开通账号，再查 claim，避免误判。插件只在任务未完成时创建回放；案例包哈希变化时停止。processing 通过 `until` 让宿主30秒后复查，其他失败按账号限频6小时；自动签到调度由 Magpie 宿主负责，插件不创建额外定时器。

Native OAuth 已验证：discovery 为 `https://qwenwork.cn/.well-known/openid-configuration`，client_id 为 `qwenwork-desktop-app`，scope 为 `openid offline_access qwen_work`，PKCE S256 + `127.0.0.1` loopback；Growth state 使用规范化渠道和服务端 `tracking_params`。

## 7. 国际站的两份模型目录（2026-11-21 实测）

`qwenwork.ai` 有两份不同的模型目录，不能混用：

| 目录 | 内容 | 可否直接聊天 |
|---|---|---|
| `GET /algo/api/v2/model/list?Encode=1`（scene=`qwork`） | 3 条：`qwork-advanced / qwork-auto / qwork-ultimate` | ✅ 是聊天接口认可的 `model` |
| `GET /api/desktop/chat-modes` | 11 条，含 `deepseek-flash`（DeepSeek-V4.1-Flash）、`glm-5.3`、`kimi-k3.1-pro` 等 | ❌ 当 `model` 发出去一律 400 `model_not_found` |

`chat-modes` 是桌面客户端模型选择器自己的目录；把它的 `key` 直接当 `model` 发到 `gateway.qwenwork.ai/chat/completions`，实测全部返回 `unknown or disabled model`。附加 `chat_mode` 字段也会被忽略（响应 `model` 仍是 `qwork-auto` 的显示名），说明真正承载 mode 的字段尚未定位。

因此插件只把 `qwork` 那 3 条作为可聊天模型；`chat-modes` 的 11 条在找到正确的请求体字段之前不进模型列表，避免用户选中即 400。

另外：`chat-modes` 里 `qwen3.8-flash`、`glm-5.3` 各出现两次（一次显示名是 `Standard` / `Pro`），按 key 去重时要注意显示名撞名。
