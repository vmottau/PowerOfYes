export function fmtPhone(s: string): string {
  const d = (s || "").replace(/\D/g, "");
  const n = d.length === 11 && d[0] === "1" ? d.slice(1) : d;
  return n.length === 10 ? `${n.slice(0, 3)}-${n.slice(3, 6)}-${n.slice(6)}` : (s || "").trim();
}
export const digits = (s: string) => (s || "").replace(/\D/g, "");
export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export function todayISO(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
export const isPast = (date: string | null) => !!date && date < todayISO();

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export function longDate(iso: string | null): string {
  if (!iso) return "No date set";
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return `${DOW[dt.getDay()]}, ${MON[m - 1]} ${d}, ${y}`;
}
export function dateParts(iso: string | null): { mon: string; day: string } {
  if (!iso) return { mon: "TBD", day: "—" };
  const [, m, d] = iso.split("-").map(Number);
  return { mon: MON[m - 1], day: String(d) };
}
export const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;
