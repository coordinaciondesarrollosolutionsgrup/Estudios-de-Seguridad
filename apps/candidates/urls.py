# apps/candidates/urls.py
from django.urls import path
from .views import CandidatoMeView, CandidatoMeUploadDocView

urlpatterns = [
    path("me/", CandidatoMeView.as_view(), name="candidato_me"),
    path("me/upload_doc/", CandidatoMeUploadDocView.as_view(), name="candidato_me_upload"),
]
