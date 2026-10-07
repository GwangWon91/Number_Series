# 문제은행 분석 리포트

`npm run analyze`로 생성 (본문 없이 집계·id만). 새 회차를 넣을 때마다 다시 실행하고 변화를 커밋한다.
config v3 · 은행 72문항 (public 12, private 60) · 로드 오류 0건

## 회차 × 문항 형식
| 회차 | blank1 | pair | nth | 합계 | 평균 난이도 |
|---|---|---|---|---|---|
| (없음) | 12 | 0 | 0 | 12 | 1.58 |
| 2026H1-3 | 13 | 4 | 3 | 20 | 2.10 |
| 2026H2-1 | 12 | 5 | 3 | 20 | 1.60 |
| 2026H2-2 | 12 | 5 | 3 | 20 | 1.95 |

## 유형별 은행 비중 vs 설정 비중
분류 = 문항에 적은 typeId, 없으면 solver가 고른 규칙 계열. 설정에 없는 행(rational-geometric 등)은 solver 규칙 계열이라 새 유형 후보다.

| 유형 | 은행 | 은행 % | 설정 weight % | 근거 수준 | 설정 evidence id 수 |
|---|---|---|---|---|---|
| arithmetic | 0 | 0 | 1 | estimated | 0 |
| diff-arithmetic | 3 | 4 | 5 | estimated | 0 |
| diff-cycle | 1 | 1 | 2 | estimated | 0 |
| diff-geometric | 4 | 6 | 4 | evidence | 1 |
| diff-second | 1 | 1 | 2 | estimated | 0 |
| fibonacci-like | 5 | 7 | 4 | evidence | 2 |
| fraction | 13 | 18 | 16 | evidence | 7 |
| geometric | 0 | 0 | 1 | estimated | 0 |
| grouped | 4 | 6 | 3 | evidence | 1 |
| interleaved | 8 | 11 | 5 | evidence | 2 |
| linear-recurrence | 2 | 3 | 5 | estimated | 0 |
| power-offset | 1 | 1 | 2 | estimated | 0 |
| rational | 18 | 25 | 50 | evidence | 10 |
| rational-geometric | 7 | 10 | - | (설정 없음) | - |
| fib-sum | 1 | 1 | - | (설정 없음) | - |
| fib-product | 2 | 3 | - | (설정 없음) | - |
| ratio-progression | 1 | 1 | - | (설정 없음) | - |
| diff-alt-square | 1 | 1 | - | (설정 없음) | - |

## 점검 대상
- 미분류(규칙 판별 실패 → 새 규칙·유형 후보): 없음
- 정답 규칙 여유 항 부족: lk-2026h1-3-085, lk-2026h1-3-087, lk-2026h1-3-093, lk-2026h1-3-094, lk-2026h2-1-082, lk-2026h2-1-083, lk-2026h2-2-094, lk-2026h2-2-095
- 다른 해석으로 다른 답이 나옴(모호): lk-2026h1-3-087, lk-2026h1-3-092, lk-2026h2-1-093, lk-2026h2-2-085
- typeId를 안 적은 문항: 40문항
- 중복 후보(같은 수열·정답): 없음

## 설정 근거 커버리지
- 기출 근거 없는 활성 유형(confidence: estimated): arithmetic, diff-arithmetic, diff-cycle, diff-second, geometric, linear-recurrence, power-offset
- 설정 evidence가 은행에 없는 id(오타·삭제): 없음
- 은행에 있지만 어떤 유형 evidence에도 안 쓰인 문항: lk-2026h1-3-081, lk-2026h1-3-082, lk-2026h1-3-083, lk-2026h1-3-084, lk-2026h1-3-085, lk-2026h1-3-086, lk-2026h1-3-087, lk-2026h1-3-088, lk-2026h1-3-089, lk-2026h1-3-090, lk-2026h1-3-091, lk-2026h1-3-092, lk-2026h1-3-093, lk-2026h1-3-094, lk-2026h1-3-095, lk-2026h1-3-096, lk-2026h1-3-097, lk-2026h1-3-098, lk-2026h1-3-099, lk-2026h1-3-100, lk-2026h2-1-082, lk-2026h2-1-083, lk-2026h2-1-091, lk-2026h2-1-094, lk-2026h2-1-095, lk-2026h2-1-096, lk-2026h2-1-097, lk-2026h2-1-098, lk-2026h2-1-099, lk-2026h2-1-100, lk-2026h2-2-082, lk-2026h2-2-087, lk-2026h2-2-091, lk-2026h2-2-093, lk-2026h2-2-094, lk-2026h2-2-095, lk-2026h2-2-096, lk-2026h2-2-097
