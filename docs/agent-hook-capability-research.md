# 에이전트 훅 역량 조사

작성일: 2026-04-26

대상: Codex, Claude Code, GitHub Copilot, Cursor.

목표: oh-my-trace가 AI 작업 로그를 수집하기 위해 필요한 시점의 훅을 각 에이전트가 제공하는지, 그리고 그 훅에서 충분한 데이터를 받을 수 있는지 확인한다.

필요한 수집 시점은 다음과 같다.

- 세션 시작 / 재개
- 사용자 프롬프트 제출
- 도구 호출 전
- 도구 호출 후
- 어시스턴트 턴 / 에이전트 응답 종료
- 세션 종료
- transcript 또는 대화 참조
- 현재 작업 디렉터리 / 프로젝트 식별 정보

## 요약 결론

| 에이전트 | OMT 관점의 훅 성숙도 | 권장 수집 경로 | 주요 리스크 |
| --- | --- | --- | --- |
| Codex | 높음 | Codex native hooks | 훅이 feature flag 뒤에 있으며, 일부 도구 호출 interception은 아직 불완전하다. |
| Claude Code | 매우 높음 | Claude Code native hooks | 훅 표면이 넓으므로 실제 설치 버전에서 payload fixture 검증이 필요하다. |
| GitHub Copilot | 중간-높음 | Copilot cloud agent / Copilot CLI hooks | Codex/Claude보다 payload가 단순하며, hook payload에 transcript path가 문서화되어 있지 않다. |
| Cursor | 불명확 / 불안정 | native hooks 가능성 확인 후 사용, 대안은 MCP 또는 로컬 transcript 조사 | 공개된 hook surface가 공식 문서, Marketplace plugin, 커뮤니티 보고 사이에서 일관되지 않다. |

MVP 권장 순서:

1. Codex와 Claude Code를 1차 지원 대상으로 둔다.
2. Copilot은 prompt/tool/session 훅만으로 충분한지 확인한 뒤 2차로 붙인다.
3. Cursor는 설치된 로컬 버전에서 fixture를 먼저 확보하기 전까지 production MVP adapter로 확정하지 않는다.

## OMT가 원하는 훅 시점

| OMT 이벤트 | 필요한 이유 | 최소 필요 payload |
| --- | --- | --- |
| `session_started` | 세션, 기기, 프로젝트 경계를 만든다. | session id, cwd/project root, start source, timestamp |
| `user_prompt_submitted` | Work Entry 후보의 시작 경계를 만든다. | prompt, session id, cwd, timestamp |
| `tool_started` | 파일 읽기/쓰기, shell, MCP 사용을 관찰한다. | tool name, tool input, cwd, session/turn id |
| `tool_completed` | 명령 출력, 파일 편집 결과, 실패 여부를 관찰한다. | tool name, tool input, result/output, status |
| `turn_completed` | Work Entry 후보를 닫는다. | assistant final text 또는 transcript ref, status |
| `session_ended` | 세션 cleanup과 최종 메타데이터를 남긴다. | reason/status, session id, cwd, timestamp |

## Codex

출처:

- OpenAI Codex Hooks: https://developers.openai.com/codex/hooks
- OpenAI Codex Config Reference: https://developers.openai.com/codex/config-reference

Codex는 native hook framework를 제공한다. 현재는 다음 feature flag가 필요하다.

```toml
[features]
codex_hooks = true
```

훅 위치:

- `~/.codex/hooks.json`
- `~/.codex/config.toml`
- `<repo>/.codex/hooks.json`
- `<repo>/.codex/config.toml`

OMT에 관련 있는 Codex 훅은 다음과 같다.

| Codex hook | OMT 용도 | Payload 핵심 |
| --- | --- | --- |
| `SessionStart` | `session_started` | common fields + `source` (`startup`, `resume`, `clear`) |
| `UserPromptSubmit` | `user_prompt_submitted` | common fields + `turn_id`, `prompt` |
| `PreToolUse` | `tool_started` | common fields + `turn_id`, `tool_name`, `tool_use_id`, `tool_input` |
| `PermissionRequest` | 승인/audit 보조 정보 | common fields + `turn_id`, `tool_name`, `tool_input`, optional approval description |
| `PostToolUse` | `tool_completed` | common fields + `turn_id`, `tool_name`, `tool_use_id`, `tool_input`, `tool_response` |
| `Stop` | `turn_completed` | common fields + `turn_id`, `stop_hook_active`, `last_assistant_message` |

