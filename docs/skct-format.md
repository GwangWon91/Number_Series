# SKCT 수열추리 형식 — 아는 것 / 추정 / 모름

실전 자료가 들어올 때마다 이 표를 갱신하고, 바뀐 내용을 `config/`에 반영한다.
마지막 갱신: 2026-10-07 (config v1, 기출 자료 확보 전)

## 확실함 (취업 커뮤니티 다수 출처 일치 — SK 공식 공지는 미확인)
| 항목 | 내용 | 반영 위치 |
|---|---|---|
| 영역 | 온라인 SKCT 인지역량 5영역(언어이해·자료해석·창의수리·언어추리·수열추리) 중 하나 | — |
| 문항 수·시간 | 20문항 / 15분 → 문항당 평균 45초 | `exam.timePerItemSec: 45` |
| 진행 방식 | 한 문제씩 표시, 넘긴 문제로 돌아갈 수 없음 | 연속 풀이 UI (실전 모드는 확장 예정) |
| 도구 | 화면 내 계산기·메모장, 종이 사용 불가 | 확장 후보 |

## 추정 (확인 필요)
| 항목 | 현재 가정 | 반영 위치 |
|---|---|---|
| 문항 형식 | 숫자 나열 + 빈칸 1개 | 엔진 전제 |
| 선택지 | 5지선다, 오름차순 정렬 | `exam.choices`, `exam.choiceOrder` |
| 항 개수 | 6~10개 (유형별) | `types/*.yaml length` |
| 빈칸 위치 | 대부분 끝, 가끔 중간 | `types/*.yaml blank` |
| 숫자 크기 | 정수 위주, 두세 자리, 음수·분수 가끔 | `types/*.yaml numbers`, `difficulty` |
| 유형 카탈로그·비중 | 계차·연산 적용·홀짝 교대 비중 큼, 등차·등비 단독은 적음 | `types/*.yaml weight` |
| 오답 선택지 | 정답 근처 값, 흔한 실수 값 | `exam.distractors` |

## 모름 (자료로 확인할 것)
- 유형별 실제 출제 비중과 최근 회차 경향
- 선택지 개수, 응답 방식(클릭/직접 입력), 오답 구성 방식
- 빈칸 2개 형식(A+B 묻기 등) 존재 여부
- 문자·도형·표 배치형 수열 출제 여부
- 군수열의 묶음 구분이 화면에 보이는지 (`types/grouped.yaml display.groupSeparator`)
- 오답 감점 여부, 20문항 내 난이도 배치

## 출처
- 링커리어 SKCT 자료: https://community.linkareer.com/employment_data/6153854 , https://community.linkareer.com/employment_data/6396376 , https://community.linkareer.com/employment_data/6487272
- 코멘토 온라인 SKCT 공부법 질문

## 갱신 기록
- 2026-10-07: 초기 작성
