// 千问办公：独立 Magpie 供应商插件，免费领基础会员与500积分。
// 聊天、设备登录与续期复用本机当前 0.2.71 协议；本文件装配固定渠道与自动会员任务。
import { protocol, _internal as qwenWorkInternal } from "./src/vendor/qoder.mjs"
import { usageWindow } from "./src/quota.mjs"
import { uidOf } from "./src/credential.mjs"
import { ICON } from "./src/icon.mjs"
import { normalizeDistributionChannel, parseAttribution, withAttribution } from "./src/growth.mjs"
import { runDesktopCampaignCheckin } from "./src/campaign.mjs"
import { createHash } from "node:crypto"
import { MAAS_CHAT_PATH, createMaasCache, fetchChatModes, isMaasChatModel, isMaasMode, maasUserAgent, mintMaasSession, modeContext, modeDisplayName, modeKey, modeThinking, requestModelOf } from "./src/intl-maas.mjs"
import { createQwenWorkReuseMethods, latestQwenWorkCredential, qwenWorkDisplayName, syncQwenWorkCredentialFamily } from "./src/qwenwork-import.mjs"

const PROVIDER = "qwenwork-affiliate"
const PROVIDER_NAME = "千问办公 QwenWork"
const DEFAULT_ATTRIBUTION_ID = "xingdoukejidownload162"
const SITE = Object.freeze({ ...qwenWorkInternal.SITES.qwenwork, id: PROVIDER, name: PROVIDER_NAME })
const makeQwenWork = protocol.makePlugin(SITE)

function accountKeyOf(auth) {
  const uid = uidOf(auth)
  return uid ? String(uid) : ""
}

function withModelCapabilities(model) {
  const input = new Set(Array.isArray(model?.modalities?.input) ? model.modalities.input : ["text"])
  const output = new Set(Array.isArray(model?.modalities?.output) ? model.modalities.output : ["text"])
  const inputCapabilities = {
    text: input.has("text"),
    image: input.has("image"),
    audio: input.has("audio"),
    video: input.has("video"),
    pdf: input.has("pdf"),
    ...model?.capabilities?.input,
  }
  for (const key of ["text", "image", "audio", "video", "pdf"]) inputCapabilities[key] = inputCapabilities[key] === true
  return {
    ...model,
    capabilities: {
      ...model?.capabilities,
      input: inputCapabilities,
      output: { text: output.has("text"), ...model?.capabilities?.output },
    },
  }
}

function withModelMapCapabilities(models) {
  return Object.fromEntries(Object.entries(models ?? {}).map(([id, model]) => [id, withModelCapabilities(model)]))
}

function memberWindow(base) {
  const active = /基础/.test(String(base?.plan ?? ""))
  return usageWindow({
    name: "千问办公 · 会员福利",
    used: 0,
    aside: true,
    display: active ? "个人基础版生效中 · 500月度积分" : "自动领取基础版与500积分；结果以服务端为准",
  })
}

export const QwenWorkAffiliateAuthPlugin = async (_ctx = {}, _options = {}) => {
  const base = await makeQwenWork(_ctx)
  const campaignAttempts = new Map()
  const oauth = base.auth.methods.find((method) => method.type === "oauth")
  if (!oauth) throw new Error("千问办公设备登录入口不可用")
  const reuseMethods = createQwenWorkReuseMethods({
    attributionId: DEFAULT_ATTRIBUTION_ID,
    ...(_options?.qwenWorkImport ?? {}),
  })

  const method = {
    ...oauth,
    label: "Sign in with QwenWork",
    prompts: [],
    async authorize() {
      const attribution = parseAttribution(DEFAULT_ATTRIBUTION_ID)
      const flow = await oauth.authorize()
      return {
        ...flow,
        opened: process.env.QWENWORK_NO_BROWSER === "1" ? true : flow.opened,
        url: withAttribution(flow.url, attribution),
        instructions: "在官方页面完成千问办公授权即可；会员任务会在添加账号后自动执行。",
        async callback(code) {
          const result = await flow.callback(code)
          if (result?.type !== "success") return result
          return {
            ...result,
            attributionId: DEFAULT_ATTRIBUTION_ID,
          }
        },
      }
    },
  }

  return {
    ...base,
    async config(cfg) {
      await base.config(cfg)
      const provider = cfg.provider?.[PROVIDER]
      if (provider?.models) provider.models = withModelMapCapabilities(provider.models)
    },
    provider: {
      ...base.provider,
      async models(provider, options) {
        const models = await base.provider.models(provider, options)
        return withModelMapCapabilities(models)
      },
    },
    auth: {
      ...base.auth,
      provider: PROVIDER,
      icon: ICON,
      options: [],
      methods: [...reuseMethods, method, ...base.auth.methods.filter((item) => item !== oauth)],
      async refresh(auth, provider) {
        const shared = latestQwenWorkCredential(auth?.uid, _options?.qwenWorkImport)
        const sharedAuth = shared?.credential ?? auth
        if (shared && sharedAuth.access !== auth?.access
          && Number(sharedAuth.expires ?? 0) > Number(auth?.expires ?? 0)
          && Number(sharedAuth.expires ?? 0) > Date.now() + 60_000) {
          const displayName = qwenWorkDisplayName({ ...auth, ...sharedAuth })
          return { ...auth, ...sharedAuth, accountId: displayName, cardName: displayName, attributionId: DEFAULT_ATTRIBUTION_ID }
        }
        const refreshed = await base.auth.refresh(sharedAuth, provider)
        if (!refreshed) return refreshed
        syncQwenWorkCredentialFamily({ uid: auth?.uid, previous: sharedAuth, refreshed, ...(_options?.qwenWorkImport ?? {}) })
        const displayName = qwenWorkDisplayName({ ...auth, ...refreshed })
        return {
          ...auth,
          ...refreshed,
          accountId: displayName,
          cardName: displayName,
          attributionId: DEFAULT_ATTRIBUTION_ID,
        }
      },
      async usage(getAuth, provider) {
        const usage = await base.auth.usage(getAuth, provider)
        return {
          ...usage,
          windows: [...(Array.isArray(usage?.windows) ? usage.windows : []), memberWindow(usage)],
        }
      },
      async checkin(getAuth) {
        const auth = await getAuth()
        if (!auth?.access) return { outcome: "inactive", message: "未登录，无法检查会员福利" }
        const key = accountKeyOf(auth) || "default"
        const previous = campaignAttempts.get(key)
        const retryMs = previous?.result?.claimStatus === "processing" ? 30_000 : 6 * 60 * 60_000
        if (previous && (previous.result.outcome === "claimed" || Date.now() - previous.at < retryMs)) {
          return { ...previous.result, outcome: previous.result.outcome === "claimed" ? "done" : previous.result.outcome }
        }
        try {
          const result = await runDesktopCampaignCheckin({ accessToken: auth.access })
          campaignAttempts.set(key, { at: Date.now(), result })
          return result
        } catch (error) {
          const result = {
            outcome: "failed",
            message: `签到未完成：${String(error?.message ?? error).slice(0, 160)}`,
            code: String(error?.code ?? "upstream_error"),
          }
          campaignAttempts.set(key, { at: Date.now(), result })
          return result
        }
      },
    },
  }
}

