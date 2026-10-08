# SKCT 수열추리 연습 웹앱

SKCT 인지역량 '수열추리'를 폰·노트북에서 끊김 없이 연습하는 PWA. 성패 기준은 **실전 유사도**이고,
유사도 개선은 **코드가 아니라 설정·데이터 수정**으로 한다.

## 명령어
| 명령 | 용도 |
|---|---|
| `npm run dev` | 개발 서버 |
| `npm run validate` | 품질 게이트: 설정 스키마 + 유형별 대량 생성 검사(정답 유일성·범위·중복) + 문제은행 검사. **엔진·설정·은행을 바꾸면 반드시 실행** |
| `npm run validate -- --type <id> --n 2000` | 한 유형만 깊게 검사 |
| `npm run validate:bank` | 문제은행만 검사 |
| `npm test` | 엔진 단위 테스트 |
| `npm run typecheck` / `npm run build` | 타입 검사 / 배포 빌드 |
| `npm run sample -- [--type <id>] [--n 60] [--compare]` | 생성 문항 HTML 리포트 (`reports/`), `--compare`면 문제은행과 나란히 + 형식 통계 |
| `npm run bank:variants` | 비공개 기출 → 숫자를 바꾼 공개 변형 문항 `data/bank/public/variants.yaml` 다시 만들기 (검사 통과한 것만) |
| `npm run ship` | 현재 브랜치를 PR → CI → 병합 → 릴리스 → Pages 배포까지 (아래 "브랜치·커밋·릴리스") |
| `npm run calibrate` | `data/feedback/*.json`(앱에서 내보낸 기록) 집계 → 조정 후보 제안 |

## 구조
```
config/exam.yaml            공통 출제 설정 (선택지 수, 시간, 은행 비율, 난이도 비중, 검증 기준, 피드백 사유)
config/types/<id>.yaml      유형별 설정 (비중, 근거 수준, 항 개수, 빈칸 위치, 숫자 범위, 난이도별 파라미터)
config/modes.yaml           게임 모드 (연습·실전·타임어택·서바이벌·약점 집중). 새 모드 = 항목 하나, 자체 version
data/bank/public/*.yaml     직접 만든·변형 문항 (앱에 포함, 공개)
data/bank/private/*.yaml    실제 기출 복원 문항 (gitignore — 절대 커밋 금지)
data/feedback/*.json        앱에서 내보낸 기록·피드백 (gitignore)
src/engine/                 UI와 무관한 순수 TS (브라우저·스크립트·테스트 공용)
  families/                 규칙 계열: 수열이 어떤 규칙으로 설명되는지 판정 (solver가 경쟁시킴)
  plugins/                  유형 생성기 (유형 1개 = 파일 1개)
  solver.ts                 정답 유일성 검사 (다른 규칙으로 다른 답이 나오면 모호)
  compose.ts                생성 파이프라인 (범위·빈칸·자기일관성·모호성·오답 선택지)
  bank.ts / session.ts      문제은행 / 다음 문항 선택
src/game/                   게임 규칙 (순수 TS): run(점수·콤보·구간) · adapt(적응형 난이도·약점) · modes(모드 스키마)
src/app/                    브라우저 로더 (YAML을 빌드 시 번들), 기기별 설정
src/store/                  기록 저장 (IndexedDB, append-only) + Firebase 동기화
src/ui/                     React 화면 (홈 / 풀이 / 설정)
src/node/                   스크립트용 로더·통계
scripts/                    validate / sample / calibrate / make-icons
```

## 핵심 개념
- **규칙 계열(Family)**: `fit(완성 수열)`로 규칙 성립 여부와 *여유 항*(= 항 수 − 자유 파라미터 수, 빈칸이면 −1)을 계산하고, `candidates`로 빈칸 후보를 낸다.
- **정답 유일성**: solver가 등록된 모든 계열을 경쟁시킨다. 정답 해석의 여유 항 ≥ `minRedundancy`(기본 2), 다른 값을 내는 해석의 여유 항 ≥ `altMinRedundancy`(기본 1)이면 모호 → 폐기. 다른 해석으로 설명되는 값은 오답 선택지로도 쓰지 않는다.
- **재현성**: 생성 문항은 `typeId + difficulty + seed + configVersion`으로 똑같이 재현된다 (플래그 분석용).

## 작업 체크리스트

### A. 출제 파라미터 조정 (가장 흔한 작업)
1. `config/types/<id>.yaml` 또는 `config/exam.yaml` 수정. 근거는 YAML 주석/`note`에 남긴다.
2. 근거가 생긴 유형은 `confidence: evidence`, `evidence: [은행 문항 id]`.
3. `config/exam.yaml`의 `version` +1, `changelog`에 날짜·이유 추가.
4. `npm run validate && npm test` 통과 확인. 성공률·중복률 실패 시 범위를 조정 (항 개수를 줄이면 모호 문항이 늘어난다).
5. `docs/skct-format.md`의 확실/추정/모름 표 갱신.

