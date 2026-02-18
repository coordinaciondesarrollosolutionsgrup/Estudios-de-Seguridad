  // src/App.jsx
  import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
  import Login from "./pages/Login";
  import CandidatoPortal from "./pages/CandidatoPortal";
  import AnalistaDashboard from "./pages/AnalistaDashboard";
  import ClienteDashboard from "./pages/ClienteDashboard";
  import CandidatoEconomica from "./pages/CandidatoEconomica";
  import CandidatoAnexos from "./pages/CandidatoAnexos";
  import CandidatoReferencias from "./pages/CandidatoReferencias";
  import CandidatoPatrimonio from "./pages/CandidatoPatrimonio";
  
  import RoleRoute from "./RoleRoute";


  import CandidatoBio from "./pages/CandidatoBio";
  import CandidatoAcademico from "./pages/CandidatoAcademico";
  import CandidatoLaboral from "./pages/CandidatoLaboral";
  import CandidatoDocs from "./pages/CandidatoDocs";
  import CandidatoInfoFamiliar from "./pages/CandidatoInfoFamiliar";


  export default function App() {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Login />} />

          {/* CANDIDATO (layout + subrutas) */}
          <Route
            path="/candidato"
            element={
              <RoleRoute allow={["CANDIDATO"]}>
                <CandidatoPortal />
              </RoleRoute>
            }
          >
            <Route index element={<Navigate to="bio" replace />} />
            <Route path="bio" element={<CandidatoBio />} />
            <Route path="info_familiar" element={<CandidatoInfoFamiliar />} />
            <Route path="academico" element={<CandidatoAcademico />} />
            <Route path="laboral" element={<CandidatoLaboral />} />
            <Route path="docs" element={<CandidatoDocs />} />
            <Route path="economico" element={<CandidatoEconomica />} />
            <Route path="anexos" element={<CandidatoAnexos />} />
            <Route path="referencias" element={<CandidatoReferencias />} />
            <Route path="patrimonio"  element={<CandidatoPatrimonio  />} />
          </Route>

          {/* ANALISTA */}
          <Route
            path="/analista"
            element={
              <RoleRoute allow={["ANALISTA", "ADMIN"]}>
                <AnalistaDashboard />
              </RoleRoute>
            }
          />

          {/* CLIENTE */}
          <Route
            path="/cliente"
            element={
              <RoleRoute allow={["CLIENTE", "ADMIN"]}>
                <ClienteDashboard />
              </RoleRoute>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    );
  }
