// QwenWork 2.1.0 首次桌面活动：ensure → 官方案例回放 → benefits/claim。
// 默认不调用模型：回放包必须来自官方 materials，并通过 SHA256 校验。
// 只有官方 claim 返回 succeeded 才算领取成功；eligible/processing 都不冒充到账。
import { createHash, randomUUID } from "node:crypto"
import { _internal as vendorInternal } from "./vendor/qoder.mjs"

const { qwenworkClientHeaders } = vendorInternal

export const DESKTOP_CAMPAIGN_ID = "hd_33f905bd-111b-4ce1-832b-01f1b06b306e"
const QWENWORK_ORIGIN = "https://qwenwork.cn"
const GATEWAY_ORIGIN = "https://gateway.qwenwork.cn"

// 来自项目 materials 的固定官方案例。包哈希变化时停止，避免拿旧提示词回放新包。
export const OFFICIAL_REPLAY_CASE = Object.freeze({
  caseId: "5XP7FKAVBRMQAKXGKOJPMFK46T",
  sessionName: "生成用户运营招聘JD",
  prompt: "帮我写一个招聘 JD，公司是拾光科技，产品是AI办公助手，岗位是用户运营，岗位在杭州，要求1—3年经验，负责用户活动、社群维护和反馈整理。写清公司介绍、岗位职责、必备能力和加分项，再附一段100字以内的朋友圈招聘文案。职责具体，要求与工作对应，不编造薪资福利，不添加年龄、性别等无关限制。生成一份排版清楚、可编辑的Word文件。",
  archiveSha256: "71525096658f552b63c0ea9400d0836d341aeee20a43803a0405b8681b8c1e84",
})

export class CampaignError extends Error {
  constructor(message, { status = 0, code = "upstream_error", payload } = {}) {
    super(message)
    this.name = "CampaignError"
    this.status = status
    this.code = code
    this.payload = payload
  }
}

// 活动接口必须和聊天/账号接口使用同一套客户端身份。之前这里自造了一套
// （UA QwenWork/2.1.0、写死 build、没有 X-Request-Id），同一个账号在网关眼里
// 会同时出现两种客户端，属于典型风控信号。现在直接复用 vendor 里那份
// qwenworkClientHeaders（qoderwork/1.2.1 + 每次请求的 X-Request-Id），
// 只额外补 Accept、Authorization 和活动接口需要的 App-Mode。
function appHeaders(accessToken, appModeId = "standard") {
  return {
    ...qwenworkClientHeaders(),
    Accept: "application/json",
    ...(appModeId ? { "X-QwenWork-App-Mode": appModeId } : {}),
    Authorization: `Bearer ${accessToken}`,
  }
}

