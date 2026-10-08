# 게임화 리팩토링 계획 — SKCT 수열추리 → 매일 하고 싶은 숫자 퍼즐

> 작성 2026-10-08 · 기준 v0.2.0 / config v3 · 계획 문서이며 코드 변경 없음.
> 근거는 `파일:라인`으로 표기. 측정하지 않은 값·사용자 행동 가정은 **(추정)**.

### 확정된 결정 (2026-10-08)
| # | 결정 |
|---|---|
| 1 | 소리 **기본 켜짐** (설정에서 끔) |
| 2 | **실전 모드 유지** — 문제은행 출제 비율을 높여서 |
| 3 | **일일 챌린지 없음, 연속 출석 일수 기능 삭제** (기존 표시도 제거) |
| 4 | 기본 경험 = **무한 연습 세션** (게임 요소를 얹음) |
| 5 | 기존 기록 보존은 필수가 아님 → 마이그레이션 코드는 최소화. **다른 사용자의 오답률을 모아 출제에 반영하는 구조**를 설계에 포함 |
| 6 | 테마 토큰은 `light-dark()` 사용 |
| 7 | 무한 연습은 지금처럼 **한 문제씩 → 규칙·해설 확인 → [다음]**. **나가기 버튼으로 언제든 종료**. 10문제 구간 카드는 흐름을 막지 않는 요약으로만 둔다 |
| 8 | 집단 오답률: 실시간 수집은 이미 있다 (`pool.ts`가 풀이 직후 Firestore로 자동 전송 — 사용자 다운로드 불필요, 단 Firebase 설정 필요). **집계 결과(`data/crowd/`)는 gitignore** → 배포 앱에 포함하지 않고, **calibrate를 거친 설정·은행 수정으로만 반영**. 앱 안 "다른 사람 정답률" 표시는 하지 않는다 |
| 9 | 실전 모드용 은행: **비공개 기출 60문항을 바탕으로 숫자를 바꾼 변형 문항**을 만들어 공개 은행에 추가 (현재 공개 12문항) |
| 10 | 구간 크기 10문제, 집계는 **수동 운영** (자동화 안 함) |

## ① 현황 요약

### 현재 논리 구조
```
[main.tsx] applyTheme → <App/> → initSync() · initPool()
   │
[App.tsx] 화면 상태 4개: home | practice(mode) | settings | records   (라우터 없음)
   │
[Practice.tsx] 무한 연속 풀이 — 한 컴포넌트가 아래를 전부 처리
   ├ 문항 선택  freshState() → engine/session.pickNextItem()            Practice.tsx:21-39
   │     └ 은행 20% / generateItem(config,{seed,typeId}) 80%           session.ts:18-38
   ├ 판정       eqNum(chosen, answer)                                   Practice.tsx:58
   ├ 기록       addAttempt({...18개 필드})  → IndexedDB                  Practice.tsx:60-79
   ├ 점수       state.solved / state.correct (세션 누적 카운터)           practiceState.ts
   ├ 시간       <Timer> 경과 시간 + 45초 기준 막대                        Timer.tsx
   ├ 플래그     '실전과 다름' → addFlag({...})                            Practice.tsx:132-152
   └ 진행 저장  localStorage 'practice' (보던 문항 이어 풀기)             practiceState.ts
   │
[store] records.ts(Dexie) ─onLocalWrite→ sync.ts(내 계정) · pool.ts(익명 수집 → Firestore poolAttempts)
[scripts] pool:pull(소유자, 익명 기록 다운로드) → calibrate(조정 후보 제안, 사람이 판단)
[engine] 순수 TS: compose(생성·모호성 검사) · solver · families · plugins · session
```

### 이미 갖춰진 것 (재사용)
| 자산 | 위치 | 게임화에서의 쓰임 |
|---|---|---|
| seed로 재현 가능한 문항 생성 | `compose.ts:119` `generateItem(config,{seed,typeId,difficulty})` | 집계 스크립트에서 문항 재현, 버그 재현 |
| 데이터로 정의한 유형·난이도 | `config/types/*.yaml` `difficulty: {1,2,3}` | 적응형 난이도는 *고르는 정책*만 추가하면 됨 |
| 정답 유일성 보장 | `solver.ts` `judge` | 게임 모드에서도 "억울한 오답" 없음 |
| 해설 자동 생성 | `Item.explain` | 오답 → 바로 학습 (원칙 4) |
| **익명 풀이 수집 파이프라인** | `pool.ts`(전송), `firestore.rules`(쓰기만 허용·읽기는 소유자만), `scripts/pool-pull.ts`(다운로드) | **집단 오답률 구조의 수집 단계가 이미 있다** → 집계·반영 단계만 추가 |
| 기록 쓰기 이벤트 | `records.ts:9-15` `onLocalWrite` | 이벤트 방식의 선례 |
| 테마 토큰·3단 전환·저장 | `styles.css:4-57`, `prefs.ts:30-53`, `Settings.tsx:72-94` | 트랙 C는 약 80% 완료 |
| 하단 선택지 + 키보드 1~5 | `styles.css:625-`, `Practice.tsx:110-130` | 모바일 엄지 영역·PC 단축키 이미 해결 |

### "시험지 같은" 핵심 원인
1. **멈출 지점이 없다** — 무한 연속에 구간 마무리도 요약도 없다. "어디까지 했지"가 보이지 않는다.
2. **점수 = 푼 수/맞힌 수**뿐 — 콤보·보상·기록 갱신 연출이 없다.
3. **화면 언어가 시험·보정용이다** — "실전과 다름" 버튼(`Practice.tsx:221-228`), 13개 기술 용어 유형 목록(`Home.tsx:90-113`), 홈 하단 출제 설정 버전(`Home.tsx:120-124`).
4. **45초 경과 막대가 압박으로 읽힌다** (`Timer.tsx`) — 보상이 아니라 감시처럼 보인다.

