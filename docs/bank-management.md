# 문제은행 관리

문제은행은 **기출 복원 문항을 모아 출제 설정을 보정하는 근거**이자, 앱에 일부 문항을 그대로 내는 정적 문항 풀이다.
성패 기준은 실전 유사도이고, 개선은 코드가 아니라 설정·데이터 수정으로 한다.

## 1. 은행의 종류와 쓰임
| 구분 | 위치 | 커밋 | 앱 출제 | 쓰임 |
|---|---|---|---|---|
| 생성 문항 | `config/` + `src/engine/plugins` | 코드 | 은행 비율의 나머지 | 규칙 기반 자동 생성 |
| public 은행 | `data/bank/public/*.yaml` | 한다 | 연습 20% (`exam.bankRatio`), 실전 모드 60% (`config/modes.yaml`) | 직접 만든 문항(`original.yaml`) + 기출을 **숫자만 바꾼 변형 문항**(`variants.yaml`, `npm run bank:variants`로 자동 생성) |
| private 은행 | `data/bank/private/*.yaml` | **절대 안 한다** (gitignore) | 안 한다 | 기출 복원 원문. 검사·비교·설정 보정의 근거 전용 |
| 원본 캡처·전사 | `data/bank/private/captures/<출처>/` | 안 한다 | 안 한다 | 이미지 원본, 정오표, 전사 YAML (id·파일명 대응) |
| 풀이 기록 | `data/feedback/*.json` | 안 한다 | — | 앱에서 내보낸 정답률·"실전과 다름" 사유 |
| 분석 리포트 | `reports/bank-analysis.md` | 안 한다 | — | `npm run review` 결과 (집계·id만이지만 기출 집계라 비공개) |

기출 원문은 저작권·개인 기록 문제로 공개 리포나 배포 사이트에 올리지 않는다. 앱에 나가는 문항은 public 은행뿐이다.

## 2. 문항 한 개의 생애
```
원본(이미지/메모) → 전사 → private 은행 → 검사 → 분석 → 설정 반영 → (선택) 변형 문항을 public으로
```
1. **전사**: 이미지는 읽어서 수열·선택지·정답을 옮기고, 오독이 없는지 사람이 확인한다. 정답은 정오표와 맞춘다.
2. **등록**: `data/bank/private/<회차>-<출처>.yaml`에 넣는다 (형식은 `data/bank/private/README.md`). `publishable: false`.
3. **검사** `npm run validate:bank`: 빈칸 수, 정답이 선택지에 있는지, solver가 규칙으로 정답을 설명하는지.
   - 경고 `등록된 규칙으로 정답을 설명하지 못함` → 새 규칙·유형 후보
   - 경고 `다른 해석 [...]` / `여유 항 미만` → 모호하거나 항이 적은 문항 (실전에도 있다는 증거일 수 있음)
4. **분석** `npm run review`: `reports/bank-analysis.md`를 갱신한다 (집계·id만, **커밋하지 않음**). 이전 결과와 비교하려면 실행 전에 파일을 복사해 둔다. 회차×형식 분포, 유형별 은행 비중 vs 설정 비중, 미분류·모호·중복 후보, 근거 없는 유형.
5. **설정 반영**: `config/types/*.yaml`·`config/exam.yaml`을 고치고 `confidence: evidence`로 표시한다. 근거 문항 id는 공개 config가 아니라 `data/bank/private/meta/evidence.yaml`(유형 id → 문항 id 목록)에 적는다. `exam.yaml`의 `version` +1과 `changelog`, `docs/skct-format.md`의 확실/추정/모름 표를 같이 갱신한다. 한 회차(20문항)만으로는 `estimated`로 두고 근거 출처 수를 적는다.
6. **공개 변형**: `npm run bank:variants`로 `variants.yaml`을 다시 만든다 (원래 규칙이 유지되고 다른 해석이 없는 것만 자동으로 남는다). 자동 변형이 안 되는 문항을 손으로 만들 때는 `source.kind: variant`, `publishable: true`로 `original.yaml` 등에 추가한다. 원문 그대로는 금지.

