import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import { api, ApiError, type User } from "../api";
import { useAuth } from "../auth";
import { formatPhoneInput } from "../phone";
import { SiteHeader } from "../components/SiteHeader";

type CodeResponse = { phone: string; resendAfter: number; devCode?: string };

export function LoginPage() {
  const { user, signIn } = useAuth();
  const navigate = useNavigate();
  // Куда вернуться после входа: только страницы кабинета, чтобы ссылкой нельзя было увести на чужой сайт
  const [params] = useSearchParams();
  const next = params.get("next")?.startsWith("/cabinet") ? params.get("next")! : "/cabinet";
  // Пришёл из «Мои заказы» без кода: номер из заявки уже известен — остаётся подтвердить его звонком
  const device = user?.scope === "device";
  const [phone, setPhone] = useState(() => (device ? formatPhoneInput(user.phone) : ""));
  const [sent, setSent] = useState<CodeResponse | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  useEffect(() => {
    if (device && !phone) setPhone(formatPhoneInput(user.phone));
  }, [device, user, phone]);

  if (user && !device) return <Navigate to={next} replace />;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Что-то пошло не так");
    } finally {
      setBusy(false);
    }
  };

  const requestCode = (e?: FormEvent) => {
    e?.preventDefault();
    return run(async () => {
      const r = await api<CodeResponse>("POST", "/auth/code", { phone });
      setSent(r);
      setCode("");
      setWait(r.resendAfter);
    });
  };

  const onCode = (v: string) => {
    const digits = v.replace(/\D/g, "").slice(0, 4);
    setCode(digits);
    if (digits.length === 4)
      void run(async () => {
        const r = await api<{ token: string; user: User }>("POST", "/auth/verify", { phone: sent!.phone, code: digits, device: "web" });
        signIn(r.token, r.user);
        navigate(next, { replace: true });
      });
  };

  return (
    <>
      <SiteHeader />
      <div className="page-center">
        {!sent ? (
          <form className="auth-card" onSubmit={requestCode}>
            <h1>{device ? "Подтвердите номер" : "Вход"}</h1>
            {device ? (
              <p className="muted">
                Код из звонка — ваша подпись: после него можно согласовать смету, открыть договор и увидеть все заявки по номеру, в том числе оформленные по
                телефону. Вам позвонят: последние 4 цифры входящего номера — код, отвечать не нужно.
              </p>
            ) : (
              <p className="muted">Для клиентов, мастеров и владельца. Вам позвонят: последние 4 цифры входящего номера — код входа, отвечать не нужно.</p>
            )}
            <label className="field">
              <span>Мобильный телефон</span>
              <input
                className="input"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+7 (999) 123-45-67"
                value={phone}
                onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
                autoFocus
              />
            </label>
            {error && <div className="error">{error}</div>}
            <button className="btn btn-primary btn-block" disabled={busy || phone.replace(/\D/g, "").length < 11}>
              Получить код
            </button>
            {device && (
              <Link to={next} className="btn-link" style={{ justifySelf: "center" }}>
                Вернуться к заказу
              </Link>
            )}
          </form>
        ) : (
          <div className="auth-card">
            <h1>Код из звонка</h1>
            <p className="muted">Звоним на {formatPhoneInput(sent.phone)}. Введите последние 4 цифры номера, с которого поступил звонок.</p>
            {sent.devCode && <div className="dev-hint">Режим разработки: код {sent.devCode}</div>}
            <input
              className="input code-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              aria-label="Код"
              value={code}
              onChange={(e) => onCode(e.target.value)}
              disabled={busy}
              autoFocus
            />
            {error && <div className="error">{error}</div>}
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <button className="btn-link" onClick={() => setSent(null)}>
                Изменить номер
              </button>
              {wait > 0 ? (
                <span className="muted">Повторить через {wait} с</span>
              ) : (
                <button className="btn-link" onClick={() => requestCode()} disabled={busy}>
                  Позвонить ещё раз
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
