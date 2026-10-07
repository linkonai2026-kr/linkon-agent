// 서버가 서명한 1회용 승인 증표의 형식과 검증. 기기에는 공개키만 있어 증표를 만들 수 없다
import { createHash, verify, type KeyObject } from "node:crypto";

export type GrantPayload = {
  v: 1;
  kind: string; // 행동 종류 (예: order.send)
  target: string; // 대상 (예: 공급처 id)
  hash: string; // 보낼 내용의 sha256(hex). 사람이 [수정]하면 해시가 바뀌어 새 승인이 필요하다
  deviceId: string;
  exp: number; // 만료 시각(ms)
  nonce: string;
};

export type GrantDenyCode =
  | "no_grant"
  | "malformed"
  | "bad_signature"
  | "expired"
  | "wrong_device"
  | "mismatch"
  | "replay";

export class EgressDenied extends Error {
  constructor(readonly code: GrantDenyCode) {
    super(`외부 행동이 거부되었습니다 (${code})`);
    this.name = "EgressDenied";
  }
}

export const contentHash = (content: string): string =>
  createHash("sha256").update(content, "utf8").digest("hex");

const b64u = (s: string): Buffer => Buffer.from(s, "base64url");

/** `payload.signature` (둘 다 base64url). 서명 대상은 payload 문자열 그대로 */
export function parseAndVerifyGrant(token: string | undefined, publicKey: KeyObject): GrantPayload {
  if (!token) throw new EgressDenied("no_grant");
  const parts = token.split(".");
  if (parts.length !== 2) throw new EgressDenied("malformed");
  const [body, sig] = parts as [string, string];
  if (!verify(null, Buffer.from(body, "utf8"), publicKey, b64u(sig)))
    throw new EgressDenied("bad_signature");
  let payload: GrantPayload;
  try {
    payload = JSON.parse(b64u(body).toString("utf8")) as GrantPayload;
  } catch {
    throw new EgressDenied("malformed");
  }
  if (payload?.v !== 1 || typeof payload.exp !== "number" || typeof payload.nonce !== "string")
    throw new EgressDenied("malformed");
  return payload;
}
