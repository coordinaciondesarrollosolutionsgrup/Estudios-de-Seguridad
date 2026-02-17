# apps/studies/views_pdf.py
from io import BytesIO
from datetime import datetime, date
from pathlib import Path
import logging

from django.http import HttpResponse, Http404
from django.shortcuts import get_object_or_404
from django.utils.html import escape
from django.conf import settings

from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.authentication import JWTAuthentication

from .models import Estudio, Academico, Laboral, Economica, AnexoFoto, EstudioDocumento

log = logging.getLogger(__name__)

# ----- WeasyPrint -----
try:
    from weasyprint import HTML, CSS
    _HAS_WEASY = True
except Exception:
    _HAS_WEASY = False

try:
    WEASY_BASE_URL = Path(settings.BASE_DIR).as_uri()
except Exception:
    WEASY_BASE_URL = str(settings.BASE_DIR)

# ----- CSS -----
PRINT_CSS = """
@page{
  size: A4;
  margin: 18mm 16mm;
  background: linear-gradient(180deg,#0a1430 0%, #0b1e44 45%, #0b1220 100%);
  @bottom-right { color:#d7e3ff; content: "pág. " counter(page) " / " counter(pages); }
}

:root{ --muted:#a9bbd6; --ink:#eef3ff; --primary:#1d4ed8; --accent:#22d3ee; --ok:#10b981; --err:#ef4444; }
html, body { color: var(--ink); }
body{ font:11pt 'Inter', system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; }
*{ hyphens:auto; overflow-wrap:anywhere; }

.header{
  margin:-12mm -16mm 8mm; padding:18mm 16mm 12mm;
  background:linear-gradient(180deg,rgba(11,18,32,.85) 0%, rgba(19,42,94,.92) 100%);
  border-bottom:1px solid rgba(255,255,255,.06);
}
.h1{ font-weight:800; font-size:20pt; margin:0 0 4mm; hyphens:none; word-break:normal; overflow-wrap:normal; }
.sub{ color:var(--muted); }
.chips{ margin-top:6mm; display:flex; gap:6mm; flex-wrap:wrap; }
.chip{ color:#fff; padding:3px 8px; border-radius:8px; font:9pt/1.4 sans-serif; display:inline-block; }
.chip--state{ background:var(--primary) } .chip--decision{ background:var(--ok) }
.chip--decision.no{ background:var(--err) } .chip--progress{ background:#0ea5e9 }

.section{ margin:8mm 0 4mm; display:flex; align-items:center; gap:6mm; page-break-after:avoid; }
.dot{ width:6mm; height:6mm; border-radius:2mm; background:var(--accent); }
.h2{ font-weight:700; font-size:12pt; color:#e6eeff; }

.card{
  background:rgba(255,255,255,.045);
  border:1px solid rgba(255,255,255,.10);
  border-radius:10px; padding:6mm;
  box-shadow: inset 0 10px 30px rgba(0,0,0,.25);
}
.card.nobreak{ break-inside: avoid; page-break-inside: avoid; }

.note{
  border:1px dashed rgba(245,158,11,.5); background:rgba(245,158,11,.12);
  color:#fde68a; padding:4mm; border-radius:8px; margin:4mm 0 0;
  break-inside: avoid; page-break-inside: avoid;
}

/* Tablas */
.table{ width:100%; table-layout:fixed; border-collapse:separate; border-spacing:0; margin-top:3mm }
.table thead{ display:table-header-group; }
.table th{
  background:#122243; color:#d7e3ff; text-align:left; padding:6px 8px;
  font-weight:700; font-size:10pt; vertical-align:top;
}
.table td{
  background:#0f172a; color:#eef3ff; padding:6px 8px; font-size:10pt;
  border-top:1px solid #20304f; vertical-align:top; word-break:break-word;
}
.table td.file a{ color:#93c5fd; text-decoration:underline; }
.table tr{ page-break-inside:avoid; }
.table tr:nth-child(even) td{ background:#0c152b }

.kvtable{ width:100%; table-layout:fixed; border-collapse:separate; border-spacing:0; }
.kvtable td{ padding:4px 8px; vertical-align:top; font-size:10.5pt; }
.kvk{ color:#c7d6f5; font-size:9pt; }
.kvtable col.k1{ width:18%; } .kvtable col.v1{ width:32%; }
.kvtable col.k2{ width:18%; } .kvtable col.v2{ width:32%; }

.small{ color:#b5c7e6; font-size:9pt; margin-top:6mm }

.imgthumb{
  width:58mm; height:38mm; object-fit:cover; border-radius:6px;
  border:1px solid rgba(255,255,255,.10); background:rgba(255,255,255,.04);
}
"""

