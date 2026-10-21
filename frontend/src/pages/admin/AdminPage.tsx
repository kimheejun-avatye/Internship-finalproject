import { useCallback, useEffect, useState } from "react";

import {
  approveUser,
  blockRoom,
  blockUser,
  listRooms,
  listUsers,
  rejectUser,
  type AdminRoom,
  type AdminUser,
} from "../../shared/api/admin";
import { ApiError } from "../../shared/api/client";

const ROLE_LABEL = { ADMIN: "관리자", MEMBER: "일반 구성원" } as const;

const errorMessage = (e: unknown) =>
  e instanceof ApiError ? e.message : "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";

const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });

function RoomChip({ room }: { room: AdminRoom }) {
  if (room.blocked_until) return <span className="chip amber">차단 중 · {hhmm(room.blocked_until)}까지</span>;
  if (room.status === "BLOCK") return <span className="chip amber">사용 중지</span>;
  return <span className="chip green">운영 중</span>;
}

function UserChip({ user }: { user: AdminUser }) {
  if (user.status === "BLOCKED") return <span className="chip muted">차단됨</span>;
  if (user.status === "PENDING") return <span className="chip amber">승인 대기</span>;
  return <span className="chip green">승인됨</span>;
}

export default function AdminPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [rooms, setRooms] = useState<AdminRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // 처리 중인 회원·회의실 ID. 같은 버튼을 두 번 누르지 않게 막는다
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [u, r] = await Promise.all([listUsers(), listRooms()]);
      setUsers(u);
      setRooms(r);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function run(id: string, action: () => Promise<void>) {
    setBusy(id);
    setError("");
    try {
      await action();
    } catch (e) {
      // 다른 관리자가 먼저 처리했을 수 있으니 목록을 다시 받아 맞춘다
      setError(errorMessage(e));
      await load();
    } finally {
      setBusy(null);
    }
  }

  const replaceUser = (next: AdminUser) => setUsers((list) => list.map((u) => (u.user_id === next.user_id ? next : u)));
  const replaceRoom = (next: AdminRoom) => setRooms((list) => list.map((r) => (r.room_id === next.room_id ? next : r)));

  const approve = (user: AdminUser) => run(user.user_id, async () => replaceUser(await approveUser(user.user_id)));

  const reject = (user: AdminUser) => {
    if (!window.confirm(`${user.name}(${user.email}) 님의 가입을 거절할까요? 계정이 삭제됩니다.`)) return;
    run(user.user_id, async () => {
      await rejectUser(user.user_id);
      setUsers((list) => list.filter((u) => u.user_id !== user.user_id));
    });
  };

  const block = (user: AdminUser) => {
    if (!window.confirm(`${user.name}(${user.email}) 님을 차단할까요? 차단은 해제할 수 없습니다.`)) return;
    run(user.user_id, async () => replaceUser(await blockUser(user.user_id)));
  };

  const blockRoomNow = (room: AdminRoom) => {
    if (!window.confirm(`${room.name}을(를) 지금부터 1시간 동안 차단할까요? 이 시간과 겹치는 예약도 이용할 수 없습니다.`)) return;
    run(room.room_id, async () => replaceRoom(await blockRoom(room.room_id)));
  };

  const available = rooms.filter((r) => r.status === "ACTIVE" && !r.blocked_until).length;
  const pending = users.filter((u) => u.status === "PENDING").length;

  return (
    <>
      <h1 className="page-title">워크스페이스 관리</h1>

      {error && <p className="admin-error" role="alert">{error}</p>}

      <div className="stats">
        <div className="card stat">
          <div className="label">오늘의 예약</div>
          <div className="value">-</div>
          <div className="sub">예약 기능 연동 후 표시</div>
        </div>
        <div className="card stat">
          <div className="label">사용 가능한 회의실</div>
          <div className="value">{available} / {rooms.length}</div>
          <div className="sub">{rooms.length - available}개 회의실 차단·중지</div>
        </div>
        <div className="card stat">
          <div className="label">전체 구성원</div>
          <div className="value">{users.length}</div>
          <div className="sub">승인 대기 {pending}명</div>
        </div>
      </div>

      <section className="card panel">
        <h2>회의실 관리</h2>
        <table className="table">
          <thead>
            <tr><th>회의실</th><th>수용 인원</th><th>상태</th><th /></tr>
          </thead>
          <tbody>
            {rooms.map((r) => (
              <tr key={r.room_id}>
                <td className="strong">{r.name}</td>
                <td>{r.capacity}명</td>
                <td><RoomChip room={r} /></td>
                <td>
                  {r.status === "ACTIVE" && !r.blocked_until && (
                    <button type="button" className="action" disabled={busy === r.room_id} onClick={() => blockRoomNow(r)}>
                      차단
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!loading && rooms.length === 0 && (
              <tr><td colSpan={4} className="empty">등록된 회의실이 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="card panel">
        <h2>구성원 관리</h2>
        <table className="table">
          <thead>
            <tr><th>구성원</th><th>소속</th><th>역할</th><th>상태</th><th /></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.user_id}>
                <td>
                  <div className="member">
                    <div className="avatar">{u.name[0]}</div>
                    <div>
                      <div className="name">{u.name}</div>
                      <div className="email">{u.email}</div>
                    </div>
                  </div>
                </td>
                <td>{u.team}</td>
                <td>{ROLE_LABEL[u.role]}</td>
                <td><UserChip user={u} /></td>
                <td>
                  {u.status === "PENDING" && (
                    <>
                      <button type="button" className="action" disabled={busy === u.user_id} onClick={() => approve(u)}>승인</button>
                      <button type="button" className="action" disabled={busy === u.user_id} onClick={() => reject(u)}>거절</button>
                    </>
                  )}
                  {u.status === "ACTIVE" && u.role === "MEMBER" && (
                    <button type="button" className="action" disabled={busy === u.user_id} onClick={() => block(u)}>차단</button>
                  )}
                </td>
              </tr>
            ))}
            {!loading && users.length === 0 && (
              <tr><td colSpan={5} className="empty">구성원이 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}
