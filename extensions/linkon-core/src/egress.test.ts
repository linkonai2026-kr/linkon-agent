// 승인 관문 검증. 증표가 없거나 위조·만료·재사용·다른 기기·내용 변경이면 실행되지 않음을 증명한다
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createEgress } from "./egress.ts";
import { contentHash, EgressDenied, type GrantPayload } from "./grant.ts";
import { buildTools } from "./tools.ts";

const server = generateKeyPairSync("ed25519");
const attacker = generateKeyPairSync("ed25519");
const NOW = 1_000_000;

function issue(over: Partial<GrantPayload> = {}, key = server.privateKey): string {
  const payload: GrantPayload = {
    v: 1,
    kind: "order.send",
    target: "supplier-1",
    hash: contentHash("우유 10박스"),
    deviceId: "dev-1",
    exp: NOW + 60_000,
    nonce: Math.random().toString(36),
    ...over,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(null, Buffer.from(body, "utf8"), key).toString("base64url")}`;
}

const req = { kind: "order.send", target: "supplier-1", content: "우유 10박스" };
const setup = () =>
  createEgress({
    publicKey: server.publicKey,
    deviceId: "dev-1",
    nonces: new Set<string>() as never,
    now: () => NOW,
  });

// Set 은 has/add 를 가져 NonceStore 와 호환된다
describe("egress", () => {
  it("유효한 증표면 실행한다", async () => {
    const perform = vi.fn(async () => "ok");
    expect(await setup()(req, issue(), perform)).toBe("ok");
    expect(perform).toHaveBeenCalledOnce();
  });

  const bad: [string, () => string | undefined, string][] = [
    ["증표 없음", () => undefined, "no_grant"],
    ["형식 오류", () => "abc", "malformed"],
    ["다른 키로 서명(위조)", () => issue({}, attacker.privateKey), "bad_signature"],
    ["만료", () => issue({ exp: NOW - 1 }), "expired"],
    ["다른 기기", () => issue({ deviceId: "dev-2" }), "wrong_device"],
    ["내용 변경", () => issue({ hash: contentHash("우유 100박스") }), "mismatch"],
    ["다른 대상", () => issue({ target: "supplier-2" }), "mismatch"],
    ["다른 행동 종류", () => issue({ kind: "review.post" }), "mismatch"],
  ];
  for (const [name, token, code] of bad) {
    it(`거부: ${name}`, async () => {
      const perform = vi.fn(async () => "x");
      await expect(setup()(req, token(), perform)).rejects.toMatchObject({ code });
      expect(perform).not.toHaveBeenCalled();
    });
  }

  it("같은 증표 재사용을 거부한다", async () => {
    const egress = setup();
    const token = issue();
    await egress(req, token, async () => 1);
    const perform = vi.fn(async () => 2);
    await expect(egress(req, token, perform)).rejects.toBeInstanceOf(EgressDenied);
    expect(perform).not.toHaveBeenCalled();
  });

  it("실행이 실패해도 증표는 소진된다", async () => {
    const egress = setup();
    const token = issue();
    await expect(
      egress(req, token, async () => {
        throw new Error("네트워크");
      }),
    ).rejects.toThrow("네트워크");
    await expect(egress(req, token, async () => 1)).rejects.toMatchObject({ code: "replay" });
  });
});

describe("도구 전수 검사", () => {
  it("external 도구는 승인이 없거나 위조면 어떤 외부 전송도 하지 않는다", async () => {
    const sendOrder = vi.fn(async () => {});
    for (const approval of [undefined, "abc", issue({}, attacker.privateKey)]) {
      const tools = buildTools({
        readRoot: tmpdir(),
        requestApproval: async () => approval,
        egress: setup(),
        sendOrder,
      });
      for (const tool of tools.filter((t) => t.external)) {
        await expect(
          tool.execute("t", { supplier: "supplier-1", body: "우유 10박스" } as never),
        ).rejects.toBeInstanceOf(EgressDenied);
      }
    }
    expect(sendOrder).not.toHaveBeenCalled();
  });

  it("승인되면 전송한다", async () => {
    const sendOrder = vi.fn(async () => {});
    const tools = buildTools({
      readRoot: tmpdir(),
      requestApproval: async () => issue(),
      egress: setup(),
      sendOrder,
    });
    const tool = tools.find((t) => t.name === "linkon_send_order")!;
    await tool.execute("t", { supplier: "supplier-1", body: "우유 10박스" } as never);
    expect(sendOrder).toHaveBeenCalledWith("supplier-1", "우유 10박스");
  });

  it("읽기 도구는 허용 폴더 밖을 읽지 못한다", async () => {
    const root = await mkdtemp(join(tmpdir(), "linkon-root-"));
    await writeFile(join(root, "sales.csv"), "x");
    const tool = buildTools({
      readRoot: root,
      requestApproval: async () => undefined,
      egress: setup(),
      sendOrder: async () => {},
    }).find((t) => t.name === "linkon_list_folder")!;
    expect((await tool.execute("t", { path: "." } as never)).content[0]!.text).toContain(
      "sales.csv",
    );
    await expect(tool.execute("t", { path: ".." } as never)).rejects.toThrow("허용되지 않은");
    await expect(tool.execute("t", { path: "/etc" } as never)).rejects.toThrow("허용되지 않은");
  });
});
void createHash;
