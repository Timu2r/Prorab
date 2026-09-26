/** Роли аккаунта. У одного человека может быть несколько ролей: владелец может проверить сайт как клиент. */
export const ROLES = ["owner", "master", "client"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Владелец",
  master: "Мастер",
  client: "Клиент",
};

/** Главная роль для выбора экрана после входа: владелец важнее мастера, мастер важнее клиента. */
export function primaryRole(roles: readonly Role[]): Role {
  if (roles.includes("owner")) return "owner";
  if (roles.includes("master")) return "master";
  return "client";
}
