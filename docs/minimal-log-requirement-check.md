# 최소 로그 수집 요건 검토

작성일: 2026-04-26

## 검토 기준

oh-my-trace가 1차 MVP에서 반드시 저장해야 하는 정보는 다음 세 가지로 줄인다.

1. 사용자가 제출한 프롬프트
2. 에이전트가 사용자에게 출력한 내용
3. 도구 사용 전/후에 어떤 도구를 사용했는지 알 수 있는 정보

도구가 읽거나 작성한 파일 내용, shell command output, MCP tool result 본문은 기본 저장 대상에서 제외한다. 도구 이벤트에서는 `tool_name`, 상태, 시각, cwd, session/turn 식별자 정도만 저장한다.

## 결론 요약

| 에이전트 | 최소 요건 충족 여부 | 판단 |
| --- | --- | --- |
| Codex | 충족 | `UserPromptSubmit.prompt`, `Stop.last_assistant_message`, `PreToolUse`/`PostToolUse.tool_name`으로 충족한다. |
| Claude Code | 충족 | `UserPromptSubmit.prompt`, `Stop.last_assistant_message`, `PreToolUse`/`PostToolUse.tool_name`으로 충족한다. |
| GitHub Copilot | 조건부 충족 | hook만 보면 agent output payload schema가 불명확하다. Copilot CLI의 local session data까지 사용하면 prompts, responses, tools를 모두 확보할 수 있다. |
| Cursor | 조건부 충족 | Cursor IDE hooks 기준으로는 `beforeSubmitPrompt`, `afterAgentResponse`, tool hooks로 충족 가능성이 높다. Cursor CLI/headless는 일부 hook이 누락된다는 보고가 있어 별도 spike가 필요하다. |

MVP 우선순위는 다음이 적절하다.

1. Codex
2. Claude Code
3. GitHub Copilot CLI
4. Cursor IDE
5. Cursor CLI/headless 또는 Copilot cloud agent는 fixture 확인 후 결정

## Codex

출처:

- OpenAI Codex Hooks: https://developers.openai.com/codex/hooks

### 1. 사용자 프롬프트 저장

충족한다.

`UserPromptSubmit` hook은 사용자의 prompt가 모델에 보내지기 전에 실행되며, 입력 payload에 다음 필드를 제공한다.

- `session_id`
- `transcript_path`
- `cwd`
- `hook_event_name`
- `model`
- `turn_id`
- `prompt`

OMT는 `UserPromptSubmit.prompt`를 저장하면 된다.

### 2. 에이전트 출력 저장

충족한다.

`Stop` hook은 턴이 끝날 때 실행되며, 입력 payload에 `last_assistant_message`가 포함된다. 이 값은 최신 assistant message text이다.

OMT는 `Stop.last_assistant_message`를 저장하면 된다. `transcript_path`도 공통 필드로 제공되므로, 필요하면 원본 transcript를 나중에 참조할 수 있다.

### 3. 도구 사용 전/후 도구명 저장

충족한다.

`PreToolUse`와 `PostToolUse`는 `tool_name`, `tool_use_id`, `tool_input`을 제공한다. OMT는 `tool_input` 전체를 저장할 필요 없이 다음 정도만 저장하면 된다.

- `tool_name`
- `tool_use_id`
- `turn_id`
- `cwd`
- `hook_event_name`
- `status` 또는 pre/post 구분

주의할 점은 Codex 문서가 일부 shell 경로와 non-shell/non-MCP 도구 interception이 아직 불완전하다고 밝힌다는 것이다. 그래도 MVP의 “어떤 도구를 썼는지 정도” 수집에는 충분하다.

### Codex 판정

Codex는 최소 요건을 충족한다. 1차 adapter로 구현해도 된다.

## Claude Code

출처:

- Claude Code Hooks Reference: https://code.claude.com/docs/en/hooks

### 1. 사용자 프롬프트 저장

충족한다.

Claude Code의 `UserPromptSubmit`은 사용자가 prompt를 제출하고 Claude가 처리하기 전에 실행된다. hook input에는 prompt text가 포함된다.

OMT는 `UserPromptSubmit.prompt`를 저장하면 된다.

### 2. 에이전트 출력 저장

충족한다.

Claude Code의 `Stop` hook은 main agent가 응답을 끝냈을 때 실행된다. 문서상 `Stop` input에는 `last_assistant_message`가 포함되며, 이 필드는 Claude의 final response text를 담는다.