공통 입력 필드:

- `session_id`
- `transcript_path`
- `cwd`
- `hook_event_name`
- `model`

oh-my-trace 적합성:

- 세션, 프롬프트, 도구, 턴 종료 수집에 적합하다.
- `transcript_path`가 직접 제공되므로 raw log 참조에 유리하다.
- `cwd`가 직접 제공된다.
- turn-scoped hook에는 `turn_id`가 있다.

제약:

- 훅이 현재 feature flag 뒤에 있다.
- `PreToolUse` / `PostToolUse`가 모든 가능한 동작을 가로채지는 않는다. 문서상 일부 shell 경로와 non-shell/non-MCP 도구 interception은 불완전하다.
- `Stop`은 턴 종료이지, 애플리케이션이나 전체 세션 종료를 의미하지는 않는다.

OMT adapter 판단:

- 1차 구현 대상으로 적합하다.
- 받은 hook JSON을 raw event로 그대로 저장한다.
- 첫 Work Entry 후보 경계는 `UserPromptSubmit` + `Stop` 조합으로 잡는다.
- 명령/편집 근거는 `PostToolUse`에서 수집한다.

## Claude Code

출처:

- Claude Code Hooks Guide: https://code.claude.com/docs/en/hooks-guide
- Claude Code Hooks Reference: https://code.claude.com/docs/en/hooks

Claude Code는 조사 대상 중 가장 풍부한 hook surface를 제공한다.

훅 위치:

- `~/.claude/settings.json`
- `.claude/settings.json`
- `.claude/settings.local.json`
- managed policy settings
- plugin / skill / agent-provided hooks

OMT에 관련 있는 Claude Code 훅은 다음과 같다.

| Claude Code hook | OMT 용도 | Payload 핵심 |
| --- | --- | --- |
| `SessionStart` | `session_started` | common fields + `source` (`startup`, `resume`, `clear`, `compact`) |
| `UserPromptSubmit` | `user_prompt_submitted` | common fields + `prompt` |
| `PreToolUse` | `tool_started` | common fields + `tool_name`, `tool_input` |
| `PermissionRequest` | 승인/audit 보조 정보 | permission prompt data |
| `PostToolUse` | `tool_completed` | common fields + `tool_name`, `tool_input`, `tool_response` |
| `PostToolUseFailure` | 실패한 tool 결과 | failed tool payload |
| `PostToolBatch` | 다음 model call 전 batch 경계 | 병렬 tool call 결과 묶음 |
| `Notification` | 대기/권한 요청 알림 | notification type/message |
| `SubagentStart` | subagent 시작 | agent type/name |
| `SubagentStop` | subagent 완료 | subagent result boundary |
| `Stop` | `turn_completed` | main agent 응답 완료 |
| `StopFailure` | 실패한 turn | API/error boundary |
| `PreCompact` / `PostCompact` | transcript/context lifecycle | compaction trigger |
| `SessionEnd` | `session_ended` | common fields + reason |
| `CwdChanged` | project/cwd 추적 | cwd changes |
| `FileChanged` | 파일 watch 반응 | watched file changes |

공통 입력 필드는 이벤트에 따라 조금씩 다르지만, 주요 필드는 다음이다.

- `session_id`
- `transcript_path`
- `cwd`
- `hook_event_name`
- permission mode 및 관련 세션 메타데이터

oh-my-trace 적합성:

- 매우 적합하다.
- session start, prompt submit, tool before/after, stop, session end, transcript path, cwd를 모두 확보할 수 있다.
- success/failure hook이 분리되어 있어 도구 결과 품질을 Codex보다 더 세밀하게 기록할 수 있다.
- `PostToolBatch`는 다음 model call 전 병렬 tool call 묶음을 그룹화하는 데 유용하다.