# ----- Helpers -----
def _fmt(v): return "—" if v is None or v == "" else str(v)

def _fdate(dt):
    if not dt: return "—"
    if isinstance(dt, str): return dt
    if isinstance(dt, date) and not isinstance(dt, datetime):
        try: return dt.strftime("%d/%m/%Y")
        except Exception: return str(dt)
    try: return dt.strftime("%d/%m/%Y %H:%M")
    except Exception: return str(dt)

def _pct(x):
    try: return f"{int(round(float(x or 0)))}%"
    except Exception: return "0%"

def _yesno(v): return "Sí" if v is True else ("No" if v is False else "—")

def _money(v):
    try:
        n = float(v)
        return f"${n:,.0f}".replace(",", ".")
    except Exception:
        return _fmt(v)

def _age(born):
    try:
        if not isinstance(born, date): return "—"
        today = date.today()
        return today.year - born.year - ((today.month, today.day) < (born.month, born.day))
    except Exception:
        return "—"

def _human_module(tipo: str) -> str:
    t = (tipo or "").upper()
    if "ACADEM" in t: return "Académico"
    if "LABOR"  in t: return "Laboral"
    if "ECON"   in t: return "Información económica"
    if "CENTRAL" in t or "RESTRICT" in t: return "Centrales de riesgo"
    if "VISITA" in t or "ANEXO" in t or "FOTO" in t: return "Anexos fotográficos"
    if "DOC"    in t: return "Documentos"
    return "Módulo"

def _abs_file_url(request, filefield):
    """Devuelve URL absoluta http/https para un FileField (sirve FS o S3)."""
    if not filefield:
        return None
    try:
        url = filefield.url
    except Exception:
        url = None
    if not url:
        return None
    if url.startswith("http"):
        return url
    try:
        return request.build_absolute_uri(url)
    except Exception:
        base = getattr(settings, "PUBLIC_BASE_URL", "").rstrip("/")
        return f"{base}{url}" if base else url

def _filename(filefield):
    try:
        return Path(filefield.name).name
    except Exception:
        return None

# >>> Mostrar OBSERVADO si estado=VALIDADO y hay comentario
def _estado_obs_display(estado, comentario):
    e = (estado or "").upper()
    return "OBSERVADO" if (comentario and e == "VALIDADO") else (estado or "—")