Subagent까지 기록하려면 `SubagentStop.last_assistant_message`도 추가로 저장할 수 있다. 다만 MVP에서는 main agent의 `Stop.last_assistant_message`만으로 충분하다.

### 3. 도구 사용 전/후 도구명 저장

충족한다.

Claude Code의 `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PostToolBatch`는 tool event를 제공한다. 각 tool event에는 `tool_name`과 관련 입력/응답 정보가 들어간다.

OMT는 tool payload 전체를 저장하지 않고 다음만 저장하면 된다.

- `tool_name`
- `tool_use_id`
- `hook_event_name`
- `cwd`
- 성공/실패 여부
- duration이 있으면 `duration_ms`

파일 내용이나 tool response 본문은 저장하지 않는다.

### Claude Code 판정

Claude Code는 최소 요건을 충족한다. Codex와 함께 1차 adapter로 구현해도 된다.

## GitHub Copilot

출처:

- GitHub Copilot hooks overview: https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-hooks
- GitHub Copilot hooks configuration: https://docs.github.com/en/copilot/reference/hooks-configuration
- GitHub Copilot CLI session data: https://docs.github.com/en/copilot/concepts/agents/copilot-cli/chronicle
- GitHub Copilot CLI command reference: https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference

### 1. 사용자 프롬프트 저장

충족한다.

`userPromptSubmitted` hook은 사용자가 prompt를 제출했을 때 실행된다. 입력 payload에는 다음 필드가 문서화되어 있다.

- `timestamp`
- `cwd`
- `prompt`

OMT는 `userPromptSubmitted.prompt`를 저장하면 된다.

### 2. 에이전트 출력 저장

조건부로 충족한다.

GitHub 문서는 `agentStop` hook이 main agent가 prompt에 대한 응답을 끝냈을 때 실행된다고 설명한다. 다만 현재 확인한 hook configuration reference에서는 `agentStop`의 상세 input schema나 assistant output text 필드가 명확히 보이지 않았다.

대신 Copilot CLI는 session data를 로컬에 저장한다고 문서화되어 있다. 이 session data에는 prompts, Copilot responses, used tools, modified files details가 포함된다. 따라서 Copilot CLI adapter는 다음 두 경로 중 하나로 구현해야 한다.

1. `agentStop` hook payload에 response text가 실제로 있는지 fixture로 확인한다.
2. 없다면 `~/.copilot/session-state/` 또는 session store에서 response text를 읽는 보조 collector를 둔다.

Copilot cloud agent는 local-first OMT CLI가 cloud 환경에서 직접 접근 가능한지 불명확하므로 별도 판단이 필요하다.

### 3. 도구 사용 전/후 도구명 저장

충족한다.

`preToolUse` payload에는 `toolName`, `toolArgs`가 있다. `postToolUse` payload에는 `toolName`, `toolArgs`, `toolResult`가 있다.

OMT는 `toolResult.textResultForLlm`을 저장하지 않고 다음만 저장하면 된다.

- `toolName`
- pre/post 구분
- `timestamp`
- `cwd`
- `toolResult.resultType` 정도의 상태값

### GitHub Copilot 판정

Copilot은 최소 요건을 “hook만으로 즉시 충족”한다고 단정하기 어렵다. prompt와 tool name은 hook으로 충분하지만, agent output은 `agentStop` payload fixture 또는 Copilot CLI local session data 확인이 필요하다.

MVP에서는 Copilot CLI를 2차 adapter로 두고, Phase 0 spike에서 `agentStop` payload와 `~/.copilot/session-state/` 구조를 확인한다.

## Cursor

출처:

- Cursor Enterprise blog: https://cursor.com/blog/enterprise
- Cursor Hooks docs: https://cursor.com/docs/hooks
- Cursor Marketplace hook examples: https://cursor.com/marketplace/hooks/beforesubmitprompt
- Cursor community example with `beforeSubmitPrompt` and `afterAgentResponse`: https://forum.cursor.com/t/hook-beforesubmitprompt-afteragentresponse/148602
- Cursor CLI hook gap report: https://forum.cursor.com/t/hooks-afteragentresponse-afteragentthought-not-firing-in-headless-cli/156220

### 1. 사용자 프롬프트 저장

조건부로 충족한다.

Cursor는 `beforeSubmitPrompt` hook을 제공한다. Cursor Enterprise blog에서도 prompt와 completion logging을 hooks의 observability 사용 사례로 언급한다.

커뮤니티 fixture 예시에서는 `beforeSubmitPrompt` payload에 다음 필드가 있었다.

