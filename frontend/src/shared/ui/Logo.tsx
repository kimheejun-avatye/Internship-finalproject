import logo from "../../assets/logo.svg";

export default function Logo({ className }: { className?: string }) {
  return <img src={logo} alt="avatye" className={className} />;
}
