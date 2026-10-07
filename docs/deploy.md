# 배포와 동기화 설정

## GitHub Pages 배포
1. 리포 **Settings → Pages → Build and deployment → Source: GitHub Actions**
2. `main`에 push하면 `.github/workflows/deploy.yml`이 `validate → test → build → deploy`를 실행한다.
   검증이 실패하면 배포되지 않는다.
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
