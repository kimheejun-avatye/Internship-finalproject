"""예약자가 참석자에게 예약 일정을 채팅으로 공유한다."""

from datetime import datetime, timedelta
from types import SimpleNamespace
from zoneinfo import ZoneInfo

import pytest
from conftest import signin
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError

from app.db.session import SessionLocal
from app.models import ChatRoom, ChatRoomMember, Message, Room
from app.models.reservation_attendee import ReservationAttendee
from app.models.reservations import Reservation
from app.services import chat
from app.services.reservations import ReservationService

KST = ZoneInfo("Asia/Seoul")
START = datetime(2030, 1, 7, 13, tzinfo=KST)  # 월요일 13:00


@pytest.fixture
def world(seed):
    """예약자(host)와 참석자 두 명(kim, lee). 예약은 host가 만든 A회의실 13~14시."""
    people = SimpleNamespace(
        host=seed("host@example.com", name="예약자"),
        kim=seed("kim@example.com", name="김민수"),
        lee=seed("lee@example.com", name="이영희"),
        outsider=seed("outsider@example.com", name="외부인"),
    )
    with SessionLocal() as db:
        room = Room(name="A회의실", capacity=6)
        db.add(room)
        db.flush()
        reservation = Reservation(room_id=room.room_id, user_id=people.host, title="주간 회의",
                                  start_at=START, end_at=START + timedelta(hours=1), created_at=START)
        db.add(reservation)
        db.flush()
        db.add_all(ReservationAttendee(reservation_id=reservation.reservation_id, user_id=uid)
                   for uid in (people.host, people.kim, people.lee))
        db.commit()
        people.reservation_id = reservation.reservation_id
    return people


def share(client, reservation_id):
    return client.post(f"/api/reservations/{reservation_id}/share", json={})


def messages_between(db, a, b):
    key = chat.direct_key(a, b)
    room = db.scalar(select(ChatRoom).where(ChatRoom.direct_key == key))
    if room is None:
        return None, []
    return room, list(db.scalars(select(Message).where(Message.chat_room_id == room.chat_room_id).order_by(Message.created_at)))


def test_host_sends_schedule_to_each_attendee_direct_room(client, world):
    signin(client, "host@example.com")
    response = share(client, world.reservation_id)

    assert response.status_code == 200
    body = response.json()
    assert sorted(body["sent_user_ids"]) == sorted([str(world.kim), str(world.lee)])
    assert body["failed_user_ids"] == []
    with SessionLocal() as db:
        for attendee in (world.kim, world.lee):
            room, messages = messages_between(db, world.host, attendee)
            assert room is not None
            assert len(messages) == 1 and messages[0].user_id == world.host
            assert messages[0].message == "[회의실 예약] 주간 회의\n2030-01-07(월) 13:00–14:00\n회의실: A회의실"
            members = set(db.scalars(select(ChatRoomMember.user_id).where(ChatRoomMember.chat_room_id == room.chat_room_id)))
            assert members == {world.host, attendee}
        # 예약자 본인에게는 보내지 않고, 참석자가 아닌 사람과는 방이 만들어지지 않는다.
        assert messages_between(db, world.host, world.outsider)[0] is None
        assert db.scalar(select(func.count()).select_from(ChatRoom)) == 2


def test_message_text_marks_the_end_date_when_it_crosses_midnight():
    reservation = SimpleNamespace(title="야간 점검", start_at=datetime(2030, 1, 11, 22, tzinfo=KST),
                                  end_at=datetime(2030, 1, 12, 1, tzinfo=KST))
    assert ReservationService._share_text(reservation, "B회의실") == "[회의실 예약] 야간 점검\n2030-01-11(금) 22:00–01-12 01:00\n회의실: B회의실"