# ----- HTML builder -----
def _build_html(est: Estudio, request) -> str:
    sol       = getattr(est, "solicitud", None)
    empresa   = getattr(sol, "empresa", None)
    candidato = getattr(sol, "candidato", None)

    empresa_name = _fmt(getattr(empresa, "nombre", None) or empresa)
    cand_name    = f"{_fmt(getattr(candidato, 'nombre', None))} {_fmt(getattr(candidato, 'apellido', None))}"
    cand_id      = _fmt(getattr(candidato, "cedula", None))

    items_qs  = est.items.all()
    total     = items_qs.count()
    validados = items_qs.filter(estado="VALIDADO").count()
    hallazgos = items_qs.filter(estado="HALLAZGO").count()

    irregularidades = (
        items_qs.filter(estado="HALLAZGO") |
        items_qs.exclude(comentario__isnull=True).exclude(comentario="")
    ).distinct()

    irr_head = "<tr><th>Módulo</th><th>Estado</th><th>Detalle</th></tr>"
    irr_body = "".join(
        f"<tr>"
        f"<td>{escape(_human_module(getattr(it,'tipo','')))}</td>"
        f"<td>{escape(_estado_obs_display(getattr(it,'estado',None), getattr(it,'comentario',None)))}</td>"
        f"<td>{escape(_fmt(getattr(it,'comentario', None)))}</td>"
        f"</tr>"
        for it in irregularidades
    )

    # ===== Candidato: KV =====
    if candidato:
        get_doc = getattr(candidato, "get_tipo_documento_display", None)
        doc_tipo = get_doc() if callable(get_doc) else _fmt(getattr(candidato, "tipo_documento", None))
        edad = _age(getattr(candidato, "fecha_nacimiento", None))

        dir_line = " ".join(x for x in [
            _fmt(getattr(candidato, "direccion", None)),
            f"Barrio {_fmt(getattr(candidato,'barrio',None))}" if getattr(candidato, "barrio", None) else "",
        ] if x and x != "—")
        muni_depto = " · ".join(x for x in [
            _fmt(getattr(candidato, "municipio_nombre", None)),
            _fmt(getattr(candidato, "departamento_nombre", None)),
        ] if x and x != "—")

        kv_pairs = [
            ("Identificación", f"{doc_tipo} {cand_id}"),
            ("Fecha nacimiento", f"{_fdate(getattr(candidato,'fecha_nacimiento', None))}{(' · ' + str(edad) + ' años') if isinstance(edad,int) else ''}"),
            ("Edad", edad if isinstance(edad,int) else "—"),
            ("Sexo", _fmt(getattr(candidato, "sexo", None))),
            ("Estatura", (str(getattr(candidato,"estatura_cm", "")) + " cm") if getattr(candidato,"estatura_cm",None) not in (None,"") else "—"),
            ("Grupo sanguíneo", _fmt(getattr(candidato, "grupo_sanguineo", None))),
            ("Teléfono", _fmt(getattr(candidato, "telefono", None))),
            ("Celular", _fmt(getattr(candidato, "celular", None))),
            ("Email", _fmt(getattr(candidato, "email", None))),
            ("Dirección", _fmt(dir_line)),
            ("Barrio", _fmt(getattr(candidato, "barrio", None))),
            ("Municipio / Depto", _fmt(muni_depto)),
            ("Zona", _fmt(getattr(candidato, "tipo_zona", None))),
            ("EPS", _fmt(getattr(candidato, "eps", None))),
            ("Caja compensación", _fmt(getattr(candidato, "caja_compensacion", None))),
            ("Fondo pensión", _fmt(getattr(candidato, "pension_fondo", None))),
            ("Fondo cesantías", _fmt(getattr(candidato, "cesantias_fondo", None))),
            ("SISBEN", _fmt(getattr(candidato, "sisben", None))),
        ]

        cand_rows = []
        for i in range(0, len(kv_pairs), 2):
            (k1, v1) = kv_pairs[i]
            k2, v2 = kv_pairs[i+1] if i+1 < len(kv_pairs) else ("", "")
            cand_rows.append(
                f"<tr>"
                f"<td class='kvk'>{escape(k1)}</td><td>{escape(_fmt(v1))}</td>"
                f"<td class='kvk'>{escape(k2)}</td><td>{escape(_fmt(v2))}</td>"
                f"</tr>"
            )
        cand_table = (
            "<table class='kvtable'>"
            "<colgroup><col class='k1'><col class='v1'><col class='k2'><col class='v2'></colgroup>"
            f"<tbody>{''.join(cand_rows)}</tbody></table>"
        )
    else:
        cand_table = "<div class='small'>Sin datos del candidato</div>"

    sections = []

    # ===== Académico =====
    acad = list(est.academicos.all())
    if acad:
        rows = []
        for a in acad:
            url = _abs_file_url(request, getattr(a, "archivo", None))
            name = _filename(getattr(a, "archivo", None)) or "archivo"
            soporte_cell = f'<a href="{escape(url)}">{escape(name)}</a>' if url else "—"
            rows.append(
                "<tr>"
                f"<td>{escape(_fmt(a.titulo))}</td>"
                f"<td>{escape(_fmt(a.institucion))}</td>"
                f"<td>{escape(_fdate(getattr(a,'fecha_graduacion', None)))}</td>"
                f"<td>{escape(_fmt(getattr(a,'ciudad', None)))}</td>"
                f"<td>{escape('Original' if getattr(a,'presenta_original', False) else 'Copia')}</td>"
                f"<td class='file'>{soporte_cell}</td>"
                "</tr>"
            )
        sections.append(f"""
          <section class="section"><span class="dot"></span><div class="h2">Académico</div></section>
          <div class="card">
            <table class="table">
              <colgroup>
                <col style="width:28%"><col style="width:20%"><col style="width:12%"><col style="width:12%"><col style="width:10%"><col style="width:18%">
              </colgroup>
              <thead><tr><th>Título</th><th>Institución</th><th>Graduación</th><th>Ciudad</th><th>Presenta</th><th>Soporte</th></tr></thead>
              <tbody>{''.join(rows)}</tbody>
            </table>
          </div>
        """)

    # ===== Laboral =====
    lab = list(est.laborales.all())
    if lab:
        rows = []
        for l in lab:
            url = _abs_file_url(request, getattr(l, "certificado", None))
            name = _filename(getattr(l, "certificado", None)) or "archivo"
            cert_cell = f'<a href="{escape(url)}">{escape(name)}</a>' if url else "—"
            rows.append(
                "<tr>"
                f"<td>{escape(_fmt(l.empresa))}</td>"
                f"<td>{escape(_fmt(getattr(l,'cargo', None)))}</td>"
                f"<td>{escape(_fdate(getattr(l,'ingreso', None)))}</td>"
                f"<td>{escape(_fdate(getattr(l,'retiro', None)))}</td>"
                f"<td>{escape(_fmt(getattr(l,'tipo_contrato', None)))}</td>"
                f"<td>{escape(_yesno(getattr(l,'volveria_contratar', None)))}</td>"
                f"<td class='file'>{cert_cell}</td>"
                "</tr>"
            )
        sections.append(f"""
          <section class="section"><span class="dot"></span><div class="h2">Laboral</div></section>
          <div class="card">
            <table class="table">
              <colgroup>
                <col style="width:22%"><col style="width:18%"><col style="width:12%"><col style="width:12%"><col style="width:12%"><col style="width:12%"><col style="width:12%">
              </colgroup>
              <thead><tr><th>Empresa</th><th>Cargo</th><th>Ingreso</th><th>Retiro</th><th>Contrato</th><th>¿Recontrataría?</th><th>Certificado</th></tr></thead>
              <tbody>{''.join(rows)}</tbody>
            </table>
          </div>
        """)

    # ===== Económica =====
    eco = list(est.economicas.all())
    if eco:
        rows = []
        for e in eco:
            rows.append(
                "<tr>"
                f"<td>{escape(_fmt(getattr(e,'central', '')))}</td>"
                f"<td>{_yesno(getattr(e,'registra_negativos', None))}</td>"
                f"<td>{escape(_money(getattr(e,'deuda_actual', None)))}</td>"
                f"<td>{_yesno(getattr(e,'acuerdo_pago', None))}</td>"
                f"<td>{escape(_fdate(getattr(e,'fecha_acuerdo', None)))}</td>"
                f"<td>{escape(_money(getattr(e,'valor_mensual', None)))}</td>"
                f"<td>{_yesno(getattr(e,'es_codeudor', None))}</td>"
                "</tr>"
            )
        sections.append(f"""
          <section class="section"><span class="dot"></span><div class="h2">Información económica</div></section>
          <div class="card">
            <table class="table">
              <colgroup>
                <col style="width:22%"><col style="width:12%"><col style="width:14%"><col style="width:12%"><col style="width:14%"><col style="width:12%"><col style="width:14%">
              </colgroup>
              <thead><tr><th>Central</th><th>Negativos</th><th>Deuda</th><th>Acuerdo</th><th>Fecha acuerdo</th><th>Cuota</th><th>¿Codeudor?</th></tr></thead>
              <tbody>{''.join(rows)}</tbody>
            </table>
          </div>
        """)

    # ===== Documentos / Centrales (links) =====
    docs = list(est.documentos.all())
    if docs:
        rows_docs = []
        rows_cent = []
        for d in docs:
            url = _abs_file_url(request, getattr(d, "archivo", None))
            nombre = d.nombre or (_filename(getattr(d, "archivo", None)) or "archivo")
            cell = f'<a href="{escape(url)}">{escape(nombre)}</a>' if url else escape(nombre)
            row = f"<tr><td class='file'>{cell}</td></tr>"
            (rows_cent if d.categoria == "CENTRALES" else rows_docs).append(row)

        if rows_docs:
            sections.append(f"""
              <section class="section"><span class="dot"></span><div class="h2">Documentos</div></section>
              <div class="card">
                <table class="table"><colgroup><col style="width:100%"></colgroup>
                  <thead><tr><th>Archivo</th></tr></thead><tbody>{''.join(rows_docs)}</tbody>
                </table>
              </div>
            """)
        if rows_cent:
            sections.append(f"""
              <section class="section"><span class="dot"></span><div class="h2">Centrales de riesgo</div></section>
              <div class="card">
                <table class="table"><colgroup><col style="width:100%"></colgroup>
                  <thead><tr><th>Archivo</th></tr></thead><tbody>{''.join(rows_cent)}</tbody>
                </table>
              </div>
            """)

    # ===== Anexos (thumbnail + link) =====
    anex = list(est.anexos_foto.all())
    if anex:
        thumbs = []
        for ax in anex:
            url = _abs_file_url(request, getattr(ax, "archivo", None))
            label = escape(_fmt(ax.get_tipo_display()))
            if url:
                thumbs.append(
                    f'<div style="display:inline-block;margin:3mm 3mm 0 0;text-align:center; page-break-inside:avoid;">'
                    f'<a href="{escape(url)}"><img class="imgthumb" src="{escape(url)}" alt="{label}"/></a>'
                    f'<div style="font-size:9pt;color:#c7d6f5;margin-top:2mm">{label}</div>'
                    f'</div>'
                )
            else:
                thumbs.append(
                    f'<span class="pill" style="margin-right:4mm">{label} · {"N/A" if ax.no_aplica else "Pend."}</span>'
                )
        sections.append(f"""
          <section class="section"><span class="dot"></span><div class="h2">Anexos fotográficos</div></section>
          <div class="card">{''.join(thumbs)}</div>
        """)

    # ===== Consentimientos =====
    cons_rows = []
    try:
        for c in est.consentimientos.all():
            cons_rows.append(
                f"<tr><td>{escape(_fmt(getattr(c,'tipo',None)))}</td>"
                f"<td>{'Aceptado' if getattr(c,'aceptado',False) else 'Pendiente'}</td>"
                f"<td>{escape(_fdate(getattr(c,'firmado_at',None)))}</td></tr>"
            )
    except Exception:
        cons_rows.append("<tr><td>—</td><td>—</td><td>—</td></tr>")

    decision     = (getattr(est, "decision_final", "") or "").upper()
    decision_cls = "chip--decision" + (" no" if decision == "NO_APTO" else "")

    enviado_at    = getattr(est, "enviado_at", None)
    finalizado_at = getattr(est, "finalizado_at", None)

    return f"""<!doctype html>
<html lang="es">
<head><meta charset="utf-8" /><style>{PRINT_CSS}</style></head>
<body>
  <header class="header">
    <div class="h1">ESTUDIO DE SEGURIDAD DE {escape(cand_name)}</div>
    <div class="sub">{escape(empresa_name)} · Cédula {escape(cand_id)}</div>
    <div class="chips">
      <span class="chip chip--state">ESTADO: {escape(_fmt(getattr(est, 'estado', None)))}</span>
      {f'<span class="chip {decision_cls}">DECISIÓN: {escape(_fmt(getattr(est,"decision_final", None)))}</span>' if getattr(est,'decision_final', None) else ''}
      <span class="chip chip--progress">PROGRESO: {_pct(getattr(est, 'progreso', 0))}</span>
    </div>
  </header>

  <section class="section"><span class="dot"></span><div class="h2">Datos del candidato</div></section>
  <div class="card">{cand_table}</div>

  <section class="section"><span class="dot"></span><div class="h2">Resumen</div></section>
  <div class="card nobreak">
    <div>Items: <b>{total}</b> · Validados: <b>{validados}</b> · Hallazgos: <b>{hallazgos}</b></div>
    <div>Autorización: <b>{'Firmada' if getattr(est,'autorizacion_firmada',False) else 'Pendiente'}</b></div>
    <div>Enviado: <b>{escape(_fdate(enviado_at))}</b> · Cerrado: <b>{escape(_fdate(finalizado_at))}</b></div>
    {f'<div class="note">{escape(_fmt(getattr(est,"observacion_analista", None)))}</div>' if getattr(est,'observacion_analista', None) else ''}
  </div>

  <section class="section"><span class="dot"></span><div class="h2">Irregularidades reportadas</div></section>
  <div class="card">
    <table class="table">
      <colgroup><col style="width:28%"><col style="width:18%"><col style="width:54%"></colgroup>
      <thead><tr><th>Módulo</th><th>Estado</th><th>Detalle</th></tr></thead>
      <tbody>{irr_body or '<tr><td colspan="3">Sin irregularidades.</td></tr>'}</tbody>
    </table>
  </div>

  {''.join(sections)}

  <section class="section"><span class="dot"></span><div class="h2">Consentimientos & autorización</div></section>
  <div class="card">
    <table class="table">
      <colgroup><col style="width:50%"><col style="width:20%"><col style="width:30%"></colgroup>
      <thead><tr><th>Tipo</th><th>Estado</th><th>Fecha firma</th></tr></thead>
      <tbody>{''.join(cons_rows)}</tbody>
    </table>
    <div class="small">Emitido por eConfia · {datetime.now().strftime("%d/%m/%Y %H:%M")}</div>
  </div>
</body>
</html>
"""

