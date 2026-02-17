import { useOutletContext, useParams, useSearchParams } from "react-router-dom";

/** Devuelve un número (>0) o null. Nunca 0. */
export default function useStudyId(propId) {
  const outlet = useOutletContext() || {};
  const params = useParams();
  const [qs] = useSearchParams();

  const candidates = [
    propId,
    outlet?.studyId,         // como en CandidatoEconomica
    outlet?.estudioId,       // por si el padre lo expone así
    params?.studyId || params?.estudioId || params?.id,
    qs.get("study") || qs.get("estudio") || qs.get("id"),
    typeof window !== "undefined" ? window.localStorage?.getItem("estudioId") : null,
  ];

  for (const v of candidates) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}
