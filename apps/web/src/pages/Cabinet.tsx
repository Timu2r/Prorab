import { CATEGORY_LABELS, formatPhone, primaryRole, ROLE_LABELS, STATUS_LABELS, type Category, type RequestStatus } from "@ks/core";
import { ClipboardList, HardHat, LogOut, Tags, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { SiteHeader } from "../components/SiteHeader";

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

        {role === "owner" && (
          <div className="tiles">
            <Tile Icon={ClipboardList} title="Заявки" text={requests ? `Всего: ${requests.length}` : "Загрузка…"} />
            <Tile Icon={HardHat} title="Мастера" text="Появится на этапе 1" />
            <Tile Icon={Tags} title="Прайс" text="Появится на этапе 1" />
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
              {requests.slice(0, 20).map((r) => (
                <div key={r.id} className="list-item">
                  <span>
                    <b>{r.number}</b> <span className="muted">{CATEGORY_LABELS[r.category] ?? r.category}</span>
                  </span>
                  <span className="status">{STATUS_LABELS[r.status]}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
