# 프론트 파일 구조와 구현 현황

기존 파일을 app·layouts·features·shared로 정리했습니다. 프론트 구현은 김희준 담당이며 아래 이름은 백엔드 연동 담당자를 뜻합니다. 담당자가 지정되어 있다는 사실은 해당 API의 연결 완료를 뜻하지 않습니다.

2026-10-22, `frontjun` 브랜치의 로컬 작업 파일을 기준으로 실제 코드와 import·라우트·API 호출을 확인했습니다. 아래 상태는 프론트 소스 기준이며, 이번 확인에서 서버를 실행하거나 테스트를 재실행하지 않았습니다.

- `[구현]`: 설명한 역할의 실제 코드가 있으며 현재 앱에서 사용합니다. API 파일은 요청 함수가 구현되어 화면 또는 Provider에서 호출되는 상태를 뜻합니다.
- `[부분]`: 동작하는 코드가 있으나 임시 데이터 사용, API 미연결 또는 일부 기능 미구현이 남아 있습니다.
- `[미구현]`: TODO·빈 export·주석만 있는 골격입니다. 파일이나 import 경로만 존재해도 구현으로 표시하지 않습니다.
- `[테스트 작성]`: 검증 코드가 있습니다. 이번 점검에서 실행 통과를 확인했다는 의미는 아닙니다.
- `[리소스]`, `[빈 폴더]`: 이미지·환경 타입 또는 폴더 유지용 파일입니다.

## 현재 파일 구조