## 3. 품질 게이트와 점검 주기
| 명령 | 언제 | 보는 것 |
|---|---|---|
| `npm run validate:bank` | 문항을 넣거나 고칠 때마다 | 형식 오류(에러), 판별 실패·모호(경고) |
| `npm run review` | 새 회차를 넣은 직후, 그리고 설정을 바꾼 직후 | 검사 + `reports/bank-analysis.md` 갱신 (커밋 안 함) |
| `npm run bank:variants` | 새 회차를 넣은 뒤 | 공개 변형 문항 다시 만들기 → `validate:bank` |
| `npm run validate && npm test && npm run typecheck` | 커밋 전 | 생성기·설정·엔진 전체 |
| `npm run calibrate` | 풀이 기록을 `data/feedback/`에 넣은 뒤 | 유형별 정답률·시간·"실전과 다름" 집계, 조정 후보 |

CI는 private이 없어서 public 은행만 검사한다. private 검사는 로컬 전용이다.
설정을 바꾸면 이전 플래그의 재현 기준이 달라지므로 `version`을 반드시 올린다 (재현 키: `typeId + difficulty + seed + configVersion`).

## 4. 새 문제를 추가하려면 (요청 방법)
### 줄 것 (아는 만큼만)
- **문제**: 이미지(스크린샷)나 텍스트 메모. 수열, 선택지, 정답. 빈칸 2개(A·B)나 n번째 항 형식이면 그 사실
- **출처/회차**: 예) `<커뮤니티> <회차>`, `본인 응시 복원`, `교재 ○○`
- 있으면: 정답률(정오표), 규칙 메모, 체감 난이도, 표기 특이점(약분 안 한 분수, 소수 혼용 등)

### 요청 문구 예
| 하고 싶은 일 | 이렇게 말한다 |
|---|---|
| 기출 추가 | "이 캡처 20문항을 `<회차>` `<출처>` 기출로 private 은행에 추가해줘" |
| 추가 + 분석 | "추가하고 `npm run review` 결과로 설정 보정 후보까지 알려줘" |
| 설정 반영 | "새로 들어온 근거로 `config/types`와 `exam.yaml`을 보정하고 version/changelog/skct-format 갱신해줘" |
| 현황 확인 | "은행 분석 리포트 다시 돌려서 근거 없는 유형과 미분류 문항 알려줘" |
| 공개 문제 만들기 | "`bank:variants` 다시 돌려줘" / 자동 변형이 안 된 문항은 "`<문항 id>`를 손으로 변형해서 public에 추가해줘" |
| 새 유형 | "미분류 문항 `○○`들을 새 유형으로 추가해줘" (절차: `docs/adding-a-type.md`) |
| 피드백 반영 | "`data/feedback/`에 기록 넣었으니 calibrate 돌려서 조정안 알려줘" |

### Claude가 하는 일 / 사용자가 확인할 것
- Claude: 전사 → YAML 변환 → `validate:bank` → `review` → `bank:variants` → 경고·새 유형 후보 보고 → (요청 시) 설정·문서 갱신 → 검증 → 커밋 → `npm run ship`
- 사용자: 이미지 오독 여부와 정답 확인, 설정 반영 여부 결정(예: 비중을 얼마나 믿고 바꿀지)

### 지켜야 할 것
- private·`data/feedback/`·`reports/` 내용은 커밋하지 않는다 (`git status`로 확인).
- 추정을 사실처럼 쓰지 않는다. 근거 수준(`confidence`, [확실]/[추정]/[모름])을 표시한다.
- 문항 id는 전체 은행에서 유일해야 한다 (예: 기출 `<출처>-<회차>-<번호>`, 직접 만든 공개 문항 `pub-0xx`, 자동 변형 `var-<해시>`).
- 공개 파일(config·docs·public 은행·테스트)에는 출처·회차·기출 문항 id·기출에서 센 수치를 적지 않는다. 설정의 근거 문항 id는 `data/bank/private/meta/evidence.yaml`에 둔다.
