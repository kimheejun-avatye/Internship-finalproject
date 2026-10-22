**예약과 캘린더 페이지 프론트엔드 작업 계획**

작성일: 2026-10-22

작업 프로젝트: [/Users/kimheejun/Desktop/kimheejun/Internship-finalproject](/Users/kimheejun/Desktop/kimheejun/Internship-finalproject), `frontjun`

현재 예약과 캘린더는 이미 실제 API를 호출하고 있다. 기존 조회·생성 기능을 유지하면서 피그마의 화면 배치, 1시간 단위 예약 입력, 참석자 선택, 주간 시간표와 월간 탐색을 적용한다. 큰 폴더 구조와 인증 검사는 유지하며, 백엔드 담당자의 코드는 이 작업에서 수정하지 않는다.

**1. 확인한 기준과 현재 구현**

기준 문서는 [공통 API 규칙](/Users/kimheejun/Documents/ChatGPT/Internship-finalproject/docs/collaboration/api-contracts/00_공통_API_규칙.txt), [황희구님 예약 API 요청서](/Users/kimheejun/Documents/ChatGPT/Internship-finalproject/docs/collaboration/api-contracts/01_황희구_예약_API.txt), [최우석님 캘린더·메모·알림 API 요청서](/Users/kimheejun/Documents/ChatGPT/Internship-finalproject/docs/collaboration/api-contracts/03_최우석_캘린더_메모_알림_API.txt), [프론트 구조와 API 연동](/Users/kimheejun/Documents/ChatGPT/Internship-finalproject/docs/collaboration/api-contracts/04_프론트_구조와_API_연동.txt)이다. 이 문서들은 Documents 폴더에 보관되어 있으며, 실제 수정할 소스는 위 Desktop 프로젝트다. 폐기된 `api-contracts-v0.2`를 기준으로 사용하지 않는다.

