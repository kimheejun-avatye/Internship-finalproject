"""같은 팀 동료 검색 GET /api/users/search."""

import pytest

pytestmark = pytest.mark.skip(reason="TODO: services.users 구현 후 활성화")


def test_only_same_team_is_listed(client, seed):
    ...


def test_me_blocked_and_pending_are_excluded(client, seed):
    ...


def test_phone_and_birth_date_are_not_exposed(client, seed):
    ...


def test_like_wildcards_are_escaped(client, seed):
    """q='%' 는 모든 사용자가 아니라 이름·이메일에 '%' 가 있는 사용자만 찾는다."""
    ...


def test_limit_bounds(client, seed):
    """limit 기본 20, 최대 50."""
    ...
