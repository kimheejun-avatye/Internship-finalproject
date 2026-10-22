# 프론트 파일 구조 변경

기존 파일을 app·layouts·features·shared로 정리하고, 확정된 구조의 나머지 파일과 폴더도 추가했습니다. 프론트 구현은 김희준 담당이며 아래 이름은 백엔드 연동 담당자를 뜻합니다.

## 현재 파일 구조

```text
frontend/src/
├─ app/
│  ├─ App.test.tsx
│  ├─ App.tsx
│  ├─ providers.tsx  # 라우터·인증 Provider
│  └─ routes.tsx  # URL·접근 권한·레이아웃 연결
├─ assets/
│  └─ logo.svg
├─ features/
│  ├─ account/
│  │  ├─ components/
│  │  │  └─ PasswordChangeForm.tsx
│  │  ├─ pages/
│  │  │  └─ PasswordChangePage.tsx
│  │  └─ account.api.ts
│  ├─ admin/
│  │  ├─ guards/
│  │  │  ├─ AdminRoute.test.tsx
│  │  │  └─ AdminRoute.tsx
│  │  ├─ pages/
│  │  │  ├─ AdminPage.test.tsx
│  │  │  └─ AdminPage.tsx
│  │  ├─ admin.api.ts
│  │  └─ admin.css
│  ├─ auth/
│  │  ├─ components/
│  │  │  └─ PrivacyDialog.tsx
│  │  ├─ guards/
│  │  │  ├─ GuestRoute.tsx  # 골격
│  │  │  └─ ProtectedRoute.tsx
│  │  ├─ hooks/
│  │  │  └─ useSessionActivity.ts
│  │  ├─ pages/
│  │  │  ├─ LoginPage.test.tsx
│  │  │  ├─ LoginPage.tsx
│  │  │  ├─ PasswordResetPage.test.tsx
│  │  │  ├─ PasswordResetPage.tsx
│  │  │  ├─ SignupPage.test.tsx
│  │  │  └─ SignupPage.tsx
│  │  ├─ AuthProvider.tsx
│  │  ├─ auth.api.ts
│  │  ├─ auth.types.ts
│  │  ├─ password-reset.api.ts
│  │  ├─ signup.api.ts
│  │  └─ validation.ts
│  ├─ chat/
│  │  ├─ components/
│  │  │  ├─ ChatRoomRow.tsx  # 골격
│  │  │  ├─ FriendRow.tsx  # 골격
│  │  │  ├─ MessageBubble.tsx  # 골격
│  │  │  └─ MessageComposer.tsx  # 골격
│  │  ├─ views/
│  │  │  ├─ ChatRoomListView.tsx  # 골격
│  │  │  ├─ ConversationView.tsx  # 골격
│  │  │  ├─ CreateChatRoomView.tsx  # 골격
│  │  │  └─ FriendListView.tsx  # 골격
│  │  └─ ChatPanel.tsx  # 채팅 화면 전환 (이찬석 API 연동) · 골격
│  ├─ meeting-notes/
│  │  ├─ components/
│  │  └─ pages/
│  │     └─ MeetingNotePage.tsx  # 회의 메모 (최우석 API 연동) · 골격
│  └─ reservations/
│     ├─ components/
│     ├─ mocks/
│     │  └─ data.ts
│     ├─ pages/
│     │  ├─ CalendarPage.tsx  # 홈·캘린더 (최우석 API 연동)
│     │  └─ ReservationPage.tsx  # 회의실 예약 (황희구 API 연동)
│     ├─ calendar.css
│     ├─ reservation.css
│     ├─ reservations.api.ts  # 골격
│     └─ reservations.types.ts  # 골격
├─ layouts/
│  ├─ auth/
│  │  ├─ AuthLayout.css
│  │  └─ AuthLayout.tsx
│  ├─ chat/
│  │  ├─ ChatLayout.css  # 골격
│  │  └─ ChatLayout.tsx  # 골격
│  └─ main/
│     ├─ MainHeader.tsx  # 골격
│     ├─ MainLayout.css
│     └─ MainLayout.tsx
├─ shared/
│  ├─ api/
│  │  ├─ client.ts
│  │  └─ session-client.ts
│  ├─ hooks/
│  │  └─ useCountdown.ts
│  └─ ui/
│     ├─ Button.tsx  # 골격
│     ├─ Logo.tsx
│     └─ TextField.tsx  # 골격
├─ styles/
│  ├─ global.css
│  ├─ index.css
│  ├─ session.css
│  └─ tokens.css
├─ test/
│  └─ setup.ts
├─ main.tsx
└─ vite-env.d.ts
```

`골격` 표시 파일은 역할과 TODO만 작성한 구현 전 파일입니다. 화면·인증 가드·API 연결은 후속 단계에서 진행합니다. 비어 있는 components 폴더는 `.gitkeep`으로 Git에 포함했습니다.

## 기존 위치 → 변경 위치

- `App.tsx`의 라우팅 → `app/routes.tsx`
- `main.tsx`의 Provider 구성 → `app/providers.tsx`
- 인증 화면·Provider·가드·API·타입 → `features/auth`
- `pages/profile` → `features/account` (`ProfilePage` → `PasswordChangePage`)
- 캘린더·예약 화면·목 데이터 → `features/reservations`
- 관리자 화면·가드·API → `features/admin`
- `components/AppLayout.tsx` → `layouts/main/MainLayout.tsx`
- `layouts/AuthLayout.tsx` → `layouts/auth/AuthLayout.tsx`
- `components/Logo.tsx` → `shared/ui/Logo.tsx`
- 기능별 CSS → 각 기능·레이아웃 폴더

이동에 맞춰 import와 CSS 경로를 정리했습니다. 기존 기능과 URL은 유지했습니다.

## 담당자별 확인 위치

| 담당자 | 확인할 파일·폴더 |
|---|---|
| 김희준 — 프론트 | `app/routes.tsx`, `layouts/`, `features/`, `shared/ui/` |
| 황희구 — 예약 API | `features/reservations/pages/ReservationPage.tsx`, `reservations.api.ts`, `reservations.types.ts` |
| 최우석 — 캘린더·메모·알림 API | `features/reservations/pages/CalendarPage.tsx`, `features/meeting-notes/pages/MeetingNotePage.tsx`, `layouts/main/MainHeader.tsx` |
| 이찬석 — 사용자 검색·채팅 API | `features/chat/ChatPanel.tsx`, `features/chat/views/`, `features/chat/components/` |

공통 HTTP·세션·CSRF 처리는 `shared/api/`에서 확인합니다.
