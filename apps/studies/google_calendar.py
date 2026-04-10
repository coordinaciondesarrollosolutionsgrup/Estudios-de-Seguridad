import logging
import os
from datetime import datetime
from zoneinfo import ZoneInfo

from django.conf import settings
from django.utils.crypto import get_random_string

logger = logging.getLogger(__name__)

CALENDAR_SCOPE = ["https://www.googleapis.com/auth/calendar"]


class GoogleCalendarConfigurationError(Exception):
    pass


class GoogleCalendarSyncError(Exception):
    pass


def google_calendar_integration_enabled():
    return bool(getattr(settings, "GOOGLE_CALENDAR_SYNC_ENABLED", False))


def _calendar_timezone():
    return (
        getattr(settings, "GOOGLE_CALENDAR_TIME_ZONE", "")
        or getattr(settings, "TIME_ZONE", "America/Bogota")
        or "America/Bogota"
    )


def _calendar_send_updates():
    return (getattr(settings, "GOOGLE_CALENDAR_SEND_UPDATES", "all") or "all").strip() or "all"


def _calendar_service():
    if not google_calendar_integration_enabled():
        raise GoogleCalendarConfigurationError("La integracion con Google Calendar esta deshabilitada.")

    service_account_file = (getattr(settings, "GOOGLE_CALENDAR_SERVICE_ACCOUNT_FILE", "") or "").strip()
    if not service_account_file:
        raise GoogleCalendarConfigurationError("Falta GOOGLE_CALENDAR_SERVICE_ACCOUNT_FILE.")
    if not os.path.exists(service_account_file):
        raise GoogleCalendarConfigurationError("No se encontro el archivo de credenciales de Google Calendar.")

    calendar_id = (getattr(settings, "GOOGLE_CALENDAR_ID", "primary") or "primary").strip() or "primary"
    impersonate_user = (getattr(settings, "GOOGLE_CALENDAR_IMPERSONATE_USER", "") or "").strip()

    if calendar_id == "primary" and not impersonate_user:
        raise GoogleCalendarConfigurationError(
            "Para usar el calendario primary debes configurar GOOGLE_CALENDAR_IMPERSONATE_USER o usar un calendario compartido."
        )

    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
        from googleapiclient.errors import HttpError
    except ImportError as exc:
        raise GoogleCalendarConfigurationError(
            "Faltan dependencias de Google Calendar. Instala google-api-python-client y google-auth-httplib2."
        ) from exc

    credentials = service_account.Credentials.from_service_account_file(
        service_account_file,
        scopes=CALENDAR_SCOPE,
    )
    if impersonate_user:
        credentials = credentials.with_subject(impersonate_user)

    try:
        service = build("calendar", "v3", credentials=credentials, cache_discovery=False)
    except HttpError as exc:
        raise GoogleCalendarSyncError(f"No se pudo inicializar Google Calendar: {exc}") from exc

    return service, calendar_id, HttpError


def _attendees_for_estudio(estudio):
    attendees = []
    seen = set()
    for person in (
        getattr(getattr(estudio, "solicitud", None), "candidato", None),
        getattr(getattr(estudio, "solicitud", None), "analista", None),
        getattr(getattr(estudio, "solicitud", None), "empresa", None),
    ):
        email = (getattr(person, "email", "") or "").strip()
        if not email:
            continue
        key = email.lower()
        if key in seen:
            continue
        seen.add(key)
        attendees.append({"email": email})
    return attendees


def _conference_meeting_url(event):
    conference_data = event.get("conferenceData") or {}
    for entry in conference_data.get("entryPoints") or []:
        uri = (entry.get("uri") or "").strip()
        if uri:
            return uri
    return (event.get("hangoutLink") or "").strip()


def _build_event_payload(estudio, reunion):
    slot = reunion.slot
    timezone_name = _calendar_timezone()
    tz = ZoneInfo(timezone_name)
    inicio = datetime.combine(slot.fecha, slot.hora_inicio, tzinfo=tz)
    fin = datetime.combine(slot.fecha, slot.hora_fin, tzinfo=tz)

    candidato = getattr(getattr(estudio, "solicitud", None), "candidato", None)
    analista = getattr(getattr(estudio, "solicitud", None), "analista", None)
    empresa = getattr(getattr(estudio, "solicitud", None), "empresa", None)

    descripcion = "\n".join(
        [
            f"Estudio #{estudio.id}",
            f"Candidato: {getattr(candidato, 'nombre', '') or getattr(candidato, 'email', '')}",
            f"Analista: {getattr(analista, 'username', '') or getattr(analista, 'email', '')}",
            f"Cliente: {getattr(empresa, 'nombre', '') or getattr(empresa, 'email', '')}",
        ]
    )

    return {
        "summary": f"Reunion virtual estudio #{estudio.id}",
        "description": descripcion,
        "start": {"dateTime": inicio.isoformat(), "timeZone": timezone_name},
        "end": {"dateTime": fin.isoformat(), "timeZone": timezone_name},
        "attendees": _attendees_for_estudio(estudio),
    }


def crear_evento_google_calendar(estudio, reunion):
    service, calendar_id, http_error = _calendar_service()
    payload = _build_event_payload(estudio, reunion)
    send_updates = _calendar_send_updates()

    try:
        if reunion.calendar_event_id:
            event = service.events().update(
                calendarId=calendar_id,
                eventId=reunion.calendar_event_id,
                body=payload,
                sendUpdates=send_updates,
            ).execute()
        else:
            payload["conferenceData"] = {
                "createRequest": {
                    "requestId": f"estudio-{estudio.id}-reunion-{reunion.id}-{get_random_string(8)}"
                }
            }
            event = service.events().insert(
                calendarId=calendar_id,
                body=payload,
                conferenceDataVersion=1,
                sendUpdates=send_updates,
            ).execute()
    except http_error as exc:
        raise GoogleCalendarSyncError(f"No se pudo crear la reunion en Google Calendar: {exc}") from exc

    meeting_url = _conference_meeting_url(event)
    if not meeting_url:
        raise GoogleCalendarSyncError("Google Calendar no devolvio un enlace de Google Meet para esta reunion.")

    return {
        "calendar_event_id": (event.get("id") or "").strip(),
        "meeting_url": meeting_url,
    }


def cancelar_evento_google_calendar(calendar_event_id):
    if not calendar_event_id:
        return False

    service, calendar_id, http_error = _calendar_service()
    send_updates = _calendar_send_updates()

    try:
        service.events().delete(
            calendarId=calendar_id,
            eventId=calendar_event_id,
            sendUpdates=send_updates,
        ).execute()
        return True
    except http_error as exc:
        raise GoogleCalendarSyncError(f"No se pudo cancelar la reunion en Google Calendar: {exc}") from exc