# ----- Render -----
def _render_pdf_weasy(html: str) -> bytes:
    return HTML(string=html, base_url=WEASY_BASE_URL).write_pdf(
        stylesheets=[CSS(string=PRINT_CSS)]
    )

def _render_pdf_fallback_reportlab(est: Estudio) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas
    buff = BytesIO(); c = canvas.Canvas(buff, pagesize=A4); w, h = A4
    y = h - 40
    c.setFont("Helvetica-Bold", 14); c.drawString(40, y, f"Estudio de seguridad #{est.id}")
    y -= 18; c.setFont("Helvetica", 10)
    sol = getattr(est, "solicitud", None); empresa = getattr(sol, "empresa", None); candidato = getattr(sol, "candidato", None)
    empresa_name = _fmt(getattr(empresa, "nombre", None) or empresa)
    cand_name = f"{_fmt(getattr(candidato, 'nombre', None))} {_fmt(getattr(candidato, 'apellido', None))}"
    cand_id = _fmt(getattr(candidato, "cedula", None))
    c.drawString(40, y, f"{empresa_name} · {cand_name} ({cand_id})"); y -= 16
    items_qs = est.items.all(); total = items_qs.count(); validados = items_qs.filter(estado="VALIDADO").count(); hallazgos = items_qs.filter(estado="HALLAZGO").count()
    c.drawString(40, y, f"Progreso: {_pct(getattr(est,'progreso',0))} · Items: {total} · Validados: {validados} · Hallazgos: {hallazgos}")
    y -= 16
    if getattr(est, "observacion_analista", None):
        c.setFont("Helvetica-Bold", 11); c.drawString(40, y, "Observación del analista:"); y -= 14
        c.setFont("Helvetica", 10)
        for chunk in [est.observacion_analista[i:i+95] for i in range(0, len(est.observacion_analista), 95)]:
            c.drawString(50, y, chunk); y -= 14
            if y < 60: c.showPage(); y = h - 40; c.setFont("Helvetica", 10)
    c.showPage(); c.save(); buff.seek(0); return buff.read()

