"""채팅방·메시지 REST API."""

from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from conftest import signin
from sqlalchemy import func, select

from app.db.session import SessionLocal
from app.models import ChatRoom, ChatRoomMember, Team, User
from app.services import chat, clock, cursors


@pytest.fixture
def people(seed):
    """같은 팀 나·김민수·이영희·박지성, 다른 팀 구루."""
    return SimpleNamespace(
        me=seed("me@example.com", name="나"),
        kim=seed("kim@example.com", name="김민수"),
        lee=seed("lee@example.com", name="이영희"),
        park=seed("park@example.com", name="박지성"),
        guru=seed("guru@example.com", name="구루", team=Team.GURU),
    )


def login(client, who="me"):
    assert signin(client, f"{who}@example.com").status_code == 200


def direct(client, target):
    return client.post("/api/chat/rooms/direct", json={"target_user_id": str(target)})


def group(client, members, **body):
    return client.post(
        "/api/chat/rooms/group", json={"member_ids": [str(m) for m in members], **body}
    )


def send(client, room_id, message, **body):
    return client.post(
        f"/api/chat/rooms/{room_id}/messages", json={"message": message, **body}
    )


def rooms(client, **params):
    r = client.get("/api/chat/rooms", params=params)
    assert r.status_code == 200, r.text
    return r.json()


def messages(client, room_id, **params):
    r = client.get(f"/api/chat/rooms/{room_id}/messages", params=params)
    assert r.status_code == 200, r.text
    return r.json()


def error_code(r):
    return r.json()["detail"]["code"]


# ---- 1:1방 ----


def test_direct_room_is_created_then_reused(client, people):
    login(client)
    first = direct(client, people.kim)
    assert first.status_code == 201
    room = first.json()
    assert room["type"] == "DIRECT"
    assert room["title"] is None
    assert room["display_title"] == "김민수"
    assert room["member_count"] == 2
    assert room["members"] == [{"user_id": str(people.kim), "name": "김민수"}]
    assert room["last_message"] is None
    assert room["last_activity_at"] == room["created_at"]

    again = direct(client, people.kim)
    assert again.status_code == 200
    assert again.json()["chat_room_id"] == room["chat_room_id"]

    # 상대가 열어도 같은 방, 제목은 받는 사람 기준
    login(client, "kim")
    other_side = direct(client, people.me)
    assert other_side.status_code == 200
    assert other_side.json()["chat_room_id"] == room["chat_room_id"]
    assert other_side.json()["display_title"] == "나"


@pytest.mark.parametrize("target", ["other_team", "blocked", "pending", "missing"])
def test_direct_room_rejects_invalid_target(client, people, seed, target):
    target_id = {
        "other_team": lambda: people.guru,
        "blocked": lambda: seed("blocked@example.com", blocked=True),
        "pending": lambda: seed("pending@example.com", approved=False),
        "missing": uuid4,
    }[target]()
    login(client)

    r = direct(client, target_id)
    assert r.status_code == 400
    assert error_code(r) == "CHAT_MEMBER_INVALID"


def test_direct_room_with_myself_is_rejected(client, people):
    login(client)
    r = direct(client, people.me)
    assert r.status_code == 400
    assert error_code(r) == "CHAT_SELF_NOT_ALLOWED"


def test_concurrent_direct_room_returns_existing_room(people, monkeypatch):
    """조회 후 INSERT 사이에 상대가 방을 만들면 유니크 위반 → 롤백 후 그 방을 돌려준다."""
    with SessionLocal() as db:
        first, created = chat.open_direct(db, db.get(User, people.me), people.kim)
        assert created

        real = chat._direct_room
        calls = []

        def stale_lookup(db, key):
            calls.append(key)
            # 첫 조회는 상대가 아직 commit 하기 전이라 못 본 상황
            return None if len(calls) == 1 else real(db, key)

        monkeypatch.setattr(chat, "_direct_room", stale_lookup)
        second, created = chat.open_direct(db, db.get(User, people.me), people.kim)

    assert not created
    assert second["chat_room_id"] == first["chat_room_id"]
    assert len(calls) == 2
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(ChatRoom)) == 1


# ---- 그룹방 ----


def test_group_room_is_created_with_creator(client, people):
    login(client)
    r = group(client, [people.kim, people.lee], title="  기획 회의  ")
    assert r.status_code == 201
    room = r.json()
    assert room["type"] == "GROUP"
    assert room["title"] == "기획 회의"
    assert room["display_title"] == "기획 회의"
    assert room["member_count"] == 3
    assert sorted(m["name"] for m in room["members"]) == sorted(["김민수", "이영희"])

    login(client, "kim")
    detail = client.get(f"/api/chat/rooms/{room['chat_room_id']}").json()
    assert sorted(m["name"] for m in detail["members"]) == sorted(["나", "이영희"])


