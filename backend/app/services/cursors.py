"""keyset 페이지네이션 커서. 마지막 행의 정렬 값들을 base64 로 감싼 문자열이고, 프런트는 해석하지 않는다."""

import base64
import json


def encode(*values) -> str:
    raw = json.dumps([str(v) for v in values], ensure_ascii=False).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def decode(cursor: str, size: int) -> list[str]:
    """값 size 개짜리 커서를 문자열 목록으로 푼다. 형식이 틀리면 ValueError."""
    raw = base64.urlsafe_b64decode(cursor + "=" * (-len(cursor) % 4))
    values = json.loads(raw)
    if (
        not isinstance(values, list)
        or len(values) != size
        or not all(isinstance(v, str) for v in values)
    ):
        raise ValueError("invalid cursor")
    return values