@pytest.mark.parametrize("who,status,code", [
    ("kim@example.com", 403, "SHARE_FORBIDDEN"),         # 참석자도 예약자가 아니면 보낼 수 없다
    ("outsider@example.com", 403, "SHARE_FORBIDDEN"),    # 참석자도 아닌 사람
])
def test_only_the_host_can_share(client, world, who, status, code):
    signin(client, who)
    response = share(client, world.reservation_id)
    assert (response.status_code, response.json()["detail"]["code"]) == (status, code)
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(Message)) == 0


def test_unknown_reservation_and_anonymous_requests(client, world):
    assert share(client, world.reservation_id).status_code == 401
    signin(client, "host@example.com")
    response = share(client, "11111111-1111-1111-1111-111111111111")
    assert (response.status_code, response.json()["detail"]["code"]) == (404, "RESERVATION_NOT_FOUND")


def test_host_alone_has_nobody_to_notify(client, seed):
    host = seed("solo@example.com", name="혼자")
    with SessionLocal() as db:
        room = Room(name="C회의실", capacity=4)
        db.add(room)
        db.flush()
        reservation = Reservation(room_id=room.room_id, user_id=host, title="혼자 회의",
                                  start_at=START, end_at=START + timedelta(hours=1), created_at=START)
        db.add(reservation)
        db.flush()
        db.add(ReservationAttendee(reservation_id=reservation.reservation_id, user_id=host))
        db.commit()
        reservation_id = reservation.reservation_id
    signin(client, "solo@example.com")
    response = share(client, reservation_id)
    assert response.status_code == 200
    assert response.json() == {"sent_user_ids": [], "failed_user_ids": []}


def test_sharing_again_reuses_the_room_and_sends_again(client, world):
    signin(client, "host@example.com")
    assert share(client, world.reservation_id).status_code == 200
    assert share(client, world.reservation_id).status_code == 200
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(ChatRoom)) == 2  # 방은 늘지 않는다
        assert len(messages_between(db, world.host, world.kim)[1]) == 2    # 메시지는 다시 간다


def test_blocked_attendee_fails_but_others_still_receive(client, world, seed):
    blocked = seed("blocked@example.com", name="차단됨")
    with SessionLocal() as db:
        db.add(ReservationAttendee(reservation_id=world.reservation_id, user_id=blocked))
        db.commit()
        from app.models import User
        from app.services import clock
        db.get(User, blocked).blocked_at = clock.now()   # 예약 뒤에 차단(퇴사 처리)됨
        db.commit()
    signin(client, "host@example.com")
    body = share(client, world.reservation_id).json()
    assert body["failed_user_ids"] == [str(blocked)]
    assert sorted(body["sent_user_ids"]) == sorted([str(world.kim), str(world.lee)])
    with SessionLocal() as db:
        assert messages_between(db, world.host, blocked)[1] == []


def test_failure_while_sending_one_message_keeps_the_rest(client, world, monkeypatch):
    original = chat.send_message

    def fail_for_kim(db, chat_room_id, user, message, client_id, **extra):
        room = db.get(ChatRoom, chat_room_id)
        kim_room = chat.direct_key(world.host, world.kim)
        if room.direct_key == kim_room:
            raise RuntimeError("test failure")
        return original(db, chat_room_id, user, message, client_id, **extra)

    monkeypatch.setattr(chat, "send_message", fail_for_kim)
    signin(client, "host@example.com")
    body = share(client, world.reservation_id).json()
    assert body["failed_user_ids"] == [str(world.kim)]
    assert body["sent_user_ids"] == [str(world.lee)]
    with SessionLocal() as db:
        assert messages_between(db, world.host, world.kim)[1] == []
        assert len(messages_between(db, world.host, world.lee)[1]) == 1
        assert db.scalar(select(func.count()).select_from(Reservation)) == 1  # 예약은 그대로


# ---- 예약 카드: kind=RESERVATION, payload=보낸 시점의 예약 정보 ----

