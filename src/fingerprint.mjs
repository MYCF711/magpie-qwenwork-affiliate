// 出站身份伪装：凡是会把「本机」带给上游的字段，都在这里统一成稳定假名。
//
// 现状（逆向桌面客户端 2.0.0.26111901 对照）：
//   · 头部 Cosy-MachineHostname 原样发 os.hostname()，等于把真实机器名交给上游
//   · Cosy-MachineId / Cosy-MachineToken 取凭据里的 machineId（签发时随机生成，不落本机指纹）
//   · X-QwenWork-Platform / Arch 用 process.*，属通用平台信息，不指向具体机器
//
// 伪装原则：同一账号 + 同一插件 → 恒定假名（上游看到的是稳定设备，不是每次新机器），
// 且格式与真实 Windows 主机名同形（DESKTOP-XXXXXXX），不影响任何校验。
import { createHash } from "node:crypto"

const HOSTNAME_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

function digest(seed) {
  return createHash("sha256").update(String(seed ?? ""), "utf8").digest()
}

// pseudoHostname 生成 DESKTOP-XXXXXXX 形态的稳定假机器名。
export function pseudoHostname(seed = "qwenwork") {
  const bytes = digest(seed)
  let out = "DESKTOP-"
  for (let i = 0; i < 7; i++) out += HOSTNAME_CHARS[bytes[i] % HOSTNAME_CHARS.length]
  return out
}

// pseudoMachineId 生成 32 位十六进制的稳定设备 id（客户端 machineId 同形）。
export function pseudoMachineId(seed = "qwenwork") {
  return digest(`machine\0${seed}`).toString("hex").slice(0, 32)
}

// outboundHostname 是实际要发出去的主机名：环境变量可覆盖，否则按账号稳定假名。
export function outboundHostname(seed) {
  const override = String(process.env.QWENWORK_HOSTNAME ?? "").trim()
  if (override) return override
  return pseudoHostname(seed ?? "qwenwork")
}

// outboundMachineId 用于补齐缺失的 machineId；已有的一律沿用（那是签发时给的）。
export function outboundMachineId(seed) {
  const override = String(process.env.QWENWORK_MACHINE_ID ?? "").trim()
  if (override) return override
  return pseudoMachineId(seed ?? "qwenwork")
}
