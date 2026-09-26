/**
 * Приводит российский мобильный номер к виду +79991234567.
 * Принимает «8 999 123-45-67», «+7 (999) 123 45 67», «9991234567». Всё остальное — null.
 */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  let national: string;
  if (digits.length === 11 && (digits[0] === "7" || digits[0] === "8")) national = digits.slice(1);
  else if (digits.length === 10) national = digits;
  else return null;
  if (national[0] !== "9") return null; // вход только с мобильного: код приходит звонком на этот номер
  return `+7${national}`;
}

/** +79991234567 -> +7 999 123-45-67 */
export function formatPhone(phone: string): string {
  const m = /^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/.exec(phone);
  return m ? `+7 ${m[1]} ${m[2]}-${m[3]}-${m[4]}` : phone;
}