## ② 게임화 방향 — 핵심 루프 한 장 요약
```
 ┌────────────────── 홈 (1탭) ──────────────────┐
 │  [ 풀기 ]  ← 무한 연습 (기본)                    │
 │  모드: 실전 · 타임어택 · 서바이벌 · 약점 집중        │
 └───────────────┬─────────────────────────────┘
                 ▼
 ┌──────── 무한 연습 (게임화) ────────┐   [←나가기]는 항상 보임
 │ 문제 → 선택 → 즉시 판정              │  정답: 색·✓·소리·진동·콤보 +1·점수 튐
 │       └ 수열 규칙·해설 → [다음]       │  오답: 정답·해설 공개, 콤보 초기화 (감점 없음)
 │ 10문제마다 → 구간 요약 한 줄 (인라인)   │  구간 정답 수·점수·최고 콤보 — [다음]을 막지 않음
 └───────────────┬────────────────┘
                 ▼ 나가기
 ┌──────── 세션 요약 ─────────┐
 │ 이 세션: 점수·정답률·최고 콤보     │
 │ 틀린 문제 다시 보기 (해설)         │  ← 학습 연결
 │ [계속 풀기] [홈]                 │
 └───────────────┬──────────┘
                 ▼
 내 기록 → 유형 숙련도 · 약점 유형 가중 · 업적 ─────────────▶ 다음 출제·홈 화면
 모두의 기록(익명, 자동 수집) → 소유자 로컬 집계 → calibrate → 설정·은행 수정 ─▶ 다음 릴리스의 출제
```
**설계 규칙**
- 점수는 정확도가 대부분을 차지하고 속도는 보너스로 상한을 둔다.
- 보상은 모두 "더 잘 풀게 됨"을 보여 주는 지표로 만든다 (숙련도, 약점 극복, 콤보). 화폐·상점·출석 보상은 없다.
- 무한 연습은 끝이 없다 (결정 7). 짧은 세션 원칙(원칙 2)은 **10문제마다 나오는 구간 요약 한 줄**로 대신한다. 흐름은 막지 않고 "여기서 멈춰도 된다"는 지점만 보여 준다. 구간 크기는 `modes.yaml` 값이다.

## ③ 트랙 A — 구조 장단점 (기준: 게임 요소를 얼마나 쉽게 얹을 수 있는가)

| 관점 | 장점 | 단점 (근거) |
|---|---|---|
| 게임 루프 분리 | 문제 생성은 이미 독립돼 있다 (`engine/`, DOM 없음). 판정은 함수 하나(`eqNum`) | 판정·기록·점수·진행 저장이 `Practice.tsx` 한 컴포넌트에 섞여 있다 (`:53-108`). 세션·구간 개념이 없다 |
| 모드 확장성 | `mode: string`으로 전체/유형별을 이미 구분한다 | 모드가 `'all' \| typeId` 문자열뿐 (`Practice.tsx:16`, `App.tsx:8`). 문항 수·시간 제한·목숨·은행 비율을 담을 데이터 구조가 없다 |
| 난이도 체계 | 유형×난이도가 YAML 데이터이고, `GenerateSpec.difficulty`로 고정할 수 있다 | `pickNextItem`이 difficulty·유형 가중치·은행 비율을 받지 않는다 (`session.ts:7-21`, 은행 비율은 전역 `exam.bankRatio` 고정). 난이도가 실력에 반응하지 않는다 |
| 이벤트 구조 | `onLocalWrite` 리스너 선례 (`records.ts:9-15`) | 정답·오답·콤보 이벤트가 없다. 효과는 `key={state.correct}` 재마운트로 숫자가 튀는 것 하나 (`Practice.tsx:172`, `styles.css:444`) |
| 전역 상태 | `config`·`bank`가 모듈 싱글턴이라 단순하다 (`app/engine.ts`) | 지금은 문제없음 — YAGNI |
| 중복 | — | 문항 스냅숏(18개 필드)을 손으로 4번 복사한다: `Practice.tsx:60-79`, `:134-149`, `pool.ts:21`, `pool.ts:43`. `typeLabel`이 3번 정의돼 있다: `Practice.tsx:41`, `Records.tsx:33`, `scripts/calibrate.ts:37` |
| 하드코딩 | — | 재시도 횟수 20 (`session.ts:25,31`), `STRIP_MAX` (`Home.tsx:14`), 테마 색이 여러 곳에 따로 있다 (트랙 C) |
| 함수 복잡도 | 거부 사유 집계로 디버깅하기 쉽다 | `generateItem` 165줄·3갈래 분기 (`compose.ts:119-283`). 분해는 범위 밖. 단, **오답 선택지 출처 태그(B7)**만 최소 수정한다 |
| 에러 처리 | 저장소 접근을 전부 try/catch로 감쌌다 (`prefs.ts:5-28`) | ErrorBoundary가 없다 → `pickNextItem` throw 시(`session.ts:37`) 흰 화면. `void addAttempt(...)` 실패가 조용히 사라진다. `loadPractice`가 저장 모양을 검증하지 않는다 (`practiceState.ts:21-24`) |
| 수집 데이터 | attempt마다 `mode`·`seed`·`configVersion`·`chosen`이 남아 집계가 가능하다 | 오답 선택지가 어떤 전략(near/step/mistake/digit)에서 나왔는지 기록하지 않는다 → "매력적인 오답" 분석 불가. 생성 문항의 규칙 계열(`Generated.family`)이 `Item`에 남지 않는다 (`compose.ts` 반환부) |

### 목표 구조 (최소 추가)
```
src/game/            ← 새 폴더, 순수 TS (DOM 없음, vitest로 테스트)
  modes.ts           모드 스키마(zod) — config/modes.yaml
  session.ts         세션 상태 + reducer: answer / checkpoint / end → { state, events[] }
  score.ts           점수·콤보 계산
  adapt.ts           내 최근 기록 + 집단 통계 → 다음 문항의 유형·난이도 선택 정책
  achievements.ts    업적 정의 = 기록에 대한 조건식 (저장하지 않고 계산)
src/ui/
  Play.tsx           Practice.tsx를 모드 구동형으로 바꾼 것
  Checkpoint.tsx     10문제 구간 요약 한 줄 (인라인, 흐름 안 막음)
  Summary.tsx        세션 요약
  effects.ts         events[] → CSS 클래스·진동·소리 (구독자 1개)
config/modes.yaml    모드 = 데이터
scripts/crowd.ts     pool 원자료 → data/crowd/stats.json 집계 (gitignore, 소유자 로컬 전용)
```
**이벤트는 버스·라이브러리 없이** reducer가 돌려주는 `events[]` 배열로 처리한다.
`ponytail:` 구독자가 3개 이상으로 늘면 그때 작은 emitter로 바꾼다.

## ④ 트랙 B — 기록 스키마

### 방침
- **IndexedDB(Dexie) 유지**, localStorage는 설정·UI 커서만 둔다.
  - 지시문은 localStorage를 요청했지만, IDB가 이미 있고 용량·비동기 면에서 낫다. 옮기는 비용만 생긴다 (자체 판단).
- **기존 데이터 보존은 필수가 아니므로**: 형식이 바뀐 localStorage 값은 마이그레이션 없이 기본값으로 초기화한다. Dexie는 테이블·인덱스 추가만 하므로 upgrade 함수가 필요 없다 (기존 기록은 덤으로 남는다).

