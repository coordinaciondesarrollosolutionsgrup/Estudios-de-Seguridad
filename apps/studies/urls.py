from rest_framework.routers import DefaultRouter
from django.urls import path
from .views import (
    SolicitudViewSet, EstudioViewSet, EstudioItemViewSet,
    AcademicoViewSet, LaboralViewSet, EconomicaViewSet, AnexoFotoViewSet, EstudioReferenciaViewSet,
    ReferenciaPersonalViewSet, PatrimonioViewSet, ClienteConfiguracionFormularioViewSet,
    ClientePoliticaConfiguracionViewSet, HistorialConfiguracionViewSet,
    DisponibilidadAnalistaViewSet,
)
from .views_pdf import estudio_pdf

router = DefaultRouter()
router.register(r"solicitudes", SolicitudViewSet, basename="solicitud")
router.register(r"estudios", EstudioViewSet, basename="estudio")
router.register(r"items", EstudioItemViewSet, basename="item")
router.register(r"academicos", AcademicoViewSet, basename="academico")
router.register(r"laborales", LaboralViewSet, basename="laboral")
router.register(r"economicas", EconomicaViewSet, basename="economica")
router.register(r"anexos", AnexoFotoViewSet, basename="anexo")
router.register(r"referencias", EstudioReferenciaViewSet, basename="referencia")
router.register(r"refs-personales", ReferenciaPersonalViewSet, basename="refpersonal")
router.register(r"patrimonios", PatrimonioViewSet, basename="patrimonio")

router.register(r"config-formulario", ClienteConfiguracionFormularioViewSet, basename="config-formulario")
router.register(r"politicas", ClientePoliticaConfiguracionViewSet, basename="politicas")
router.register(r"historial-config", HistorialConfiguracionViewSet, basename="historial-config")
router.register(r"disponibilidad-analista", DisponibilidadAnalistaViewSet, basename="disponibilidad-analista")


urlpatterns = [
    path("estudios/<int:estudio_id>/pdf/", estudio_pdf, name="estudio_pdf"),
] + router.urls   # <- SUMA, no lo vuelvas a reasignar después
