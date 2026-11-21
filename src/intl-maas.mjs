// 千问办公国际版真实模型通道（逆向自桌面客户端 2.0.0.26111901）。
//
// 客户端有两套执行策略（main.js: runtimeServicesExtension）：
//   · qoder-cli  → 走 gateway.qwenwork.ai，model 只能是 qwork-advanced / qwork-auto / qwork-ultimate 三个逻辑档
//   · opencode（harness "oc"）→ 先向网关注册一个桌面会话换 MaaS 凭据，再拿凭据去凭据里回传的 base_url
//
// 第二步才是 11 个真实模型的入口：
//   POST <gateway>/api/desktop-sessions   {"session_id":"<uuid>"}
//     → 201 {access_token, base_url, expires_at_ms, ttl_ms, session_id}
//   POST <base_url>/v1/chat/completions   Authorization: Bearer <access_token>
//     model = chat-modes 里的 key（deepseek-flash / glm-5.3 / kimi-k3.1-pro …）
//
// 直接把这些 key 发到 gateway 会 400 model_not_found —— 这正是「客户端有、插件没有」的原因。
import { randomUUID } from "node:crypto"

export const MAAS_MINT_PATH = "/api/desktop-sessions"
export const MAAS_CHAT_PATH = "/v1/chat/completions"

// 与客户端 getQwenWorkClientHeaders 同形；版本串来自客户端包本身。
const CLIENT = Object.freeze({ version: "1.2.1", release: "1.2.1-26092107" })

// 客户端 UA：WAF 对没有 UA 或脚本默认 UA（python-urllib 等）的请求回 200 + HTML 挑战页，
// 只有客户端自己的 UA 才稳定拿到 JSON。所有打这个上游的请求都显式带上它。
export function maasUserAgent() {
  return `qoderwork/${CLIENT.version}`
}

export function maasClientHeaders({ appModeId = "standard", requestId = randomUUID() } = {}) {
  return {
    "User-Agent": maasUserAgent(),
    Accept: "application/json",
    "X-Request-Id": requestId,
    "X-QwenWork-Version": CLIENT.version,
    "X-QwenWork-Release-Version": CLIENT.release,
    "X-QwenWork-Build": CLIENT.release.split("-")[1],
    "X-QwenWork-Platform": process.platform,
    "X-QwenWork-Arch": process.arch,
    "X-QwenWork-Channel": "stable",
    "X-QwenWork-App-Mode": appModeId,
  }
}

// 客户端认为 harness 为 "oc" 的模式走 MaaS；qoder-cli 的模式留在网关。
export function isMaasMode(mode) {
  const harness = String(mode?.harness ?? "").trim().toLowerCase()
  if (!harness) return false
  return harness !== "qoder-cli"
}

export function modeKey(mode) {
  return String(mode?.key ?? "").trim()
}

export function modeDisplayName(mode) {
  const names = mode?.i18n?.display_name ?? {}
  const order = ["zh", "zh-CN", "en", "zh-HK", "zh-TW", "ja", "pt-BR"]
  for (const k of order) {
    const v = names?.[k]
    if (typeof v === "string" && v.trim()) return v.trim()
  }
  const first = Object.values(names).find((v) => typeof v === "string" && v.trim())
  return String(first ?? modeKey(mode)).trim()
}

export function modeContext(mode) {
  const direct = Number(mode?.max_input_tokens)
  if (Number.isFinite(direct) && direct > 0) return direct
  const cfg = mode?.context_config ?? mode?.contextConfig
  if (cfg && typeof cfg === "object") {
    let best = 0
    for (const entry of Object.values(cfg)) {
      const n = Number(entry?.token_count)
      if (Number.isFinite(n) && n > best) best = n
    }
    if (best) return best
  }
  return 0
}

export function modeThinking(mode) {
  const effort = String(mode?.thinking_config?.effort ?? mode?.model_params?.reasoning_effort ?? "").trim()
  return mode?.is_reasoning === true ? effort || "medium" : ""
}

// mintMaasSession 换一条 2 小时的 MaaS 凭据。session_id 必须与响应一致（客户端同样校验）。
export async function mintMaasSession({ accessToken, fetchImpl = fetch, appModeId, timeoutMs = 20_000 } = {}) {
  const token = String(accessToken ?? "").trim()
  if (!token) throw new Error("MaaS mint: 缺少登录凭据")
  const sessionId = randomUUID()
  const res = await fetchImpl(`https://gateway.qwenwork.ai${MAAS_MINT_PATH}`, {
    method: "POST",
    headers: {
      ...maasClientHeaders({ appModeId }),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ session_id: sessionId }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`MaaS mint: HTTP ${res.status} ${text.slice(0, 160)}`)
  let body
  try {
    body = JSON.parse(text)
  } catch {
    throw new Error("MaaS mint: 响应不是 JSON")
  }
  const minted = String(body?.access_token ?? "").trim()
  const baseUrl = String(body?.base_url ?? "").trim().replace(/\/+$/, "")
  const returnedId = String(body?.session_id ?? "").trim()
  if (!minted) throw new Error("MaaS mint: 响应缺少 access_token")
  if (!baseUrl) throw new Error("MaaS mint: 响应缺少 base_url")
  if (returnedId && returnedId.toLowerCase() !== sessionId.toLowerCase()) {
    throw new Error("MaaS mint: 返回的 session_id 与请求不一致")
  }
  const expiresAt = Number(body?.expires_at_ms) > 0 ? Number(body.expires_at_ms) : Date.now() + 60 * 60_000
  return { accessToken: minted, baseUrl, expiresAt, sessionId: returnedId || sessionId }
}

// 按账号缓存凭据：提前 10 分钟续期，失败不缓存（下一次请求重试）。
export function createMaasCache({ clock = () => Date.now(), slackMs = 10 * 60_000 } = {}) {
  const entries = new Map()
  return {
    async get(key, mint) {
      const now = clock()
      const hit = entries.get(key)
      if (hit && hit.expiresAt - slackMs > now) return hit
      const fresh = await mint()
      entries.set(key, fresh)
      return fresh
    },
    peek(key) {
      return entries.get(key) ?? null
    },
    clear(key) {
      if (key === undefined) entries.clear()
      else entries.delete(key)
    },
    size() {
      return entries.size
    },
  }
}

// fetchChatModes 读客户端自己的模型目录（schema_version=2）。
export async function fetchChatModes({ accessToken, fetchImpl = fetch, timeoutMs = 15_000 } = {}) {
  const token = String(accessToken ?? "").trim()
  if (!token) return []
  const res = await fetchImpl("https://gateway.qwenwork.ai/api/desktop/chat-modes", {
    headers: { ...maasClientHeaders(), Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) throw new Error(`chat-modes: HTTP ${res.status}`)
  const body = await res.json()
  const catalog = Array.isArray(body?.catalog) ? body.catalog : []
  return catalog.filter((mode) => modeKey(mode) && mode?.enable !== false)
}

// 哪些模型键要走 MaaS：网关只认 qwork-* 三个逻辑档，其余都是客户端目录里的真实模型。
export function isMaasChatModel(model) {
  const id = String(model ?? "").replace(/^qwenwork-intl\//, "").trim()
  return !!id && !id.startsWith("qwork-")
}

export function requestModelOf(raw) {
  if (typeof raw !== "string") return ""
  try {
    return String(JSON.parse(raw)?.model ?? "")
  } catch {
    return ""
  }
}
