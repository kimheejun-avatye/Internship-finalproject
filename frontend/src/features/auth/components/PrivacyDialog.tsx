import { useEffect } from "react";

const ROWS = [
  ["이메일", "로그인 ID, 이메일 인증", "계정이 있는 동안 (퇴사 후 권한 말소 기록으로 3년)"],
  ["이름", "가입 승인 시 신청자 확인", "계정이 있는 동안 (퇴사 후 권한 말소 기록으로 3년)"],
  ["생일", "승인 시 본인 확인", "퇴사 30일 후 삭제"],
  ["휴대폰번호", "승인 시 본인 확인", "퇴사 30일 후 삭제"],
  ["부서 / 직무", "프로필 표시", "계정이 있는 동안 (퇴사 후 권한 말소 기록으로 3년)"],
];

export default function PrivacyDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="개인정보 수집·이용 동의" onClick={(e) => e.stopPropagation()}>
        <h2>개인정보 수집·이용 동의</h2>
        <p className="modal-desc">회의실 예약 서비스 가입 승인과 프로필 표시를 위해 아래 항목을 수집합니다. 모든 항목은 필수이며, 동의하지 않으면 가입할 수 없습니다.</p>
        <table className="table">
          <thead>
            <tr><th>항목</th><th>수집 목적</th><th>보관 기간</th></tr>
          </thead>
          <tbody>
            {ROWS.map(([item, purpose, keep]) => (
              <tr key={item}><td>{item}</td><td>{purpose}</td><td>{keep}</td></tr>
            ))}
          </tbody>
        </table>
        <button type="button" className="btn" onClick={onClose}>확인</button>
      </div>
    </div>
  );
}
