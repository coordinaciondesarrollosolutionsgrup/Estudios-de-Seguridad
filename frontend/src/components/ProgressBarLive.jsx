// src/components/ProgressBarLive.jsx
import ProgressBar from "./ProgressBar";
import useStudyProgress from "../hooks/useStudyProgress";

export default function ProgressBarLive({ estudioId, initial = 0, label, compact }) {
  const progreso = useStudyProgress(initial, estudioId);
  return <ProgressBar value={progreso} label={label} compact={compact} />;
}
