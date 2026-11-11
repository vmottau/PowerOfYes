import { useState, type FormEvent } from "react";
import { useApi, type ChurchEvent, type EventInput } from "../api";
import { useAppState } from "../App";
import { errText } from "../lib/hooks";

interface Props {
  event: ChurchEvent | null;
  defaultArea?: string | null;
  onSaved: (ev: ChurchEvent) => void;
  onCancel: () => void;
  onDeleted?: () => void;
}

export function EventForm({ event, defaultArea, onSaved, onCancel, onDeleted }: Props) {
  const api = useApi();
  const { ministries } = useAppState();
  const [f, setF] = useState<EventInput>(event
    ? { name: event.name, date: event.date, time: event.time, place: event.place, area: event.area, needed: event.needed, notes: event.notes }
    : { name: "", date: null, time: "", place: "", area: defaultArea ?? null, needed: null, notes: "" });
  const [warn, setWarn] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const set = (p: Partial<EventInput>) => setF({ ...f, ...p });

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) { setWarn("Give the event or project a name."); return; }
    setBusy(true);
    try { onSaved(await api.saveEvent({ ...f, name: f.name.trim() }, event?.id)); }
    catch (err) { setWarn(errText(err)); setBusy(false); }
  }

  return (
    <form onSubmit={submit} noValidate>
      <h2 id="ev-dlg-title">{event ? "Edit event" : "New event or project"}</h2>
      <div className="field"><label htmlFor="ev-name">Name</label>
        <input id="ev-name" value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="Fall pierogi batch" /></div>
      <div className="row">
        <div className="field"><label htmlFor="ev-date">Date</label>
          <input id="ev-date" type="date" value={f.date ?? ""} onChange={(e) => set({ date: e.target.value || null })} /></div>
        <div className="field"><label htmlFor="ev-time">Time</label>
          <input id="ev-time" value={f.time} onChange={(e) => set({ time: e.target.value })} placeholder="9:00 am – noon" /></div>
      </div>
      <div className="row">
        <div className="field"><label htmlFor="ev-area">Area of interest</label>
          <select id="ev-area" value={f.area ?? ""} onChange={(e) => set({ area: e.target.value || null })}>
            <option value="">General (no specific area)</option>
            <optgroup label="Parish ministries">{ministries.filter((m) => m.kind === "ministry").map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</optgroup>
            <optgroup label="Events">{ministries.filter((m) => m.kind === "event").map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</optgroup>
          </select></div>
        <div className="field"><label htmlFor="ev-place">Where</label>
          <input id="ev-place" value={f.place} onChange={(e) => set({ place: e.target.value })} placeholder="Parish hall" /></div>
      </div>
      <div className="field"><label htmlFor="ev-needed">Volunteers needed</label>
        <input id="ev-needed" type="number" min={0} inputMode="numeric" value={f.needed ?? ""} placeholder="Optional"
          onChange={(e) => { const n = parseInt(e.target.value, 10); set({ needed: Number.isFinite(n) && n > 0 ? n : null }); }} /></div>
      <div className="field"><label htmlFor="ev-notes">Notes for volunteers</label>
        <textarea id="ev-notes" rows={2} value={f.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="What to bring, who's in charge. Assigned volunteers see this." /></div>
      {warn && <p className="warn">{warn}</p>}
      <div className="formfoot">
        <div>
          {event && onDeleted && !confirmDel && <button className="btn danger" type="button" onClick={() => setConfirmDel(true)}>Delete</button>}
          {event && onDeleted && confirmDel && (
            <div className="confirmdel">Delete this event and its roster?
              <button className="btn danger" type="button" onClick={async () => { try { await api.deleteEvent(event.id); onDeleted(); } catch (err) { setWarn(errText(err)); } }}>Yes, delete</button>
              <button className="btn" type="button" onClick={() => setConfirmDel(false)}>Keep</button>
            </div>
          )}
        </div>
        <div className="right">
          <button className="btn" type="button" onClick={onCancel}>Cancel</button>
          <button className="btn primary" type="submit" disabled={busy}>Save</button>
        </div>
      </div>
    </form>
  );
}
