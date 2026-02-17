    // Cabecera con arte/ilustración sutil por módulo (opcional)
import imgBio from "../assets/modules/bio-tech.svg";
import imgAcad from "../assets/modules/academico-tech.svg";
import imgLab  from "../assets/modules/laboral-tech.svg";
import imgEco  from "../assets/modules/economica-tech.svg";
import imgDocs from "../assets/modules/docs-tech.svg";
import imgAx   from "../assets/modules/anexos-tech.svg";

const ART = { bio: imgBio, academico: imgAcad, laboral: imgLab, economico: imgEco, docs: imgDocs, anexos: imgAx };

export default function ModuleHeader({ title, module }) {
  const art = ART[module];
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5">
      {art && (
        <img
          src={art}
          alt=""
          className="pointer-events-none select-none absolute -right-2 -bottom-2 h-32 opacity-20"
        />
      )}
      <h3 className="p-4 text-lg font-semibold">{title}</h3>
    </div>
  );
}