```text
frontend/src/
├─ app/
│  ├─ App.test.tsx                  # [테스트 작성] 라우팅·인증 가드·캘린더 이동·로그아웃
│  ├─ App.tsx                       # [구현] AppRoutes 렌더링
│  ├─ providers.tsx                 # [구현] BrowserRouter·AuthProvider 구성
│  └─ routes.tsx                    # [구현] 인증·예약·캘린더·관리자·비밀번호 변경 경로 연결
├─ assets/
│  └─ logo.svg                      # [리소스] 공통 로고에서 사용
├─ features/
│  ├─ account/
│  │  ├─ components/
│  │  │  └─ PasswordChangeForm.tsx   # [구현] 입력 검증·변경 API 호출·인증 상태 초기화
│  │  ├─ pages/
│  │  │  └─ PasswordChangePage.tsx   # [구현] /profile의 이메일·비밀번호 변경 폼
│  │  └─ account.api.ts             # [구현] 세션·CSRF를 포함한 비밀번호 변경 요청
│  ├─ admin/
│  │  ├─ guards/
│  │  │  ├─ AdminRoute.test.tsx      # [테스트 작성] 관리자·일반 회원 접근과 메뉴
│  │  │  └─ AdminRoute.tsx           # [구현] ADMIN 통과, 그 외 /reservations로 이동
│  │  ├─ pages/
│  │  │  ├─ AdminPage.test.tsx       # [테스트 작성] 목록·승인·거절·차단·실패 처리
│  │  │  └─ AdminPage.tsx            # [부분] 관리 API 연결, 오늘의 예약 통계 미구현
│  │  ├─ admin.api.ts               # [구현] 회원 조회·승인·거절·차단, 회의실 조회·차단
│  │  └─ admin.css                  # [구현] 관리자 화면 스타일
│  ├─ auth/
│  │  ├─ components/
│  │  │  └─ PrivacyDialog.tsx        # [구현] 수집·이용 안내 모달과 닫기 동작
│  │  ├─ guards/
│  │  │  ├─ LoggedOutRoute.tsx       # [구현] 세션 확인 대기·로그인 시 /calendar 이동
│  │  │  └─ ProtectedRoute.tsx       # [구현] 로그인 검사·확인 오류 재시도·/login 이동
│  │  ├─ hooks/
│  │  │  └─ useSessionActivity.ts    # [구현] 사용자 활동 API 호출·만료 시각 갱신
│  │  ├─ pages/
│  │  │  ├─ LoginPage.test.tsx       # [테스트 작성] 로그인·세션 복원·보호 경로·비밀번호 변경
│  │  │  ├─ LoginPage.tsx            # [구현] 로그인 API·오류 안내·성공 후 /calendar 이동
│  │  │  ├─ PasswordResetPage.test.tsx # [테스트 작성] 인증·재설정 요청·토큰 만료
│  │  │  ├─ PasswordResetPage.tsx    # [구현] 이메일 인증·비밀번호 재설정 API 연결
│  │  │  ├─ SignupPage.test.tsx      # [테스트 작성] 가입 흐름·검증·인증 실패·개인정보 안내
│  │  │  └─ SignupPage.tsx           # [구현] 이메일 인증·가입 API·입력 검증·동의·완료 안내
│  │  ├─ AuthProvider.tsx           # [구현] 로그인·로그아웃·세션 복원·만료 확인·탭 간 동기화
│  │  ├─ auth.api.ts                # [구현] 로그인·세션 조회·로그아웃·활동 요청
│  │  ├─ auth.types.ts              # [구현] 사용자·세션·만료 시각 타입
│  │  ├─ password-reset.api.ts      # [구현] 재설정 인증번호 발송·확인·비밀번호 재설정 요청
│  │  ├─ signup.api.ts              # [구현] 이메일 확인·인증번호 발송/검증·가입 요청
│  │  └─ validation.ts              # [구현] 이메일·이름·생일·전화·비밀번호 검증과 정규화
│  ├─ chat/
│  │  ├─ components/
│  │  │  ├─ ChatRoomRow.tsx          # [미구현] 채팅방 목록의 한 행
│  │  │  ├─ FriendRow.tsx            # [미구현] 친구 목록의 한 행
│  │  │  ├─ MessageBubble.tsx        # [미구현] 메시지 말풍선
│  │  │  └─ MessageComposer.tsx      # [미구현] 메시지 입력창
│  │  ├─ views/
│  │  │  ├─ ChatRoomListView.tsx     # [미구현] 채팅방 목록
│  │  │  ├─ ConversationView.tsx     # [미구현] 개인·단체 대화
│  │  │  ├─ CreateChatRoomView.tsx   # [미구현] 채팅방 생성
│  │  │  └─ FriendListView.tsx       # [미구현] 친구 목록
│  │  └─ ChatPanel.tsx              # [미구현] 패널 내부 화면 전환, 앱 미연결
│  ├─ meeting-notes/
│  │  ├─ components/
│  │  │  └─ .gitkeep                # [빈 폴더] 메모 컴포넌트 없음
│  │  └─ pages/
│  │     └─ MeetingNotePage.tsx      # [미구현] 회의 메모 화면·API·라우트 연결 없음
│  └─ reservations/
│     ├─ components/
│     │  └─ .gitkeep                # [빈 폴더] 예약 컴포넌트 분리 전
│     ├─ mocks/
│     │  └─ data.ts                 # [부분] 예약·회의실 임시 데이터와 화면용 타입
│     ├─ pages/
│     │  ├─ CalendarPage.tsx        # [부분] 주간 표시·주 이동 구현, 임시 데이터·API 미연결
│     │  └─ ReservationPage.tsx     # [부분] 선택·시간 검증·로컬 추가, 날짜 고정·API 미연결
│     ├─ calendar.css              # [구현] 캘린더 화면 스타일
│     ├─ reservation.css           # [구현] 예약 화면 스타일
│     ├─ reservations.api.ts       # [미구현] 예약 API 호출 함수 없음
│     └─ reservations.types.ts     # [미구현] 서버 요청·응답 타입 없음
├─ layouts/
│  ├─ auth/
│  │  ├─ AuthLayout.css             # [구현] 인증 폼·완료 안내·모달 공통 스타일
│  │  └─ AuthLayout.tsx             # [구현] 로그인·비밀번호 찾기 공통 배치만 담당
│  ├─ chat/
│  │  ├─ ChatLayout.css             # [미구현] 오른쪽 채팅 영역 스타일
│  │  └─ ChatLayout.tsx             # [미구현] 오른쪽 고정 채팅 배치, 앱 미연결
│  └─ main/
│     ├─ MainHeader.tsx             # [미구현] 독립 헤더·홈 이동·계정·알림
│     ├─ MainLayout.css             # [구현] 헤더·사이드바·본문 배치 스타일
│     └─ MainLayout.tsx             # [부분] 로고·메뉴·로그아웃 구현, 별도 헤더·채팅 미연결
├─ shared/
│  ├─ api/
│  │  ├─ client.ts                  # [구현] HTTP 요청·네트워크/서버/필드 검증 오류 변환
│  │  └─ session-client.ts          # [구현] 세션·CSRF 헤더·인증 소실 이벤트 처리
│  ├─ hooks/
│  │  └─ useCountdown.ts            # [구현] 인증번호 재전송 대기 카운트다운
│  └─ ui/
│     ├─ Button.tsx                 # [미구현] 공통 버튼 컴포넌트
│     ├─ Logo.tsx                   # [구현] 로고 이미지 표시 (홈 이동 링크 없음)
│     └─ TextField.tsx              # [미구현] 공통 입력 필드 컴포넌트
├─ styles/
│  ├─ global.css                    # [구현] 기본 스타일·공통 클래스·현재 디자인 변수
│  ├─ index.css                     # [구현] 사용 중인 CSS를 순서대로 import
│  ├─ session.css                   # [구현] 세션 안내·비밀번호 변경 화면 스타일
│  └─ tokens.css                    # [미구현] 주석만 존재, 변수는 현재 global.css에 정의
├─ test/
│  └─ setup.ts                      # [테스트 작성] Testing Library matcher 설정
├─ main.tsx                         # [구현] React 실행·Provider·전역 CSS 연결
└─ vite-env.d.ts                    # [리소스] Vite 환경 타입 선언
```

