// components/EvaluacionTratoModal.jsx
import { useState } from "react";
import api from "../api/axios";

const RadioRow = ({ name, value, onChange, options }) => (
  <div className="flex flex-wrap gap-2">
    {options.map((opt) => (
      <label key={opt} className={`px-3 py-1.5 rounded-full border cursor-pointer text-sm
        ${value === opt ? "bg-blue-600/90 border-blue-500 text-white" : "border-white/15 text-white/80 hover:bg-white/10"}`}>
        <input
          type="radio"
          name={name}
          value={opt}
          checked={value === opt}
          onChange={(e) => onChange(e.target.value)}
          className="hidden"
        />
        {opt}
      </label>
    ))}
  </div>
);

export default function EvaluacionTratoModal({ open, estudioId, onClose, onSubmitted }) {
  const [busy, setBusy] = useState(false);
  const [ans, setAns] = useState({
    q1: "", q1_obs: "",
    q2: "", q2_obs: "",
    q3: "", q3_obs: "",
    q4: "", q4_obs: "",
    q5: "", q5_obs: "",
    q6: "", q6_obs: "",
    q7: "", q7_obs: "",
    q8: "", q8_obs: "",
  });

  if (!open) return null;

  const must = ["q1","q2","q3","q4","q5","q6","q7","q8"]; // marca obligatorias si quieres
  const allOk = must.every((k) => String(ans[k] || "").length);

  const submit = async () => {
    if (!estudioId || !allOk || busy) return;
    setBusy(true);
    try {
      await api.post(`/api/estudios/${estudioId}/evaluacion/`, { answers: ans });
      onSubmitted?.(); // cierra y redirige
    } catch (e) {
      alert("No se pudo enviar la evaluación.");
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const setVal = (k, v) => setAns((s) => ({ ...s, [k]: v }));

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm grid place-items-center p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-2xl border border-white/10 bg-[#0b1220] p-5 text-white space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Evaluación de trato recibido</h2>
          <button onClick={onClose} className="px-3 py-1.5 rounded-full border border-white/15 hover:bg-white/10 text-sm">Cerrar</button>
        </div>

        {/* 1 */}
        <div>
          <div className="font-medium mb-1">
            1) ¿Durante el desarrollo del estudio recibió usted un trato…?
          </div>
          <RadioRow
            name="q1"
            value={ans.q1}
            onChange={(v) => setVal("q1", v)}
            options={["Excelente", "Bueno", "Regular", "Malo"]}
          />
          <textarea
            className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 p-2 text-sm"
            placeholder="Observaciones…"
            value={ans.q1_obs}
            onChange={(e) => setVal("q1_obs", e.target.value)}
          />
        </div>

        {/* 2 */}
        <div>
          <div className="font-medium mb-1">
            2) ¿Durante el desarrollo del estudio se sintió usted…?
          </div>
          <RadioRow
            name="q2"
            value={ans.q2}
            onChange={(v) => setVal("q2", v)}
            options={["Respetado", "Presionado", "Ridiculizado", "Agredido"]}
          />
          <textarea className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 p-2 text-sm"
            placeholder="Observaciones…" value={ans.q2_obs} onChange={(e)=>setVal("q2_obs", e.target.value)} />
        </div>

        {/* 3 */}
        <div>
          <div className="font-medium mb-1">
            3) ¿Está de acuerdo con que al personal se le realice el estudio?
          </div>
          <RadioRow
            name="q3"
            value={ans.q3}
            onChange={(v) => setVal("q3", v)}
            options={["Excelente", "Bueno", "Regular", "Malo"]}
          />
          <textarea className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 p-2 text-sm"
            placeholder="Observaciones…" value={ans.q3_obs} onChange={(e)=>setVal("q3_obs", e.target.value)} />
        </div>

        {/* 4 */}
        <div>
          <div className="font-medium mb-1">4) ¿El estudio inició…?</div>
          <RadioRow
            name="q4"
            value={ans.q4}
            onChange={(v) => setVal("q4", v)}
            options={["A tiempo", "Después de 20 minutos", "Después de 30 minutos", "Muy tarde"]}
          />
          <textarea className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 p-2 text-sm"
            placeholder="Observaciones…" value={ans.q4_obs} onChange={(e)=>setVal("q4_obs", e.target.value)} />
        </div>

        {/* 5 */}
        <div>
          <div className="font-medium mb-1">5) ¿Cómo calificaría la amabilidad del personal?</div>
          <RadioRow
            name="q5"
            value={ans.q5}
            onChange={(v) => setVal("q5", v)}
            options={["Muy amable", "Amable", "Neutral", "Poco amable"]}
          />
          <textarea className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 p-2 text-sm"
            placeholder="Observaciones…" value={ans.q5_obs} onChange={(e)=>setVal("q5_obs", e.target.value)} />
        </div>

        {/* 6 */}
        <div>
          <div className="font-medium mb-1">6) ¿El personal se dirigió con respeto y cortesía?</div>
          <RadioRow
            name="q6"
            value={ans.q6}
            onChange={(v) => setVal("q6", v)}
            options={["Siempre", "La mayoría de las veces", "Algunas veces", "Nunca"]}
          />
          <textarea className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 p-2 text-sm"
            placeholder="Observaciones…" value={ans.q6_obs} onChange={(e)=>setVal("q6_obs", e.target.value)} />
        </div>

        {/* 7 */}
        <div>
          <div className="font-medium mb-1">7) ¿Recomendaría este servicio?</div>
          <RadioRow
            name="q7"
            value={ans.q7}
            onChange={(v) => setVal("q7", v)}
            options={["Sí", "No"]}
          />
          <textarea className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 p-2 text-sm"
            placeholder="Observaciones…" value={ans.q7_obs} onChange={(e)=>setVal("q7_obs", e.target.value)} />
        </div>

        {/* 8 */}
        <div>
          <div className="font-medium mb-1">8) ¿Tiene algún comentario o sugerencia final?</div>
          <RadioRow
            name="q8"
            value={ans.q8}
            onChange={(v) => setVal("q8", v)}
            options={["Sí", "No"]}
          />
          <textarea className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 p-2 text-sm"
            placeholder="Observaciones…" value={ans.q8_obs} onChange={(e)=>setVal("q8_obs", e.target.value)} />
        </div>

        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg border border-white/15 hover:bg-white/10">
            Cancelar
          </button>
          <button
            disabled={!allOk || busy}
            onClick={submit}
            className={`px-4 py-2 rounded-lg text-white ${allOk ? "bg-emerald-600/90 hover:bg-emerald-600" : "bg-emerald-500/40 cursor-not-allowed"}`}
          >
            {busy ? "Enviando…" : "Enviar evaluación"}
          </button>
        </div>
      </div>
    </div>
  );
}