def generar_pdf_estudio(est: Estudio, request):
    html = _build_html(est, request)
    if _HAS_WEASY:
        try:
            return _render_pdf_weasy(html), "weasy"
        except Exception as e:
            log.exception("WeasyPrint falló: %s", e)
    return _render_pdf_fallback_reportlab(est), "reportlab"

# ----- View -----
@api_view(["GET"])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def estudio_pdf(request, estudio_id):
    est = get_object_or_404(Estudio, pk=estudio_id)
    u = request.user; rol = getattr(u, "rol", None)
    if not (
        rol == "ADMIN"
        or (rol == "CLIENTE" and est.solicitud.empresa == getattr(u, "empresa", None))
        or (rol == "ANALISTA" and est.solicitud.analista_id == getattr(u, "id", None))
        or (rol == "CANDIDATO" and est.solicitud.candidato.email == u.email)
    ):
        raise Http404()

    if request.GET.get("debug") == "1":
        return HttpResponse(_build_html(est, request), content_type="text/html")

    pdf_bytes, renderer = generar_pdf_estudio(est, request)
    resp = HttpResponse(pdf_bytes, content_type="application/pdf")
    resp["Content-Disposition"] = f'attachment; filename="Estudio_{est.id}.pdf"'
    resp["X-PDF-Renderer"] = renderer
    return resp