제약:

- hook surface가 넓으므로 OMT는 최소 subset부터 시작해야 한다.
- 훅은 동작을 제어하거나 바꿀 수 있으므로, OMT 훅은 사용자가 명시적으로 요청하지 않는 한 관찰 전용이어야 한다.
- Claude Code는 빠르게 변하고 있으므로 설치된 로컬 버전에서 fixture 확인이 필요하다.

OMT adapter 판단:

- Codex와 함께 1차 구현 대상으로 적합하다.
- 최소 초기 이벤트는 `SessionStart`, `UserPromptSubmit`, `PostToolUse`, `PostToolUseFailure`, `Stop`, `SessionEnd`로 잡는다.
- `PreToolUse`는 실행 전 audit가 필요할 때만 사용한다. passive logging에는 `PostToolUse`가 더 안전하다.

## GitHub Copilot

출처:

- About Copilot hooks: https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-hooks
- Hooks configuration reference: https://docs.github.com/en/copilot/reference/hooks-configuration
- Use hooks: https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/use-hooks

GitHub 문서는 Copilot cloud agent와 GitHub Copilot CLI 모두에 대해 hooks를 설명한다.

훅 위치:

- Copilot cloud agent: repository default branch의 `.github/hooks/*.json`
- Copilot CLI: GitHub how-to 기준으로 current working directory에서 hook을 로드

OMT에 관련 있는 Copilot 훅은 다음과 같다.

| Copilot hook | OMT 용도 | Payload 핵심 |
| --- | --- | --- |
| `sessionStart` | `session_started` | `timestamp`, `cwd`, `source`, optional `initialPrompt` |
| `sessionEnd` | `session_ended` | `timestamp`, `cwd`, `reason` |
| `userPromptSubmitted` | `user_prompt_submitted` | `timestamp`, `cwd`, `prompt` |
| `preToolUse` | `tool_started` | `timestamp`, `cwd`, `toolName`, JSON string 형태의 `toolArgs` |
| `postToolUse` | `tool_completed` | `timestamp`, `cwd`, `toolName`, `toolArgs`, `toolResult` |
| `agentStop` | `turn_completed` | 개념적으로 문서화되어 있으나 현재 reference page에서 상세 schema는 확인하지 못함 |
| `subagentStop` | subagent 완료 | 개념적으로 문서화되어 있으나 현재 reference page에서 상세 schema는 확인하지 못함 |
| `errorOccurred` | error boundary | `timestamp`, `cwd`, `error` object |

oh-my-trace 적합성:

- prompt/tool/session 수준 로그에는 충분할 가능성이 높다.
- Codex/Claude보다 payload는 단순하다.
- `postToolUse.toolResult`에는 `resultType`, `textResultForLlm` 같은 필드가 있어 명령/test 결과 기록에 유용하다.

제약:

- 문서에서 확인한 hook payload snippet에는 `session_id`, `turn_id`, `transcript_path`가 없다.
- `userPromptSubmitted`의 출력은 무시되므로 logging-only 성격이다.
- `preToolUse` schema에는 `allow`, `deny`, `ask`가 보이지만 현재 처리되는 값은 `deny` 중심으로 문서화되어 있다.
- Copilot cloud hook은 repository default branch에 있어 user-local OMT logging과 잘 맞지 않을 수 있다. Local-first 관점에서는 Copilot CLI가 더 적합할 가능성이 높다.

OMT adapter 판단:

- 가능하지만 Codex/Claude보다 정보가 적다.
- Copilot이 stable session id를 제공하지 않으면 OMT가 local session id를 생성해야 한다.
- Copilot CLI 실제 hook payload에 문서에 없는 session field나 session data path가 있는지 spike가 필요하다.

## Cursor

출처:

