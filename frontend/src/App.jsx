  // src/App.jsx
  import { Suspense, lazy } from "react";
  import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
  import { ToastProvider } from "./components/Toast";
  import SessionExpiredModal from "./components/SessionExpiredModal";

  import RoleRoute from "./RoleRoute";

  const Login = lazy(() => import("./pages/Login"));
  const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
  const ResetPassword = lazy(() => import("./pages/ResetPassword"));
  const CandidatoPortal = lazy(() => import("./pages/CandidatoPortal"));
  const AnalistaDashboard = lazy(() => import("./pages/AnalistaDashboard"));
  const ClienteDashboard = lazy(() => import("./pages/ClienteDashboard"));
  const CandidatoEconomica = lazy(() => import("./pages/CandidatoEconomica"));
  const CandidatoAnexos = lazy(() => import("./pages/CandidatoAnexos"));
  const CandidatoReferencias = lazy(() => import("./pages/CandidatoReferencias"));
  const CandidatoPatrimonio = lazy(() => import("./pages/CandidatoPatrimonio"));
  const CandidatoBio = lazy(() => import("./pages/CandidatoBio"));
  const CandidatoAcademico = lazy(() => import("./pages/CandidatoAcademico"));
  const CandidatoLaboral = lazy(() => import("./pages/CandidatoLaboral"));
  const CandidatoDocs = lazy(() => import("./pages/CandidatoDocs"));
  const CandidatoInfoFamiliar = lazy(() => import("./pages/CandidatoInfoFamiliar"));
  const CandidatoVivienda = lazy(() => import("./pages/CandidatoVivienda"));
  const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));


  export default function App() {
    return (
      <ToastProvider>
      <SessionExpiredModal />
      <BrowserRouter>
        <Suspense
          fallback={
            <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-200 text-sm">
              Cargando...
            </div>
          }
        >
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password/:uid/:token" element={<ResetPassword />} />

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
            <Route path="vivienda" element={<CandidatoVivienda />} />
            <Route path="academico" element={<CandidatoAcademico />} />
            <Route path="laboral" element={<CandidatoLaboral />} />
            <Route path="docs" element={<CandidatoDocs />} />
            <Route path="economico" element={<CandidatoEconomica />} />
            <Route path="anexos" element={<CandidatoAnexos />} />
            <Route path="referencias" element={<CandidatoReferencias />} />
            <Route path="patrimonio"  element={<CandidatoPatrimonio  />} />
          </Route>

          {/* ADMIN */}
          <Route
            path="/admin"
            element={
              <RoleRoute allow={["ADMIN"]}>
                <AdminDashboard />
              </RoleRoute>
            }
          />

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
        </Suspense>
      </BrowserRouter>
      </ToastProvider>
    );
  }
