import { useState } from "react";
import api from "../api/axios";

export default function FileUploader({ itemId, onUploaded }) {
  const [file, setFile] = useState(null);
  const [tipo, setTipo] = useState("");

  const upload = async () => {
    if (!file || !itemId) return;
    const form = new FormData();
    form.append("item", itemId);
    form.append("nombre", file.name);
    form.append("tipo", tipo);
    form.append("archivo", file);
    await api.post("/api/documentos/", form);
    setFile(null); setTipo("");
    onUploaded && onUploaded();
  };

  return (
    <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
      <input type="file" onChange={e=>setFile(e.target.files?.[0] ?? null)} />
      <input className="border rounded p-1 text-sm" placeholder="tipo (diploma, acta...)" value={tipo} onChange={e=>setTipo(e.target.value)} />
      <button onClick={upload} className="px-3 py-1.5 bg-indigo-600 text-white rounded disabled:opacity-50" disabled={!file}>
        Subir
      </button>
    </div>
  );
}
