from pathlib import Path
from datetime import timedelta
import environ, os

BASE_DIR = Path(__file__).resolve().parent.parent
env = environ.Env()
environ.Env.read_env(BASE_DIR / ".env")

# --- Core ---
SECRET_KEY = env("DJANGO_SECRET_KEY", default="django-insecure-ehzymbds%cwv#)pu2zd(!q66cztw$(c*ofe@%#4=%y*woh&i54")
DEBUG = env.bool("DJANGO_DEBUG", default=True)

ALLOWED_HOSTS = [
    'conecta.econfia.co',  # tu subdominio
    'localhost',            # opcional, útil para desarrollo
    '127.0.0.1',            # opcional, útil para desarrollo
]

# URL del frontend (prod en tu subdominio; en dev usa localhost)
FRONTEND_URL = env("FRONTEND_URL", default="https://conecta.econfia.co")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",

    # Terceros
    "rest_framework",
    "corsheaders",

    # Nuestras apps
    "apps.accounts",
    "apps.candidates",
    "apps.studies",
    "apps.documents",
    "apps.visits",
    "apps.notifications",
]

# Recomendado: Security primero, CORS alto y antes de CommonMiddleware
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "backend.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "backend.wsgi.application"

# --- DB (MVP) ---
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": env("DB_NAME", default="estudios"),
        "USER": env("DB_USER", default="postgres"),
        "PASSWORD": env("DB_PASSWORD", default="0206"),
        "HOST": env("DB_HOST", default="127.0.0.1"),
        "PORT": env("DB_PORT", default="5432"),
    }
}

# --- Usuario custom ---
AUTH_USER_MODEL = "accounts.User"

# --- Static/Media ---
STATIC_URL = "/django_static/"
STATIC_ROOT = BASE_DIR / "static"
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

# --- DRF + JWT ---
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=60),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "AUTH_HEADER_TYPES": ("Bearer",),
}

# --- CORS / CSRF (prod: expl�citos; dev puedes abrir) ---
CORS_ALLOW_ALL_ORIGINS = env.bool("DJANGO_CORS_ALLOW_ALL", default=False)
CORS_ALLOWED_ORIGINS = env.list(
    "DJANGO_CORS_ALLOWED_ORIGINS",
    default=[
        "https://conecta.econfia.co",
        "https://econfia.co",
        "https://www.econfia.co",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
)
# Si prefieres permitir cualquier subdominio *.econfia.co, usa regex:
# CORS_ALLOWED_ORIGIN_REGEXES = [r"^https://([a-z0-9-]+\.)*econfia\.co$"]

CSRF_TRUSTED_ORIGINS = env.list(
    "DJANGO_CSRF_TRUSTED_ORIGINS",
    default=[
        "https://conecta.econfia.co",
        "https://econfia.co",
        "https://www.econfia.co",
    ],
)

# Si usas cookies (no necesario con JWT por header), activa credenciales:
# CORS_ALLOW_CREDENTIALS = True

# --- Seguridad detr�s de Nginx/HTTPS ---
USE_X_FORWARDED_HOST = env.bool("USE_X_FORWARDED_HOST", default=True)
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = env.bool("SECURE_SSL_REDIRECT", default=not DEBUG)

SESSION_COOKIE_SECURE = env.bool("SESSION_COOKIE_SECURE", default=True)
CSRF_COOKIE_SECURE = env.bool("CSRF_COOKIE_SECURE", default=True)
# Si alguna vez necesitas cookies cross-site, cambia a "None"
CSRF_COOKIE_SAMESITE = env("CSRF_COOKIE_SAMESITE", default="Lax")
SESSION_COOKIE_SAMESITE = env("SESSION_COOKIE_SAMESITE", default="Lax")

# --- Email (SMTP Econfia con SSL 465) ---
EMAIL_HOST = env("EMAIL_HOST", default="mail.econfia.co")
EMAIL_PORT = env.int("EMAIL_PORT", default=465)
EMAIL_USE_SSL = env.bool("EMAIL_USE_SSL", default=True)   # 465 = SSL
EMAIL_USE_TLS = env.bool("EMAIL_USE_TLS", default=False)
EMAIL_HOST_USER = env("EMAIL_HOST_USER", default="no-reply@econfia.co")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", default=None)
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default=EMAIL_HOST_USER)
EMAIL_TIMEOUT = env.int("EMAIL_TIMEOUT", default=20)

if EMAIL_HOST_USER and EMAIL_HOST_PASSWORD:
    EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
else:
    EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"
    DEFAULT_FROM_EMAIL = "no-reply@estudio.local"
    print("??  EMAIL SMTP deshabilitado: faltan EMAIL_HOST_USER/EMAIL_HOST_PASSWORD. Usando consola.")

# --- i18n ---
LANGUAGE_CODE = "es-co"
TIME_ZONE = "America/Bogota"
USE_I18N = True
USE_TZ = True

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
