"""전체 멤버 검색 GET /api/users/search."""

import pytest
from conftest import signin

from app.db.session import SessionLocal
from app.models import Team, User


def page(client, **params):
    r = client.get("/api/users/search", params=params)
    assert r.status_code == 200, r.text
    return r.json()


def search(client, **params):
    return page(client, **params)["items"]


def test_login_is_required(client):
    assert client.get("/api/users/search").status_code == 401


def test_all_teams_are_listed(client, seed):
    seed()
    seed("kim@example.com", name="김민수")
    seed("lee@example.com", name="이영희")
    seed("guru@example.com", name="김구루", team=Team.GURU)
    signin(client)

    names = [u["name"] for u in search(client)]
    assert names == ["김구루", "김민수", "이영희"]
    assert [u["name"] for u in search(client, q="김")] == ["김구루", "김민수"]


def test_me_blocked_and_pending_are_excluded(client, seed):
    seed()
    seed("ok@example.com", name="정상")
    seed("blocked@example.com", name="차단", blocked=True)
    seed("pending@example.com", name="대기", approved=False)
    seed("guru-blocked@example.com", name="구루차단", team=Team.GURU, blocked=True)
    seed("guru-pending@example.com", name="구루대기", team=Team.GURU, approved=False)
    signin(client)

    assert [u["name"] for u in search(client)] == ["정상"]


def test_email_prefix_matches(client, seed):
    seed()
    seed("minsu.kim@example.com", name="김민수")
    seed("other@example.com", name="박지성")
    signin(client)

    assert [u["name"] for u in search(client, q="minsu")] == ["김민수"]
    # 이메일은 앞부분만 일치
    assert search(client, q="kim@") == []


def test_phone_and_birth_date_are_not_exposed(client, seed):
    seed()
    other = seed("kim@example.com", name="김민수")
    with SessionLocal() as db:
        db.get(User, other).phone = "01012345678"
        db.commit()
    signin(client)

    (found,) = search(client)
    assert set(found) == {"user_id", "name", "email", "team"}


def test_like_wildcards_are_escaped(client, seed):
    """'%', '_' 는 와일드카드가 아니라 글자 그대로 찾는다."""
    seed()
    seed("kim@example.com", name="김민수")
    seed("percent@example.com", name="100%달성")
    seed("under@example.com", name="a_b")
    signin(client)

    assert [u["name"] for u in search(client, q="%")] == ["100%달성"]
    assert [u["name"] for u in search(client, q="_")] == ["a_b"]


def test_limit_bounds(client, seed):
    """limit 기본 20, 최대 50."""
    seed()
    for i in range(25):
        seed(f"user{i:02d}@example.com", name=f"동료{i:02d}")
    signin(client)

    assert len(search(client)) == 20
    assert len(search(client, limit=5)) == 5
    assert client.get("/api/users/search", params={"limit": 51}).status_code == 422
    assert client.get("/api/users/search", params={"limit": 0}).status_code == 422


def test_cursor_pages_through_all_members(client, seed):
    """이름이 같은 사람이 있어도 페이지를 넘기며 빠짐·중복 없이 전원 나온다."""
    seed()
    expected = []
    for i in range(7):
        # 같은 이름 두 명씩: user_id 로 순서가 정해져야 한다
        uid = seed(f"user{i}@example.com", name=f"동료{i // 2}", team=Team.GURU if i % 2 else Team.AVATYE)
        expected.append(uid)
    signin(client)

    seen, cursor = [], None
    while True:
        params = {"limit": 3, **({"cursor": cursor} if cursor else {})}
        result = page(client, **params)
        seen += [u["user_id"] for u in result["items"]]
        cursor = result["next_cursor"]
        if cursor is None:
            break
    assert len(seen) == 7
    assert sorted(seen) == sorted(str(uid) for uid in expected)


def test_last_page_has_no_cursor(client, seed):
    seed()
    seed("kim@example.com", name="김민수")
    signin(client)

    assert set(page(client)) == {"items", "next_cursor"}
    assert page(client)["next_cursor"] is None
    # 딱 limit 명이면 다음 페이지가 없다
    assert page(client, limit=1)["next_cursor"] is None


@pytest.mark.parametrize("cursor", ["not-base64!", "bm90LWpzb24", "WzFd", "WyJhIiwgIngiXQ"])
def test_invalid_cursor_is_rejected(client, seed, cursor):
    seed()
    signin(client)

    r = client.get("/api/users/search", params={"cursor": cursor})
    assert r.status_code == 400
    assert r.json()["detail"]["code"] == "USER_CURSOR_INVALID"
