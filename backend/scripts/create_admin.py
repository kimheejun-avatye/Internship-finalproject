"""첫 관리자 계정을 만든다. 가입은 항상 MEMBER 승인 대기로 들어오므로 웹으로는 첫 관리자를 만들 수 없다.

backend 폴더에서 실행한다. 비밀번호는 실행 중에 입력받는다.

    python -m scripts.create_admin avatye-admin@gmail.com
    python -m scripts.create_admin avatye-admin@gmail.com --name 관리자 --team AVATYE

같은 이메일의 계정이 이미 있으면 비밀번호는 그대로 두고 승인 + ADMIN 으로만 바꾼다.
"""

import argparse
import getpass
import re
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.users import Role, Team, User


def password_error(password: str) -> Optional[str]:
    # 회원가입(SignupIn)과 같은 규칙
    if not 8 <= len(password) <= 64:
        return "비밀번호는 8~64자여야 합니다."
    if any(c.isspace() for c in password):
        return "비밀번호에 공백을 사용할 수 없습니다."
    if not (
        re.search(r"[A-Za-z]", password)
        and re.search(r"[0-9]", password)
        and re.search(r"[^A-Za-z0-9]", password)
    ):
        return "비밀번호는 영문, 숫자, 특수문자를 모두 포함해야 합니다."
    return None


def find_active(db: Session, email: str) -> Optional[User]:
    return db.scalar(select(User).where(User.email == email, User.blocked_at.is_(None)).with_for_update())


def promote(db: Session, user: User) -> User:
    user.role = Role.ADMIN
    if user.approved_at is None:
        user.approved_at = datetime.now(timezone.utc)
    db.commit()
    return user


def create(db: Session, email: str, password: str, name: str, team: Team) -> User:
    user = User(
        email=email,
        name=name,
        password_hash=hash_password(password),
        team=team,
        role=Role.ADMIN,
        approved_at=datetime.now(timezone.utc),
    )
    db.add(user)
    db.commit()
    return user


def ask_password() -> str:
    while True:
        password = getpass.getpass("비밀번호: ")
        error = password_error(password)
        if error:
            print(error)
        elif password != getpass.getpass("비밀번호 확인: "):
            print("비밀번호가 일치하지 않습니다.")
        else:
            return password


def main() -> None:
    parser = argparse.ArgumentParser(description="첫 관리자 계정 생성")
    parser.add_argument("email")
    parser.add_argument("--name", default="관리자")
    parser.add_argument("--team", choices=[t.value for t in Team], default=Team.AVATYE.value)
    args = parser.parse_args()
    email = args.email.strip().lower()

    with SessionLocal() as db:
        user = find_active(db, email)
        if user is not None:
            promote(db, user)
            print(f"기존 계정 {email} 을(를) 승인된 관리자로 변경했습니다.")
            return
        db.rollback()
        create(db, email, ask_password(), args.name.strip(), Team(args.team))
        print(f"관리자 계정 {email} 을(를) 만들었습니다.")


if __name__ == "__main__":
    main()