## 기능별로 구현된 것과 남은 것

| 기능 | 현재 구현한 것 | 남은 것·연결 상태 |
|---|---|---|
| 로그인·접근 가드 | 로그인 요청, 세션 확인, 로그인/비로그인/관리자 접근 제어, 캘린더 이동 | 현재 라우트에 연결됨. 실제 서버와의 실행 검증은 이번 점검 범위 밖 |
| 회원가입 | 이메일 확인·인증번호 발송/검증·가입 요청, 입력 검증, 개인정보 동의, 승인 대기 안내 | API 요청 코드가 화면에 연결됨. 자체 `auth-page` 래퍼 사용 |
| 비밀번호 찾기·변경 | 이메일 인증 후 재설정, 현재 비밀번호를 통한 변경, 변경 후 로컬 인증 초기화 | API 요청 코드가 화면에 연결됨. 다른 기기의 세션 종료는 서버 처리 영역 |
| 세션 관리 | 복원·로그아웃·만료 재확인·활동 알림·CSRF·탭 간 재조회 | `AuthProvider`와 공통 요청 모듈에서 사용 중 |
| 관리자 | 회원·회의실 조회, 가입 승인/거절, 회원 차단, 회의실 차단, 응답에 따른 화면 갱신 | `오늘의 예약`은 `-`와 연동 예정 안내만 표시 |
| 캘린더 | 주간 시간표, 이전/다음 주·오늘 이동, 내 예약/다른 예약 표시 | `mocks/data.ts`의 고정 예약만 사용. 예약 API 조회·로컬 예약 추가 결과 공유 없음 |
| 예약 | 회의실 선택, 일정 표시, 제목·시간 순서·중복 검사, React state에 예약 추가 | 날짜는 `2026-10-16` 고정. 서버 저장·조회 없음. 새로고침/페이지 이탈 시 추가 예약 소실 |
| 메인 배치·헤더 | `MainLayout` 안의 로고 헤더·사이드바·권한별 메뉴·로그아웃 | `MainHeader`는 미구현·미사용. 로고 홈 이동·계정 메뉴·알림·오른쪽 채팅 미구현 |
| 채팅·회의 메모 | 파일과 폴더 골격 | 컴포넌트·화면·API·앱 연결 미구현. 메모 라우트도 없음 |
| 공통 UI·디자인 변수 | `Logo`, HTML button/input과 공통 CSS, `global.css`의 변수 | `Button.tsx`, `TextField.tsx`, `tokens.css`는 미구현 |
| 테스트 | 앱·로그인·회원가입·비밀번호 재설정·관리자 화면/가드 테스트 작성 | fetch 모의 응답 기반. 예약·캘린더 전용 테스트 파일은 없음 |

인증 가드와 인증/계정/관리자 API 요청은 이미 구현되어 있으므로 전체를 “후속 단계에서 구현”으로 분류하지 않습니다. 반대로 화면이 보인다는 이유만으로 임시 데이터 기반 예약·캘린더를 서버 연동 완료로 분류하지 않습니다.

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

구조 이동 시 import와 CSS 경로를 정리했습니다. 이후 인증 변경으로 `GuestRoute.tsx` 골격을 `LoggedOutRoute.tsx` 구현으로 교체했고, 로그인 사용자 및 로그인 성공 후 이동 목적지는 `/calendar`입니다.

## 담당자별 확인 위치