- Cursor Enterprise blog with hooks example: https://cursor.com/blog/enterprise
- Cursor Marketplace hook example: https://cursor.com/marketplace/hooks/pretooluse
- Cursor marketplace source example: https://github.com/vercel/vercel-plugin/blob/eb3b6f19e9ca59b23c88d7cc8dfe609388be0fc7/hooks/hooks.json
- Cursor community report listing valid native hook types: https://forum.cursor.com/t/unknown-hook-type-sessionstart/149566
- Cursor community report about `sessionStart` output not being injected: https://forum.cursor.com/t/sessionstart-hook-additional-context-is-never-injected-into-agents-initial-system-context/158452
- Third-party typed Cursor hook package reference: https://context7.com/beautyfree/cursor-hook

Cursor는 hook support가 있는 것으로 보이지만, 네 에이전트 중 public surface가 가장 불명확하다.

공식 또는 공식에 가까운 출처에서 관찰한 hook 이름:

- Cursor Enterprise blog는 `beforeSubmitPrompt`, `beforeShellCommand` 예시를 보여준다.
- Cursor Marketplace는 `SessionStart`, `PreToolUse`, `UserPromptSubmit`, `PostToolUse`, `SubagentStart`, `SessionEnd` 같은 hook을 보여준다.
- 2026년 1월 Cursor community report에서는 project hook의 valid type으로 다음을 언급한다.
  - `beforeShellExecution`
  - `afterShellExecution`
  - `beforeMCPExecution`
  - `afterMCPExecution`
  - `beforeReadFile`
  - `afterFileEdit`
  - `beforeTabFileRead`
  - `afterTabFileEdit`
  - `stop`
  - `beforeSubmitPrompt`
  - `afterAgentResponse`
  - `afterAgentThought`

Third-party type 정보 기준으로는 payload에 다음이 포함될 가능성이 있다.

- common fields: `conversation_id`, `generation_id`, `model`, `hook_event_name`, `cursor_version`, `workspace_roots`, `user_email`, `transcript_path`
- `beforeSubmitPrompt`: `prompt`, `attachments`
- `beforeShellExecution`: `command`, `cwd`
- `afterShellExecution`: command/result fields
- `afterFileEdit`: `file_path`, `edits`
- `preToolUse` / `postToolUse`: `tool_name`, `tool_input`, `tool_use_id`, `cwd`, tool output/duration
- `sessionStart`: `session_id`, `is_background_agent`, optional composer mode
- `stop`: `status`, `loop_count`

oh-my-trace 적합성:

- Third-party type surface가 설치된 Cursor runtime과 일치한다면 매우 유용할 수 있다.
- Cursor-specific event인 `afterFileEdit`, `beforeShellExecution`, `afterShellExecution`는 generic tool hook보다 OMT에 직접적으로 유용할 수 있다.
- native payload에 `transcript_path`가 실제로 있다면 Cursor adapter도 강력해질 수 있다.

제약:

- 공식 문서만으로는 hook contract가 안정적이라고 보기 어렵다.
- 이전 blog 예시, Marketplace plugin, native project hook, community report 사이에서 이벤트 이름이 일관되지 않다.
- 최근 community report에서는 `additional_context` 같은 일부 documented output behavior가 실행은 되지만 agent context에 반영되지 않는 문제가 보고되어 있다.

OMT adapter 판단:

- local fixture spike 전에는 production MVP adapter로 구현하지 않는다.
- Spike에서는 `~/.cursor/hooks.json` 또는 project `.cursor` hook config를 만들고 다음 이벤트를 확인한다.
  - `sessionStart`
  - `beforeSubmitPrompt`
  - `beforeShellExecution`
  - `afterShellExecution`
  - `beforeMCPExecution`
  - `afterMCPExecution`
  - `afterFileEdit`
  - `stop`
  - `afterAgentResponse`
- 각 hook은 stdin raw JSON을 local JSONL fixture file에 append해야 한다.

## 에이전트별 coverage matrix

