"""채팅 QA 계정을 만든다. 여러 번 실행해도 이미 있는 계정은 건너뛴다.

backend 폴더에서 실행한다.

    python -m scripts.chat_qa.seed_chat

비밀번호는 scripts.seed 와 같은 DEV_PASSWORD 이다. 운영 환경에서는 실행되지 않는다.
"""

from datetime import datetime, timezone

from sqlalchemy import select

from app.core.config import settings
from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.users import Role, Team, User
from scripts.seed import DEV_PASSWORD

# (이메일, 이름, 소속). 모두 승인된 일반 회원
USERS = [
    ("qa-chat1@example.com", "김민수", Team.AVATYE),
    ("qa-chat2@example.com", "이영희", Team.AVATYE),
    ("qa-chat3@example.com", "박지성", Team.AVATYE),
    ("qa-chat4@example.com", "최지우", Team.AVATYE),
    # 다른 팀: 대화 상대로 고르면 400 CHAT_MEMBER_INVALID 가 나와야 한다
    ("qa-chat-guru@example.com", "구루팀원", Team.GURU),
]


def main() -> None:
    if settings.production:
        raise SystemExit("운영 환경에서는 seed 를 실행할 수 없습니다.")
    now = datetime.now(timezone.utc)
    password_hash = hash_password(DEV_PASSWORD)
    created = 0
    with SessionLocal() as db:
        for email, name, team in USERS:
            if db.scalar(select(User).where(User.email == email)) is None:
                db.add(User(
                    email=email,
                    name=name,
                    password_hash=password_hash,
                    team=team,
                    role=Role.MEMBER,
                    approved_at=now,
                ))
                created += 1
        db.commit()
    print(f"채팅 QA 계정 {created}개를 만들었습니다. 비밀번호: {DEV_PASSWORD}")


if __name__ == "__main__":
    main()
