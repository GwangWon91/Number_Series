# SKCT 수열추리 연습

https://gwangwon91.github.io/Number_Series/

SKCT 인지역량 '수열추리'를 출퇴근길 폰과 노트북에서 끊김 없이 연습하는 웹앱(PWA).

- 한 문제씩 출제 → 선택 즉시 정답과 적용 규칙 해설 → 다음 문제 (끝없이 연속)
- 전체 유형 무작위 / 유형별 풀기, 5지선다, 문항당 45초 기준선 표시
- 규칙 기반 자동 생성 + 정적 문제은행, 다른 규칙으로도 풀리는 모호한 문항은 자동 배제
- '실전과 다름' 피드백 → 내보내기 → 설정 보정
- 오프라인 동작(PWA), 선택적 기기 간 동기화(Firebase)

출제 규칙·비중은 실전 자료를 모아 가며 보정 중인 **추정값**입니다 (`docs/skct-format.md`).

## 문제은행 관리 (요약)
- **생성 80% + public 은행 20%**를 출제한다. public은 직접 만든·숫자를 바꾼 변형 문항뿐이다.
- 기출 복원 원문과 캡처는 `data/bank/private/`(gitignore)에만 두고 앱·리포에는 올리지 않는다. 용도는 검사·비교·설정 보정의 근거다.
- 흐름: 원본(이미지/메모) → 전사 → private 은행 → `npm run validate:bank` → `npm run review`(`docs/bank-analysis.md` 갱신) → `config/` 보정(`version`+1, `changelog`).
- 새 문제는 이미지나 메모에 **출처·회차**를 붙여 Claude에게 주고 "private 은행에 추가하고 review 돌려줘"라고 요청하면 된다. 요청 문구와 절차는 [docs/bank-management.md](docs/bank-management.md).

## 개발
```bash
npm install
npm run dev        # http://localhost:5173
npm run validate   # 문항 품질 검사
npm test
```
작업 방법은 [CLAUDE.md](CLAUDE.md), 보정 절차는 [docs/calibration.md](docs/calibration.md), 문제은행 관리는 [docs/bank-management.md](docs/bank-management.md), 배포·동기화 설정은 [docs/deploy.md](docs/deploy.md).
