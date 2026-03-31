// Router-friendly ModulesNav (usa NavLink + lucide-react)
import { NavLink } from "react-router-dom";
import {
  UserRound,
  GraduationCap,
  BriefcaseBusiness,
  BarChart3,
  FileText,
  Images,
  UsersRound,   // 👈 nuevo
  Home, 
} from "lucide-react";

const ITEMS = [
  { to: "bio",        label: "Biográficos",         Icon: UserRound },
  { to: "info_familiar", label: "Info Familiar",    Icon: UsersRound },
  { to: "vivienda",   label: "Vivienda",            Icon: Home }, // 👈 agregado
  { to: "academico",  label: "Académico",           Icon: GraduationCap },
  { to: "laboral",    label: "Laboral",             Icon: BriefcaseBusiness },
  { to: "referencias", label: "Referencias",        Icon: UsersRound },
  { to: "economico",  label: "Económica",           Icon: BarChart3 },
  { to: "patrimonio",  label: "Patrimonio",         Icon: Home },
  { to: "docs",       label: "Documentos",          Icon: FileText },
  { to: "anexos",     label: "Anexos fotográficos", Icon: Images },


];

export default function ModulesNav({ items = ITEMS }) {
  return (
    <nav className="flex flex-wrap items-center gap-3">
      {items.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          end
          className={({ isActive }) =>
            [
              "group flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition border-2",
              isActive
                ? "bg-slate-800 text-violet-200 border-violet-500 shadow-[0_0_10px_2px_rgba(139,92,246,0.4)]"
                : "bg-slate-700 text-white/90 border-slate-600 hover:border-violet-400 hover:shadow-[0_0_10px_2px_rgba(139,92,246,0.3)] hover:text-violet-200",
            ].join(" ")
          }
        >
          {({ isActive }) => (
            <>
              <Icon
                className={`h-6 w-6 ${
                  isActive ? "text-violet-200" : "text-white/80 group-hover:text-violet-200"
                }`}
              />
              <span className="text-base">
                {label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
