import type { Ministry, VolunteerInput } from "../api";
import { fmtPhone } from "../lib/format";

interface Props {
  value: VolunteerInput;
  onChange: (v: VolunteerInput) => void;
  ministries: Ministry[];
  idPrefix: string;
}

/** Name, phone, email and the area-of-interest checkboxes from the paper card. */
export function VolunteerFields({ value, onChange, ministries, idPrefix }: Props) {
  const set = (patch: Partial<VolunteerInput>) => onChange({ ...value, ...patch });
  const toggle = (id: string, on: boolean) =>
    set({ ministries: on ? [...value.ministries, id] : value.ministries.filter((m) => m !== id) });
  const groups: [string, Ministry["kind"]][] = [["Parish ministries", "ministry"], ["Events", "event"]];
  return (
    <>
      <div className="field">
        <label htmlFor={`${idPrefix}-name`}>Name</label>
        <input id={`${idPrefix}-name`} autoComplete="name" value={value.name} onChange={(e) => set({ name: e.target.value })} />
      </div>
      <div className="row">
        <div className="field">
          <label htmlFor={`${idPrefix}-phone`}>Phone</label>
          <input id={`${idPrefix}-phone`} type="tel" inputMode="tel" autoComplete="tel" value={value.phone}
            onChange={(e) => set({ phone: e.target.value })} onBlur={(e) => set({ phone: fmtPhone(e.target.value) })} />
        </div>
        <div className="field">
          <label htmlFor={`${idPrefix}-email`}>Email</label>
          <input id={`${idPrefix}-email`} type="email" autoComplete="email" value={value.email} onChange={(e) => set({ email: e.target.value })} />
        </div>
      </div>
      {groups.map(([title, kind]) => {
        const list = ministries.filter((m) => m.kind === kind && (m.active || value.ministries.includes(m.id)));
        if (!list.length) return null;
        return (
          <fieldset key={kind} className={kind === "event" ? "events" : undefined}>
            <legend>{title}</legend>
            <div className="checks">
              {list.map((m) => (
                <label key={m.id}>
                  <input type="checkbox" id={`${idPrefix}-m-${m.id}`} checked={value.ministries.includes(m.id)} onChange={(e) => toggle(m.id, e.target.checked)} />
                  <span>{m.label}{m.hint && <small>{m.hint}</small>}</span>
                </label>
              ))}
            </div>
          </fieldset>
        );
      })}
    </>
  );
}

export function validateVolunteer(v: VolunteerInput): string | null {
  if (!v.name.trim()) return "Add a name before saving.";
  if (v.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) return "That email doesn't look complete.";
  return null;
}