### 저장 위치·키
| 저장소 | 키/테이블 | 내용 | 상태 |
|---|---|---|---|
| IDB `skct-number-series` | `attempts` | 문항 단위 결과 | 있음 → v3 `sessionId?`, `choiceTags?`, `family?` 추가 |
| IDB | `flags` | '실전과 다름' 표시 | 그대로 |
| IDB | `sessions` | **세션 단위 결과** | 신규 (v3) |
| localStorage | `prefs` | 테마·확인 제출·**sound(기본 true)·haptics** | `schema` 필드 추가 |
| localStorage | `practice` → `session-progress` | 진행 중 세션 (이어 하기) | 형식 변경, 구버전 값은 버림 |
| localStorage | `game-ui` | 이미 축하한 업적 id, 마지막 모드 | 신규 |
| localStorage | `device`, `sync-pulled-<uid>` | 그대로 | 있음 |

### 데이터 모양
```ts
// IDB v3
interface Attempt {
  /* 기존 필드 그대로 */
  sessionId?: string;
  choiceTags?: ChoiceTag[];     // choices와 같은 순서: 'answer'|'near'|'step'|'mistake'|'digit'|'pair-near'|'pair-op'|'pair-swap'|'nth-prev'|'bank'
  family?: string;              // 정답 규칙 계열 (생성: Generated.family, 은행: solver 판별)
}   // 인덱스: 'id, ts, typeId, uploaded, pooled, sessionId'
interface Session {
  id: string; ts: number; endedAt: number; modeId: string;
  total: number; correct: number; score: number; maxCombo: number; durationMs: number;
  checkpoints: { correct: number; score: number }[];   // 10문제 구간별
  livesLeft?: number;
  appVersion: string; configVersion: number; modesVersion: number;
}   // 인덱스: 'id, ts, modeId, uploaded'
// localStorage
prefs   = { schema: 2, confirmBeforeSubmit, theme, sound: true, haptics: true }
game-ui = { schema: 1, seenAchievements: string[], lastModeId?: string }
```
**저장하지 않고 계산하는 것** (append-only 로그에서 도출 → 동기화 충돌 없음):
누적 통계(`recordSummary`), 모드별 최고 기록, 유형 숙련도, 업적 해금 여부·시각.
**삭제**: 연속 일수 `streakDays` (`records.ts:52,84-90,95`, `Home.tsx:69-73`).

### 버전 관리
- **IDB**: `db.ts`에 `this.version(3).stores({...})`만 추가한다. 기존 v2 패턴(`db.ts:22-30`)과 같다.
- **localStorage**: 값마다 `schema` 숫자를 둔다. `prefs.ts`의 `readJson` 옆에 `readVersioned(key, zodSchema, fallback)` 헬퍼를 둔다.
  - 버전 불일치·파싱 실패·검증 실패면 fallback을 쓴다 (마이그레이션 함수 없음 — 결정 5).
  - `ponytail:` 보존이 중요해지면 그때 `migrations[schema]`를 추가한다.
- **내보내기**: `format: 2` (+`sessions`). 가져오기는 format 1·2 모두 attempts/flags를 받는다 (추가 비용 없음).

### 기록 → 게임 경험
| 기록 | 돌아오는 방식 |
|---|---|
| sessions 구간 점수 | 구간 요약 "지난 구간 대비 +120", 모드별 최고 기록 갱신 연출 |
| attempts 유형별 최근 정오 | 유형 숙련 단계(★1~3 ↔ YAML 난이도) 승급·강등 → 적응형 출제 |
| 유형별 오답률 (`recordSummary.byType` 재사용) | 약점 유형 가중 출제, "약점 집중" 모드 |
| 주간 집계 | 성장 그래프 (정답률·평균 시간, 인라인 SVG) |
| 조건식 충족 | 업적 해금 연출 (`seenAchievements`로 한 번만) |
| **집단 통계** | 앱에 직접 표시하지 않음. calibrate → 설정·은행 수정으로 다음 릴리스 출제에 반영 (④-2) |

### 안정성
- **용량**: attempt 1건 약 0.6KB (추정) × 하루 50문제 × 365일 ≈ 11MB/년 → IDB는 충분하다. 요약 압축은 하지 않는다.
  - `ponytail:` `recordSummary`가 매번 전체를 읽는다 (`records.ts:79-80`). 5만 건 근처에서 홈이 느려지면 일 단위 요약 캐시를 붙인다.
- **브라우저 자동 삭제**: Safari는 설치하지 않은 사이트의 저장소를 장기 미사용 시 지울 수 있다 (추정). `navigator.storage.persist()` 요청 + 설정 화면의 내보내기·동기화로 대응. 보존이 필수가 아니므로 이 이상은 하지 않는다.
- **손상 데이터**: localStorage는 versioned 읽기로 처리한다. IDB 열기에 실패하면 "기록 없이 플레이" (홈 `recordSummary().then(…, () => setSum(null))` 패턴 확장).
- **동기화**: `firestore.rules`의 users 컬렉션 목록 `['attempts','flags']`에 `'sessions'`를 추가해야 `sync.ts`가 sessions를 다룰 수 있다 (**규칙 먼저 게시 → 앱 배포**).

### ④-2 집단 오답률 수집·반영 구조 (결정 5)
서버 없이 **"수집은 Firestore(쓰기 전용, 풀이 직후 자동) → 집계는 소유자 로컬 스크립트 → 반영은 calibrate를 거친 설정·은행 커밋"**으로 한다.
- 수집 단계는 이미 있다. 사용자가 기록을 내려받아 첨부할 필요가 없다.
- 단, **Firebase 프로젝트가 연결돼 있어야** 동작한다 (`docs/deploy.md` — GitHub Actions Variables의 `VITE_FIREBASE_*`). 설정이 없으면 `pool.ts`는 아무것도 하지 않는다 (`initPool`의 `syncConfigured` 검사).

```
앱 (모든 모드)
  │ pool.ts: attempt를 익명 전송 (계정 정보·메모 없음, 무작위 device id)    ← 있음
  ▼
Firestore poolAttempts / poolFlags  (create만 허용, read는 소유자만)        ← 있음, 규칙에 필드 3개 추가
  │ npm run pool:pull  (소유자 계정)                                       ← 있음
  ▼
data/feedback/pool-*.json  (원자료, gitignore)
  │ npm run crowd  (신규: 정제 + 집계)
  ▼
data/crowd/stats.json  (집계값만, gitignore · 소유자 로컬 전용 — 결정 8)
  │ (앱 번들에 넣지 않음)
  └──▶ [사람 판단] calibrate가 stats.json을 읽어 제안 → config 수정 + version +1 (CLAUDE.md 체크리스트 A)
         · 유형·난이도 비중, 숫자 범위
         · 은행 문항 difficulty 갱신 (실측 정답률 기준 → 실전 모드 난이도 배치에 쓰임)
         · 오답 선택지 전략 가중치 (exam.distractors) — "매력적인 오답" 비율
```

