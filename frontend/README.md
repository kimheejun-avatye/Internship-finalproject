# 프론트 파일 구조 변경

기존 기능과 URL을 유지하면서 기능별로 파일을 모았습니다. 프론트 구현은 김희준 담당이며, 아래 담당자 표기는 백엔드 연동 시 확인할 위치입니다.

## 변경된 파일 구조

```text
frontend/src/
├─ app/
│  ├─ App.tsx
│  ├─ routes.tsx                    # URL·접근 권한·레이아웃 연결
│  ├─ providers.tsx                 # 라우터·인증 Provider
│  └─ App.test.tsx
├─ layouts/
│  ├─ auth/                        # AuthLayout.tsx, AuthLayout.css
│  └─ main/                        # MainLayout.tsx, MainLayout.css
├─ features/
│  ├─ auth/
│  │  ├─ pages/                    # 로그인·회원가입·비밀번호 찾기와 테스트
│  │  ├─ components/               # PrivacyDialog.tsx
│  │  ├─ guards/                   # ProtectedRoute.tsx
│  │  ├─ hooks/                    # useSessionActivity.ts
│  │  ├─ AuthProvider.tsx
│  │  ├─ auth.api.ts
│  │  ├─ signup.api.ts
│  │  ├─ password-reset.api.ts
│  │  ├─ auth.types.ts
│  │  └─ validation.ts
│  ├─ account/
│  │  ├─ pages/                    # PasswordChangePage.tsx
│  │  ├─ components/               # PasswordChangeForm.tsx
│  │  └─ account.api.ts
│  ├─ reservations/
│  │  ├─ pages/                    # CalendarPage.tsx, ReservationPage.tsx
│  │  ├─ mocks/                    # data.ts
│  │  ├─ calendar.css
│  │  └─ reservation.css
│  └─ admin/
│     ├─ pages/                    # AdminPage.tsx와 테스트
│     ├─ guards/                   # AdminRoute.tsx와 테스트
│     ├─ admin.api.ts
│     └─ admin.css
├─ shared/
│  ├─ ui/                          # Logo.tsx
│  ├─ api/                         # client.ts, session-client.ts
│  └─ hooks/                       # useCountdown.ts
├─ assets/
├─ styles/                         # tokens.css, global.css, session.css, index.css
├─ test/                           # setup.ts
├─ vite-env.d.ts
└─ main.tsx
```

## 화면 연결 계획

아래는 최종 연결 계획입니다. 이번 커밋은 파일 구조 변경 단계이며 MainHeader·ChatLayout·채팅·회의 메모는 아직 구현하지 않았습니다. 비밀번호 변경의 AuthLayout 연결도 후속 단계입니다.

```text
AuthLayout
├─ LoginPage
├─ SignupPage
├─ PasswordResetPage
└─ PasswordChangePage

MainLayout
├─ MainHeader                         [추가 예정]
│  └─ 로고·홈 이동·계정·알림·로그아웃
├─ 본문 영역
│  ├─ CalendarPage                    홈·캘린더 (최우석 API 연동)
│  ├─ ReservationPage                 회의실 예약 (황희구 API 연동)
│  └─ MeetingNotePage                 회의 메모 (최우석 API 연동, 추가 예정)
└─ 오른쪽 고정 ChatLayout             [추가 예정]
   └─ ChatPanel                       이찬석 API 연동 [추가 예정]
      ├─ FriendListView
      ├─ ChatRoomListView
      ├─ CreateChatRoomView
      └─ ConversationView
```

## 담당자별 확인 위치

| 담당자 | 확인할 파일·폴더 |
|---|---|
| 김희준 — 프론트 | `main.tsx` → `app/providers.tsx` → `app/App.tsx` → `app/routes.tsx`, `layouts/`, `features/` |
| 황희구 — 예약 API | `features/reservations/pages/ReservationPage.tsx`, `features/reservations/mocks/data.ts` |
| 최우석 — 캘린더·회의 메모·알림 API | `features/reservations/pages/CalendarPage.tsx`; 메모는 `features/meeting-notes/`, 알림 진입은 `layouts/main/MainHeader.tsx`에 추가 예정 |
| 이찬석 — 사용자 검색·채팅 API | `features/chat/ChatPanel.tsx`, `views/`, `components/`에 추가 예정; 예약 참석자 검색은 예약 화면에서도 연동 |

공통 HTTP·세션·CSRF 처리는 `shared/api/`를 확인합니다. 기능별 API·타입은 각 `features` 내부에서 관리합니다.

`AppLayout`은 `MainLayout`, `ProfilePage`는 `PasswordChangePage`로 이름을 정리했습니다. `/profile` 등 기존 URL은 유지했습니다.
검증: 기존 테스트 36개, 타입 검사, 프로덕션 빌드 통과.
