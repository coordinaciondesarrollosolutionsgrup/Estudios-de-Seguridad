"""
URL configuration for backend project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
import os
from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.http import JsonResponse, FileResponse, Http404
from django.db import connection
from apps.studies import geo_views


def health_check(request):
    try:
        connection.ensure_connection()
        db_ok = True
    except Exception:
        db_ok = False
    status_code = 200 if db_ok else 503
    return JsonResponse({"status": "ok" if db_ok else "error", "db": db_ok}, status=status_code)


def spa(request):
    """Sirve el index.html de React para todas las rutas del frontend."""
    index_path = os.path.join(settings.STATIC_ROOT, "index.html")
    if not os.path.exists(index_path):
        raise Http404("Frontend no encontrado. Asegúrate de haber ejecutado 'npm run build' y copiado los archivos a static/.")
    return FileResponse(open(index_path, "rb"), content_type="text/html")


urlpatterns = [
    path("api/health/", health_check, name="health_check"),
    path("admin/", admin.site.urls),

    # Auth (JWT)
    path("api/auth/", include("apps.accounts.urls")),
    path("api/candidatos/", include("apps.candidates.urls")),

    # API
    path("api/", include("apps.studies.urls")),
    path("api/", include("apps.documents.urls")),
    path("api/", include("apps.notifications.urls")),
    path("api/geo/departamentos/", geo_views.departamentos),
    path("api/geo/municipios/", geo_views.municipios),

    # Catch-all: cualquier ruta que no sea /api/ ni /admin/ sirve React
    re_path(r"^(?!api/|admin/|media/|static/).*$", spa, name="spa"),
]

urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