**stats.json 모양**
```jsonc
{
  "schema": 1, "generatedAt": "2026-11-01", "minN": 30,
  "bank":   { "pub-001": { "n": 212, "acc": 0.41, "medMs": 31000, "pick": [0.08, 0.41, 0.30, 0.12, 0.09] } },
  "bucket": { "diff-arithmetic|2|blank": { "n": 1840, "acc": 0.63, "medMs": 24000 } },   // typeId|difficulty|kind
  "family": { "interleaved": { "n": 920, "acc": 0.48 } },
  "distractor": { "mistake": { "shown": 5100, "picked": 0.21 }, "near": { "shown": 7300, "picked": 0.06 } }
}
```
- **생성 문항은 거의 반복되지 않는다** → 문항 단위가 아니라 **버킷(유형×난이도×묻는 방식, 규칙 계열) 단위**로 집계한다. 은행 문항만 문항 단위로 집계한다.
  - 특정 생성 문항이 궁금하면 `seed + configVersion`으로 스크립트에서 재현한다.
- **필요한 추가 수집 필드** (B7)
  - `choiceTags`: 각 선택지가 어떤 오답 전략에서 나왔는지. `compose.ts`에서 pool 값에 태그를 붙여 함께 넘긴다. **rng 소비를 바꾸지 않으므로 같은 seed → 같은 문항**, config version 불변. 스냅숏 테스트로 확인한다.
  - `family`: `Generated.family`를 `Item`에 남긴다.
  - `sessionId`: pool에는 보내지 않는다 (불필요).
- **정제 규칙** (crowd.ts, 초기값 추정)
  - `elapsedMs` < 1.5초 또는 > 10분 제외
  - 같은 device가 같은 버킷에 기여하는 수를 최대 50으로 제한 (한 사람이 통계를 지배하는 것 방지)
  - `configVersion`이 현재와 다른 기록은 버킷 집계에서 제외하거나 별도로 표기
  - **모드별 분리**: 시간 압박이 있는 타임어택·서바이벌은 정답률이 왜곡되므로 `acc`는 `practice`·`exam`·`weak`만으로 계산하고, 나머지는 `n`에만 합산한다
- **악용·개인정보**
  - 규칙상 누구나 create할 수 있어 쓰레기 데이터가 들어올 수 있다 → 크기 제한(이미 있음) + device 상한 + 이상치 제거로 완화한다. 더 필요하면 Firebase App Check (범위 밖).
  - stats.json은 gitignore라 공개되지 않는다. 그래도 device id·개별 기록 없이 집계값만 담고, 표본 수 `minN`(30) 미만인 칸은 제안에 쓰지 않는다.
- **운영 주기**: 수동 `pool:pull → crowd → calibrate → 설정·은행 수정 커밋 → 릴리스` (결정 10, 자동화 안 함).
- **은행 비율 상향의 전제 (결정 2)**: 공개 은행은 **12문항**뿐이다 (`data/bank/public/original.yaml`; 비공개 기출 60문항은 앱에 포함되지 않음). 실전 모드 은행 비율을 높이면 `avoidRecent: 200` 때문에 금방 바닥나고 생성 문항으로 대체된다 (`session.ts:19-21`).
  - 따라서 **비공개 기출 60문항을 바탕으로 숫자를 바꾼 변형 문항**을 공개 은행에 추가한다 (결정 9, CLAUDE.md 체크리스트 B.4: `source.kind: variant`, `publishable: true`, 원문 금지).
  - 목표: 기출 1문항당 변형 2개 → 약 120문항. 변형마다 `npm run validate:bank`로 정답 유일성을 확인한다.

## ⑤ 트랙 C — 라이트/다크 테마

### 현재 상태
| 요구 | 상태 | 근거 |
|---|---|---|
| 첫 방문 시 시스템 설정 따름 | ✅ | `styles.css:41-57` media query, 기본값 `theme:'system'` (`prefs.ts:39`) |
| 수동 전환·저장 | ✅ (3단: 기기/밝게/어둡게) | `Settings.tsx:72-94`, `savePrefs` |
| CSS 변수 일원화 | ⚠ 대부분 | 다크 토큰 블록이 **두 번 복사**돼 있다 (`styles.css:25-40` = `:41-57`) |
| 깜빡임 방지 | ❌ | `applyTheme`가 JS 번들 실행 후 동작한다 (`main.tsx:9`). CSS `<link>`가 먼저 그려지므로 수동 테마 ≠ 시스템이면 반대 테마가 한 프레임 보인다 |
| 피드백 색 대비 | ⚠ 라이트 미달 | 아래 표 |

### 하드코딩 색상 목록
| 위치 | 값 | 조치 |
|---|---|---|
| `styles.css:25-57` | 다크 토큰 2벌 | `light-dark()` 한 벌로 통합 |
| `styles.css:701` | `rgb(0 0 0 / 0.4)` 시트 배경 | `--scrim` 토큰 |
| `src/app/prefs.ts:42` | `THEME_COLOR {light:'#f3f5f8', dark:'#1d2026'}` | CSS `--bg`와 중복이지만 meta는 CSS 변수를 못 읽으므로 유지. 주석으로 `--bg`와 연결 |
| `index.html:6-7` | meta theme-color 2개 | 위와 같은 값, 유지 |
| `vite.config.ts` manifest | `background_color/theme_color '#1d2026'` | 설치 스플래시용, 유지 |
| `public/icon.svg` | `#1f6feb` | `--accent #2f5bea`와 미세하게 다름 — 정리 시 맞춤 (하) |

### 설계
1. **토큰 단일화 (결정 6)**: `:root { color-scheme: light dark; --ok: light-dark(#…, #…); … }`, `[data-theme=light]{color-scheme:light}`, `[data-theme=dark]{color-scheme:dark}`.
   - 네이티브 `light-dark()`로 복사본이 사라진다. iOS Safari 17.5+, Chrome 123+.
2. **게임 토큰 추가**: `--combo`, `--combo-bg`, `--best`, `--scrim`. 새 색은 토큰으로만 쓴다.
3. **깜빡임 방지**: `index.html` `<head>`에 인라인 스크립트 5줄을 넣는다.
   - `localStorage.prefs.theme`를 읽어 CSS보다 먼저 `data-theme`를 설정한다 (try/catch). `main.tsx:9`의 `applyTheme`는 meta 갱신용으로 유지한다.
4. **빠른 전환**: 홈 헤더에 테마 아이콘 버튼(기기→밝게→어둡게 순환)을 둔다. 설정 화면의 3단 전환은 유지한다.
5. **색에만 의존하지 않기**: 정답/오답에 ✓/✗ 기호를 함께 표시한다. 대상은 빈칸 상자(`styles.css:553-563`)와 공개된 선택지(`:676-685`).