// 千问办公国际版（qwenwork.ai）：走站点自己的设备包装器，不挂邀请/归因与桌面会员任务
// （那两者只在国内站存在），所以直接用 vendor 的插件。
const INTL_PROVIDER = "qwenwork-intl"
const INTL_PROVIDER_NAME = "千问办公国际版 QwenWork Intl"
const INTL_SITE = Object.freeze({ ...qwenWorkInternal.SITES["qwenwork-intl"], id: INTL_PROVIDER, name: INTL_PROVIDER_NAME })
const intlBase = protocol.makePlugin(INTL_SITE)

// 国际版的真实模型：网关只认 3 个 qwork 档，其余 11 个真实模型走 MaaS 会话通道
// （mint → base_url + access_token）。这里负责模型补全与请求改写，见 src/intl-maas.mjs。
const intlMaasCache = createMaasCache()

function intlAuthKey(auth) {
  const raw = String(auth?.uid ?? auth?.userId ?? auth?.access ?? "")
  return raw ? createHash("sha256").update(raw).digest("hex").slice(0, 16) : "anonymous"
}

export const QwenWorkIntlAuthPlugin = async (ctx = {}, options = {}) => {
  const base = await intlBase(ctx, options)
  const baseLoader = base?.auth?.loader
  return {
    ...base,
    provider: {
      ...base.provider,
      async models(provider, opts = {}) {
        const models = await base.provider.models(provider, opts)
        try {
          const auth = opts?.auth
          if (!auth?.access) return models
          const modes = await fetchChatModes({ accessToken: auth.access })
          const merged = { ...models }
          for (const mode of modes) {
            if (!isMaasMode(mode)) continue
            const id = modeKey(mode)
            if (!id || merged[id]) continue
            const effort = modeThinking(mode)
            merged[id] = qwenWorkInternal.runtimeModel(INTL_SITE, {
              id,
              name: modeDisplayName(mode) || id,
              context: modeContext(mode) || undefined,
              images: mode?.is_vl === true,
              efforts: effort ? [effort] : [],
              free: false,
              rate: 0,
            })
          }
          return merged
        } catch {
          // 目录读不到就维持网关那 3 个，不影响登录与聊天
          return models
        }
      },
    },
    auth: {
      ...base.auth,
      async loader(getAuth) {
        const inner = await baseLoader(getAuth)
        const innerFetch = inner?.fetch
        if (typeof innerFetch !== "function") return inner
        return {
          ...inner,
          async fetch(input, init) {
            const url = typeof input === "string" ? input : input instanceof URL ? input.href : input?.url
            let path = ""
            try {
              path = new URL(String(url)).pathname
            } catch {
              return innerFetch(input, init)
            }
            if (!path.endsWith("/chat/completions")) return innerFetch(input, init)
            const model = requestModelOf(init?.body)
            if (!isMaasChatModel(model)) return innerFetch(input, init)
            try {
              const auth = await getAuth()
              const key = intlAuthKey(auth)
              const credential = await intlMaasCache.get(key, () => mintMaasSession({ accessToken: auth?.access }))
              const id = model.replace(/^qwenwork-intl\//, "")
              const body = JSON.stringify({ ...JSON.parse(init.body), model: id })
              return await fetch(`${credential.baseUrl}${MAAS_CHAT_PATH}`, {
                method: "POST",
                headers: {
                  "User-Agent": maasUserAgent(),
                  Accept: "application/json",
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${credential.accessToken}`,
                },
                body,
                signal: init?.signal,
              })
            } catch {
              // 换凭据失败就交回原通道，让宿主按正常上游错误处理
              return innerFetch(input, init)
            }
          },
        }
      },
    },
  }
}

// 测试入口；顶层只导出一个插件工厂函数。
export const _internal = { PROVIDER, PROVIDER_NAME, DEFAULT_ATTRIBUTION_ID, SITE, withModelCapabilities }
