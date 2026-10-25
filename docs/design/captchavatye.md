# CAPTCHAvatye 예약 인증 연동

예약 서버는 로그인 사용자, 예약 내용, 인증 시도와 완료 결과를 연결한다. SDK는 인증 UI와 완료 콜백만 제공한다. 포인트 정책은 추가하지 않았다. 기존 세션 쿠키, Origin, CSRF 검사와 회의실 행 잠금 및 시간 중복 규칙은 유지한다. 기존 참석자 저장 TODO는 이번 작업에서 변경하지 않았다.

## 설정과 실행

루트 `.env`에 `CAPTCHAVATYE_API_URL=http://127.0.0.1:8001`과 32자 이상의 `CAPTCHAVATYE_SERVICE_KEY`를 설정한다. 비밀키는 provider와 같아야 하고 `VITE_` 변수로 설정하지 않는다. `APP_ORIGINS`에 `http://127.0.0.1:5175`를 포함한다. 이미 존재하는 `.env`는 예제 변경을 자동 반영하지 않는다.

provider PostgreSQL은 고객사 DB와 별도 DB를 사용한다. provider 실행과 마이그레이션은 SDK 저장소 `backend/README.md`를 따른다. provider API는 8001, 이미지 및 선택적 시승 화면은 5173이다.

```bash
# 고객사 backend 폴더
uv sync --group dev
uv run alembic upgrade head
uv run uvicorn app.main:app --host 127.0.0.1 --port 8002

# 다른 터미널의 frontend 폴더
npm ci
npm run dev
```

고객사 화면은 `http://127.0.0.1:5175`이다. 개발 프록시 `/api`는 고객사 8002, `/captchavatye/api`는 provider 8001로 전달한다. `BACKEND_URL`, `CAPTCHAVATYE_URL`로 각각 변경할 수 있다. 이미지와 CTA 주소는 `VITE_CAPTCHAVATYE_SITE_URL`이며 기본값은 `http://127.0.0.1:5173`이다. 배포 시에도 두 API의 라우팅과 provider 정적 사이트 주소를 같은 구조로 구성해야 한다.

SDK는 `frontend/vendor/captchavatye-react-0.1.0.tgz`를 npm 파일 의존성으로 설치한다. 다른 저장소의 소스를 직접 import하지 않는다. npm 공개 발행은 필요하지 않다.

## HTTP 계약

1. `POST /api/reservations/captcha`: 기존 예약 입력으로 발급한다. 응답은 `{intent_id, challenge: {challengeId, creative}, expires_at}`이다. 서버가 provider의 비공개 `/internal/challenges`를 호출하고 `subject=intent_id`로 묶는다.
2. SDK에 `challenge`와 `key={intent_id}`를 전달한다. SDK는 `/captchavatye/api/verify`로 퍼즐을 확인한다. `onComplete`에서는 결과만 보관한다.
3. `예약 계속하기`에서 기존 `POST /api/reservations`에 예약 입력과 `captcha: {intent_id, challenge_id, completion_id}`를 보낸다. 기존 응답 필드와 201은 유지한다.
4. 고객사 서버는 intent 행을 잠그고 사용자, 예약 내용, challenge, 만료를 확인한다. provider `/internal/completions/verify`가 일치하는 완료 결과를 반환해야 예약을 저장한다.
5. 예약과 completion 사용 기록은 한 트랜잭션으로 commit한다. 동일 intent의 동일 요청과 완료 ID는 재시작 및 만료 이후에도 기존 예약을 반환한다. 다른 내용이나 다른 사용자는 거부한다. rollback 시 사용 기록도 남지 않는다.

인증 누락은 403 `CAPTCHA_REQUIRED`, 불일치는 403 `CAPTCHA_INVALID`, 미사용 만료는 403 `CAPTCHA_EXPIRED`, 완료 ID 중복은 409 `CAPTCHA_REUSED`, provider 연결 및 설정 오류는 503 `CAPTCHA_UNAVAILABLE`이다. 기존 예약 충돌 오류와 422 검증 형식은 유지한다.

화면은 전송 결과가 불확실하면 원래 예약 내용과 인증 증명을 유지한다. 시간이 지난 뒤에도 `예약 재시도`는 먼저 같은 요청을 보낸다. 서버가 미사용 만료를 확인하면 새 인증을 발급한다. 페이지 새로고침이나 다른 기기에서 화면의 초안과 재시도 증명을 복원하는 기능은 포함하지 않는다. 이미 저장된 예약은 DB와 캘린더에 남는다.

## 검증

전용 `meeting_room_captcha_followup_test` DB에서 전체 백엔드 테스트 184개, 프론트엔드 테스트 57개와 빌드가 통과했다. 인증 우회, pending/위조/다른 사용자/다른 내용, 만료, provider 장애, 트랜잭션 rollback, 완료 ID 재사용, 6개 동시 요청을 포함한다. 실제 두 HTTP 서버에서는 8개 동시 요청과 두 프로세스 재시작을 확인했다. 브라우저에서는 실제 퍼즐 드래그, 완료 후 닫기와 재열기, CTA 없이 예약 저장을 확인했다.

기존 개발 DB에는 이번 마이그레이션을 적용하지 않았다. 실행 환경 설정과 additive 마이그레이션 적용은 운영자가 수행한다. 새 테스트 DB만 생성했고 기존 DB 초기화나 원격 push 및 npm 공개는 하지 않았다. 실제 봇 탐지와 다중 고객사 키 관리, 키 교체 및 운영 배포는 범위에 포함하지 않는다.
