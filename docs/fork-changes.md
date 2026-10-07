# Linkon 포크 변경 기록

기준 업스트림 `openclaw/openclaw` v2026.9.8 (fc23bc8). 원본을 고친 곳은 전부 여기에 적는다.
원칙은 "원본 무수정, 추가는 `extensions/linkon-*`, 제한은 설정으로".

## 원본 파일 수정

| 파일             | 내용                                             | 이유                     | 병합 시 주의                                      |
| ---------------- | ------------------------------------------------ | ------------------------ | ------------------------------------------------- |
| `pnpm-lock.yaml` | 새 워크스페이스 패키지 `@linkon/agent-core` 항목 | 패키지 추가 시 자동 갱신 | 충돌하면 업스트림 것을 받고 `pnpm install` 재실행 |

## 추가한 것

| 경로                      | 내용                                                                                            |
| ------------------------- | ----------------------------------------------------------------------------------------------- |
| `extensions/linkon-core/` | 승인 증표 검증(`src/grant.ts`), 단일 관문(`src/egress.ts`), 서비스 도구(`src/tools.ts`), 테스트 |
| `docs/fork-changes.md`    | 이 문서                                                                                         |

## 잠금 설정 (코드가 아니라 설정으로 제한)

스파이크로 검증한 최소 설정 (2026-10-07, macOS 소스 실행).

```json
{
  "gateway": { "mode": "local", "bind": "loopback", "auth": { "mode": "token" } },
  "plugins": {
    "allow": ["linkon-core"],
    "entries": { "linkon-core": { "enabled": true } },
    "slots": { "memory": "none" }
  },
  "tools": { "profile": "minimal", "allow": ["linkon_list_folder", "linkon_send_order"] }
}
```

검증된 동작

- 기동 시 로드되는 플러그인은 `linkon-core` 하나뿐. 기본값은 163개 중 88개가 켜져 있으므로 **`plugins.allow` 가 필수**다. `slots.memory: "none"` 없이는 `memory-core` 가 따라 올라오고 정기 작업까지 만든다.
- 리슨 소켓은 `127.0.0.1` 과 `::1` 뿐.
- `/tools/invoke` 로 `exec`·`read`·`web_fetch` 호출 시 "Tool not available". 허용한 두 도구만 보인다.
- 외부 행동 도구는 승인 증표가 없으면 `EgressDenied` 로 실패한다.

## 개발 환경 격리

개인 `~/.openclaw` 를 건드리지 않도록 `OPENCLAW_STATE_DIR` 과 `OPENCLAW_HOME` 을 포크 밖 폴더로 지정한다.

## 업스트림 병합 절차

`docs/agent-plan.md` §2-4 (linkon-v1 저장소) 참고. 브랜치는 `upstream-mirror`(업스트림 태그 그대로)와 `linkon/main`(우리 수정).
