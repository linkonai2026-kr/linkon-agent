// Linkon 코어 플러그인 진입점. 서비스 도구를 등록한다 (스파이크 단계: 서버 연동은 아직 없음)
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { EgressDenied } from "./src/grant.ts";
import { buildTools } from "./src/tools.ts";

export default definePluginEntry({
  id: "linkon-core",
  name: "Linkon Core",
  description: "Linkon Agent 코어",
  register(api) {
    // ponytail: 스파이크 스텁. 서버 승인 API·공개키·발주 수단이 정해지면 연결한다. 그 전엔 모든 외부 행동이 거부된다.
    const tools = buildTools({
      readRoot: process.env.LINKON_READ_ROOT ?? process.cwd(),
      requestApproval: async () => undefined,
      egress: async (_req, _grant, _perform) => {
        throw new EgressDenied("no_grant");
      },
      sendOrder: async () => {
        throw new Error("발주 전송 수단이 아직 정해지지 않았습니다.");
      },
    });
    for (const tool of tools) api.registerTool(tool as never);
  },
});