- `conversation_id`
- `generation_id`
- `model`
- `prompt`
- `attachments`
- `hook_event_name`
- `cursor_version`
- `workspace_roots`
- `user_email`

OMT는 `beforeSubmitPrompt.prompt`를 저장하면 된다.

### 2. 에이전트 출력 저장

조건부로 충족한다.

Cursor IDE에서는 `afterAgentResponse` hook이 agent response 후 실행되는 것으로 보이며, 커뮤니티 fixture에는 `afterAgentResponse` payload의 `text` 필드에 agent output이 들어간 사례가 있다.

다만 Cursor CLI/headless에서는 `afterAgentResponse`와 `afterAgentThought`가 dispatch되지 않는다는 보고가 있다. 해당 보고에서는 CLI 모드에서 `stop` hook이 가장 가까운 대체재라고 설명하지만, `stop` payload가 response text를 안정적으로 제공하는지는 별도 확인이 필요하다.

따라서 Cursor는 다음처럼 나누어 본다.

- Cursor IDE: 최소 요건 충족 가능성이 높다.
- Cursor CLI/headless: 현재 정보만으로는 미충족 또는 미확정이다.

### 3. 도구 사용 전/후 도구명 저장

조건부로 충족한다.

Cursor hook surface에는 다음 이벤트들이 관찰된다.

- `beforeShellExecution`
- `afterShellExecution`
- `beforeMCPExecution`
- `afterMCPExecution`
- `beforeReadFile`
- `afterFileEdit`
- `preToolUse`
- `postToolUse`

OMT는 도구 결과 본문을 저장하지 않고 다음만 저장하면 된다.

- event name
- shell/MCP/read/edit 등 tool category
- command 또는 tool name
- cwd 또는 workspace root
- `conversation_id`
- `generation_id`

단, Cursor는 공식 문서, Marketplace plugin, 커뮤니티 보고 사이에서 event name이 일관되지 않다. 설치된 Cursor 버전에서 실제 hook event list와 payload fixture를 먼저 확보해야 한다.

### Cursor 판정

Cursor IDE는 최소 요건을 충족할 가능성이 높지만, production adapter로 확정하기 전 fixture spike가 필요하다. Cursor CLI/headless는 현재 조사 기준으로 최소 요건을 충족한다고 보기 어렵다.

## 최소 저장 schema 제안

요건을 줄였으므로 raw event 저장과 normalized event 저장을 분리한다. 기본 DB에는 다음 정도만 저장한다.

```json
{
  "id": "omt_event_id",
  "agent": "codex|claude-code|copilot|cursor",
  "event_type": "user_prompt|agent_output|tool_observed",
  "occurred_at": "ISO-8601",
  "cwd": "/absolute/path",
  "session_id": "optional",
  "turn_id": "optional",
  "conversation_id": "optional",
  "generation_id": "optional",
  "content": "prompt or agent output only",
  "tool_name": "optional",
  "tool_phase": "before|after|failure|unknown",
  "tool_status": "success|failure|denied|unknown",
  "source_hook": "UserPromptSubmit|Stop|PostToolUse|..."
}
```

도구 이벤트에서는 `content`를 비워둔다. 도구 입력과 결과 본문은 기본 저장하지 않는다.

## Phase 0 fixture 확인 항목

Codex:

- `UserPromptSubmit.prompt`가 실제 prompt 전체를 담는지 확인한다.
- `Stop.last_assistant_message`가 최종 출력 전체를 담는지 확인한다.
- `PostToolUse.tool_name`만 저장해도 충분한지 확인한다.

Claude Code:

- `UserPromptSubmit.prompt`와 `Stop.last_assistant_message`를 fixture로 저장한다.
- `PostToolUse`와 `PostToolUseFailure`에서 `tool_name`, 상태, duration만 추출한다.

GitHub Copilot:

- `agentStop` hook stdin에 response text가 있는지 확인한다.
- 없으면 `~/.copilot/session-state/`에서 prompt/response/tool list를 읽는 방법을 확인한다.
- cloud agent hook과 local CLI hook의 payload 차이를 분리한다.

Cursor:

- Cursor IDE에서 `beforeSubmitPrompt.prompt`와 `afterAgentResponse.text`가 항상 들어오는지 확인한다.
- Cursor CLI/headless에서 `afterAgentResponse`가 발생하는지 확인한다.
- CLI에서 안 된다면 `stop` hook payload에 response text가 있는지 확인한다.
- 한글/비ASCII prompt와 response가 깨지지 않는지 확인한다.