def test_shared_message_is_a_reservation_card_with_a_text_fallback(client, world):
    signin(client, "host@example.com")
    assert share(client, world.reservation_id).status_code == 200
    with SessionLocal() as db:
        message = messages_between(db, world.host, world.kim)[1][0]
        assert message.kind == "RESERVATION"
        assert message.payload == {
            "reservation_id": str(world.reservation_id), "title": "주간 회의", "room_name": "A회의실",
            "start_at": START.astimezone(ZoneInfo("UTC")).isoformat(), "end_at": (START + timedelta(hours=1)).astimezone(ZoneInfo("UTC")).isoformat(),
        }
        assert message.message.startswith("[회의실 예약] 주간 회의")  # 카드를 모르는 화면에서도 읽힌다


def test_recipient_sees_the_card_in_message_list_and_room_summary(client, world):
    signin(client, "host@example.com")
    share(client, world.reservation_id)
    client.cookies.clear()
    client.headers.pop("X-CSRF-Token", None)
    signin(client, "kim@example.com")
    room = client.get("/api/chat/rooms").json()["items"][0]
    assert room["last_message"]["kind"] == "RESERVATION"
    assert room["last_message"]["payload"]["title"] == "주간 회의"
    listed = client.get(f"/api/chat/rooms/{room['chat_room_id']}/messages").json()["items"][0]
    assert listed["kind"] == "RESERVATION"
    assert (listed["payload"]["room_name"], listed["payload"]["reservation_id"]) == ("A회의실", str(world.reservation_id))


def test_normal_messages_are_text_and_clients_cannot_create_cards(client, world):
    signin(client, "host@example.com")
    room_id = client.post("/api/chat/rooms/direct", json={"target_user_id": str(world.kim)}).json()["chat_room_id"]
    sent = client.post(f"/api/chat/rooms/{room_id}/messages", json={"message": "안녕하세요"}).json()
    assert (sent["kind"], sent["payload"]) == ("TEXT", None)
    forged = client.post(f"/api/chat/rooms/{room_id}/messages", json={
        "message": "[회의실 예약] 가짜", "kind": "RESERVATION",
        "payload": {"reservation_id": str(world.reservation_id), "title": "가짜", "room_name": "X",
                    "start_at": "2030-01-07T04:00:00Z", "end_at": "2030-01-07T05:00:00Z"}})
    assert forged.status_code == 422  # 본문에 kind/payload 는 받지 않는다


@pytest.mark.parametrize("kind,payload", [("RESERVATION", None), ("TEXT", '{"a": 1}'), ("OTHER", None)])
def test_database_rejects_inconsistent_kind_and_payload(world, kind, payload):
    with SessionLocal() as db:
        room = chat.open_direct(db, db.get(chat.User, world.host), world.kim)[0]
        with pytest.raises(IntegrityError):
            db.execute(text("INSERT INTO messages (user_id, chat_room_id, message, kind, payload) "
                            "VALUES (:u, :r, 'x', :k, CAST(:p AS jsonb))"),
                       {"u": world.host, "r": room["chat_room_id"], "k": kind, "p": payload})


def test_online_recipient_gets_the_card_over_websocket(client, world):
    import test_ws  # 같은 폴더의 WS 테스트 도우미를 재사용한다

    host, kim = test_ws.login(client, "host"), test_ws.login(client, "kim")
    with test_ws.connect(client, kim) as ws:
        test_ws.ready(ws)
        response = client.post(f"/api/reservations/{world.reservation_id}/share", json={}, headers=test_ws.auth(host))
        assert response.status_code == 200
        events = [test_ws.receive(ws) for _ in range(3)]  # room.updated(새 방), message.created, room.updated
        created = next(e for e in events if e["type"] == "message.created")["data"]
        assert created["kind"] == "RESERVATION"
        assert (created["payload"]["title"], created["payload"]["room_name"]) == ("주간 회의", "A회의실")
        assert created["sender"]["user_id"] == str(world.host)
