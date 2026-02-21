import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export function RequireAuth() {
  const { user } = useAuth();

  if (!user) return <Navigate to="/auth" />;

  return <Outlet />;
}
