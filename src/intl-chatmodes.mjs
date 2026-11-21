// Chat-modes-v2 是千问办公桌面客户端自己用的模型目录。
// 国际站的 QoderCLI 兼容目录（/algo/api/v2/model/list）只回 3 条，
// 客户端的 11 条（含 deepseek-flash=DeepSeek-V4.1-Flash）只在 /api/desktop/chat-modes。
import { _internal as qwenWorkInternal } from "./vendor/qoder.mjs"

const CHAT_MODES_PATH = "/api/desktop/chat-modes"

export async function fetchChatModes(site, access) {
  const token = String(access ?? "").trim()
  if (!token) return []
  const url = `${site.api}${CHAT_MODES_PATH}`
  const res = await fetch(url, {
    // 与 vendor 一致：带上 QwenWork 客户端自己的头（UA / X-Request-Id 等），避免裸 fetch 被当成第三方脚本
    headers: { Accept: "application/json", ...(site.clientHeaders?.() ?? {}), Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`chat-modes: HTTP ${res.status}`)
  const body = await res.json()
  return Array.isArray(body?.catalog) ? body.catalog : []
}

function modeName(mode) {
  const names = mode?.i18n?.display_name ?? {}
  return String(names.zh ?? names["zh-CN"] ?? names.en ?? mode?.key ?? "").trim()
}

// 旧目录的 key（qwork-advanced / qwork-auto / qwork-ultimate）保留，
// 新目录按 key 补进来；同一 key 在 chat-modes 里出现多次时只取第一条。
export function mergeChatModes(site, baseModels, modes) {
  const out = { ...(baseModels ?? {}) }
  for (const mode of modes ?? []) {
    const id = String(mode?.key ?? "").trim()
    if (!id || out[id] || mode?.enable === false) continue
    out[id] = qwenWorkInternal.runtimeModel(site, {
      id,
      name: modeName(mode) || id,
      context: Number(mode?.max_input_tokens ?? 0) || undefined,
      images: mode?.is_vl === true,
      efforts: [],
      free: false,
      rate: Number(mode?.price_factor ?? 0) || 0,
    })
  }
  return out
}