### 대비 점검 (WCAG 상대 휘도로 계산, 기준 4.5:1)
| 조합 | 라이트 | 다크 |
|---|---|---|
| `--ok` on `--ok-bg` (정답 상자·선택지) | **3.85 ✗** | 6.40 ✓ |
| `--ng` on `--ng-bg` | **4.12 ✗** | 5.43 ✓ |
| `--ok` on `--surface` | **4.41 ✗** | 7.36 ✓ |
| `--warn` on `--bg` (시간 초과 14px) | **3.85 ✗** | 7.95 ✓ |
| `--accent-fg` on `--accent` | 5.52 ✓ | 7.45 ✓ |
| `--muted` on `--bg` | 4.57 ✓ (경계) | 6.34 ✓ |

→ 라이트 `--ok`·`--ng`·`--warn`을 한 단계 어둡게 해 4.5 이상을 맞춘다 (값은 적용 시 재측정). 콤보 색도 같은 기준으로 정한다.

## ⑥ 트랙 D — 참고 게임 분석과 현재 문제점

### D-1. 참고 게임 (패턴만 차용, 에셋·디자인 복제 금지)
| 게임 | 핵심 루프 | 재방문 장치 | 이 사이트에 적용할 요소 | 적용 시 주의점 |
|---|---|---|---|---|
| Elevate | 하루 몇 게임의 짧은 세트 → 영역별 점수 | 영역별 숙련도 상승, 개인화 세트 | 유형별 숙련 단계 ★, 약점 집중 모드 | 지표가 많으면 성적표처럼 보인다 → 홈에는 1개만 |
| Peak | 1~2분 미니게임, 난이도 실시간 조정 | 영역 그래프, 개인 최고점, **다른 사용자 대비 위치** | 계단식 적응 난이도, 모드별 최고점 | 적응이 너무 빠르면 좌절 → 승급 5/6, 강등 3/5처럼 완만하게. 다른 사용자 대비 표시는 하지 않음 (결정 8) |
| Lumosity | 게임 → 점수 → 백분위 | 성장 차트 | 주간 성장 그래프 | 실시간 백분위는 서버 필요 → 릴리스 단위 정적 통계 |
| 뇌를 단련하는 성인 DS 트레이닝 | 짧은 측정 → 수치화된 결과 | 기록 그래프 | 세션 요약의 한 줄 평가 | 과학적 수치처럼 포장하지 않는다. 날짜 스탬프·출석은 **적용 안 함 (결정 3)** |
| Duolingo | 레슨(약 3분) → XP → 진행 | 진행 경로, 레벨 | 구간 요약(10문제 = 한 레슨 감각), 숙련도 경로 | 연속 일수·일일 목표는 **적용 안 함 (결정 3)** |
| Wordle | 하루 1문제, 결과 공유 | 희소성, 공유 | **적용 안 함 (결정 3)**. 참고만: 결과를 압축해 보여 주는 이모지 줄 → 구간 요약의 🟩🟥 표시 | — |
| 2048 | 스와이프 → 즉시 합쳐짐 → 점수 | 최고점 갱신, 바로 다시 시작 | 즉각적인 손맛(숫자 튐·소리·진동), [다음] 버튼 기본 포커스 유지 | 애니메이션 120~250ms, reduced-motion 존중 |
| Sudoku 앱 (Sudoku.com 등) | 퍼즐 → 실수 표시 → 완료 | 난이도 선택, 무실수 업적 | 서바이벌(목숨 3), "무실수 10문제" 업적 | 목숨제는 기본 연습과 분리 (초보 좌절 방지) |

### D-2. 현재 사이트 문제점
| 영역 | 문제 | 근거 |
|---|---|---|
| 진입 | 홈 → "풀기 시작" **1탭**으로 좋다. 다만 첫 화면의 절반이 13개 유형 목록이고 용어가 시험식이다 ("계차수열 (차이가 등차)") | `Home.tsx:79-113` |
| 진입 | 첫 방문 안내가 없다 | `Home.tsx:51` |
| 플레이 | 정답 피드백은 색 변화와 정답 수가 튀는 효과 하나뿐. 콤보·소리·진동이 없다 | `styles.css:444-455`, `Practice.tsx:172` |
| 플레이 | 경과 시간 막대 + 45초 초과 시 경고색 → 감시처럼 느껴진다 | `Timer.tsx:11-33` |
| 플레이 | "실전과 다름" 버튼이 "다음" 바로 옆에서 시선을 나눈다 | `Practice.tsx:221-228` |
| 플레이 | 입력: 5지선다 버튼이 하단 dock에 있다 (엄지 영역, 52px) — **이미 좋다.** 숫자를 직접 입력할 필요가 없다 | `styles.css:625-660`, `--tap: 52px` |
| 플레이 | 멈출 지점·진행감이 없다 — 무한 연속 | `Practice.tsx:103-108` |
| 결과 | 세션 요약이 없다 — 나가면 그냥 홈. 성취감·기록 갱신·틀린 문제 복습이 없다 | `App.tsx` 화면 목록 |
| 장기 동기 | 업적·숙련도·성장 그래프가 없다. 연속 일수 표시는 결정 3에 따라 삭제한다 | `Home.tsx:69-73` |
| 장기 동기 | 기록 화면이 "틀린 문제" 중심이라 부정적으로 읽힌다 | `Records.tsx:14`, `:63-66` |
| 반응형 | 최대 폭 520px 가운데 열, 720px 이상 레이아웃 있음 — 양호 | `styles.css:145`, `:791` |
| 접근성 | 11~12px 글자 (점수 라벨·기록 보조) | `styles.css:440`, `:222`, `:387` |
| 접근성 | reduced-motion은 점수 튐 하나만 처리한다 | `styles.css:451-455` |
| 접근성 | 소리 기본 켜짐(결정 1) → 끄기 토글을 설정과 플레이 화면 헤더 양쪽에 둔다. iOS 무음 스위치를 존중하도록 `navigator.audioSession.type='ambient'` (지원 브라우저만, 추정) | — |
| 접근성 | 라이트 모드 정답/오답 대비 미달, 색으로만 구분 | ⑤ 대비 표 |
| 정보 노출 | 홈 하단에 앱·출제 설정 버전 (개발자 정보) | `Home.tsx:120-124` |

