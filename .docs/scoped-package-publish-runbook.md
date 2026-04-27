# 스코프 패키지 배포 Runbook

## 목표

이 문서는 `oh-my-trace` npm 패키지를 배포할 때 따르는 정식 절차를 정리한다.
일회성 rename 작업 지시서가 아니라, 패키지명이 아래 canonical 이름으로 정리된
상태를 전제로 한 반복 가능한 배포 runbook이다.

canonical npm 패키지명:

- `@oh-my-trace/core`
- `@oh-my-trace/cli`
- `@oh-my-trace/mcp`

설치 후 실행 명령은 그대로 유지한다:

- `@oh-my-trace/cli`가 `omt` 명령 제공
- `@oh-my-trace/mcp`가 `oh-my-trace-mcp` 명령 제공

legacy 패키지명:

- `oh-my-trace`
- `oh-my-trace-mcp`

legacy 패키지는 과거 이름이다. 신규 배포/설치 안내는 scoped 패키지명을 기준으로
작성한다. legacy 패키지 deprecate/unpublish는 필요할 때 별도 정리 절차로만
수행한다.

## npm 정책상 중요한 점

- scoped package 이름은 `@scope/package` 형태다.
- scoped package는 기본적으로 private로 publish된다. public으로 배포하려면
  `npm publish --access public`을 사용해야 한다.
- npm publish는 계정 설정에 따라 2FA 또는 publish token이 필요할 수 있다.
- global package 제거는 `npm uninstall -g <package>`를 사용한다.
- 누군가 의존할 가능성이 있으면 unpublish보다 deprecate가 안전하다.

참고 문서:

- https://docs.npmjs.com/about-scopes/
- https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/
- https://docs.npmjs.com/uninstalling-packages-and-dependencies/
- https://docs.npmjs.com/deprecating-and-undeprecating-packages-or-package-versions

## 1. 배포 전 repo 상태 확인

배포 전 `package.json` 이름과 bin이 아래 상태인지 확인한다.

```text
packages/core/package.json  name: @oh-my-trace/core
packages/cli/package.json   name: @oh-my-trace/cli, bin: omt
packages/mcp/package.json   name: @oh-my-trace/mcp, bin: oh-my-trace-mcp
```

root workspace scripts도 scoped workspace 이름을 사용해야 한다.

```text
npm pack --workspace @oh-my-trace/core --dry-run
npm pack --workspace @oh-my-trace/cli --dry-run
npm pack --workspace @oh-my-trace/mcp --dry-run
```

package manifest를 변경했다면 lockfile을 갱신한다.

```bash
npm install
```

로컬 npm cache 권한 문제가 있으면 임시 cache로 실행한다:

```bash
npm_config_cache=/tmp/omt-npm-cache npm install
```

## 2. 배포 전 검증

테스트를 실행한다:

```bash
npm test
```

배포 tarball에 들어갈 파일을 확인한다:

```bash
npm_config_cache=/tmp/omt-npm-cache npm pack --workspace @oh-my-trace/core --dry-run
npm_config_cache=/tmp/omt-npm-cache npm pack --workspace @oh-my-trace/cli --dry-run
npm_config_cache=/tmp/omt-npm-cache npm pack --workspace @oh-my-trace/mcp --dry-run
```

네트워크와 npm 인증이 가능하면 로그인 계정을 확인한다:

```bash
npm whoami
```

scoped 이름이 사용 가능한지, 또는 내가 소유한 패키지인지 확인한다:

```bash
npm view @oh-my-trace/core name version
npm view @oh-my-trace/cli name version
npm view @oh-my-trace/mcp name version
```

새 패키지를 처음 배포하는 경우에는 `npm view`가 404/not found를 반환할 수 있다.
이미 배포된 패키지라면 현재 version과 dist-tags를 확인하고, 재배포할 버전이
중복되지 않는지 확인한다.

## 3. Publish 순서

CLI와 MCP가 core에 의존하므로 core를 먼저 배포한다:

```bash
npm run publish:core
```

CLI를 배포한다:

```bash
npm run publish:cli
```

MCP를 배포한다:

```bash
npm run publish:mcp
```

계정이 2FA를 요구하면 OTP를 붙인다:

```bash
npm_config_otp=123456 npm run publish:cli
```

## 4. 로컬 legacy 설치 제거 후 재설치

기존 global legacy 패키지를 제거한다:

```bash
npm uninstall -g oh-my-trace
npm uninstall -g oh-my-trace-mcp
```

반복 테스트 중 기존 scoped global 설치가 있으면 함께 제거한다:

```bash
npm uninstall -g @oh-my-trace/cli
npm uninstall -g @oh-my-trace/mcp
```

새 canonical 패키지를 설치한다:

```bash
npm install -g @oh-my-trace/cli
npm install -g @oh-my-trace/mcp
```

명령이 정상 연결되는지 확인한다:

```bash
which omt
which oh-my-trace-mcp
omt --help
omt doctor
```

MCP 서버 smoke test:

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
  | oh-my-trace-mcp
```

기대 결과:

- initialize 응답의 server name이 `oh-my-trace`
- tools list에 `collect_history` 포함

## 5. Legacy 패키지 정리

외부 사용자가 없다고 확신하면 기존 이름은 deprecate 또는 unpublish 중 하나로
정리한다.

기본 추천은 deprecate다. 설치 시 이동 안내를 보여줄 수 있고 registry 파손
위험이 낮다.

```bash
npm deprecate oh-my-trace "Package moved to @oh-my-trace/cli. Install with: npm install -g @oh-my-trace/cli"
npm deprecate oh-my-trace-mcp "Package moved to @oh-my-trace/mcp. Install with: npm install -g @oh-my-trace/mcp"
```

정말 legacy 패키지를 제거하고 싶고, npm이 해당 버전/게시 시점에 대해 unpublish를
허용한다면 scoped 패키지 설치 검증 후 실행한다:

```bash
npm unpublish oh-my-trace --force
npm unpublish oh-my-trace-mcp --force
```

scoped 설치 검증 전에 unpublish하지 않는다. 문제가 생겼을 때 기존 패키지명으로
돌아갈 수 있는 경로가 사라진다.

## 6. 배포 후 검증

registry metadata 확인:

```bash
npm view @oh-my-trace/core name version dist-tags
npm view @oh-my-trace/cli name version bin dependencies dist-tags
npm view @oh-my-trace/mcp name version bin dependencies dist-tags
```

global 설치 목록 확인:

```bash
npm list -g --depth=0 | rg "oh-my-trace|@oh-my-trace"
```

실제 로컬 수집 smoke test:

```bash
omt ingest --source codex --since "$(date +%F)"
omt status
```
