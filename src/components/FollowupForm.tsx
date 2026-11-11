import { useState, type FormEvent } from "react";
import { useApi, type Followup, type FollowupInput, type Profile, type Volunteer } from "../api";
import { useAppState } from "../App";
import { errText } from "../lib/hooks";

interface Props {
  followup: Followup | null;
  volunteers: Volunteer[];
  staff: Profile[];
  volunteerId?: string;
  onSaved: (f: Followup) => void;
  onCancel: () => void;
  onDeleted?: () => void;
}

export function FollowupForm({ followup, volunteers, staff, volunteerId, onSaved, onCancel, onDeleted }: Props) {
  const api = useApi();
  const { session } = useAppState();
  const [f, setF] = useState<FollowupInput>(followup
    ? { volunteer_id: followup.volunteer_id, note: followup.note, due: followup.due, assigned_to: followup.assigned_to }
    : { volunteer_id: volunteerId ?? "", note: "", due: null, assigned_to: session.userId });
  const [warn, setWarn] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fixedVol = volunteerId ? volunteers.find((v) => v.id === volunteerId) : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!f.volunteer_id) { setWarn("Choose who this follow-up is about."); return; }
    if (!f.note.trim()) { setWarn("Write what needs to happen, like “Call about the pierogi batch”."); return; }
    setBusy(true);
    try { onSaved(await api.saveFollowup({ ...f, note: f.note.trim() }, followup?.id)); }
    catch (err) { setWarn(errText(err)); setBusy(false); }
  }

  return (
    <form onSubmit={submit} noValidate>
      <h2 id="fu-dlg-title">{followup ? "Edit follow-up" : "New follow-up"}</h2>
      <div className="field">
        <label htmlFor="fu-vol">Volunteer</label>
        {fixedVol ? <p className="fixed">{fixedVol.name}</p> : (
          <select id="fu-vol" value={f.volunteer_id} onChange={(e) => setF({ ...f, volunteer_id: e.target.value })}>
            <option value="">Choose a volunteer…</option>
            {volunteers.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        )}
      </div>
      <div className="field">
        <label htmlFor="fu-note">What needs to happen</label>
        <textarea id="fu-note" rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Call about helping at the pancake breakfast" />
      </div>
      <div className="row">
        <div className="field">
          <label htmlFor="fu-due">Due</label>
          <input id="fu-due" type="date" value={f.due ?? ""} onChange={(e) => setF({ ...f, due: e.target.value || null })} />
        </div>
        <div className="field">
          <label htmlFor="fu-who">Who will do it</label>
          <select id="fu-who" value={f.assigned_to ?? ""} onChange={(e) => setF({ ...f, assigned_to: e.target.value || null })}>
            <option value="">Anyone</option>
            {staff.map((p) => <option key={p.id} value={p.id}>{p.id === session.userId ? `Me (${p.email})` : p.email}</option>)}
          </select>
        </div>
      </div>
      {warn && <p className="warn">{warn}</p>}
      <div className="formfoot">
        <div>{followup && onDeleted && <button className="btn danger" type="button" onClick={async () => { try { await api.deleteFollowup(followup.id); onDeleted(); } catch (err) { setWarn(errText(err)); } }}>Delete</button>}</div>
        <div className="right">
          <button className="btn" type="button" onClick={onCancel}>Cancel</button>
          <button className="btn primary" type="submit" disabled={busy}>Save</button>
        </div>
      </div>
    </form>
  );
}