@pytest.mark.parametrize("title", [None, "", "   "])
def test_group_room_without_title_uses_auto_title(client, people, title):
    login(client)
    body = {} if title is None else {"title": title}
    room = group(client, [people.kim, people.lee], **body).json()
    assert room["title"] is None
    names = [m["name"] for m in room["members"]]
    assert sorted(names) == sorted(["김민수", "이영희"])
    assert room["display_title"] == ", ".join(names)


def test_auto_title_shortens_long_member_list(client, people):
    login(client)
    room = group(client, [people.kim, people.lee, people.park]).json()
    names = [m["name"] for m in room["members"]]
    assert room["display_title"] == f"{names[0]}, {names[1]} 외 1명"

    # 받는 사람마다 나를 뺀 이름으로 만든다. 이름 순서는 DB 정렬(collation)을 따른다
    login(client, "lee")
    detail = client.get(f"/api/chat/rooms/{room['chat_room_id']}").json()
    names = [m["name"] for m in detail["members"]]
    assert sorted(names) == sorted(["나", "김민수", "박지성"])
    assert detail["display_title"] == f"{names[0]}, {names[1]} 외 1명"


@pytest.mark.parametrize("members,status,code", [
    (["kim"], 422, "CHAT_MEMBER_TOO_FEW"),
    (["me", "kim"], 422, "CHAT_MEMBER_TOO_FEW"),
    (["kim", "kim"], 422, "CHAT_MEMBER_TOO_FEW"),
    (["kim", "guru"], 400, "CHAT_MEMBER_INVALID"),
])
def test_group_room_member_rules(client, people, members, status, code):
    login(client)
    r = group(client, [getattr(people, m) for m in members])
    assert r.status_code == status
    assert error_code(r) == code


def test_group_title_longer_than_50_is_rejected(client, people):
    login(client)
    assert group(client, [people.kim, people.lee], title="가" * 51).status_code == 422
    assert group(client, [people.kim, people.lee], title="가" * 50).status_code == 201


# ---- 권한 ----


@pytest.mark.parametrize("method,path", [
    ("GET", "/api/chat/rooms/{id}"),
    ("GET", "/api/chat/rooms/{id}/messages"),
    ("POST", "/api/chat/rooms/{id}/messages"),
])
def test_non_member_gets_404(client, people, method, path):
    login(client)
    room_id = group(client, [people.kim, people.lee]).json()["chat_room_id"]

    login(client, "park")
    for target in (room_id, uuid4()):
        r = client.request(method, path.format(id=target), json={"message": "안녕"})
        assert r.status_code == 404
        assert error_code(r) == "CHAT_ROOM_NOT_FOUND"


@pytest.mark.parametrize("change", ["left", "deleted"])
def test_left_member_and_deleted_room_are_hidden(client, people, change):
    login(client)
    room_id = direct(client, people.kim).json()["chat_room_id"]
    with SessionLocal() as db:
        if change == "left":
            db.get(ChatRoomMember, (UUID(room_id), people.me)).left_at = clock.now()
        else:
            db.get(ChatRoom, UUID(room_id)).deleted_at = clock.now()
        db.commit()

    assert rooms(client)["items"] == []
    assert error_code(client.get(f"/api/chat/rooms/{room_id}")) == "CHAT_ROOM_NOT_FOUND"
    assert error_code(send(client, room_id, "안녕")) == "CHAT_ROOM_NOT_FOUND"


def test_login_is_required(client):
    assert client.get("/api/chat/rooms").status_code == 401


def test_post_without_csrf_header_is_rejected(client, people):
    login(client)
    del client.headers["X-CSRF-Token"]
    r = direct(client, people.kim)
    assert r.status_code == 403
    assert error_code(r) == "CSRF_FAILED"


# ---- 메시지 ----


def test_send_message(client, people):
    login(client)
    room_id = direct(client, people.kim).json()["chat_room_id"]

    r = send(client, room_id, "  안녕하세요  ", client_id="tmp-1")
    assert r.status_code == 201
    sent = r.json()
    assert sent["message"] == "안녕하세요"
    assert sent["chat_room_id"] == room_id
    assert sent["user_id"] == str(people.me)
    assert sent["sender"] == {"user_id": str(people.me), "name": "나"}
    assert sent["client_id"] == "tmp-1"

    # 목록의 마지막 메시지와 활동 시각에 반영. 과거 조회의 client_id 는 None
    (summary,) = rooms(client)["items"]
    assert summary["last_message"]["message_id"] == sent["message_id"]
    assert summary["last_message"]["client_id"] is None
    assert summary["last_activity_at"] == sent["created_at"]
    assert messages(client, room_id)["items"][0]["client_id"] is None