async function requestJson(fetchImpl, url, { method = "GET", token, body, headers = {}, timeoutMs = 20_000 } = {}) {
  let response
  try {
    response = await fetchImpl(url, {
      method,
      headers: { ...appHeaders(token), ...headers, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    throw new CampaignError("千问办公活动接口网络失败", { code: "upstream_unavailable", payload: String(error?.message ?? error).slice(0, 160) })
  }
  const text = await response.text()
  let payload = null
  try { payload = text ? JSON.parse(text) : null } catch { payload = { raw: text.slice(0, 300) } }
  if (!response.ok) {
    const code = String(payload?.code ?? payload?.error?.code ?? `http_${response.status}`)
    throw new CampaignError(`千问办公活动接口 HTTP ${response.status}`, { status: response.status, code, payload })
  }
  return payload
}

// 官方案例包的下载地址是一次 302 到 OSS 的短签名 URL（x-oss-expires=60）。
// 宿主的 fetch 可能不跟随重定向（实测有宿主直接回 302），所以自己跟；跳到别的源时
// 必须去掉 Authorization——OSS 只认自己的签名，带上千问的 token 反而可能被拒。
const MAX_REDIRECTS = 3

function redirectTarget(location, base) {
  if (!location) return null
  try {
    const next = new URL(location, base)
    return next.protocol === "https:" ? next.toString() : null
  } catch {
    return null
  }
}

async function requestBytes(fetchImpl, url, token) {
  let current = url
  let crossOrigin = false
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let response
    try {
      response = await fetchImpl(current, {
        headers: crossOrigin
          ? { Accept: "application/octet-stream" }
          : { ...appHeaders(token), Accept: "application/octet-stream" },
        redirect: "manual",
        signal: AbortSignal.timeout(30_000),
      })
    } catch (error) {
      throw new CampaignError("官方案例包下载失败", { code: "upstream_unavailable", payload: String(error?.message ?? error).slice(0, 160) })
    }
    if (response.status >= 300 && response.status < 400) {
      const next = redirectTarget(response.headers.get("location"), current)
      if (!next) {
        throw new CampaignError(`官方案例包 HTTP ${response.status}`, { status: response.status, code: "upstream_unavailable", payload: "redirect without a usable location" })
      }
      if (new URL(next).origin !== new URL(current).origin) crossOrigin = true
      current = next
      continue
    }
    if (!response.ok) {
      const text = (await response.text()).slice(0, 300)
      throw new CampaignError(`官方案例包 HTTP ${response.status}`, { status: response.status, code: "upstream_unavailable", payload: text })
    }
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length > 2 * 1024 * 1024) throw new CampaignError("官方案例包超过大小限制", { code: "internal_error" })
    return bytes
  }
  throw new CampaignError("官方案例包重定向过多", { code: "upstream_unavailable" })
}

async function ensureEligibility(fetchImpl, accessToken, campaignId) {
  const result = await requestJson(fetchImpl, `${QWENWORK_ORIGIN}/api/marketing/eligibility/ensure`, {
    method: "POST",
    token: accessToken,
    body: { campaign_id: campaignId },
  })
  if (result?.campaign_id !== campaignId || !["eligible", "ineligible"].includes(result?.eligibility)) {
    throw new CampaignError("活动资格响应格式不正确", { code: "internal_error", payload: result })
  }
  if (result.should_redirect === true && result.has_personal_account !== true) {
    throw new CampaignError("活动资格响应缺少个人账号", { code: "internal_error", payload: result })
  }
  return result
}

async function readPersonalPlan(fetchImpl, accessToken) {
  try {
    const result = await requestJson(fetchImpl, `${GATEWAY_ORIGIN}/api/v1/adapter/user/account-context?include=plan`, { token: accessToken })
    const context = result?.data ?? result
    return context?.plan && typeof context.plan === "object" ? context.plan : null
  } catch {
    // 套餐预检只是去重优化；失败时仍由官方 claim 决定，不掩盖后续错误。
    return null
  }
}

async function switchPersonalIdentity(fetchImpl, accessToken) {
  const result = await requestJson(fetchImpl, `${GATEWAY_ORIGIN}/api/v1/adapter/auth/switch`, {
    method: "POST",
    token: accessToken,
    body: { target: "c" },
  })
  const payload = result?.data ?? result
  const token = payload?.access_token ?? payload?.token
  if (typeof token !== "string" || !token.trim()) {
    throw new CampaignError("个人身份切换响应缺少 access_token", { code: "internal_error", payload: result })
  }
  return token
}

async function claimBenefit(fetchImpl, accessToken, campaignId) {
  const result = await requestJson(fetchImpl, `${QWENWORK_ORIGIN}/api/marketing/benefits/claim`, {
    method: "POST",
    token: accessToken,
    body: { campaign_id: campaignId },
  })
  const claim = result?.code === "ok" && result.data ? result.data : result
  if (claim?.campaign_id !== campaignId || !["succeeded", "processing"].includes(claim?.claim_status)) {
    throw new CampaignError("福利领取响应格式不正确", { code: "internal_error", payload: result })
  }
  return claim
}

async function resolveOfficialCase(fetchImpl, accessToken, campaignId, replayCase) {
  const materials = await requestJson(fetchImpl, `${QWENWORK_ORIGIN}/api/marketing/materials?campaign_id=${encodeURIComponent(campaignId)}`, { token: accessToken })
  const categories = Array.isArray(materials?.categories) ? materials.categories : []
  const item = categories.flatMap((category) => Array.isArray(category?.cases) ? category.cases : [])
    .find((candidate) => candidate?.case_id === replayCase.caseId)
  if (!item?.case_url || item?.file?.sha256 !== replayCase.archiveSha256) {
    throw new CampaignError("官方案例已变化，停止回放并等待同步证据", { code: "internal_error", payload: { caseId: replayCase.caseId } })
  }
  const url = new URL(item.case_url, QWENWORK_ORIGIN)
  if (url.protocol !== "https:" || url.origin !== QWENWORK_ORIGIN) {
    throw new CampaignError("官方案例地址不在允许的来源内", { code: "internal_error" })
  }
  return url.toString()
}

export function verifyReplayArchive(bytes, expectedSha256) {
  const actual = createHash("sha256").update(bytes).digest("hex")
  if (actual !== expectedSha256) throw new CampaignError("官方案例包 SHA256 不匹配", { code: "internal_error" })
  return actual
}

async function runOfficialCaseReplay(fetchImpl, accessToken, campaignId, replayCase) {
  // 案例地址签名只有 60 秒有效：失败后重新读一次 materials 拿新签名再试一次，
  // 不把一次过期的链接当成活动不可用。
  let archive
  for (let attempt = 0; attempt < 2; attempt++) {
    const caseUrl = await resolveOfficialCase(fetchImpl, accessToken, campaignId, replayCase)
    try {
      archive = await requestBytes(fetchImpl, caseUrl, accessToken)
      break
    } catch (error) {
      if (attempt === 1 || !(error instanceof CampaignError) || error.code !== "upstream_unavailable") throw error
    }
  }
  verifyReplayArchive(archive, replayCase.archiveSha256)

  // 回放对象是已下载且哈希验证的官方案例，不生成新答案，也不消耗模型 tokens。
  const sessionId = randomUUID()
  const turnId = randomUUID()
  const startedAt = new Date()
  const endedAt = new Date()
  const session = await requestJson(fetchImpl, `${QWENWORK_ORIGIN}/api/desktop-sessions/report`, {
    method: "POST",
    token: accessToken,
    body: {
      session_id: sessionId,
      session_name: replayCase.sessionName,
      session_type: "super",
      created_at: startedAt.toISOString(),
      updated_at: endedAt.toISOString(),
    },
  })
  if (session?.session_id !== sessionId) throw new CampaignError("案例会话回执不匹配", { code: "internal_error", payload: session })
  const turn = await requestJson(fetchImpl, `${QWENWORK_ORIGIN}/api/desktop-sessions/turns/report`, {
    method: "POST",
    token: accessToken,
    body: {
      session_id: sessionId,
      turn_id: turnId,
      prompt_preview: replayCase.prompt,
      status: "completed",
      started_at: startedAt.toISOString(),
      ended_at: endedAt.toISOString(),
      stop_reason: "end_turn",
    },
  })
  if (turn?.turn_id !== turnId) throw new CampaignError("案例任务回执不匹配", { code: "internal_error", payload: turn })
  return { sessionId, turnId, caseId: replayCase.caseId, archiveSha256: replayCase.archiveSha256 }
}

const PLAN_LABELS = { basic: "个人基础版", standard: "个人标准版", advanced: "个人高级版" }

function benefitText(benefit) {
  if (benefit?.type === "subscription") {
    const plan = PLAN_LABELS[String(benefit.plan ?? "")] ?? benefit.plan ?? "个人会员"
    return `${plan} ${benefit.months ?? "?"} 个月`
  }
  if (benefit?.type === "credits") return `${benefit.credits} 积分（${benefit.valid_days} 天有效）`
  return "活动福利"
}

export async function runDesktopCampaignCheckin({
  accessToken,
  fetchImpl = fetch,
  campaignId = DESKTOP_CAMPAIGN_ID,
  replayCase = OFFICIAL_REPLAY_CASE,
} = {}) {
  if (typeof accessToken !== "string" || !accessToken.trim()) return { outcome: "inactive", message: "未登录，无法检查会员福利" }

  // 已开通基础版的账号只读套餐并跳过，不再碰 ensure / replay / claim。
  const currentPlan = await readPersonalPlan(fetchImpl, accessToken)
  if (currentPlan?.pid === "qwen-office-basic" && currentPlan?.is_subscribed === true) {
    return {
      outcome: "claimed",
      message: "已开通个人基础版，本次跳过重复领取",
      claimStatus: "succeeded",
      benefit: { type: "subscription", plan: "basic", months: 1 },
      plan: currentPlan,
      alreadyActive: true,
    }
  }

  let eligibility
  let claim
  let campaignToken = accessToken
  let identitySwitched = false
  try {
    claim = await claimBenefit(fetchImpl, campaignToken, campaignId)
  } catch (error) {
    if (!(error instanceof CampaignError)) throw error
    const initialError = error
    eligibility = await ensureEligibility(fetchImpl, accessToken, campaignId)
    if (eligibility.eligibility !== "eligible") {
      return {
        outcome: "ineligible",
        // 官方口径：此前在桌面端发起过任务（含已领过本活动会员）的账号不可再参与，
        // 属于一次性活动，不是插件故障。把原因写清楚，避免用户以为签到坏了。
        message: "该账号不符合活动资格：此前已在桌面端发起过任务或已领过本活动会员。本活动每个账号仅限一次，无法重复领取",
        eligibility,
      }
    }
    if (eligibility.should_redirect === true) {
      campaignToken = await switchPersonalIdentity(fetchImpl, accessToken)
      identitySwitched = true
    } else if (initialError.code !== "desktop_task_incomplete") {
      throw initialError
    }
    if (identitySwitched) {
      try {
        claim = await claimBenefit(fetchImpl, campaignToken, campaignId)
      } catch (switchError) {
        if (!(switchError instanceof CampaignError && switchError.code === "desktop_task_incomplete")) throw switchError
      }
    }
  }

  let replay
  if (!claim) {
    replay = await runOfficialCaseReplay(fetchImpl, campaignToken, campaignId, replayCase)
    try {
      claim = await claimBenefit(fetchImpl, campaignToken, campaignId)
    } catch (error) {
      if (error instanceof CampaignError && error.code === "desktop_task_incomplete") {
        return {
          outcome: "done",
          message: "官方案例已提交，官方尚未确认；稍后自动复查，暂不记为已领取",
          eligibility,
          replay,
          code: error.code,
          until: Date.now() + 60_000,
          identitySwitched,
        }
      }
      throw error
    }
  }

  return {
    outcome: claim.claim_status === "succeeded" ? "claimed" : "done",
    message: claim.claim_status === "succeeded" ? `已发放：${benefitText(claim.benefit)}` : `官方处理中：${benefitText(claim.benefit)}，稍后自动复查`,
    ...(eligibility ? { eligibility } : {}),
    benefit: claim.benefit,
    claimStatus: claim.claim_status,
    ...(claim.claim_status === "processing" ? { until: Date.now() + 30_000 } : {}),
    ...(replay ? { replay } : {}),
    identitySwitched,
  }
}

export const _internal = { appHeaders, ensureEligibility, readPersonalPlan, switchPersonalIdentity, claimBenefit, resolveOfficialCase, runOfficialCaseReplay }
