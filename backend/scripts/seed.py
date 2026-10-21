"""개발·QA용 초기 데이터를 넣는다. 여러 번 실행해도 이미 있는 데이터는 건너뛴다.

backend 폴더에서 실행한다.

    python -m scripts.seed

모든 계정의 비밀번호는 DEV_PASSWORD 이다. 운영 환경(APP_ENV=production)에서는 실행되지 않는다.
"""

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.rooms import Room, RoomStatus
from app.models.users import Role, Team, User

DEV_PASSWORD = "Qa12345!"

# (이메일, 이름, 소속, 역할, 승인 여부)
USERS = [
    ("qa-admin@example.com", "QA관리자", Team.AVATYE, Role.ADMIN, True),
    ("qa-member1@example.com", "QA멤버일", Team.AVATYE, Role.MEMBER, True),
    ("qa-member2@example.com", "QA멤버이", Team.GURU, Role.MEMBER, True),
    ("qa-pending1@example.com", "QA대기일", Team.GURU, Role.MEMBER, False),
    ("qa-pending2@example.com", "QA대기이", Team.AVATYE, Role.MEMBER, False),
]

# (이름, 수용 인원)
ROOMS = [("A회의실", 6), ("B회의실", 8), ("C회의실", 10)]


def seed(db: Session, now: Optional[datetime] = None) -> tuple[int, int]:
    """없는 계정·회의실만 만든다. 만든 (계정 수, 회의실 수)를 돌려준다."""
    now = now or datetime.now(timezone.utc)
    password_hash = hash_password(DEV_PASSWORD)
    users = 0
    for email, name, team, role, approved in USERS:
        if db.scalar(select(User).where(User.email == email)) is None:
            db.add(User(
                email=email,
                name=name,
                password_hash=password_hash,
                team=team,
                role=role,
                approved_at=now if approved else None,
            ))
            users += 1
    rooms = 0
    for name, capacity in ROOMS:
        if db.scalar(select(Room).where(Room.name == name)) is None:
            db.add(Room(name=name, capacity=capacity, status=RoomStatus.ACTIVE))
            rooms += 1
    db.commit()
    return users, rooms


def main() -> None:
    if settings.production:
        raise SystemExit("운영 환경에서는 seed 를 실행할 수 없습니다.")
    with SessionLocal() as db:
        users, rooms = seed(db)
    print(f"계정 {users}개, 회의실 {rooms}개를 만들었습니다. 비밀번호: {DEV_PASSWORD}")


if __name__ == "__main__":
    main()
