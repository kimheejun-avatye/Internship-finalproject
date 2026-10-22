import { useAuth } from "../../auth/AuthProvider";
import PasswordChangeForm from "../components/PasswordChangeForm";
export default function PasswordChangePage() {
  const { session } = useAuth();
  return <><h1>비밀번호 변경</h1><p className="notice">{session?.user.email}</p><PasswordChangeForm /></>;
}