### B. 기출 복원 문항 추가
1. 사용자가 준 메모를 `data/bank/private/<회차>.yaml`로 변환 (형식: `data/bank/private/README.md`). `publishable: false`.
2. `npm run validate:bank` — 판별 실패·모호 경고는 새 유형/규칙 후보로 보고한다.
3. `npm run sample -- --compare`로 생성 문항과 형식 통계 비교 → A로 보정.
4. 공개 은행 변형 문항은 `npm run bank:variants`로 다시 만든다 (`variants.yaml`, 직접 수정 금지). 손으로 만들 때는 숫자를 바꾼 **변형 문항**을 `source.kind: variant`, `publishable: true`로 (원문 금지).

### C. 새 유형 추가
1. 필요한 규칙이 `src/engine/families/`에 없으면 `rules.ts`에 `IntRule` 추가(또는 `combinators.ts`로 조합) 후 `families/index.ts`의 `FAMILIES`에 등록. 단위 테스트(`tests/engine/families.test.ts`)에 예시 수열 추가.
2. `src/engine/plugins/<id>.ts`에 `definePlugin({ id, params, generate })` 작성 — `generate`는 완성 수열과 `family` id만 반환. 범위·빈칸·선택지·모호성은 compose가 처리.
3. `src/engine/plugins/index.ts`에 1줄 등록.
4. `config/types/<id>.yaml` 작성 (`confidence: estimated`로 시작).
5. `npm run validate -- --type <id>` → `npm run sample -- --type <id>`로 눈 검토 → `npm test`.
자세한 예: `docs/adding-a-type.md`

## 규칙
- `data/bank/private/`, `data/feedback/`, `reports/`의 내용은 **절대 커밋하지 않는다** (기출 저작권·개인 기록). `git status`로 확인.
- 설정을 바꾸면 반드시 `version` +1과 `changelog`. 출제 결과가 바뀌면 이전 플래그의 재현 기준이 달라지기 때문.
- 추정값에는 근거 수준을 표시한다 (`confidence`, YAML 주석의 [확실]/[추정]/[모름]). 추정을 사실처럼 쓰지 않는다.
- 엔진(`src/engine`)은 DOM·Node API를 쓰지 않는다. 브라우저 전용은 `src/app`·`src/ui`·`src/store`, Node 전용은 `src/node`·`scripts`.
- 커밋 전: `npm run validate && npm test && npm run typecheck`.

## 브랜치·커밋·릴리스
- `main`에 직접 push하지 않는다. 브랜치(`feat/…`, `fix/…`, `chore/…`) → PR → CI(`.github/workflows/ci.yml`) 통과 → 병합.
- **배포는 Claude가 끝까지 한다**: 작업 브랜치에서 커밋을 마친 뒤 `npm run ship` (`scripts/ship.sh`).
  push → PR(없으면 커밋으로 생성, 있으면 재사용) → CI 대기 → 병합 → release-please 릴리스 PR의 CI 대기(기본 토큰 PR이라 CI가 안 붙으면 닫았다 다시 열어 실행) → 병합 → Pages 배포 확인.
  릴리스할 커밋이 없으면 병합까지만. CI가 실패하면 멈추므로 고쳐서 다시 실행한다. 사람의 병합 승인은 필요 없다(사용자 결정, 2026-10-08).
- 커밋 메시지는 Conventional Commits. release-please가 이걸로 다음 버전과 CHANGELOG를 만든다.
  - `feat(scope): …` 새 기능(마이너↑), `fix(scope): …` 버그(패치↑), `config: …` 출제 설정 보정, `docs`·`refactor`·`test`·`chore`·`ci`는 버전 안 올림
  - scope: `engine` · `ui` · `store` · `config` · `bank` · `scripts`
  - 호환이 깨지면 본문에 `BREAKING CHANGE:` (1.0 전까지는 마이너↑)
- 릴리스: main에 병합될 때마다 release-please가 "chore: release vX.Y.Z" PR을 갱신해 둔다. 그 PR을 병합하면 태그·GitHub Release·CHANGELOG.md가 생기고 GitHub Pages에 배포된다(`release.yml` → `deploy.yml`). 급한 배포는 Actions에서 deploy 수동 실행.
- 앱 버전(`package.json`, 화면 하단 `vX.Y.Z (커밋)`)과 출제 설정 버전(`config/exam.yaml`의 `version`)은 별개다. 풀이 기록에는 둘 다 남는다(`appVersion`, `configVersion`).
