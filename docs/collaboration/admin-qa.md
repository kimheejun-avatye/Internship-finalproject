# 관리자 기능 QA 가이드

DB는 각자 PC의 Docker에 따로 있으므로, QA용 계정과 데이터도 각자 한 번씩 만든다.

## 1. 준비

```bash
git fetch origin
git switch feat/admin

docker compose up -d
bash backend/scripts/migrate.sh   # 최신 마이그레이션(0005)까지 적용

cd backend
python -m scripts.seed             # QA 계정·회의실 생성. 여러 번 실행해도 중복 생성 안 됨
```

Python 3.10 이상이 필요하다.

## 2. 서버 실행

```bash
# 터미널 1 (backend 폴더)
uvicorn app.main:app --reload --port 8000

# 터미널 2 (frontend 폴더)
npm run dev
```

브라우저에서 `http://localhost:5173` 을 연다. 백엔드는 반드시 8000 포트여야 한다(프론트가 `/api` 를 8000으로 넘긴다).

## 3. QA 계정

비밀번호는 모두 `Qa12345!` 이다.

| 이메일 | 역할 | 상태 | 용도 |
|---|---|---|---|
| qa-admin@example.com | 관리자 | 승인됨 | 관리자 화면 확인 |
| qa-member1@example.com | 일반 | 승인됨 | 관리자 메뉴가 안 보이는지 확인 |
| qa-member2@example.com | 일반 | 승인됨 | 차단 대상 |
| qa-pending1@example.com | 일반 | 승인 대기 | 승인 대상 |
| qa-pending2@example.com | 일반 | 승인 대기 | 거절 대상 |

회의실은 A회의실(6명), B회의실(8명), C회의실(10명)이 생긴다.

## 4. 체크리스트

**관리자(qa-admin@example.com)로 로그인**

- [ ] 사이드바에 "관리자" 메뉴가 보이고 "워크스페이스 관리" 화면이 나온다
- [ ] QA대기일 **승인** → "승인됨"으로 바뀌고 상단 "승인 대기" 숫자가 줄어든다
- [ ] QA대기이 **거절** → 확인창 → 목록에서 사라진다 (같은 이메일로 다시 가입 가능)
- [ ] QA멤버이 **차단** → 확인창 → "차단됨"으로 바뀌고 버튼이 사라진다
- [ ] 관리자 계정 줄에는 버튼이 없다
- [ ] A회의실 **차단** → "차단 중 · ○○:○○까지"(60분 뒤)로 바뀌고 "사용 가능한 회의실" 숫자가 줄어든다
- [ ] 확인창에서 취소하면 아무 일도 일어나지 않는다

**일반 회원(qa-member1@example.com)으로 로그인**

- [ ] 사이드바에 "관리자" 메뉴가 없다
- [ ] 주소창에 `/admin` 을 입력하면 예약 화면으로 이동한다

**차단된 회원(qa-member2@example.com)**

- [ ] 차단 후에는 로그인할 수 없다. 차단 전에 로그인해 있던 화면도 다음 요청에서 로그아웃된다

## 참고

- 회원가입 인증번호는 `.env` 에 SMTP 계정이 없으면 메일 대신 백엔드 터미널에 출력된다.
- 로그인을 5번 틀리면 15분간 잠긴다.
- 회의실 차단은 60분 뒤 자동으로 풀린다. 시간은 `.env` 의 `ROOM_BLOCK_MINUTES` 로 바꿀 수 있다.
- 관리자 계정을 직접 만들려면 `python -m scripts.create_admin <이메일>` 을 쓴다(비밀번호는 실행 중 입력).
