# 회의실 예약

로그인한 사용자가 회의실을 예약하고 캘린더에서 일정을 확인하는 서비스입니다. 예약 전에 CAPTCHAvatye 인증을 진행하며, 백엔드가 인증 결과를 확인한 뒤 예약을 저장합니다.

## Docker 실행

CAPTCHAvatye와 함께 실행하려면 [실행 안내](https://github.com/usk-avatye/captcha/blob/feat/captchavatye-demo/demo/README.md)를 참고하세요.

## 개발 환경 실행

Python 3.10 이상, Node.js, uv, Docker가 필요합니다.

```bash
cp -n .env.example .env
```

`.env`의 `SECRET_KEY`와 `CAPTCHAVATYE_SERVICE_KEY`를 32자 이상으로 설정합니다. 인증 서버의 공유키와 고객사의 `CAPTCHAVATYE_SERVICE_KEY`는 같아야 합니다.

```bash
docker compose up -d
cd backend
uv sync --group dev
uv run alembic upgrade head
uv run python -m scripts.seed
uv run uvicorn app.main:app --host 127.0.0.1 --port 8002
```

다른 터미널에서 프론트엔드를 실행합니다.

```bash
cd frontend
npm ci
npm run dev
```

화면은 [http://127.0.0.1:5175](http://127.0.0.1:5175) 입니다. 인증 서버는 기본 8001 포트를 사용합니다. 연결 설정은 [CAPTCHAvatye 연동 문서](docs/design/captchavatye.md)에 있습니다.

## 개발 계정

위의 seed 명령으로 계정과 회의실을 생성합니다.

| 구분 | 아이디 | 비밀번호 |
| --- | --- | --- |
| 일반 사용자 | qa-member1@example.com | Qa12345! |
| 관리자 | qa-admin@example.com | Qa12345! |

관리자 계정을 직접 생성하려면 backend 폴더에서 `uv run python -m scripts.create_admin <이메일>`을 실행합니다.

## 구성

| 경로 | 내용 |
| --- | --- |
| `backend/app/api` | HTTP API와 인증 연결 |
| `backend/app/services` | 예약, 로그인, 관리자 업무 로직 |
| `backend/app/models` | PostgreSQL 모델 |
| `backend/migrations` | Alembic 마이그레이션 |
| `frontend/src/pages` | 로그인, 예약, 캘린더, 관리자 화면 |