| 담당자 | 확인할 파일·폴더 |
|---|---|
| 김희준 — 프론트 | `app/routes.tsx`, `layouts/`, `features/`, `shared/ui/` |
| 황희구 — 예약 API | `features/reservations/pages/ReservationPage.tsx`, `reservations.api.ts`, `reservations.types.ts` |
| 최우석 — 캘린더·메모·알림 API | `features/reservations/pages/CalendarPage.tsx`, `features/meeting-notes/pages/MeetingNotePage.tsx`, `layouts/main/MainHeader.tsx` |
| 이찬석 — 사용자 검색·채팅 API | `features/chat/ChatPanel.tsx`, `features/chat/views/`, `features/chat/components/` |

공통 HTTP·세션·CSRF 처리는 `shared/api/`에서 확인합니다.

로그인·회원가입·비밀번호 찾기의 접근 검사는 `LoggedOutRoute`에서 처리합니다.
`LoggedOutRoute`는 세션 조회 중 상태 안내를 표시하고, 로그인 상태이면 `/calendar`로 이동하며, 로그아웃 상태이면 하위 화면을 표시합니다. `LoginPage`도 로그인 성공 후 `/calendar`로 이동합니다.

현재 인증 경로 연결은 다음과 같습니다.

- `/login`, `/password/reset`: `LoggedOutRoute` → `AuthLayout` → 각 페이지
- `/signup`: `LoggedOutRoute` → `SignupPage` (자체 `auth-page` 래퍼 사용)

`AuthLayout`은 공통 배치만 담당합니다. 회원가입 화면까지 `AuthLayout`으로 통합된 상태는 아닙니다. 기존 보호 경로는 `ProtectedRoute` → `MainLayout` 아래에 있으며, `/profile`도 이 배치를 사용합니다. 알 수 없는 경로는 기존과 같이 `/reservations`로 이동합니다.

## 사용자 선택 공통화 — 후속 변경

이 절은 위 구조 점검 이후 적용한 사용자 선택 기능의 현재 연결 범위를 설명한다.

- `app/providers.tsx`에서 로그인 계정별 `UserDirectoryProvider`를 연결한다. 최초 사용자 선택 시에만 `/api/users/search?q=&limit=50`을 조회하고, `next_cursor`가 끝날 때까지 수집한다. 여러 소비자와 새로고침 요청은 진행 중인 같은 Promise를 공유한다.
- `shared/hooks/useSelectableUsers.ts`는 Provider 상태를 읽는다. 기본 호출은 캐시를 재사용하고, `refresh()`는 새로 조회한다. `enabled: false`는 조회 없이 상태만 구독한다. `UserPicker`는 열릴 때 `refreshOnMount: true`로 갱신하며, 화면의 새로고침 버튼도 같은 함수를 쓴다.
- `shared/users/filterUsersByName.ts`와 `UserPicker.tsx`에서 이름 부분 검색, 단일·다중 선택, 제외 ID, 선택 칩, 로딩·실패·빈 목록을 처리한다. 타이핑 중에는 API를 호출하지 않는다. 이메일·소속을 표시하지만 검색은 이름만 대상으로 한다. 현재 사용자 검색 응답에 부서/직무 필드가 없어 표시하지 않는다.
- 로그아웃·계정 변경 시 목록과 선택 상태를 폐기하고 진행 중인 요청을 취소한다. 늦은 이전 계정 응답은 새로운 계정의 목록이나 인증 상태에 반영하지 않는다.
- `AttendeePicker`, `FriendListView`, `CreateChatRoomView`는 같은 Provider와 `UserPicker`를 사용한다. 예약자 포함 정원 계산과 `attendee_ids`를 예약 API에 보내는 처리는 예약 기능에 남긴다.
- 실제 앱의 `ChatPanel`은 로그인 사용자로 `chat.live.ts`를 사용한다. 공통 사용자 선택기에서 개인·단체방 생성, 방 목록·메시지 조회·전송, 이전 메시지 조회와 WebSocket 연결·재연결을 처리한다. 서버에 읽음 정보가 없어 실제 모드의 탭 숫자는 방 수이며 안 읽음 필터를 표시하지 않는다. 기존 방에 추가로 초대하는 UI와 예약 공유·알림 화면은 별도 연결이 필요하다.
- 기존 임시 대화·목록·초안·전송 예시는 `chat-preview.html` → `PreviewChatPanel` → `chat.data.ts`/`mocks`에서만 사용한다. 이 미리보기도 같은 선택 컴포넌트를 쓰되 별도 Provider에 임시 목록 소스를 명시적으로 주입한다.
- 기존 `FriendRow.tsx`와 채팅 전용 `filterUsers.ts`의 중복 구현은 공통 `UserPicker`·이름 필터로 대체했다.