@pytest.mark.parametrize("body", [
    {"message": ""},
    {"message": "   "},
    {"message": "가" * 2001},
    {"message": "안녕", "client_id": "x" * 65},
    {"message": "안녕", "sender_id": str(uuid4())},
])
def test_send_message_validation(client, people, body):
    login(client)
    room_id = direct(client, people.kim).json()["chat_room_id"]
    r = client.post(f"/api/chat/rooms/{room_id}/messages", json=body)
    assert r.status_code == 422


def test_message_cursor_pagination(client, people):
    """35개 → 기본 30개 + next_cursor, cursor 로 나머지 5개. 빠짐·중복 없이 최신순."""
    login(client)
    room_id = direct(client, people.kim).json()["chat_room_id"]
    sent = [send(client, room_id, f"메시지 {i}").json() for i in range(35)]

    first = messages(client, room_id)
    assert len(first["items"]) == 30
    assert first["next_cursor"] is not None
    second = messages(client, room_id, cursor=first["next_cursor"])
    assert len(second["items"]) == 5
    assert second["next_cursor"] is None

    received = [m["message_id"] for m in first["items"] + second["items"]]
    assert received == [m["message_id"] for m in reversed(sent)]


def test_message_page_boundary(client, people):
    """딱 limit 개면 다음 페이지가 없다."""
    login(client)
    room_id = direct(client, people.kim).json()["chat_room_id"]
    for i in range(3):
        send(client, room_id, f"메시지 {i}")
    assert messages(client, room_id, limit=3)["next_cursor"] is None
    assert messages(client, room_id, limit=2)["next_cursor"] is not None


@pytest.mark.parametrize("cursor", [
    "garbage!",
    cursors.encode("not-a-time", uuid4()),
    cursors.encode("2026-10-22T10:00:00", uuid4()),  # 시간대 없음
    cursors.encode("2026-10-22T10:00:00+09:00", "not-a-uuid"),
])
def test_invalid_cursor_is_rejected(client, people, cursor):
    login(client)
    room_id = direct(client, people.kim).json()["chat_room_id"]
    for path in ("/api/chat/rooms", f"/api/chat/rooms/{room_id}/messages"):
        r = client.get(path, params={"cursor": cursor})
        assert r.status_code == 400
        assert error_code(r) == "CHAT_CURSOR_INVALID"


# ---- 채팅방 목록 ----


def test_room_list_orders_by_last_activity(client, people):
    login(client)
    a = direct(client, people.kim).json()["chat_room_id"]
    b = direct(client, people.lee).json()["chat_room_id"]
    c = group(client, [people.kim, people.park]).json()["chat_room_id"]
    assert [r["chat_room_id"] for r in rooms(client)["items"]] == [c, b, a]

    # 메시지가 온 방이 위로
    send(client, a, "안녕")
    assert [r["chat_room_id"] for r in rooms(client)["items"]] == [a, c, b]

    # 메시지 없는 새 방은 생성 시각이 활동 시각
    d = direct(client, people.park).json()["chat_room_id"]
    assert [r["chat_room_id"] for r in rooms(client)["items"]] == [d, a, c, b]


def test_room_list_pagination(client, people):
    login(client)
    created = [direct(client, p).json()["chat_room_id"] for p in (people.kim, people.lee, people.park)]

    first = rooms(client, limit=2)
    assert len(first["items"]) == 2
    second = rooms(client, limit=2, cursor=first["next_cursor"])
    assert len(second["items"]) == 1
    assert second["next_cursor"] is None
    received = [r["chat_room_id"] for r in first["items"] + second["items"]]
    assert received == list(reversed(created))

    assert client.get("/api/chat/rooms", params={"limit": 51}).status_code == 422


def test_room_list_search_by_display_title(client, people):
    login(client)
    kim_room = direct(client, people.kim).json()["chat_room_id"]
    titled = group(client, [people.lee, people.park], title="기획 회의").json()["chat_room_id"]
    untitled = group(client, [people.lee, people.park]).json()["chat_room_id"]

    def found(q):
        return {r["chat_room_id"] for r in rooms(client, q=q)["items"]}

    assert found("김민") == {kim_room}
    assert found("기획") == {titled}
    # 제목이 있는 방은 제목으로만, 자동 제목 방은 참여자 이름으로 찾는다
    assert found("박지성") == {untitled}
    # 나 자신의 이름으로는 찾지 않는다
    assert found("나") == set()
    assert found("%") == set()
