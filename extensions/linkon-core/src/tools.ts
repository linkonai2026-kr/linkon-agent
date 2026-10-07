// 서비스 도구 정의. external 표시가 붙은 도구는 반드시 승인 관문을 거친다 (테스트가 전수 검사)
import { readdir, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { Type } from "typebox";
import type { EgressRequest } from "./egress.ts";

export type ToolDeps = {
  /** 허용된 읽기 전용 폴더 */
  readRoot: string;
  /** 사람 승인을 요청하고 서버가 서명한 증표를 받는다. 사람이 거절하면 undefined. LLM 은 이 값을 보지 못한다 */
  requestApproval: (req: EgressRequest) => Promise<string | undefined>;
  egress: <T>(
    req: EgressRequest,
    grant: string | undefined,
    perform: () => Promise<T>,
  ) => Promise<T>;
  /** 실제 발주 전송 (외부 행동) */
  sendOrder: (supplier: string, body: string) => Promise<void>;
};

export type LinkonTool = {
  name: string;
  description: string;
  /** 외부로 나가거나 되돌리기 어려운 행동이면 true */
  external: boolean;
  parameters: ReturnType<typeof Type.Object>;
  execute: (id: string, params: never) => Promise<{ content: { type: "text"; text: string }[] }>;
};

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });

async function insideRoot(root: string, target: string): Promise<string> {
  const realRoot = await realpath(root);
  const abs = await realpath(isAbsolute(target) ? target : resolve(realRoot, target));
  const rel = relative(realRoot, abs);
  if (rel.startsWith("..") || isAbsolute(rel)) throw new Error("허용되지 않은 폴더입니다.");
  return abs;
}

export function buildTools(deps: ToolDeps): LinkonTool[] {
  return [
    {
      name: "linkon_list_folder",
      description: "허용된 폴더 안의 파일 이름을 읽기 전용으로 나열한다",
      external: false,
      parameters: Type.Object({ path: Type.String() }),
      async execute(_id, params: { path: string }) {
        const dir = await insideRoot(deps.readRoot, params.path);
        return text((await readdir(dir)).join("\n"));
      },
    },
    {
      name: "linkon_send_order",
      description: "공급처에 발주서를 보낸다. 사장님이 승인해야만 실행된다",
      external: true,
      parameters: Type.Object({ supplier: Type.String(), body: Type.String() }),
      async execute(_id, params: { supplier: string; body: string }) {
        const req: EgressRequest = {
          kind: "order.send",
          target: params.supplier,
          content: params.body,
        };
        const grant = await deps.requestApproval(req);
        await deps.egress(req, grant, () => deps.sendOrder(params.supplier, params.body));
        return text("발주서를 보냈어요.");
      },
    },
  ];
}
