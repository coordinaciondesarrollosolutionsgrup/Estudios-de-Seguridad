# apps/candidates/urls.py
from django.urls import path
from .views import CandidatoMeView, CandidatoMeUploadDocView, InformacionFamiliarMeView

urlpatterns = [
    path("me/", CandidatoMeView.as_view(), name="candidato_me"),
    path("me/upload_doc/", CandidatoMeUploadDocView.as_view(), name="candidato_me_upload"),
    path("me/informacion_familiar/", InformacionFamiliarMeView.as_view(), name="candidato_me_informacion_familiar"),
]
