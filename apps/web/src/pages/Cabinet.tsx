import { CATEGORY_LABELS, formatPhone, primaryRole, ROLE_LABELS, STATUS_LABELS, type Category, type RequestStatus } from "@ks/core";
import { ClipboardList, HardHat, LogOut, Smartphone, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { api } from "../api";
import { useAuth } from "../auth";
import "../cabinet.css";
import { SiteHeader } from "../components/SiteHeader";

/** Приложение для владельца и мастеров: в разработке — Expo в браузере на порту 8082. */
const APP_URL = import.meta.env.VITE_APP_URL ?? `http://${location.hostname}:8082`;

type RequestItem = { id: string; number: string; status: RequestStatus; category: Category; district: string; createdAt: string };

function Tile({ Icon, title, text }: { Icon: LucideIcon; title: string; text: string }) {
  return (
    <div className="tile">
      <div className="row">
        <Icon size={20} />
        {title}
      </div>
      <span className="muted">{text}</span>
    </div>
  );
}

export function CabinetPage() {
  const { user, signOut } = useAuth();
  const [requests, setRequests] = useState<RequestItem[] | null>(null);
  const role = primaryRole(user!.roles);

  useEffect(() => {
    api<{ requests: RequestItem[] }>("GET", "/requests")
      .then((r) => setRequests(r.requests))
      .catch(() => setRequests([]));
  }, []);

  return (
    <>
      <SiteHeader />
      <main className="wrap cabinet">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: 8 }}>
            <h1>{user!.name || formatPhone(user!.phone)}</h1>
            <div>
              <span className="role">{ROLE_LABELS[role]}</span> <span className="muted">· {formatPhone(user!.phone)}</span>
            </div>
          </div>
          <button className="btn btn-outline btn-sm" onClick={() => void signOut()}>
            <LogOut size={18} />
            Выйти
          </button>
        </div>

        {role !== "client" && (
          <div className="tiles">
            <Tile Icon={ClipboardList} title="Заявки" text={requests ? `Всего: ${requests.length}` : "Загрузка…"} />
            <Tile Icon={HardHat} title="Работа с заявками" text="Сметы, мастера и задания — в приложении" />
            <a className="tile tile-link" href={APP_URL}>
              <div className="row">
                <Smartphone size={20} />
                Открыть приложение
              </div>
              <span className="muted">{APP_URL.replace(/^https?:\/\//, "")}</span>
            </a>
          </div>
        )}

        <section className="panel">
          <h2>{role === "master" ? "Мои задания" : role === "owner" ? "Последние заявки" : "Мои заявки"}</h2>
          {requests === null ? (
            <span className="muted">Загрузка…</span>
          ) : requests.length === 0 ? (
            <span className="muted">Пока пусто</span>
          ) : (
            <div>
              {requests.slice(0, 20).map((r) =>
                role === "client" ? (
                  <Link key={r.id} to={`/cabinet/z/${r.id}`} className="list-item list-link">
                    <span>
                      <b>{r.number}</b> <span className="muted">{CATEGORY_LABELS[r.category] ?? r.category}</span>
                    </span>
                    <span className="status">{STATUS_LABELS[r.status]}</span>
                  </Link>
                ) : (
                  <div key={r.id} className="list-item">
                    <span>
                      <b>{r.number}</b> <span className="muted">{CATEGORY_LABELS[r.category] ?? r.category}</span>
                    </span>
                    <span className="status">{STATUS_LABELS[r.status]}</span>
                  </div>
                ),
              )}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