## ⑦ 개선 항목 표
| ID | 트랙 | 문제(근거) | 개선 방안 | 참고 게임 | 게임성 | 난이도 | 위험도 |
|---|---|---|---|---|---|---|---|
| A1 | A | 문항 스냅숏 4중 복사 (`Practice.tsx:60-79,134-149`, `pool.ts:21,43`) | `records.ts` `snapshot(item)` 하나로 | — | 하 | 하 | 하 |
| A2 | A | `typeLabel` 3중 정의 | `engine/config.ts`에 `typeLabel(config,id)` | — | 하 | 하 | 하 |
| A3 | A | ErrorBoundary 없음, 진행 상태 검증 없음 (`practiceState.ts:21`) | `App.tsx` ErrorBoundary 1개 + zod 검증 | — | 중 | 하 | 하 |
| A4 | A | 세션 개념 없음, 로직이 컴포넌트에 섞임 (`Practice.tsx:53-108`) | `src/game/session.ts` 순수 reducer → `{state, events}` | 2048 | 상 | 중 | 중 |
| A5 | A | 점수 = 카운터뿐 | `src/game/score.ts`: 기본 100 + 난이도 보너스 + 속도 보너스(상한 50) × 콤보 배율(최대 ×2). 오답 감점 없음. 수치는 modes.yaml | Peak, 2048 | 상 | 하 | 하 |
| A6 | A | 효과 구독 구조 없음 | `ui/effects.ts`: events → CSS 클래스·`navigator.vibrate`·WebAudio 합성음 (에셋·라이브러리 없음) | 2048 | 상 | 중 | 하 |
| A7 | A | 모드 = 문자열 (`Practice.tsx:16`) | `config/modes.yaml` + zod: `id, label, items\|null, checkpointEvery, timeLimitSec?, lives?, bankRatio?, feedback: each\|end, adaptive, pool` | Sudoku | 상 | 중 | 중 |
| A8 | A | 난이도·은행 비율이 고정 (`session.ts:7-21`) | `pickNextItem`에 `difficulty?`·`typeWeights?`·`bankRatio?` 옵션, `game/adapt.ts` 계단식 정책 | Peak, Elevate | 상 | 중 | 중 |
| B1 | B | 세션 기록 없음 | Dexie v3 `sessions` + `attempts.sessionId` | — | 상 | 하 | 하 |
| B2 | B | localStorage 값에 버전 없음 (`prefs.ts:39`) | `readVersioned` + `schema`, 불일치면 초기화 | — | 하 | 하 | 하 |
| B3 | B | 내보내기에 sessions 없음 | `format: 2` | — | 하 | 하 | 하 |
| B4 | B | 동기화 대상 고정 (`firestore.rules`, `sync.ts:72`) | 규칙에 `sessions` 추가 → push/pull | — | 중 | 하 | 중 |
| B5 | B | 연속 일수 기능 (결정 3) | `streakDays` 삭제 (`records.ts:52,84-90,95`, `Home.tsx:69-73`) | — | — | 하 | 하 |
| B6 | B | 브라우저 자동 삭제 (추정) | `navigator.storage.persist()` | — | 하 | 하 | 하 |
| B7 | B | 오답 전략·규칙 계열을 기록하지 않음 (`compose.ts` 반환부, `Item`) | `Item.choiceTags`·`Item.family` → Attempt → pool (rng 소비 불변) + `firestore.rules` poolAttempts `hasOnly`에 필드 추가 | Peak | 중 | 중 | 중 |
| B8 | B | 집단 통계 집계 단계 없음 | `scripts/crowd.ts` → `data/crowd/stats.json` (gitignore, 정제·minN·device 상한) | Peak, Lumosity | 중 | 중 | 중 |
| B9 | B | 집단 통계가 출제에 반영되지 않음 | calibrate가 stats.json 읽어 유형 비중·은행 difficulty·오답 전략 가중치 제안 → 사람이 수정·커밋 | — | 중 | 하 | 하 |
| B10 | B | 공개 은행 12문항뿐 — 실전 모드 은행 비율 상향 불가 (`original.yaml`) | 비공개 기출 60문항 기반 변형 약 120문항 (CLAUDE.md B.4) | — | 중 | 중(분량) | 하 |
| C1 | C | 다크 토큰 2벌 (`styles.css:25-57`) | `light-dark()` 단일화 | — | 하 | 하 | 하 |
| C2 | C | 테마 깜빡임 (`main.tsx:9`) | `index.html` head 인라인 스크립트 | — | 중 | 하 | 하 |
| C3 | C | 라이트 대비 미달 (⑤ 표) | ok/ng/warn 조정 + ✓/✗ 기호 | — | 중 | 하 | 하 |
| C4 | C | 하드코딩 색 (`styles.css:701`) | `--scrim` + `--combo`,`--best` | — | 하 | 하 | 하 |
| C5 | C | 테마 전환이 설정 안쪽에만 있다 | 홈 헤더 순환 버튼 | — | 하 | 하 | 하 |
| D1 | D | 멈출 지점·진행감 없음 | 10문제 구간 요약 한 줄 (인라인, [다음] 흐름 유지) | Duolingo, 2048 | 상 | 중 | 하 |
| D2 | D | 콤보·손맛 없음 | 콤보 카운터, 정답 시 숫자 튐·진동·소리(기본 켜짐), 5·10콤보 강조 | 2048 | 상 | 중 | 하 |
| D3 | D | 세션 요약 없음 | `Summary.tsx`: 점수·정답률·최고 콤보·최고 기록 비교·틀린 문제 해설 (나가기 시 표시) | Peak | 상 | 중 | 하 |
| D4 | D | 홈이 유형 목록 위주 (`Home.tsx:90-113`) | 홈 = [풀기] + 모드 4개 + 숙련도 요약. 유형별 선택은 연습 옵션 시트로 | Elevate | 상 | 중 | 중 |
| D5 | D | 경과 막대가 압박 (`Timer.tsx`) | 연습: 속도 보너스 게이지, 실전 모드만 45초 기준 막대 | Peak | 중 | 하 | 하 |
| D6 | D | 플래그 버튼이 루프를 방해 (`Practice.tsx:221`) | 실전 모드는 그대로, 연습은 해설 옆 ⋯ 메뉴로 | — | 중 | 하 | 하 |
| D7 | D | 모드 단조로움 | 실전(은행 비율↑, 20문항/15분, 끝에 채점) · 타임어택(90초) · 서바이벌(목숨 3) · 약점 집중 | Peak, Sudoku | 상 | 중 | 중 |
| D8 | D | 성장 체감 없음 | 유형 숙련도 ★1~3 (= YAML 난이도), 주간 정답률·평균 시간 그래프 (인라인 SVG) | Elevate, Lumosity | 상 | 중 | 하 |
| D9 | D | 업적 없음 | 학습 연결 업적만: 무실수 10문제, 10콤보, 약점 극복(오답률 50%↑ 유형을 이후 10문제 80%), 전 유형 ★2. **출석형 업적 없음** | Sudoku | 중 | 중 | 하 |
| D10 | D | 기록 화면이 부정적 (`Records.tsx:63`) | 숙련도·그래프·최고 기록 중심으로 | Elevate | 중 | 하 | 하 |
| D11 | D | 첫 방문 안내 없음 | 첫 세션 시작 전 예시 1문제 (건너뛰기 가능) | Duolingo | 중 | 하 | 하 |
| D12 | D | 11~12px 글자, reduced-motion 부분 적용 | 최소 13px, 모든 애니메이션 `prefers-reduced-motion`, 소리·진동 토글 | — | 중 | 하 | 하 |
| D13 | D | 홈에 개발 정보 (`Home.tsx:120-124`) | 설정 화면으로 이동 | — | 하 | 하 | 하 |

