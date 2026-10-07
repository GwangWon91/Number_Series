# 새 유형 추가하기

예: "차이가 소수(2, 3, 5, 7, 11, …)인 수열"을 추가한다고 하자.

## 1. 규칙 계열 (판별기) — 없을 때만
solver가 이 규칙을 알아야 (a) 해설을 만들고 (b) 다른 유형 문항의 "다른 해석"으로도 검사할 수 있다.

`src/engine/families/rules.ts`에 `IntRule`을 추가한다.
```ts
export const primeRule: IntRule = {
  id: 'prime', label: '소수', minLength: 4,
  match(seq) { /* 연속된 소수이면 { params: 1, summary: '연속된 소수' } */ },
  next(seq) { /* 마지막 소수 다음 소수 */ },
  prev(seq) { /* 첫 소수 이전 소수 */ },
};
```
차이에 적용하려면 `families/index.ts`에서 조합한다.
```ts
familyFromRule(diffOf(primeRule, 1, 'diff-prime', '계차수열 (차이가 소수)')),
```
- `params`는 자유 파라미터 수(여유 항 계산에 쓰임). 너무 작게 잡으면 모호 판정이 느슨해진다.
- `tests/engine/families.test.ts`에 예시 수열과 빈칸 후보 테스트를 추가한다.

## 2. 생성기
`src/engine/plugins/diff-prime.ts`
```ts
export default definePlugin({
  id: 'diff-prime',
  params: z.object({ start: range, firstPrimeIndex: range }),
  generate({ rng, length, params }) {
    const diffs = /* 소수 length-1개 */;
    return { terms: fromDiffs(rng.range(params.start), diffs), family: 'diff-prime' };
  },
});
```
- 완성 수열과 규칙 계열 id만 돌려준다. 숫자 범위·빈칸·선택지·모호성 검사는 compose가 한다.
- 조건이 안 맞으면 `null`을 돌려주면 재시도한다.

`src/engine/plugins/index.ts`에 한 줄 등록.

## 3. 설정
`config/types/diff-prime.yaml` — 다른 유형 파일을 복사해 시작한다. `confidence: estimated`, 근거는 `note`에.

## 4. 검증
```bash
npm run validate -- --type diff-prime    # 성공률·중복률·모호성
npm run sample -- --type diff-prime --n 40
npm test && npm run typecheck
```
`exam.yaml` version +1, changelog 기록 후 커밋.
