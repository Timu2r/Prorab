import { CATEGORY_LABELS, formatPhone, primaryRole, ROLE_LABELS, STATUS_LABELS, type Category, type RequestStatus } from "@ks/core";
import { ChevronRight, ClipboardList, HardHat, LogOut, ShieldCheck, Smartphone, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { api } from "../api";
import { isStaff, useAuth } from "../auth";
import "../cabinet.css";
import { SiteHeader } from "../components/SiteHeader";
import { dateText, STAGE_LABELS } from "../orders";

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

function useRequests() {
  const [requests, setRequests] = useState<RequestItem[] | null>(null);
  useEffect(() => {
    api<{ requests: RequestItem[] }>("GET", "/requests")
      .then((r) => setRequests(r.requests))
      .catch(() => setRequests([]));
  }, []);
  return requests;
}

export function CabinetPage() {
  const { user } = useAuth();
  return isStaff(user!) ? <StaffCabinet /> : <Orders />;
}

/**
 * Без кода — подсказка подтвердить номер: код открывает все заявки по номеру и согласование сметы.
 * Возврат — на эту же страницу.
 */
export function ConfirmPhone({ text }: { text: string }) {
  const location = useLocation();
  return (
    <div className="confirm-phone">
      <ShieldCheck size={22} />
      <p>{text}</p>
      <Link className="btn btn-primary btn-sm" to={`/login?next=${encodeURIComponent(location.pathname)}`}>
        Подтвердить номер
      </Link>
    </div>
  );
}

/** «Мои заказы» клиента: появляются сами после заявки на сайте (docs/TZ.md, 16.4). */
function Orders() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const requests = useRequests();
  const device = user!.scope === "device";

  return (
    <>
      <SiteHeader />
      <main className="wrap cabinet orders">
        <div className="orders-head">
          <div>
            <h1>Мои заказы</h1>
            <span className="muted">
              {formatPhone(user!.phone)}
              {device ? " · без входа, с этого устройства" : ""}
            </span>
          </div>
          <button
            className="btn btn-outline btn-sm"
            onClick={async () => {
              await signOut();
              navigate("/");
            }}
          >
            <LogOut size={18} />
            {device ? "Выйти на этом устройстве" : "Выйти"}
          </button>
        </div>

        {device && (
          <ConfirmPhone text="Вы видите заявки, отправленные с этого устройства. Подтвердите номер кодом из звонка — увидите все заявки по номеру, в том числе оформленные по телефону, и сможете согласовывать сметы." />
        )}

        <section className="panel">
          {requests === null ? (
            <span className="muted">Загрузка…</span>
          ) : requests.length === 0 ? (
            <div className="orders-empty">
              <ClipboardList size={28} />
              <span>Заявок пока нет.</span>
              <Link to="/?lead=full" className="btn btn-primary btn-sm">
                Оставить заявку
              </Link>
            </div>
          ) : (
            <div className="orders-list">
              {requests.map((r) => (
                <Link key={r.id} to={`/cabinet/z/${r.id}`} className="order-row">
                  <span className="order-main">
                    <b>{r.number}</b>
                    <span className="muted">
                      {CATEGORY_LABELS[r.category] ?? r.category} · от {dateText(r.createdAt)}
                    </span>
                  </span>
                  <span className={`order-stage${r.status === "cancelled" ? " off" : r.status === "closed" || r.status === "paid" ? " ok" : ""}`}>
                    {STAGE_LABELS[r.status]}
                  </span>
                  <ChevronRight size={18} className="order-go" />
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}

/** Владелец и мастер: заявки ведутся в приложении, здесь — короткая сводка и переход. */
function StaffCabinet() {
  const { user, signOut } = useAuth();
  const requests = useRequests();
  const role = primaryRole(user!.roles);

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

        <section className="panel">
          <h2>{role === "master" ? "Мои задания" : "Последние заявки"}</h2>
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
