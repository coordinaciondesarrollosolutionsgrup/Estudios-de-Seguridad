from django.urls import path
from .views import (
    MeView,
    PasswordResetRequestView,
    PasswordResetConfirmView,
    CandidateAwareTokenObtainPairView,
    CandidateAwareTokenRefreshView,
    AdminUsuariosView,
    AdminUsuarioDetalleView,
    AdminEmpresasView,
    AdminEmpresaDetalleView,
    AdminMetricasView,
    AdminAsignarAnalistaView,
)

urlpatterns = [
    path("login/", CandidateAwareTokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("refresh/", CandidateAwareTokenRefreshView.as_view(), name="token_refresh"),
    path("me/", MeView.as_view(), name="me"),
    path("password-reset/", PasswordResetRequestView.as_view(), name="password_reset_request"),
    path("password-reset/confirm/", PasswordResetConfirmView.as_view(), name="password_reset_confirm"),

    # Super Admin
    path("admin/usuarios/", AdminUsuariosView.as_view(), name="admin_usuarios"),
    path("admin/usuarios/<int:pk>/", AdminUsuarioDetalleView.as_view(), name="admin_usuario_detalle"),
    path("admin/empresas/", AdminEmpresasView.as_view(), name="admin_empresas"),
    path("admin/empresas/<int:pk>/", AdminEmpresaDetalleView.as_view(), name="admin_empresa_detalle"),
    path("admin/metricas/", AdminMetricasView.as_view(), name="admin_metricas"),
    path("admin/estudios/<int:estudio_id>/asignar-analista/", AdminAsignarAnalistaView.as_view(), name="admin_asignar_analista"),
]
