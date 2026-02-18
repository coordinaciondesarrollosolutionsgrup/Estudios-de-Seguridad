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
              "group flex items-center gap-2 rounded-2xl px-4 py-2 transition",
              isActive
                ? "bg-white/10 ring-1 ring-white/15"
                : "hover:bg-white/5",
            ].join(" ")
          }
        >
          {({ isActive }) => (
            <>
              <Icon
                className={`h-6 w-6 ${
                  isActive ? "text-white" : "text-white/80 group-hover:text-white"
                }`}
              />
              <span className={`text-base ${isActive ? "text-white" : "text-white/90"}`}>
                {label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