## ⑧ 단계별 계획

### 순서 판단
권장 순서에서 **두 가지를 바꾼다.**
1. **수집 필드(B7)를 2단계로 앞당긴다.** 집단 통계는 데이터가 쌓이는 데 시간이 걸린다. 3~4단계를 만드는 동안 데이터가 모이도록 수집을 먼저 배포한다.
2. **장기 동기를 마지막 다듬기와 합친다.** 연속 일수·일일 챌린지가 빠져 분량이 줄었다. 대신 5단계를 "집단 통계 반영"에 쓴다.

테마는 대부분 끝났으므로 1단계는 가볍다. 구조 분리(A4)는 쓰일 곳이 생기는 3단계에서 한다.
각 단계 끝에 `npm run validate && npm test && npm run typecheck && npm run build`가 통과해야 한다.

### 의존 관계
```
C1·C3·C4(토큰) ─────▶ D2(콤보 색) · D1/D3(카드·요약 색)
B1(sessions) ───────▶ A4(세션 reducer 저장) ─▶ D3(최고 기록) ─▶ D9(업적) · D8(그래프)
Firebase 연결 확인 ─▶ B7(수집 필드) + firestore.rules 게시 ─▶ 앱 배포 ─▶ (데이터 축적) ─▶ B8(집계) ─▶ B9(calibrate 반영)
A7(modes.yaml) ─────▶ D7(모드들) · D6(플래그 위치)
A8(adapt) ──────────▶ D8(숙련도 ★) · 약점 집중 모드
B10(은행 확충, 콘텐츠) ─▶ 실전 모드 은행 비율 상향 (4단계)
```

### 1단계 — 구조 정리 + 테마 마감 + 연속 일수 삭제
- **항목**: A1, A2, A3, B5, C1, C2, C3, C4, C5, D13
- **파일**: `src/store/records.ts`, `src/store/pool.ts`, `src/ui/Practice.tsx`, `src/ui/Records.tsx`, `src/ui/Home.tsx`, `src/ui/App.tsx`, `src/ui/practiceState.ts`, `src/engine/config.ts`, `scripts/calibrate.ts`, `src/ui/styles.css`, `index.html`
- **완료 기준**
  - 스냅숏 생성 1곳, typeLabel 1곳, 다크 토큰 1벌
  - 라이트 피드백 색 4.5:1 이상
  - 수동 테마 새로고침 시 깜빡임 0
  - 손상된 진행 값으로도 앱이 열림
  - 연속 일수 코드·표시 0
- **검증**
  - OS 다크 + 앱 "밝게" 강제 → 새로고침 10회 깜빡임 없음 (반대 조합도, 폰·PC)
  - DevTools에서 `localStorage.practice='{broken'` → 홈 정상
  - 라이트/다크 각각 정답·오답 표시 확인
  - 익명 pool 전송이 계속 성공 (Firestore 콘솔에서 새 문서 확인)
- **커밋**: `refactor(store): 문항 스냅숏 생성 통합` · `refactor(ui): 유형 이름 조회 통합` · `fix(ui): 테마 새로고침 깜빡임 제거` · `fix(ui): 라이트 모드 정답·오답 대비 보강` · `feat(ui): 홈 테마 전환 버튼` · `fix(ui): 오류 화면과 진행 상태 검증` · `refactor(ui): 연속 일수 표시 제거`

### 2단계 — 기록·수집 기반 (화면 변화 거의 없음)
- **진행 기록 (2026-10-08 완료)**
  - 세션은 지금의 무한 연습에 바로 붙였다. 풀기 화면에서 나갈 때 1건을 저장하고, 다시 들어오면 새 세션으로 시작한다.
  - Session 필드는 지금 쓰는 것만 넣었다. 점수·콤보·구간은 3단계에서 추가한다.
  - localStorage 값의 `schema` 번호 대신, 필드마다 zod `.catch(기본값)`으로 읽는다. 손상되거나 옛 형식인 값은 해당 필드만 기본값이 된다. 형식이 호환 안 되게 바뀔 때 버전 필드를 둔다.
  - B7(추가 수집 필드)은 Firebase 미연결로 5단계로 연기했다.
- **항목**: B1, B2, B3, B4, B6, B7
- **전제**: B7(수집 필드)은 Firebase가 연결돼 있을 때만 의미가 있다. **2026-10-08 기준 미연결(추정) → B7은 5단계로 미룬다.** 5단계 시작 전에 `docs/deploy.md` 절차로 Firebase를 연결한다.
- **파일**: `src/store/db.ts`(v3), `src/store/types.ts`, `src/store/records.ts`, `src/store/sync.ts`, `src/store/pool.ts`(choiceTags·family 전송), `src/engine/item.ts`·`src/engine/compose.ts`·`src/engine/distractors.ts`(태그 전달), `src/engine/bank.ts`(은행 family), `firestore.rules`, `src/app/prefs.ts`, `tests/engine/compose.test.ts`(seed 스냅숏), `docs/deploy.md`(규칙 게시 순서)
- **완료 기준**
  - 같은 seed의 생성 문항이 변경 전후 동일 (태그 외)
  - pool 문서에 `choiceTags`·`family`가 들어감
  - sessions 동기화
  - prefs `schema: 2` (구값은 기본값으로 초기화)
- **검증**
  - **Firestore 규칙 먼저 게시** → 앱 배포 → 문항 몇 개 풀이 → 콘솔에서 새 필드 확인
  - 규칙 게시 전 구버전 앱의 전송도 계속 허용되는지 (hasOnly는 필드 *추가* 허용이라 하위 호환)
  - 두 기기 동기화, 내보내기/가져오기 왕복
  - `npm run validate` 성공률·중복률이 변경 전과 같은 수치
- **커밋**: `feat(engine): 선택지 출처·규칙 계열 태그` · `feat(store): 세션 기록 테이블` · `feat(store): 설정 값 스키마 버전` · `feat(store): 익명 기록에 선택지 출처 포함` · `feat(store): 세션 동기화`

### 3단계 — 핵심 게임 루프: 무한 연습 게임화
- **항목**: A4, A5, A6, D1, D2, D3, D5, D12(새 애니메이션 부분)
- **파일**
  - 신규: `src/game/session.ts`, `src/game/score.ts`, `src/ui/effects.ts`, `src/ui/Checkpoint.tsx`, `src/ui/Summary.tsx`, `tests/game/session.test.ts`
  - 변경: `src/ui/Practice.tsx` → `Play.tsx`, `src/ui/App.tsx`, `src/ui/Home.tsx`, `src/ui/Timer.tsx`(보너스 게이지), `src/app/prefs.ts`(sound 기본 true·haptics), `src/ui/Settings.tsx`, `styles.css`