## 캘린더 카드·개인 회의록·예약 삭제 — 2026-10-22 후속 변경

이 절은 위 최초 구조 점검 이후 적용한 예약·회의록의 실제 연결 상태를 설명한다.

- `WeekCalendar`는 1시간 144px을 기준으로 시간 눈금·배경·카드·최초 스크롤을 함께 계산한다. 동시간 예약은 레인당 220px을 확보한다. 내용의 실제 높이가 부족하면 카드만 늘리지 않고 시간축 전체를 늘린다. `MonthCalendar` 카드는 내용에 맞춰 높이가 늘어나며 날짜·`+N건` 주간 이동을 유지한다.
- 두 보기의 `ReservationActions`는 `삭제`·`회의록`을 제공한다. 삭제는 생성자(`is_mine`), 회의록은 실제 참석자(`is_attending`)에게만 활성화한다. 서버에서도 각각 권한을 검증한다.
- 예약 범위는 `전체 보기 / 나만 보기`로 표시한다. API는 `scope=all`로 조회하고, 나만 보기에서는 주간·월간 공통 목록을 `is_attending`으로 필터링해 다른 사람이 만든 초대 회의도 포함한다. 빈 결과는 ‘조회 기간에 내가 참석하는 예약이 없습니다.’로 안내한다. 생성자 표시·색상과 삭제 권한의 `is_mine` 기준은 유지한다. 기존 예약의 참석자 행 누락 여부는 별도 확인 항목이며, 누락된 예약은 나만 보기에서 제외될 수 있다.
- `DELETE /api/reservations/{reservation_id}` → `204 No Content`. 생성자만 삭제할 수 있다. 해당 예약의 **모든 사용자의 개인 회의록, 참석자 등록 정보, 예약 행을 한 트랜잭션으로 삭제**한다. 다른 예약의 데이터는 보존한다. 존재하지 않으면 `404 RESERVATION_NOT_FOUND`, 생성자가 아니면 `403 RESERVATION_FORBIDDEN`이다. 로그인·Origin·CSRF·JSON 헤더 검사는 유지한다.
- `memo` 외래키에는 CASCADE가 없어 서비스에서 메모부터 명시적으로 정리한다. 삭제·메모 저장은 같은 예약 행을 잠가 동시 저장과 충돌하지 않게 한다. 기존 `0009` 마이그레이션의 `(reservation_id,user_id)` 고유키가 필요하다.
- 확인창에 제목·일시와 전체 개인 회의록 삭제 범위를 표시한다. 요청 중 중복을 막고 실패 시 카드를 유지한다. 삭제 성공 이후 재조회 실패는 삭제 실패와 구분한다. 날짜·보기·회의실·참석 기준 예약 범위(`scope`)를 URL에 유지한다.
- `/reservations/:reservationId/memo`는 `ProtectedRoute → MainLayout` 안에서 공통 헤더·채팅을 유지한다. `date`로 예약 정보를 재조회하고 `calendar_date`, `view`, `scope`, `room_id`로 캘린더 복귀 상태를 복원한다.
- 기존 `GET/PUT /api/reservations/{reservation_id}/memo`를 사용한다. GET의 `null`은 빈 편집기이며 최초 PUT 때만 행이 생성된다. PUT 본문은 `{ "memo": "내용" }`만 보내고 작성자는 로그인 세션에서 결정한다. 저장 실패 시 내용을 보존하며 최근 저장은 `updated_at ?? created_at`이다.
- `main.tsx`의 Data Router와 `useBlocker`로 앱 내 이동·뒤로 가기를 확인하고 `beforeunload`로 새로고침·탭 닫기를 안내한다. 기존 라우트 구조와 인증 검사는 유지한다.
- 참석자 이름 목록은 캘린더 응답에 없어 실제 `participant_count`만 표시한다. 전체 사용자 목록으로 참석자를 추정하지 않는다.
- 관련 테스트: `CalendarPage.test.tsx`, `MeetingNotePage.test.tsx`, `CalendarMemo.integration.test.tsx`, `backend/tests/test_reservation_delete.py`. 실제 DB 삭제·메모 생성/수정·권한·실패 롤백·동시 삭제/저장은 별도 PostgreSQL 테스트 DB에서 검증한다.