피그마는 Page 4의 [홈](https://www.figma.com/design/rObtjxNoF9V9iQwPct1lIU?node-id=2894-1132), [회의실 예약](https://www.figma.com/design/rObtjxNoF9V9iQwPct1lIU?node-id=2894-1377), [두 번째 예약 프레임](https://www.figma.com/design/rObtjxNoF9V9iQwPct1lIU?node-id=2911-1938)과 클릭 연결을 확인했다. 홈의 예약 버튼은 예약 화면으로, 예약 완료 흐름은 홈으로, 일정의 메모장 버튼은 회의 메모 화면으로 이어진다.

| 영역 | 현재 구현 | 이번에 바꿀 부분 |
|---|---|---|
| 공통 화면 | MainHeader, 본문 Outlet, 오른쪽 ChatPanel 연결. 왼쪽 사이드바는 이미 제거됨 | 공통 구조 유지. 본문 배치와 중복 메뉴만 조정 |
| 캘린더 | 실제 기간 조회, 회의실 필터, 주·월 전환, 오늘·이전·다음 이동 | 날짜별 목록을 피그마의 주간 시간표로 변경 |
| 월간 | 날짜별 예약 전체 표시, 날짜 클릭 시 목록 팝업 | 일정 요약과 +N 표시, 날짜/+N 클릭 시 해당 주간으로 이동 |
| 예약 | 실제 회의실 목록, 예약 생성, 오늘 남은 예약과 페이지 이동 | 입력 폼을 상단으로 옮기고 날짜·1시간 구간·참석자 선택 추가 |
| 가능 시간 | getAvailability 함수는 존재 | 페이지에서 호출하고 시작·종료 선택지에 반영 |
| 참석자 | 요청 타입에 attendee_ids만 존재 | 사용자 선택 UI, 중복 제거, 정원 안내, 요청 데이터 연결 |
| 메모·알림·삭제 | 메모 페이지는 골격, 알림 버튼은 준비 상태, 삭제 API 없음 | 별도 연동 조건으로 관리 |

관찰 시점에 인증·메인·채팅·사용자 조회 파일에 미커밋 작업이 있다. 구현 착수 시 해당 변경을 보존하고 최신 내용을 다시 읽는다. 예약·캘린더의 `mocks/data.ts`는 남아 있지만 현재 두 페이지에서 사용하지 않는다.

**2. 현재 폴더와 수정 예정 파일**

`app / layouts / features / shared` 구조는 그대로 사용한다. 아래는 이번 작업에 관련된 현재 파일이다.

```text
frontend/src/
├─ app/
│  └─ routes.tsx                         # /calendar, /reservations 연결
├─ features/
│  ├─ reservations/
│  │  ├─ components/
│  │  │  └─ .gitkeep                     # 현재 빈 폴더
│  │  ├─ pages/
│  │  │  ├─ CalendarPage.tsx             # 실제 기간 조회·현재 주/월 화면
│  │  │  ├─ CalendarPage.test.tsx
│  │  │  ├─ ReservationPage.tsx          # 실제 목록 조회·예약 생성
│  │  │  └─ ReservationPage.test.tsx
│  │  ├─ mocks/data.ts                   # 현재 두 페이지에서 미사용
│  │  ├─ calendar.css
│  │  ├─ reservation.css
│  │  ├─ reservations.api.ts             # 현재 골격
│  │  └─ reservations.types.ts           # 현재 골격
│  └─ meeting-notes/pages/
│     └─ MeetingNotePage.tsx             # 현재 골격, 별도 후속 작업
├─ layouts/
│  ├─ main/
│  │  ├─ MainLayout.tsx                  # 헤더·본문·오른쪽 채팅 유지
│  │  ├─ MainHeader.tsx
│  │  └─ MainLayout.css
│  └─ chat/
│     ├─ ChatLayout.tsx
│     └─ ChatLayout.css
└─ shared/
   ├─ api/
   │  ├─ calendar.ts                    # 현재 실제 캘린더 API·타입
   │  ├─ reservations.ts                # 현재 실제 예약 API·타입
   │  ├─ users.ts                       # 채팅·예약 공용 사용자 조회
   │  ├─ client.ts
   │  └─ session-client.ts
   └─ hooks/
      └─ useSelectableUsers.ts          # 사용자 목록·커서·재시도
```

기존 합의와 다른 점은 **예약·캘린더 API가 아직 shared/api에 있고, features/reservations의 API·타입 파일이 비어 있다는 것**이다. 새 API를 중복 작성하지 않고 기존 함수와 타입을 기능 폴더로 옮긴다. import를 모두 변경한 뒤 사용되지 않는 기존 파일을 정리한다. 사용자 조회는 채팅과 공용이므로 현재 shared 위치를 유지한다.

추가할 UI 파일은 다음 다섯 개를 기본안으로 한다. 페이지는 조회와 상태를 관리하고, 컴포넌트는 표시와 선택 동작을 담당한다.

```text
features/reservations/components/
├─ CalendarToolbar.tsx       # 기간·오늘·주/월 전환·회의실 필터·예약 진입
├─ WeekCalendar.tsx          # 월~금 시간축과 예약 카드 배치
├─ MonthCalendar.tsx         # 월간 요약·+N·해당 주간 이동
├─ TimeSlotPicker.tsx        # 가능 슬롯에 맞춘 시작·종료 선택
└─ AttendeePicker.tsx        # 사용자 검색·선택·해제·인원 안내
```

TimeSlotPicker는 피그마 상단의 시작·종료 입력을 담당한다. 예약 화면에 별도의 큰 시간표를 추가하는 방식으로 디자인을 바꾸지 않는다. 회의실 카드와 오늘 목록은 우선 ReservationPage 안에 유지하고, 복잡해질 때만 분리한다.

**3. API 연결표**

| 화면 기능 | 사용할 API | 프론트가 처리할 내용 |
|---|---|---|
| 예약 회의실 카드 | GET /api/rooms | room_id, name, status, capacity 표시 |
| 날짜별 가능 시간 | GET /api/rooms/{room_id}/availability?date=YYYY-MM-DD&slot_minutes=60 | 슬롯 배열의 available로 선택 가능 여부 결정 |
| 참석자 목록 | GET /api/users/search | 기존 users.ts/useSelectableUsers 재사용. 본인 제외 정상 회원, 다른 팀 포함 |
| 예약 생성 | POST /api/reservations | room_id, title, start_at, end_at, attendee_ids 전송 |
| 오늘 남은 일정 | GET /api/rooms/{room_id}/reservations?page=1 | items, total, page, page_size로 목록·페이지 이동 |
| 캘린더 회의실 필터 | GET /api/calendar/rooms | 전체 회의실과 개별 회의실 선택 |
| 주간·월간 일정 | GET /api/calendar/reservations | start_at, end_at, scope, room_id로 기간 조회 |

시간은 Asia/Seoul로 표시한다. 요청은 시간대가 포함된 ISO 8601을 사용하며, 쿼리는 URLSearchParams로 인코딩한다. 세션 쿠키와 변경 요청의 CSRF 처리는 기존 session-client를 사용한다.

예약 생성 요청 예시는 다음과 같다. UUID 자리는 실제 선택한 ID를 넣는다.

```json
{
  "room_id": "선택한 회의실 UUID",
  "title": "프로젝트 회의",
  "start_at": "2026-10-30T13:00:00+09:00",
  "end_at": "2026-10-30T15:00:00+09:00",
  "attendee_ids": ["선택한 참석자 UUID"]
}
```

예약자는 세션으로 결정된다. 프론트는 선택한 다른 참석자의 중복 없는 ID 목록을 전송하고, 정원 안내는 예약자 1명까지 포함한다. 생성 응답에는 참석자 목록이나 room_name이 없으므로 요청 타입과 응답 타입을 분리한다.

**4. 예약 페이지 작업 순서**

1. **폼을 피그마 위치로 옮긴다.** 제목 → 날짜·시작·종료·참여자 → 회의실 카드 → 오늘 남은 일정 → 예약하기 버튼 순서로 배치한다. 기존 공통 헤더와 채팅은 페이지 안에 다시 만들지 않는다.
2. **미래 날짜와 1시간 선택을 연결한다.** 오늘뿐 아니라 23일에 30일 예약도 가능해야 한다. 현재 5분 단위 기본 시작과 30분 기본 길이를 제거하고, 선택 날짜·회의실의 가능 슬롯을 조회한다. 09~10, 10~11처럼 이어지는 가능 슬롯을 09:00~11:00 예약 하나로 전송한다. 중간에 불가 슬롯이 있으면 그 구간을 선택할 수 없게 한다.
3. **날짜가 바뀌는 예약을 표현한다.** 자정을 넘으면 종료 날짜를 함께 표시·선택하게 하고 해당 날짜들의 슬롯을 각각 조회한다. 종료 시각만 보고 다음 날이라고 임의 해석하지 않는다. 날짜·회의실 변경 시 기존 선택 구간을 다시 검증한다. 최대 길이는 아래 계약 차이 항목을 먼저 맞춘 뒤 적용한다.
4. **참석자를 연결한다.** 기존 공용 사용자 목록을 재사용하고 입력창의 이름·이메일·소속 검색, 선택·해제, 선택 인원을 제공한다. 같은 사용자는 한 번만 선택한다. 현재 응답에 없는 부서/직무를 있다고 가정하지 않는다. 선택 인원이 정원을 넘으면 폼에서 안내하되 최종 유효성은 서버 응답을 따른다.
5. **회의실 상태를 정확히 표시한다.** name·capacity·status는 서버 값을 쓴다. 피그마의 A/B/C, 수용 인원, 모니터·화이트보드를 임의의 고정 데이터로 넣지 않는다. 장비 정보는 현재 Room DTO에 없다. ACTIVE만으로 특정 시간에 예약 가능하다고 단정하지 않으며, 시간대 가능 여부는 슬롯 결과로 판단한다.
6. **오늘 목록을 분리한다.** 이 API는 선택한 미래 날짜가 아니라 한국 시간 오늘의 아직 끝나지 않은 예약을 반환한다. 하단 제목을 ‘회의실 A · 오늘 남은 일정’으로 명확히 하고, 선택한 미래 날짜의 가능 시간은 상단 입력에서 확인한다. 오늘 목록의 빈 상태 때문에 미래 예약을 막지 않는다. 진행 중·전날부터 이어진 예약도 표시하며 자정 경계는 날짜를 함께 표기한다.
7. **저장과 갱신을 연결한다.** 제출 중 중복 요청을 막는다. 성공하면 예약 날짜가 포함된 캘린더로 이동해 새 데이터를 조회한다. 현재 페이지에 남는 흐름에서는 가능 슬롯과 오늘 목록을 재조회한다. 이미 저장된 뒤 재조회만 실패한 경우에는 저장 실패로 표시하지 않는다. 실패 시 입력 내용을 보존하고 충돌·차단·시간 경과 오류는 슬롯을 재조회한다.

서버 오류는 요청서의 RESERVATION_CONFLICT, ROOM_UNAVAILABLE, CAPACITY_EXCEEDED, PARTICIPANT_NOT_FOUND, START_IN_PAST, INVALID_TIME_SLOT과 실제 서버의 ROOM_BLOCKED 및 422 검증 오류를 기존 오류 처리에 맞춰 표시한다. 아직 구현되지 않은 오류가 현재 서버에서 반환된다고 가정하지 않는다.

**5. 캘린더 페이지 작업 순서**

1. **상단 도구를 정리한다.** 예약 캘린더 제목, ‘+ 회의실 예약’, 기간, 이전·오늘·다음, 회의실 선택, 주간/월간 선택을 피그마 위치에 배치한다. 현재 헤더의 별도 캘린더·예약 메뉴는 로고 홈 이동과 페이지의 예약 버튼으로 통합한다. 관리자 전용 진입·계정·로그아웃은 유지한다.
2. **주간을 시간표로 바꾼다.** 기본 보기는 주간이며, 기존 합의대로 월~금 다섯 열을 사용한다. 각 날짜 안에서 시작·종료 시각에 맞춰 예약을 배치한다. 여러 회의실의 동시간 예약은 겹쳐 가리지 않도록 나란히 배치한다. 날짜를 넘는 예약은 날짜별로 잘라 표시한다.
3. **시간 표시와 생성 규칙을 구분한다.** 피그마에는 09~19시 화면과 10:30 종료 예시가 있지만, 신규 예약 입력은 합의한 1시간 단위를 따른다. 기존 데이터의 30분 단위 일정은 원래 시각대로 표시한다. 하루 24시간 API와 자정 통과 예약을 확인할 수 있도록 시간축은 스크롤로 전체 시간을 제공하고 초기 위치를 09시 부근으로 둔다.
4. **예약 색상과 정보를 연결한다.** 내 생성 여부는 is_mine, 참석 여부는 is_attending으로 구분한다. 내 예약은 파란 계열, 다른 구성원의 예약은 회색 계열로 표시하고 참석 여부는 별도 문구로 표현한다. 제목·회의실·시간·인원은 응답 값을 사용한다. 참석자 이름 전체 목록과 작성자 이름은 현재 캘린더 응답에 없다.
5. **월간을 완성한다.** 확인한 Page 4에는 월간 완성 프레임이 없으므로 기존 합의와 주간의 스타일을 따른다. 월간 한 날짜에 시간·제목을 최대 3건 표시하는 안으로 시작하고 나머지는 +N으로 묶는다. 날짜나 +N을 누르면 해당 날짜가 속한 주간으로 이동한다. 기존 날짜별 팝업은 이 흐름으로 대체한다. 주말은 기존 UI 합의대로 회색·선택 불가로 표시하되, 서버가 반환한 기존 주말 일정은 월간 칸에 그대로 표시한다. 주간의 월~금 밖에 일정이 있으면 ‘주말 일정 N건 · 월간에서 보기’로 안내한다. 날짜 선택과 새 예약 진입 제한 때문에 기존 데이터를 숨기거나 예약이 없다고 표시하지 않는다. 서버가 주말을 거절한다고 설명하지 않는다.
6. **조회 경계를 유지한다.** 주간은 해당 월요일 00:00부터 다음 월요일 00:00까지, 월간은 월초부터 다음 월초까지 조회한다. 날짜별로 [start_at,end_at)과 겹치는 일정을 배치한다. 로딩·빈 결과·오류·재시도를 구분하며, 늦게 도착한 이전 조회가 새 필터 결과를 덮지 않게 한다.
7. **페이지 이동 상태를 연결한다.** 캘린더의 기준 날짜·보기·회의실을 URL에 보존하고 예약 진입 시 날짜·회의실을 넘긴다. 예약 페이지의 기존 room_id·page 파라미터는 유지하면서 date를 추가하는 방식으로 정리한다. 예약 성공 후에는 예약 날짜의 주간을 보여준다. 루트 / 진입은 캘린더 홈으로 명시하고 잘못된 경로의 이동도 홈 기준으로 정리한다. MainLayout은 공통 부모로 남아 채팅 상태를 유지한다.

예약 범위 선택은 ‘전체 보기 / 나만 보기’로 표시한다. 전체 보기는 조회 기간·회의실에 해당하는 전체 예약을, 나만 보기는 로그인 사용자가 참석자로 등록된 예약을 표시한다. API는 기존처럼 scope=all로 조회하고, 주간·월간 공통 목록에 is_attending 필터를 적용하므로 다른 사람이 만든 회의에 초대받은 경우도 포함한다. 날짜·회의실·주간/월간 변경에도 URL의 scope 선택을 유지하며, 나만 보기의 빈 결과는 ‘조회 기간에 내가 참석하는 예약이 없습니다.’로 안내한다.

is_mine은 로그인 사용자가 예약 생성자인지, is_attending은 실제 참석자인지를 뜻한다. 생성자 표시·색상과 삭제 권한은 is_mine, 회의 메모 접근은 기존 is_attending 기준을 유지한다. 나만 보기에 표시된 초대 회의도 생성자가 아니면 삭제할 수 없다. 신규 예약은 생성자도 참석자로 저장하지만, 기존 예약의 참석자 행 누락 여부는 별도 확인 항목이며 누락된 예약은 나만 보기에서 제외될 수 있다.

**6. 구현 전에 공유할 API 차이와 의존 항목**

| 항목 | 확인한 차이 | 계획에서의 처리 |
|---|---|---|
| 최대 예약 길이 | 앞선 대화는 제한 없음, 최신 전달 요청서는 최대 24시간, 현재 생성 코드는 상한 검사 없음 | 구현 기준 확인 항목으로 기록. 24시간이 사용자 확정이라고 쓰거나 무제한이 현행 문서라고 쓰지 않음 |
| 참석자 저장 | attendee_ids는 받지만 검증·저장 호출이 TODO이고 저장 함수가 미완성 | UI·전송 작업과 실제 저장 완료를 구분. 서버 반영 후 재조회로 확인 |
| 참석 인원과 내 참석 | 실제 참석 행 기준이며 기존 예약자 행 보충도 필요 | 서버의 0명을 임의로 1명으로 보정하지 않음. 참석자 저장과 기존 데이터 반영을 함께 확인 |
| scope=mine | 사용자 확정 기준과 현재 서비스 모두 내가 참석한 예약 | 화면은 scope=all 응답의 is_attending으로 필터링하고, URL 선택 값은 mine을 유지. attending 같은 새 API 문자열은 추가하지 않음 |
| 시간 검증 | 슬롯 조회는 60분, 생성은 정각·배수·최대길이 검증 미반영 | 프론트 1시간 입력 구성. 현재 422와 계약 오류 모두 처리 |
| 평일 UI | 주간 월~금·월간 주말 비활성은 기존 UI 합의, API에는 주말 제한 없음 | 화면 결정과 서버 정책을 구분. 서버 동작을 프론트가 임의 변경하지 않음 |
| 삭제 버튼 | 피그마에는 있으나 최신 요청서와 실제 코드에 예약 취소·삭제 API 없음 | 버튼 동작 연결은 API 계약 후 진행. 화면에서만 지워 취소 완료처럼 처리하지 않음 |
| 메모장 버튼 | 피그마의 이동은 있으나 메모 API는 명세만 있고 실제 라우트 미구현 | MeetingNotePage와 저장 API 연결은 후속 작업으로 분리 |
| 알림 | 요청서에 목록·읽음·WS 이벤트가 있으나 앱알림 구현은 확인되지 않음 | 예약 완료가 초대 알림 완료라고 보고되지 않도록 분리 |
| 추가 표시 정보 | 회의실 장비, 참석자 이름 목록, 검색 결과 position 미제공 | 제공되는 정보로 표시하고 추가 필드 계약은 별도 확인 |

참석자 미완성 근거는 [예약 서비스](/Users/kimheejun/Desktop/kimheejun/Internship-finalproject/backend/app/services/reservations.py:87), scope 차이는 [캘린더 조회 서비스](/Users/kimheejun/Desktop/kimheejun/Internship-finalproject/backend/app/services/reservations.py:151), 현재 생성 입력 검증은 [예약 스키마](/Users/kimheejun/Desktop/kimheejun/Internship-finalproject/backend/app/schemas/reservations.py:78)에서 확인했다. 실제 파일은 협업 중 변경될 수 있으므로 구현 직전 상태를 재확인한다.

**7. 수행자에게 넘길 작업 단위와 순서**

| 순서 | 작업 | 주 수정 파일 | 완료 결과 |
|---|---|---|---|
| 1 | 기존 API·타입을 기능 폴더로 정리 | reservations.api.ts, reservations.types.ts, 두 Page의 import | 실제 호출은 그대로, 중복 정의 제거 |
| 2 | 예약 폼의 피그마 배치와 미래 날짜·1시간 선택 | ReservationPage.tsx, TimeSlotPicker.tsx, reservation.css | 날짜별 가능 구간 선택과 연속 예약 |
| 3 | 참석자 선택과 요청 연결 | AttendeePicker.tsx, ReservationPage.tsx | 공용 사용자 목록 재사용, attendee_ids 전송 |
| 4 | 주간 시간표와 도구 구성 | CalendarPage.tsx, CalendarToolbar.tsx, WeekCalendar.tsx, calendar.css | 월~금 시간축·회의실 필터·카드 표시 |
| 5 | 월간 요약과 주간 전환 | MonthCalendar.tsx, CalendarPage.tsx, calendar.css | +N과 날짜 선택으로 주간 이동 |
| 6 | 저장 후 캘린더 이동과 상태 복원 | 두 Page, routes.tsx, MainHeader.tsx, 필요한 범위의 MainLayout.css | 날짜·회의실 유지, 새 예약 조회, 오른쪽 채팅 유지 |
| 7 | API가 준비된 항목 연결 완료 확인 | 해당 프론트 호출부 | 참석자 실제 저장·인원·필터 의미까지 확인 |

삭제·메모·알림은 담당 API 준비와 범위 확정 후 별도 단계로 진행한다. 기존 골격이라는 이유만으로 이번 작업에 전체 구현을 묶지 않는다.

**8. 완료 보고 기준**

- 미래 날짜 예약, 1시간 단위와 연속 구간, 자정 경계, 과거·차단·이미 예약된 구간 처리가 화면과 요청 데이터에 일치한다.
- 참석자 선택은 공용 사용자 목록을 쓰며 중복을 제거하고 예약자를 포함한 정원을 안내한다. 전송 성공과 서버 저장 확인을 구분한다.
- 오늘 남은 일정은 미래 날짜의 일정으로 오해되지 않는다. 페이지 이동과 오류 재시도가 유지된다.
- 주간·월간에서 동일 API 데이터를 사용한다. 기간 경계·동시간 일정·내 생성/참석 구분·월간에서 주간 이동이 맞는다.
- 예약 성공 후 해당 날짜의 캘린더에서 새 일정을 확인하고, 본문 이동 중 채팅 선택 상태가 유지된다.
- 완료 보고에는 변경 파일, 실제 동작, API 미확인 또는 미완성 항목을 각각 적는다.

기존 테스트 파일에는 30분 예약과 월간 날짜 팝업을 전제로 한 코드가 있으므로 구현 시 기대 동작과 함께 정리할 대상이다. 이번 요청은 계획 작성이며 소스 코드 수정, 테스트·빌드 실행, 커밋·푸시, 수행자에게 작업 전달은 포함하지 않는다.
