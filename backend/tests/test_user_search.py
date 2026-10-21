"""같은 팀 동료 검색 GET /api/users/search."""

from conftest import signin

from app.db.session import SessionLocal
from app.models import Team, User


def search(client, **params):
    r = client.get("/api/users/search", params=params)
    assert r.status_code == 200, r.text
    return r.json()


def test_login_is_required(client):
    assert client.get("/api/users/search").status_code == 401


def test_only_same_team_is_listed(client, seed):
    seed()
    seed("kim@example.com", name="김민수")
    seed("lee@example.com", name="이영희")
    seed("guru@example.com", name="김구루", team=Team.GURU)
    signin(client)

    names = [u["name"] for u in search(client)]
    assert names == ["김민수", "이영희"]
    assert [u["name"] for u in search(client, q="김")] == ["김민수"]


def test_me_blocked_and_pending_are_excluded(client, seed):
    seed()
    seed("ok@example.com", name="정상")
    seed("blocked@example.com", name="차단", blocked=True)
    seed("pending@example.com", name="대기", approved=False)
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