- **완료 기준**
  - 한 문제씩 풀고 규칙·해설 확인 후 [다음] (기존 흐름 유지), 나가기는 언제나 1탭
  - 10문제마다 구간 요약 한 줄 (흐름 안 막음)
  - 나가면 세션 요약, 틀린 문제 해설 다시 보기
  - 콤보·점수·최고 기록이 동작하고 sessions에 저장
  - 소리 기본 켜짐 + 헤더에서 즉시 끄기
  - reduced-motion이면 애니메이션 없음
- **검증**
  - 폰 세로: 10문제 구간 소요 시간 측정 (목표 3~5분)
  - 앱을 닫았다 열어 세션 이어 하기
  - iOS(진동 미지원)에서 오류 없음, 무음 스위치 동작 확인
  - 라이트/다크 콤보 색
  - `session.test.ts`: 콤보 초기화·점수 상한·구간 경계
- **커밋**: `feat(game): 세션 진행과 점수·콤보` · `feat(ui): 구간 요약과 세션 요약` · `feat(ui): 정답 피드백 효과와 소리·진동`

### 4단계 — 모드 확장 + 적응형 + 실전 모드
- **항목**: A7, A8, D4, D6, D7, B10(병렬 콘텐츠)
- **파일**
  - 신규: `config/modes.yaml`, `src/game/modes.ts`(zod), `src/game/adapt.ts`
  - 변경: `src/app/engine.ts`·`src/node/load.ts`(모드 로딩), `scripts/validate.ts`(모드 스키마 검사), `src/engine/session.ts`(difficulty·typeWeights·bankRatio 옵션), `src/ui/Home.tsx`, `src/ui/Play.tsx`(lives·timeLimit·feedback:end), `data/bank/public/*.yaml`(변형 문항), `docs/` 모드 추가 방법
- **모드**
  - `practice`: 기본, 무한, 10문제 구간, 적응형, 유형 선택 옵션
  - `exam`: 20문항/15분, `bankRatio` 높게(초기 0.6, 은행 규모에 맞춰 조정), 끝에 채점, 플래그
  - `time-attack`: 90초 최다 정답
  - `survival`: 목숨 3
  - `weak`: 약점 유형 10문제
- **완료 기준**: 새 모드를 YAML만으로 추가할 수 있다. 실전 모드 20문항 중 은행 문항 비율이 설정값에 근접한다 (은행 규모가 충분할 때)
- **검증**
  - 서바이벌 목숨 0 → 요약
  - 타임어택 시간 종료 → 요약
  - 실전 모드는 끝날 때까지 정오 표시 없음
  - 적응형: 연속 정답 시 난이도 상승 (테스트)
  - `npm run validate`가 modes.yaml 오류를 잡음
  - `npm run validate:bank`가 새 변형 문항 통과
- **주의**: 모드 설정은 문항 생성 결과를 바꾸지 않는다 → `exam.yaml` version과 별개로 `modes.yaml`에 자체 version
- **커밋**: `feat(game): 모드 설정 파일` · `feat(game): 적응형 난이도와 약점 출제` · `feat(ui): 실전·타임어택·서바이벌 모드` · `feat(bank): 공개 변형 문항 추가`

### 5단계 — 집단 오답률 반영 루프
- **항목**: B8, B9
- **선행 조건**: 2단계 배포 후 데이터 축적. 버킷당 n ≥ 30 칸이 주요 유형에 생길 때까지 (기간은 사용자 수에 따라 다름, 추정)
- **파일**: 신규 `scripts/crowd.ts`. 변경 `package.json`(`crowd` 스크립트), `.gitignore`(`data/crowd/`), `scripts/calibrate.ts`(stats.json 기반 제안), `docs/calibration.md`(운영 절차)
- **완료 기준**
  - `pool:pull → crowd → calibrate` 한 흐름으로 제안 출력
  - n < minN 칸은 화면에 표시되지 않음
- **검증**
  - 테스트용 가짜 pool JSON으로 정제 규칙(1.5초 미만 제외, device 상한) 단위 테스트
  - stats.json에 device id 없음 (스크립트에서 assert)
  - `git status`에 `data/crowd/`가 나타나지 않음
  - calibrate 제안 → config 수정 → version +1 → validate 통과
- **커밋**: `feat(scripts): 집단 통계 집계` · `feat(scripts): calibrate 집단 통계 제안` · `config: 집단 통계 반영 보정 (vN)`

### 6단계 — 장기 동기 + 다듬기
- **항목**: D8, D9, D10, D11, D12(전체), C3 재측정, 문서
- **파일**: 신규 `src/game/achievements.ts`, `src/ui/Growth.tsx`. 변경 `src/ui/Home.tsx`, `src/ui/Records.tsx`, `src/store/records.ts`(주간 집계), `styles.css`, `CLAUDE.md`(구조 표에 `src/game/`, `config/modes.yaml`, `data/crowd/`(gitignore)), `README.md`
- **완료 기준**
  - 업적은 해금 순간 한 번만 축하
  - 기록 화면은 숙련도·그래프·최고 기록 중심
  - 첫 방문 → 예시 1문제 → 연습
  - 최소 글자 13px
  - 키보드만으로 전 흐름 가능
- **검증**
  - 기록 0건·1건·수천 건(가져오기)에서 그래프 렌더
  - 업적 조건 단위 테스트
  - 시크릿 창 첫 방문
  - iOS VoiceOver로 한 구간
  - OS 모션 줄이기 ON
  - 라이트/다크 그래프 색
- **커밋**: `feat(game): 업적` · `feat(ui): 성장 그래프와 숙련도` · `feat(ui): 첫 방문 안내` · `fix(ui): 접근성 보강` · `docs: 게임 구조 반영`

## ⑨ 하지 않을 것 (범위 밖)
- **일일 챌린지·연속 출석 일수·일일 목표·출석 업적** (결정 3)
- **실시간 서버·리더보드·개인 간 비교** — 집단 통계는 릴리스 단위 정적 집계만
- **화폐·상점·꾸미기·광고·목숨 구매** — 보상만 있고 학습이 없는 장치 (원칙 4)
- **푸시 알림**
- **상태 관리·라우터·차트·사운드 라이브러리 추가** — reducer, 상태 전환, 인라인 SVG, WebAudio로 충분
- **기존 기록을 localStorage로 이전**, 기존 데이터 마이그레이션 코드 (결정 5)
- **문항 생성 엔진 재구성** (`compose.ts` 분해, 새 유형) — 선택지 태그(B7) 외에는 손대지 않는다
- **집계 자동화 (GitHub Actions)**, Firebase App Check — 수동 운영이 부담될 때
- **오래된 상세 기록 요약·압축** — 홈 집계가 느려지면 그때
