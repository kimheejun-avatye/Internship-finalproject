# Frontend

React, TypeScript, Vite로 구성한 회의실 예약 화면입니다.

## 실행

```bash
cd frontend
npm ci
npm run dev
```

개발 화면은 [http://127.0.0.1:5175](http://127.0.0.1:5175) 입니다. `/api`는 예약 API 8002로, `/captchavatye/api`는 인증 API 8001로 전달합니다. 백엔드 실행과 계정 준비는 [프로젝트 README](../README.md)를 참고하세요.

## 명령

```bash
npm run build   # 타입 검사와 빌드
npm test        # 화면 테스트
```

## 화면

| 경로 | 내용 |
| --- | --- |
| `/login` | 로그인 |
| `/signup` | 회원가입 |
| `/reservations` | 회의실 예약 |
| `/calendar` | 예약 캘린더 |
| `/admin` | 관리자 |
| `/profile` | 비밀번호 변경 |