| OMT가 원하는 시점 | Codex | Claude Code | GitHub Copilot | Cursor |
| --- | --- | --- | --- | --- |
| Session start | `SessionStart` | `SessionStart` | `sessionStart` | likely `sessionStart`, but verify |
| Session end | Codex hook에서는 명확하지 않음 | `SessionEnd` | `sessionEnd` | likely `sessionEnd`, but verify |
| User prompt | `UserPromptSubmit` | `UserPromptSubmit` | `userPromptSubmitted` | likely `beforeSubmitPrompt` |
| Before tool | `PreToolUse` | `PreToolUse` | `preToolUse` | likely `beforeShellExecution`, `beforeMCPExecution`, `preToolUse` |
| After tool | `PostToolUse` | `PostToolUse`, `PostToolUseFailure`, `PostToolBatch` | `postToolUse` | likely `afterShellExecution`, `afterMCPExecution`, `afterFileEdit`, `postToolUse` |
| Agent/turn finished | `Stop` | `Stop`, `StopFailure` | `agentStop` | likely `stop`, `afterAgentResponse` |
| Transcript path | 있음 | 있음 | 문서상 없음 | 가능성은 있으나 미검증 |
| CWD/project path | 있음 | 있음 | 있음 | likely 있음 |
| Tool result/output | 있음 | 있음 | 있음 | likely 있음 |

## MVP에 주는 영향

OMT MVP는 단일한 "session id = 작업 경계" 모델로 설계하면 안 된다. 훅 조사 결과도 기존 기획의 판단을 뒷받침한다. 실제로는 prompt, turn, tool boundary가 더 유용하다.

권장 초기 adapter model:

```text
Agent hook payload
  -> raw_event JSONL
  -> normalized OMT event
  -> Work Entry candidate grouped by:
       agent + device + cwd/project + session_id/conversation_id + turn_id/generation_id + local date
```

권장 normalized event fields:

```json
{
  "id": "omt_event_id",
  "agent": "codex|claude-code|copilot|cursor",
  "event_type": "session_started|user_prompt_submitted|tool_started|tool_completed|turn_completed|session_ended|error",
  "occurred_at": "ISO-8601 timestamp",
  "cwd": "/absolute/path",
  "project_hint": "/absolute/path-or-repo-root",
  "session_id": "agent session id if available",
  "turn_id": "agent turn/generation id if available",
  "transcript_path": "path if available",
  "tool_name": "name if tool event",
  "status": "success|failure|denied|completed|aborted|unknown",
  "raw_event_ref": "local raw log record id"
}
```

## Phase 0 spike 질문

1. Codex: 이 desktop/CLI 환경에서 `transcript_path`가 항상 존재하고 읽을 수 있는가?
2. Codex: `Stop.last_assistant_message`가 Work Entry summary에 쓸 만큼 안정적으로 최종 답변을 담는가?
3. Claude Code: 설치된 버전에서 실제 지원하는 hook 목록이 현재 `code.claude.com` reference와 일치하는가?
4. Claude Code: terminal close, `/clear`, interrupted session에서 `SessionEnd`가 일관되게 발생하는가?
5. Copilot CLI: 실제 hook payload에 문서에 없는 hidden session id나 transcript/session data path가 있는가?
6. Copilot cloud agent: cloud hook에서 local-first `omt` CLI를 호출할 수 있는가, 아니면 Copilot CLI에만 의미가 있는가?
7. Cursor: 설치된 Cursor 버전에서 실제로 지원하는 hook config file 위치는 어디인가?
8. Cursor: 현재 유효한 event name은 무엇인가?
9. Cursor: raw payload에 `transcript_path`, `conversation_id`, `generation_id`, `workspace_roots`가 포함되는가?
10. Cursor: `stop` 또는 `afterAgentResponse`가 Work Entry를 닫을 만큼 충분한 final response text를 제공하는가?

## 권장 fixture spike 산출물

에이전트별로 JSONL 파일을 하나씩 만든다.

```text
docs/fixtures/hooks/codex-hooks.jsonl
docs/fixtures/hooks/claude-code-hooks.jsonl
docs/fixtures/hooks/copilot-hooks.jsonl
docs/fixtures/hooks/cursor-hooks.jsonl
```

각 line은 다음 형태를 권장한다.

```json
{
  "captured_at": "ISO-8601",
  "agent": "codex",
  "hook": "UserPromptSubmit",
  "stdin": {},
  "env_sample": {
    "cwd": "/path",
    "selected_agent_env_vars": {}
  }
}
```

secret은 포함하지 않는다. 필요한 경우 prompt나 command output은 redaction한다.
