# 비공개 문제은행 (실제 기출 복원 문항)

이 폴더의 `*.yaml`은 **gitignore 대상**입니다. 실제 기출 복원 문항은 저작권 문제가 있으므로
공개 리포(GitHub)에 절대 올리지 않습니다. 이 README만 커밋됩니다.

- 쓰임: `npm run validate:bank`(형식·판별 검사), `npm run sample -- --compare`(생성 문항과 비교), 파라미터 보정의 근거
- 앱(배포 사이트)에는 포함되지 않습니다.
- 파일명 예: `2025H2.yaml`, `community-2026.yaml`

## 문항 형식

```yaml
- id: r-2025h2-001              # 영문/숫자/-/_ , 전체 은행에서 유일
  terms: [3, 7, 15, 31, null, 127]   # 빈칸은 null (정확히 1개), 분수는 "3/4"
  choices: [61, 62, 63, 64, 65]      # 실전 선택지 그대로 (기억나는 만큼)
  answer: 63
  typeId: linear-recurrence     # 모르면 생략 → solver가 판별 시도
  rule: "×2+1"                  # 사람이 이해한 규칙
  difficulty: 1                 # 체감 1~3 (선택)
  source: { kind: recall, round: 2025H2, note: "본인 응시 복원" }   # recall|community|book|original|variant
  publishable: false            # private은 항상 false
```

메모 형태(예: `3 7 15 31 ? 127 / 61~65 / 정답 63 / ×2+1`)로 Claude에게 주면 이 형식으로 변환합니다.
