// 외부로 나가는 모든 행동이 거치는 단일 관문. 유효한 승인 증표가 없으면 perform 은 호출되지 않는다
import type { KeyObject } from "node:crypto";
import { contentHash, EgressDenied, parseAndVerifyGrant } from "./grant.ts";

export type EgressRequest = { kind: string; target: string; content: string };

export type NonceStore = { has(nonce: string): boolean; add(nonce: string): void };

export type EgressDeps = {
  publicKey: KeyObject;
  deviceId: string;
  nonces: NonceStore;
  now?: () => number;
};

export function createEgress(deps: EgressDeps) {
  const now = deps.now ?? Date.now;
  return async function egress<T>(
    req: EgressRequest,
    grantToken: string | undefined,
    perform: () => Promise<T>,
  ): Promise<T> {
    const grant = parseAndVerifyGrant(grantToken, deps.publicKey);
    if (grant.exp <= now()) throw new EgressDenied("expired");
    if (grant.deviceId !== deps.deviceId) throw new EgressDenied("wrong_device");
    if (
      grant.kind !== req.kind ||
      grant.target !== req.target ||
      grant.hash !== contentHash(req.content)
    )
      throw new EgressDenied("mismatch");
    if (deps.nonces.has(grant.nonce)) throw new EgressDenied("replay");
    // 먼저 소진한다. 실행이 실패해도 같은 증표로 다시 보낼 수 없다
    deps.nonces.add(grant.nonce);
    return perform();
  };
}
