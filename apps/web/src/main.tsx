import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router";
import { AuthProvider, useAuth } from "./auth";
import { CabinetPage } from "./pages/Cabinet";
import { ContractPage } from "./pages/ContractPage";
import { HomePage } from "./pages/Home";
import { LoginPage } from "./pages/Login";
import { PrivacyPage } from "./pages/Privacy";
import { RequestPage } from "./pages/RequestPage";
import "./styles.css";

/** Без входа — на страницу входа, а после входа обратно: клиент приходит по ссылке на смету из WhatsApp. */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="page-center muted">Загрузка…</div>;
  return user ? children : <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/dogovor" element={<ContractPage template />} />
          <Route
            path="/cabinet/z/:id"
            element={
              <RequireAuth>
                <RequestPage />
              </RequireAuth>
            }
          />
          <Route
            path="/cabinet/z/:id/dogovor"
            element={
              <RequireAuth>
                <ContractPage />
              </RequireAuth>
            }
          />
          <Route
            path="/cabinet"
            element={
              <RequireAuth>
                <CabinetPage />
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
);
