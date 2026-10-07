# 배포와 동기화 설정

## GitHub Pages 배포
1. 리포 **Settings → Pages → Build and deployment → Source: GitHub Actions**
2. 배포는 **릴리스 단위**다. main에 PR이 병합될 때마다 release-please가 "chore: release vX.Y.Z" PR을 갱신해 두고,
   그 PR을 병합하면 태그·GitHub Release·CHANGELOG.md가 생기면서 `deploy.yml`이 `validate → test → build → deploy`를 실행한다.
   검증이 실패하면 배포되지 않는다. 급할 때는 Actions → deploy → Run workflow로 수동 배포.
3. 주소: `https://<github-id>.github.io/<repo>/` (이 리포는 `https://gwangwon91.github.io/Number_Series/`)
4. 폰에서 열고 "홈 화면에 추가"하면 앱처럼 설치되고 오프라인에서도 풀린다.

## 기기 간 동기화 (Firebase, 무료 Spark 플랜)
설정하지 않으면 기록은 각 기기에만 저장되고 앱은 그대로 동작한다.

1. https://console.firebase.google.com → 프로젝트 만들기 (Analytics 불필요)
2. **Authentication → 시작하기 → 로그인 방법 → 이메일/비밀번호** 사용 설정
3. **Authentication → 설정 → 승인된 도메인**에 `gwangwon91.github.io` 추가
4. **Firestore Database → 데이터베이스 만들기** (프로덕션 모드, 서울 `asia-northeast3` 권장)
5. **Firestore → 규칙**에 리포의 `firestore.rules` 내용을 붙여넣고 게시
6. **프로젝트 설정 → 일반 → 내 앱 → 웹 앱 추가** → 표시되는 `apiKey`, `authDomain`, `projectId`, `appId` 확인
7. GitHub 리포 **Settings → Secrets and variables → Actions → Variables**에 등록:
   `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`
   (웹 설정 값은 공개돼도 안전하다 — 접근 제어는 보안 규칙이 담당)
8. Actions에서 deploy를 다시 실행 → 앱 **설정 → 기기 간 동기화**에서 계정 만들기/로그인

로컬에서 시험하려면 `.env.example`을 `.env.local`로 복사해 같은 값을 채운다.

### 동작 방식
- 기기 안(IndexedDB)이 원본. 로그인하면 아직 올리지 않은 기록을 올리고, 다른 기기 기록을 받아 합친다.
- 기록은 추가만 하므로 충돌이 없다. 오프라인에서 푼 기록은 다시 연결되면 올라간다.
- 동기화 시점: 로그인 직후, 앱이 다시 보일 때, 네트워크 복귀 시, 풀이 후 3초.
- 한 기기에서 여러 계정을 번갈아 쓰는 경우는 고려하지 않았다 (개인용).

## 익명 풀이 기록 (소유자에게 모이는 풀이 데이터)
Firebase가 설정된 배포본은 로그인 여부와 상관없이 모든 사용자의 풀이를 Firestore `poolAttempts`·`poolFlags`에 보낸다
(`src/store/pool.ts`). 보정(`npm run calibrate`) 근거를 내 기록만이 아니라 실제 사용자 전체로 넓히기 위한 것.
- 보내는 것: 문항(수열·선택지·정답), 고른 답, 정답 여부, 풀이 시간, 출제 설정·앱 버전, 무작위 기기 id. '실전과 다름'은 사유 칩만.
- 보내지 않는 것: 계정 이메일·uid, '실전과 다름'의 자유 메모.
- 누구나 생성만 할 수 있고 읽기는 소유자만 (`firestore.rules`). 이미 있는 문서 덮어쓰기·삭제는 불가.

설정:
1. 소유자 계정을 앱에서 하나 만든다 (설정 → 기기 간 동기화 → 계정 만들기), Firebase 콘솔 → Authentication → 사용자에서 그 계정의 uid 복사
2. `firestore.rules`의 `OWNER_UID`를 그 uid로 바꿔 콘솔 → Firestore → 규칙에 게시 (리포에는 `OWNER_UID` 그대로 둔다)
3. `.env.local`에 `VITE_FIREBASE_*`와 `POOL_OWNER_EMAIL`, `POOL_OWNER_PASSWORD`

받기:
```
npm run pool:pull        # 지난번 이후 새 기록 → data/feedback/pool-YYYY-MM-DD.json
npm run calibrate        # 내보낸 파일·pool 파일을 합쳐 유형별 정답률·시간·사유 집계
```
`data/feedback/pool-cursor.txt`가 마지막으로 받은 시점이다. 처음부터 다시 받으려면 `npm run pool:pull -- --all`.
