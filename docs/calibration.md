# 실전 유사도 보정 워크플로

```
기출 확보 → 은행 등록(private) → 비교 리포트 → 설정 조정 → 검증 → 배포 → 풀이 중 피드백 → 집계 → 조정 …
```

## 1. 확보
- 본인 응시 복원, 커뮤니티 후기, 교재 문항을 메모 형태로 모은다 (수열, 선택지, 정답, 규칙, 회차, 체감 난이도).
- Claude에게 주면 `data/bank/private/<회차>.yaml`로 변환한다. 이 폴더는 gitignore 대상이다.

## 2. 은행 검사
```bash
npm run validate:bank
```
- `등록된 규칙으로 정답을 설명하지 못함` → 새 규칙 계열/유형 후보 (`docs/adding-a-type.md`)
- `다른 해석 [...]` → 실전에도 여유 항이 적은 문항이 있다는 뜻일 수 있음. `minRedundancy` 기준을 재검토할 근거.
- `선택지 n개 (설정은 5개)` → `exam.choices` 근거

## 2.5 분석 리포트 (새 회차를 넣을 때마다)
```bash
npm run review     # validate:bank + analyze
```
`reports/bank-analysis.md`가 갱신된다 (집계·id만이지만 기출 집계라 **커밋하지 않는다**). 이전 결과와 비교하려면 실행 전에 파일을 복사해 둔다.
- 회차 × 형식(blank1/pair/nth) 분포, 기출 유형·묻는 방식 비중 vs 설정 `weight`·`exam.questions.kinds` (차이가 크면 점검)
- 미분류·여유 항 부족·모호 문항, 중복 후보 (→ 새 규칙·유형 후보)
- `confidence: estimated`로 남은 활성 유형, 어떤 유형 `evidence`에도 안 쓰인 은행 문항 (→ 4단계에서 근거 연결)
- private은 CI에 없으므로 로컬에서만 실행한다. 원본 캡처·전사는 `data/bank/private/captures/<출처>/`에 두고 id와 파일명을 맞춘다.

## 3. 비교
```bash
npm run sample -- --compare --n 40
```
`reports/sample-*.html`에서 유형별로 생성 문항과 은행 문항을 나란히 보고, 형식 통계(평균 항수, 빈칸 끝 비율, 최대값, 음수 비율, 선택지 폭)를 비교한다.
요약 표의 "은행 문항" 수로 실전 유형 빈도와 `weight`를 비교한다.

## 4. 조정
| 관찰 | 조정할 설정 |
|---|---|
| 실전 유형 빈도와 비중이 다름 | `types/*.yaml weight`, 없는 유형은 `enabled: false` |
| 항 개수가 다름 | `length` (줄이면 validate의 모호 판정이 늘어남 — 확인 필수) |
| 숫자가 크거나 작음 | `numbers`, `difficulty.*`의 start/diff/ratio 범위 |
| 빈칸 위치 분포가 다름 | `blank.last` / `blank.middle` / `minMiddleIndex` |
| 선택지 간격·형태가 다름 | `exam.distractors`, `exam.choiceOrder`, `exam.choices` |
| 난이도 체감이 다름 | `exam.difficultyMix`, 난이도별 파라미터 |

근거가 생긴 유형은 `confidence: evidence`로 표시하고 (근거 문항은 비공개 기출의 `typeId`),
`exam.yaml`의 `version` +1, `changelog`에 이유를 남긴다. `docs/skct-format.md` 표도 갱신한다.

## 5. 검증
```bash
npm run validate && npm test && npm run typecheck
```
통과하면 커밋·푸시 → GitHub Actions가 다시 검증 후 배포한다.

## 6. 피드백 회수
- 풀이 중 실전과 다른 문항은 정답 화면의 **실전과 다름**으로 사유를 남긴다.
- 설정 → **내보내기 (JSON)** 파일을 `data/feedback/`에 넣고:
```bash
npm run calibrate                     # 전체
npm run calibrate -- --since-version 2  # 조정 이후 기록만
```
- 유형별 정답률·시간 중앙값·사유 집계와 조정 후보가 나온다. 표시된 문항은 `typeId·difficulty·seed·config v`로 재현할 수 있다.
