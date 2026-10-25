# 회의실 예약

## 로컬 실행

Python 3.10 이상, Node.js, Docker가 필요하다.

```bash
cp .env.example .env              # 처음 한 번. SECRET_KEY는 32자 이상 임의 값
docker compose up -d
bash backend/scripts/migrate.sh   # 새 코드를 받을 때마다 실행

cd backend
python -m scripts.seed            # 테스트 계정·회의실 생성
uvicorn app.main:app --reload --port 8002

cd frontend
npm run dev                       # http://127.0.0.1:5175
```

- 고객사 API는 8002, 화면은 5175를 기본 사용한다. CAPTCHAvatye API 8001과 분리한다.
- 예약에는 서버 간 인증 확인이 필요하다. [CAPTCHAvatye 설정과 API 계약](docs/design/captchavatye.md)에 따라 provider DB와 서버를 준비하고 공유 비밀키를 설정한다.
- `docker compose up -d`는 PostgreSQL과 Redis를 함께 실행한다. 기존 `.env`에도 `.env.example`의 `REDIS_PORT`, `REDIS_PASSWORD`를 추가한다.
- Redis는 기본 `127.0.0.1:6379`에서 `.env`의 `REDIS_PASSWORD`로 접속한다. 데이터는 `redis_data` 볼륨에 AOF로 보존한다.
- `.env`에 SMTP 계정이 없으면 회원가입 인증번호는 메일 대신 백엔드 터미널에 출력된다.

### 관리자 계정

회원가입은 항상 승인 대기 일반 회원으로 들어오므로, 첫 관리자는 스크립트로 만든다. DB가 PC마다 따로라 각자 한 번씩 만든다.

- 테스트용: `python -m scripts.seed` → `qa-admin@example.com` / `Qa12345!`
- 원하는 이메일: `python -m scripts.create_admin <이메일>` (비밀번호는 실행 중 입력. 이미 가입한 계정이면 비밀번호는 유지하고 관리자로 바꾼다)

관리자 기능 QA 순서는 [관리자 QA 가이드](docs/collaboration/admin-qa.md)를 따른다.

작업 폴더는 login-only, 브랜치는 codex/login-only다. 회원가입·세션 로그인 전용 e087f49에 developer d686b4f를 머지했다. main과 별도 teamproject1 폴더의 codex/login은 변경하지 않는다. 사용자 요청에 따라 검증한 통합 결과를 developer에 반영한다.

## 로그인 후 이동

- 로그인 성공: 항상 /reservations로 이동한다.
- 유효한 세션으로 /login 또는 /password/reset 접근: /reservations로 이동한다.
- 캘린더·예약·관리자·비밀번호 변경 화면은 ProtectedRoute와 팀 공통 AppLayout으로 연결한다.
- 팀 메뉴의 로그아웃 버튼은 서버의 현재 세션 종료를 호출한다. 비밀번호 변경 메뉴는 /profile이다.
- /signup은 기존 담당자의 화면·API·정책을 그대로 사용한다.

## 구조

```text
backend/app/
├── api/            # 로그인·비밀번호·가입·회의실 HTTP 연결
├── services/       # 인증 업무 로직 + 팀 예약/캘린더 서비스
├── schemas/        # 요청·응답 형식
├── models/         # 가입·인증 + 팀 회의실·예약·참석자·리마인더
├── core/           # 설정·보안
└── db/             # DB 연결
frontend/src/
├── main.tsx / App.tsx
├── auth/           # 세션 상태·보호 라우트
├── layouts/        # AuthLayout
├── components/     # 팀 공통 AppLayout·Logo
├── pages/          # auth·profile·calendar·reservation·admin
├── shared/         # API·타입·hooks
├── mocks/          # 기존 팀 화면의 임시 데이터
└── styles/
```

## DB 이력

기존 login_0003과 팀 캘린더 0003을 유지하고 merge_0004로 합쳤다. users 정책·인덱스는 변경하지 않는다. 새 DB·로그인 DB·팀 DB에서 upgrade head가 같은 단일 head로 이어지는 것을 별도 DB에서 검증했다. 기존 개발 DB에는 자동 적용하지 않았다.

## 확인 결과

백엔드 114개·프런트 26개 테스트, TypeScript 검사·프로덕션 빌드·인증 코드 정적 검사 통과. 캘린더 화면은 기존 팀 임시 데이터를 유지하며 실제 API로의 교체는 이번 머지에서 구현하지 않는다.

[실행 안내](docs/design/login-implementation.md) · [머지 검증](docs/design/login-pr-readiness.md)
