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
@page {
  size: A4;
  margin: 0;
  @bottom-center {
    content: "eConfia · Estudio de Seguridad · Pag. " counter(page) " de " counter(pages);
    font-size: 8pt;
    color: #94a3b8;
    padding-bottom: 6mm;
  }
}

:root {
  --bg:       #0d1829;
  --surface:  #132035;
  --surface2: #1a2d48;
  --border:   #1e3a5f;
  --border2:  #2a4a72;
  --ink:      #e2e8f0;
  --ink2:     #cbd5e1;
  --muted:    #94a3b8;
  --primary:  #38bdf8;
  --primary2: #7dd3fc;
  --accent:   #0ea5e9;
  --ok:       #34d399;
  --ok-bg:    rgba(52,211,153,.15);
  --ok-brd:   rgba(52,211,153,.35);
  --err:      #f87171;
  --err-bg:   rgba(248,113,113,.15);
  --err-brd:  rgba(248,113,113,.35);
  --warn:     #fbbf24;
  --warn-bg:  rgba(251,191,36,.12);
  --warn-brd: rgba(251,191,36,.35);
  --blue-bg:  rgba(56,189,248,.10);
  --blue-brd: rgba(56,189,248,.25);
  --radius:   8px;
}

html, body {
  margin: 0; padding: 0;
  background: var(--bg);
  color: var(--ink);
  font: 10pt/1.5 'Segoe UI', system-ui, -apple-system, Helvetica, Arial, sans-serif;
}

* { box-sizing: border-box; hyphens: auto; overflow-wrap: anywhere; }

/* ── HEADER ─────────────────────────────── */
.page-header {
  background: linear-gradient(135deg, #060f1e 0%, #0b1f40 40%, #0f3460 70%, #1558a0 100%);
  padding: 10mm 16mm 8mm;
  color: #fff;
  page-break-inside: avoid;
  border-bottom: 2px solid #1d4ed8;
}
.header-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 5mm;
}
.brand {
  display: inline-flex;
  align-items: center;
  min-height: 12mm;
}
.brand img {
  max-height: 10mm;
  width: auto;
  display: block;
  object-fit: contain;
}
.brand-text {
  font-size: 13pt;
  font-weight: 800;
  letter-spacing: 3px;
  text-transform: uppercase;
  background: linear-gradient(90deg, #38bdf8, #818cf8);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
.report-meta {
  text-align: right;
  font-size: 8pt;
  color: #94a3b8;
  line-height: 1.7;
}
.header-title {
  font-size: 20pt;
  font-weight: 800;
  letter-spacing: -.5px;
  margin: 0 0 1mm;
  line-height: 1.2;
  color: #f1f5f9;
}
.header-title-company {
  font-size: 11pt;
  font-weight: 600;
  color: #93c5fd;
  margin-left: 2mm;
}
.header-sub {
  font-size: 10pt;
  color: #94a3b8;
  margin-bottom: 5mm;
}
.chips {
  display: flex;
  gap: 3mm;
  flex-wrap: wrap;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 1.5mm;
  padding: 3px 11px;
  border-radius: 20px;
  font-size: 8pt;
  font-weight: 700;
  letter-spacing: .4px;
  text-transform: uppercase;
  border: 1.5px solid rgba(56,189,248,.3);
  background: rgba(56,189,248,.12);
  color: #7dd3fc;
}
.chip--apto   { background: rgba(52,211,153,.2); border-color: rgba(52,211,153,.5); color: #34d399; }
.chip--noapto { background: rgba(248,113,113,.2); border-color: rgba(248,113,113,.5); color: #f87171; }
.chip--prog   { background: rgba(14,165,233,.15); border-color: rgba(14,165,233,.35); }
.chip--bajo   { background: rgba(52,211,153,.2);  border-color: rgba(52,211,153,.5);  color: #34d399; }
.chip--medio  { background: rgba(251,191,36,.15); border-color: rgba(251,191,36,.4);  color: #fbbf24; }
.chip--alto   { background: rgba(251,146,60,.2);  border-color: rgba(251,146,60,.5);  color: #fb923c; }
.chip--critico{ background: rgba(248,113,113,.2); border-color: rgba(248,113,113,.5); color: #f87171; }

/* ── BODY WRAPPER ────────────────────────── */
.body-wrap {
  padding: 8mm 16mm 12mm;
  background: var(--bg);
}

/* ── PROFILE BLOCK ───────────────────────── */
.profile-block {
  display: flex;
  gap: 6mm;
  margin-bottom: 6mm;
  break-inside: avoid;
  page-break-inside: avoid;
}
.profile-photo {
  flex-shrink: 0;
  width: 32mm;
  height: 40mm;
  border-radius: 8px;
  overflow: hidden;
  border: 2px solid var(--border2);
  background: var(--surface2);
}
.profile-photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.profile-data {
  flex: 1;
}

/* ── SECTION HEADING ─────────────────────── */
.sec-head {
  display: flex;
  align-items: center;
  gap: 3mm;
  margin: 7mm 0 2.5mm;
  page-break-after: avoid;
}
.sec-bar {
  width: 3mm;
  height: 5mm;
  border-radius: 2px;
  background: linear-gradient(180deg, #38bdf8, #818cf8);
  flex-shrink: 0;
}
.sec-title {
  font-size: 9.5pt;
  font-weight: 700;
  color: #38bdf8;
  text-transform: uppercase;
  letter-spacing: 1px;
}
.sec-line {
  flex: 1;
  height: 1px;
  background: var(--border);
}

/* ── CARD ────────────────────────────────── */
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 5mm;
}
.card.nobreak { break-inside: avoid; page-break-inside: avoid; }

/* ── KV TABLE ────────────────────────────── */
.kvtable {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
}
.kvtable td {
  padding: 2.5px 6px;
  vertical-align: top;
  font-size: 9pt;
}
.kvk {
  color: var(--muted);
  font-size: 8pt;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .4px;
  white-space: nowrap;
}
.kvv {
  color: var(--ink);
  font-weight: 500;
  border-bottom: 1px solid var(--border);
}
.kvtable col.k { width: 19%; }
.kvtable col.v { width: 31%; }

/* ── DATA TABLE ──────────────────────────── */
.dtable {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  font-size: 9pt;
  margin-top: 2mm;
}
.dtable thead tr {
  background: linear-gradient(90deg, #0f2d52, #163d6e);
}
.dtable th {
  color: #7dd3fc;
  text-align: left;
  padding: 4px 7px;
  font-weight: 700;
  font-size: 8pt;
  text-transform: uppercase;
  letter-spacing: .5px;
  border-bottom: 1px solid var(--border2);
}
.dtable td {
  padding: 4px 7px;
  color: var(--ink2);
  border-bottom: 1px solid var(--border);
  vertical-align: top;
  word-break: break-word;
}
.dtable tr:nth-child(even) td { background: rgba(255,255,255,.025); }
.dtable tr { page-break-inside: avoid; }
.dtable td a { color: var(--primary); text-decoration: none; }

/* ── SUMMARY GRID ────────────────────────── */
.summary-grid {
  display: flex;
  gap: 4mm;
  flex-wrap: wrap;
}
.summary-cell {
  flex: 1;
  min-width: 28mm;
  background: var(--surface2);
  border: 1px solid var(--border2);
  border-radius: 6px;
  padding: 3mm 4mm;
  text-align: center;
}
.summary-cell .num {
  font-size: 20pt;
  font-weight: 800;
  color: var(--primary);
  line-height: 1;
}
.summary-cell .lbl {
  font-size: 8pt;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: .4px;
  margin-top: 1mm;
}
.progress-bar-wrap {
  background: var(--border);
  border-radius: 20px;
  height: 5px;
  margin-top: 3mm;
  overflow: hidden;
}
.progress-bar-fill {
  height: 5px;
  border-radius: 20px;
  background: linear-gradient(90deg, #1d4ed8, #38bdf8);
}

/* ── RISK METER ──────────────────────────── */
.risk-cell {
  flex: 1;
  min-width: 28mm;
  border-radius: 6px;
  padding: 3mm 4mm;
  text-align: center;
  border: 1px solid;
}
.risk-cell.bajo    { background: rgba(52,211,153,.12); border-color: rgba(52,211,153,.35); }
.risk-cell.medio   { background: rgba(251,191,36,.10); border-color: rgba(251,191,36,.35); }
.risk-cell.alto    { background: rgba(251,146,60,.12); border-color: rgba(251,146,60,.40); }
.risk-cell.critico { background: rgba(248,113,113,.14);border-color: rgba(248,113,113,.45); }
.risk-cell .rlbl { font-size: 8pt; color: var(--muted); text-transform: uppercase; letter-spacing:.4px; margin-bottom:1mm; }
.risk-cell .rnum { font-size: 20pt; font-weight: 800; line-height: 1; }
.risk-cell.bajo    .rnum { color: #34d399; }
.risk-cell.medio   .rnum { color: #fbbf24; }
.risk-cell.alto    .rnum { color: #fb923c; }
.risk-cell.critico .rnum { color: #f87171; }
.risk-cell .rnivel { font-size: 9pt; font-weight: 700; text-transform: uppercase; letter-spacing:.5px; margin-top:1mm; }
.risk-cell.bajo    .rnivel { color: #34d399; }
.risk-cell.medio   .rnivel { color: #fbbf24; }
.risk-cell.alto    .rnivel { color: #fb923c; }
.risk-cell.critico .rnivel { color: #f87171; }

/* ── NOTE / WARNING ──────────────────────── */
.note {
  border-left: 3px solid var(--warn);
  background: var(--warn-bg);
  color: #fbbf24;
  padding: 3mm 4mm;
  border-radius: 0 6px 6px 0;
  font-size: 9pt;
  margin-top: 3mm;
  break-inside: avoid;
}

/* ── HEAT MAP ────────────────────────────── */
.heatmap-wrap { margin: 3mm 0 4mm; }
.heatmap-bar {
  display: flex;
  height: 9mm;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--border2);
}
.hm-seg {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-size: 7pt;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .6px;
  color: rgba(255,255,255,.45);
  opacity: .4;
}
.hm-seg.hm-active {
  opacity: 1;
  color: #fff;
}
.hm-seg.hm-active .hm-arrow { display: block; }
.hm-arrow { display: none; font-size: 6pt; margin-bottom: 1px; }
.hm-bajo    { background: linear-gradient(180deg, #065f46, #059669); }
.hm-medio   { background: linear-gradient(180deg, #78350f, #d97706); }
.hm-alto    { background: linear-gradient(180deg, #7c2d12, #ea580c); }
.hm-critico { background: linear-gradient(180deg, #7f1d1d, #dc2626); }
.heatmap-labels {
  display: flex;
  margin-top: 1.5mm;
  font-size: 7.5pt;
  color: var(--muted);
}
.heatmap-labels span { flex: 1; text-align: center; }
.score-gauge {
  position: relative;
  height: 4mm;
  margin-top: 2mm;
  background: linear-gradient(90deg, #059669 0%, #d97706 40%, #ea580c 65%, #dc2626 100%);
  border-radius: 20px;
  overflow: visible;
}
.score-marker {
  position: absolute;
  top: -1.5mm;
  width: 3mm;
  height: 7mm;
  background: #fff;
  border-radius: 2px;
  border: 1.5px solid rgba(0,0,0,.4);
  transform: translateX(-50%);
  box-shadow: 0 0 4px rgba(0,0,0,.5);
}

.matrix-wrap { border-top: 1px solid var(--border); padding-top: 3mm; }
.matrix-legend {
  text-align: center;
  font-size: 8pt;
  color: var(--muted);
  margin-bottom: 2mm;
}
.risk-matrix {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2mm;
}
.matrix-cell {
  min-height: 12mm;
  border: 1px solid var(--border2);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  text-transform: uppercase;
  font-size: 8pt;
  font-weight: 700;
  opacity: .72;
}
.matrix-cell.m-low-low { background: rgba(52,211,153,.16); color: #34d399; }
.matrix-cell.m-low-high { background: rgba(251,191,36,.16); color: #fbbf24; }
.matrix-cell.m-high-low { background: rgba(251,146,60,.17); color: #fb923c; }
.matrix-cell.m-high-high { background: rgba(248,113,113,.18); color: #f87171; }
.matrix-cell.matrix-active {
  opacity: 1;
  border-color: #e2e8f0;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.2);
}
.matrix-axes {
  display: flex;
  justify-content: space-between;
  margin-top: 2mm;
  font-size: 7.5pt;
  color: var(--muted);
}

.traffic-wrap { border-top: 1px solid var(--border); padding-top: 3mm; }
.traffic-header {
  text-align: center;
  font-size: 8pt;
  color: var(--muted);
  margin-bottom: 2mm;
}
.traffic-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 2mm;
}
.traffic-item {
  border: 1px solid var(--border2);
  border-radius: 6px;
  min-height: 13mm;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  opacity: .68;
}
.traffic-item span {
  font-size: 7pt;
  letter-spacing: .4px;
  text-transform: uppercase;
}
.traffic-item b {
  font-size: 8pt;
  font-weight: 700;
}
.traffic-item:nth-child(1) { background: rgba(52,211,153,.14); color: #34d399; }
.traffic-item:nth-child(2) { background: rgba(251,191,36,.12); color: #fbbf24; }
.traffic-item:nth-child(3) { background: rgba(251,146,60,.13); color: #fb923c; }
.traffic-item:nth-child(4) { background: rgba(248,113,113,.15); color: #f87171; }
.traffic-item.active {
  opacity: 1;
  border-color: #e2e8f0;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.18);
}

/* ── EXEC SUMMARY ────────────────────────── */
.exec-block {
  display: flex;
  gap: 6mm;
  align-items: flex-start;
}
.exec-score-box {
  flex-shrink: 0;
  width: 36mm;
  border-radius: 8px;
  padding: 4mm 3mm;
  text-align: center;
  border: 1.5px solid;
}
.exec-score-box.bajo    { background: rgba(52,211,153,.12); border-color: rgba(52,211,153,.4); }
.exec-score-box.medio   { background: rgba(251,191,36,.10); border-color: rgba(251,191,36,.4); }
.exec-score-box.alto    { background: rgba(251,146,60,.12); border-color: rgba(251,146,60,.45); }
.exec-score-box.critico { background: rgba(248,113,113,.14);border-color: rgba(248,113,113,.5); }
.exec-score-box .elbl { font-size: 7.5pt; color: var(--muted); text-transform: uppercase; letter-spacing:.5px; }
.exec-score-box .enum { font-size: 26pt; font-weight: 900; line-height: 1; margin: 1mm 0; }
.exec-score-box.bajo    .enum { color: #34d399; }
.exec-score-box.medio   .enum { color: #fbbf24; }
.exec-score-box.alto    .enum { color: #fb923c; }
.exec-score-box.critico .enum { color: #f87171; }
.exec-score-box .enivel { font-size: 9pt; font-weight: 800; text-transform: uppercase; letter-spacing:.6px; }
.exec-score-box.bajo    .enivel { color: #34d399; }
.exec-score-box.medio   .enivel { color: #fbbf24; }
.exec-score-box.alto    .enivel { color: #fb923c; }
.exec-score-box.critico .enivel { color: #f87171; }
.exec-text { flex: 1; }
.exec-text p { margin: 0 0 2mm; font-size: 9.5pt; color: var(--ink2); line-height: 1.6; }
.exec-text p.lead { font-size: 10.5pt; color: var(--ink); font-weight: 600; margin-bottom: 2.5mm; }
.exec-bullets { list-style: none; margin: 0; padding: 0; }
.exec-bullets li { padding: 1.5px 0 1.5px 4mm; font-size: 9pt; color: var(--ink2); position: relative; }
.exec-bullets li::before { content: "›"; position: absolute; left: 0; color: var(--primary); font-weight: 700; }

/* ── PHOTO GRID ──────────────────────────── */
.photo-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 4mm;
  margin-top: 1mm;
}
.photo-item {
  break-inside: avoid;
  page-break-inside: avoid;
  text-align: center;
}
.photo-item img {
  width: 52mm;
  height: 38mm;
  object-fit: cover;
  border-radius: 6px;
  border: 1.5px solid var(--border2);
  display: block;
}
.photo-label {
  font-size: 8pt;
  color: var(--muted);
  margin-top: 1.5mm;
  text-align: center;
}

/* ── STATUS BADGE ────────────────────────── */
.badge {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 12px;
  font-size: 8pt;
  font-weight: 700;
  text-transform: uppercase;
}
.badge--ok   { background: var(--ok-bg);   color: var(--ok);   border: 1px solid var(--ok-brd); }
.badge--err  { background: var(--err-bg);  color: var(--err);  border: 1px solid var(--err-brd); }
.badge--warn { background: var(--warn-bg); color: var(--warn); border: 1px solid var(--warn-brd); }
.badge--blue { background: var(--blue-bg); color: var(--primary); border: 1px solid var(--blue-brd); }

/* ── FOOTER ──────────────────────────────── */
.report-footer {
  margin-top: 8mm;
  padding-top: 4mm;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 8pt;
  color: var(--muted);
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

def _normalize_report_style(style_raw):
    s = (style_raw or "").strip().lower()
    if s in ("gerencial", "investigativo", "cumplimiento"):
        return s
    return "gerencial"

# >>> Mostrar OBSERVADO si estado=VALIDADO y hay comentario
def _estado_obs_display(estado, comentario):
    e = (estado or "").upper()
    return "OBSERVADO" if (comentario and e == "VALIDADO") else (estado or "—")

# ----- HTML builder -----
def _build_html(est: Estudio, request, report_style="gerencial") -> str:
    sol       = getattr(est, "solicitud", None)
    empresa   = getattr(sol, "empresa", None)
    candidato = getattr(sol, "candidato", None)

    empresa_name = _fmt(getattr(empresa, "nombre", None) or empresa)
    empresa_logo_url = (getattr(empresa, "logo_url", None) or "").strip()
    if empresa_logo_url and not empresa_logo_url.startswith(("http://", "https://")) and request:
        try:
            empresa_logo_url = request.build_absolute_uri(empresa_logo_url)
        except Exception:
            pass
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
            url  = _abs_file_url(request, getattr(a, "archivo", None))
            name = _filename(getattr(a, "archivo", None)) or "Soporte"
            soporte_cell = f'<a href="{escape(url)}">{escape(name)}</a>' if url else "—"
            rows.append(
                "<tr>"
                f"<td>{escape(_fmt(a.titulo))}</td>"
                f"<td>{escape(_fmt(a.institucion))}</td>"
                f"<td>{escape(_fdate(getattr(a,'fecha_graduacion', None)))}</td>"
                f"<td>{escape(_fmt(getattr(a,'ciudad', None)))}</td>"
                f"<td>{'Original' if getattr(a,'presenta_original', False) else 'Copia'}</td>"
                f"<td>{soporte_cell}</td>"
                "</tr>"
            )
        sections.append(
            '<div class="sec-head"><div class="sec-bar"></div><div class="sec-title">Academico</div><div class="sec-line"></div></div>'
            '<div class="card"><table class="dtable">'
            '<colgroup><col style="width:28%"><col style="width:22%"><col style="width:12%"><col style="width:12%"><col style="width:10%"><col style="width:16%"></colgroup>'
            '<thead><tr><th>Titulo</th><th>Institucion</th><th>Graduacion</th><th>Ciudad</th><th>Presenta</th><th>Soporte</th></tr></thead>'
            f'<tbody>{"".join(rows)}</tbody></table></div>'
        )

    # ===== Laboral =====
    lab = list(est.laborales.all())
    if lab:
        rows = []
        for l in lab:
            url  = _abs_file_url(request, getattr(l, "certificado", None))
            name = _filename(getattr(l, "certificado", None)) or "Certificado"
            cert_cell = f'<a href="{escape(url)}">{escape(name)}</a>' if url else "—"
            rec = _yesno(getattr(l, "volveria_contratar", None))
            rec_badge = (
                '<span class="badge badge--ok">Si</span>' if rec == "Sí" else
                '<span class="badge badge--err">No</span>' if rec == "No" else rec
            )
            rows.append(
                "<tr>"
                f"<td>{escape(_fmt(l.empresa))}</td>"
                f"<td>{escape(_fmt(getattr(l,'cargo', None)))}</td>"
                f"<td>{escape(_fdate(getattr(l,'ingreso', None)))}</td>"
                f"<td>{escape(_fdate(getattr(l,'retiro', None)))}</td>"
                f"<td>{escape(_fmt(getattr(l,'tipo_contrato', None)))}</td>"
                f"<td>{rec_badge}</td>"
                f"<td>{cert_cell}</td>"
                "</tr>"
            )
        sections.append(
            '<div class="sec-head"><div class="sec-bar"></div><div class="sec-title">Laboral</div><div class="sec-line"></div></div>'
            '<div class="card"><table class="dtable">'
            '<colgroup><col style="width:22%"><col style="width:18%"><col style="width:11%"><col style="width:11%"><col style="width:13%"><col style="width:10%"><col style="width:15%"></colgroup>'
            '<thead><tr><th>Empresa</th><th>Cargo</th><th>Ingreso</th><th>Retiro</th><th>Contrato</th><th>Recontratar</th><th>Certificado</th></tr></thead>'
            f'<tbody>{"".join(rows)}</tbody></table></div>'
        )

    # ===== Económica =====
    eco = list(est.economicas.all())
    if eco:
        rows = []
        for e in eco:
            neg = _yesno(getattr(e, "registra_negativos", None))
            neg_cell = (
                '<span class="badge badge--err">Si</span>' if neg == "Sí" else
                '<span class="badge badge--ok">No</span>'  if neg == "No" else neg
            )
            rows.append(
                "<tr>"
                f"<td>{escape(_fmt(getattr(e,'central','')))}</td>"
                f"<td>{neg_cell}</td>"
                f"<td>{escape(_money(getattr(e,'deuda_actual', None)))}</td>"
                f"<td>{_yesno(getattr(e,'acuerdo_pago', None))}</td>"
                f"<td>{escape(_fdate(getattr(e,'fecha_acuerdo', None)))}</td>"
                f"<td>{escape(_money(getattr(e,'valor_mensual', None)))}</td>"
                f"<td>{_yesno(getattr(e,'es_codeudor', None))}</td>"
                "</tr>"
            )
        sections.append(
            '<div class="sec-head"><div class="sec-bar"></div><div class="sec-title">Informacion economica</div><div class="sec-line"></div></div>'
            '<div class="card"><table class="dtable">'
            '<colgroup><col style="width:20%"><col style="width:11%"><col style="width:13%"><col style="width:11%"><col style="width:14%"><col style="width:11%"><col style="width:20%"></colgroup>'
            '<thead><tr><th>Central</th><th>Negativos</th><th>Deuda</th><th>Acuerdo</th><th>Fecha acuerdo</th><th>Cuota</th><th>Codeudor</th></tr></thead>'
            f'<tbody>{"".join(rows)}</tbody></table></div>'
        )

    # ===== Documentos / Centrales =====
    docs = list(est.documentos.all())
    if docs:
        rows_docs, rows_cent = [], []
        for d in docs:
            url    = _abs_file_url(request, getattr(d, "archivo", None))
            nombre = d.nombre or (_filename(getattr(d, "archivo", None)) or "Archivo")
            icon   = "📄 "
            cell   = f'<a href="{escape(url)}">{icon}{escape(nombre)}</a>' if url else f'{icon}{escape(nombre)}'
            row    = f"<tr><td>{cell}</td></tr>"
            (rows_cent if d.categoria == "CENTRALES" else rows_docs).append(row)

        if rows_docs:
            sections.append(
                '<div class="sec-head"><div class="sec-bar"></div><div class="sec-title">Documentos</div><div class="sec-line"></div></div>'
                '<div class="card"><table class="dtable"><colgroup><col style="width:100%"></colgroup>'
                f'<thead><tr><th>Archivo</th></tr></thead><tbody>{"".join(rows_docs)}</tbody></table></div>'
            )
        if rows_cent:
            sections.append(
                '<div class="sec-head"><div class="sec-bar"></div><div class="sec-title">Centrales de riesgo</div><div class="sec-line"></div></div>'
                '<div class="card"><table class="dtable"><colgroup><col style="width:100%"></colgroup>'
                f'<thead><tr><th>Archivo</th></tr></thead><tbody>{"".join(rows_cent)}</tbody></table></div>'
            )

    # ===== Anexos fotográficos (solo los que tienen archivo) =====
    anex = list(est.anexos_foto.all())
    photos_with_url = []
    for ax in anex:
        url = _abs_file_url(request, getattr(ax, "archivo", None))
        if url:
            try:
                label = escape(_fmt(ax.get_tipo_display()))
            except Exception:
                label = "Foto"
            photos_with_url.append((url, label))

    if photos_with_url:
        items_html = "".join(
            f'<div class="photo-item">'
            f'<a href="{escape(u)}"><img src="{escape(u)}" alt="{lbl}"/></a>'
            f'<div class="photo-label">{lbl}</div>'
            f'</div>'
            for u, lbl in photos_with_url
        )
        sections.append(
            '<div class="sec-head"><div class="sec-bar"></div><div class="sec-title">Anexos fotograficos</div><div class="sec-line"></div></div>'
            f'<div class="card"><div class="photo-grid">{items_html}</div></div>'
        )

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

    # ── foto perfil del candidato ──
    foto_url = None
    if candidato:
        try:
            if getattr(candidato, "foto", None):
                foto_url = _abs_file_url(request, candidato.foto)
            if not foto_url:
                s = getattr(candidato, "soportes", None)
                if s:
                    sp = s.filter(tipo="FOTO_FRENTE").order_by("-id").first()
                    if sp:
                        foto_url = _abs_file_url(request, getattr(sp, "archivo", None))
        except Exception:
            foto_url = None

    photo_block = (
        f'<div class="profile-photo"><img src="{escape(foto_url)}" alt="Foto candidato"/></div>'
        if foto_url else ""
    )

    pct_val  = int(round(float(getattr(est, "progreso", 0) or 0)))
    decision = (getattr(est, "decision_final", "") or "").upper()
    dec_chip = ""
    if decision == "APTO":
        dec_chip = '<span class="chip chip--apto">APTO</span>'
    elif decision in ("NO_APTO", "NO APTO"):
        dec_chip = '<span class="chip chip--noapto">NO APTO</span>'

    # Score y nivel de riesgo
    score_val   = getattr(est, "score_cuantitativo", None)
    nivel_raw   = (getattr(est, "nivel_cualitativo", None) or "").upper()
    score_int   = int(round(float(score_val))) if score_val is not None else None
    nivel_css   = nivel_raw.lower() if nivel_raw in ("BAJO", "MEDIO", "ALTO", "CRITICO") else "bajo"
    nivel_label = nivel_raw or "—"
    riesgo_chip_cls = {
        "BAJO":    "chip--bajo",
        "MEDIO":   "chip--medio",
        "ALTO":    "chip--alto",
        "CRITICO": "chip--critico",
    }.get(nivel_raw, "")
    if nivel_raw:
        dec_chip += f' <span class="chip {riesgo_chip_cls}">Riesgo {nivel_label}</span>'

    # ── Mapa de calor ──
    _hm_active = lambda seg: "hm-active" if nivel_raw == seg else ""
    hm_bajo    = _hm_active("BAJO")
    hm_medio   = _hm_active("MEDIO")
    hm_alto    = _hm_active("ALTO")
    hm_critico = _hm_active("CRITICO")

    # Posición del marcador en la barra de gradiente (0-100%)
    marker_pct = min(max(score_int if score_int is not None else 0, 0), 100)
    score_display = f"{score_int}%" if score_int is not None else "—"

    # ── Resumen ejecutivo dinámico ──
    style_label_map = {
        "gerencial": "Gerencial",
        "investigativo": "Investigativo",
        "cumplimiento": "Cumplimiento",
    }
    style_title = style_label_map.get(report_style, "Gerencial")
    _exec_texts = {
        "BAJO": (
            f"El candidato {escape(cand_name)} presenta un perfil de <strong>bajo riesgo</strong>. "
            f"Los modulos verificados no arrojaron irregularidades significativas.",
            [
                "Historial academico y laboral consistente con lo declarado.",
                "Sin hallazgos criticos en centrales de riesgo ni antecedentes.",
                "Se recomienda proceder con el proceso de vinculacion.",
            ]
        ),
        "MEDIO": (
            f"El candidato {escape(cand_name)} presenta un riesgo <strong>moderado</strong>. "
            f"Se identificaron elementos que ameritan revision antes de tomar una decision.",
            [
                f"Se encontraron {hallazgos} hallazgo(s) que requieren atencion.",
                "Revisar los modulos marcados con observaciones antes de decidir.",
                "Se recomienda solicitar documentacion adicional si es necesario.",
            ]
        ),
        "ALTO": (
            f"El candidato {escape(cand_name)} presenta un nivel de riesgo <strong>alto</strong>. "
            f"Se identificaron irregularidades relevantes que deben analizarse con detenimiento.",
            [
                f"Se registraron {hallazgos} hallazgo(s) con impacto significativo.",
                "Las inconsistencias encontradas representan un riesgo para la organizacion.",
                "Se recomienda revision por un analista senior antes de cualquier decision.",
            ]
        ),
        "CRITICO": (
            f"El candidato {escape(cand_name)} presenta un nivel de riesgo <strong>critico</strong>. "
            f"Los hallazgos encontrados son de alta gravedad.",
            [
                f"Se detectaron {hallazgos} hallazgo(s) criticos en el estudio.",
                "Las irregularidades identificadas representan un riesgo inaceptable.",
                "Se recomienda NO proceder con la vinculacion del candidato.",
            ]
        ),
    }
    exec_lead, exec_bullets_list = _exec_texts.get(nivel_raw, (
        f"El estudio del candidato {escape(cand_name)} se encuentra en proceso de evaluacion.",
        ["Pendiente de completar todos los modulos del estudio."]
    ))
    if report_style == "investigativo":
        exec_lead = (
            f"Analisis investigativo: el perfil de {escape(cand_name)} se clasifica en "
            f"<strong>riesgo {nivel_label.lower()}</strong> con score {score_display}."
        )
        exec_bullets_list = [
            f"Total de hallazgos identificados: {hallazgos}.",
            "Priorizar validacion de identidad, coherencia laboral y soporte documental.",
            "Escalar hallazgos de alto impacto a revision de segundo analista.",
        ]
    elif report_style == "cumplimiento":
        exec_lead = (
            f"Resumen de cumplimiento para {escape(cand_name)}: resultado "
            f"<strong>{nivel_label}</strong> con trazabilidad de evidencias."
        )
        exec_bullets_list = [
            "Consolidar evidencias de debida diligencia y fuentes consultadas.",
            "Registrar decision y justificacion del analista en el expediente.",
            "Aplicar seguimiento reforzado cuando el riesgo sea ALTO o CRITICO.",
        ]
    exec_bullets_html = "".join(f"<li>{b}</li>" for b in exec_bullets_list)

    matrix_cell = {
        "BAJO": "m-low-low",
        "MEDIO": "m-low-high",
        "ALTO": "m-high-low",
        "CRITICO": "m-high-high",
    }.get(nivel_raw, "m-low-low")
    heatmap_html = f"""
  <div class="heatmap-wrap">
    <div class="heatmap-bar">
      <div class="hm-seg hm-bajo { hm_bajo }">
        <span class="hm-arrow">&#9660;</span>BAJO
      </div>
      <div class="hm-seg hm-medio { hm_medio }">
        <span class="hm-arrow">&#9660;</span>MEDIO
      </div>
      <div class="hm-seg hm-alto { hm_alto }">
        <span class="hm-arrow">&#9660;</span>ALTO
      </div>
      <div class="hm-seg hm-critico { hm_critico }">
        <span class="hm-arrow">&#9660;</span>CRITICO
      </div>
    </div>
    <div class="heatmap-labels">
      <span>0 &ndash; 24%</span>
      <span>25 &ndash; 49%</span>
      <span>50 &ndash; 74%</span>
      <span>75 &ndash; 100%</span>
    </div>
    <div class="score-gauge" style="margin-top:3mm;">
      <div class="score-marker" style="left:{ marker_pct }%;"></div>
    </div>
    <div style="text-align:center;font-size:8pt;color:#94a3b8;margin-top:2mm;">
      Posicion del score ({ score_display }) en la escala de riesgo
    </div>
  </div>
"""
    if report_style == "investigativo":
        heatmap_html = f"""
  <div class="heatmap-wrap matrix-wrap">
    <div class="matrix-legend">Probabilidad x Impacto</div>
    <div class="risk-matrix">
      <div class="matrix-cell m-low-low {'matrix-active' if matrix_cell == 'm-low-low' else ''}">Bajo</div>
      <div class="matrix-cell m-low-high {'matrix-active' if matrix_cell == 'm-low-high' else ''}">Medio</div>
      <div class="matrix-cell m-high-low {'matrix-active' if matrix_cell == 'm-high-low' else ''}">Alto</div>
      <div class="matrix-cell m-high-high {'matrix-active' if matrix_cell == 'm-high-high' else ''}">Critico</div>
    </div>
    <div class="matrix-axes">
      <span>Probabilidad baja</span><span>Probabilidad alta</span>
    </div>
    <div style="text-align:center;font-size:8pt;color:#94a3b8;margin-top:2mm;">
      Clasificacion activa: { nivel_label } ({ score_display })
    </div>
  </div>
"""
    elif report_style == "cumplimiento":
        heatmap_html = f"""
  <div class="heatmap-wrap traffic-wrap">
    <div class="traffic-header">Semaforo de riesgo para debida diligencia</div>
    <div class="traffic-row">
      <div class="traffic-item {'active' if nivel_raw == 'BAJO' else ''}"><span>BAJO</span><b>Control base</b></div>
      <div class="traffic-item {'active' if nivel_raw == 'MEDIO' else ''}"><span>MEDIO</span><b>Seguimiento</b></div>
      <div class="traffic-item {'active' if nivel_raw == 'ALTO' else ''}"><span>ALTO</span><b>Escalamiento</b></div>
      <div class="traffic-item {'active' if nivel_raw == 'CRITICO' else ''}"><span>CRITICO</span><b>Bloqueo</b></div>
    </div>
    <div style="text-align:center;font-size:8pt;color:#94a3b8;margin-top:2mm;">
      Estado actual: { nivel_label } ({ score_display })
    </div>
  </div>
"""
    brand_html = (
        f'<div class="brand"><img src="{escape(empresa_logo_url)}" alt="{escape(empresa_name)}"/></div>'
        if empresa_logo_url
        else '<div class="brand"><span class="brand-text">eConfia</span></div>'
    )

    return f"""<!doctype html>
<html lang="es">
<head><meta charset="utf-8"/><style>{PRINT_CSS}</style></head>
<body>

<!-- ══ HEADER ══ -->
<div class="page-header">
  <div class="header-top">
    {brand_html}
    <div class="report-meta">
      Estudio #{ est.id }<br>
      Emitido: { datetime.now().strftime("%d/%m/%Y %H:%M") }<br>
      Empresa: { escape(empresa_name) }
    </div>
  </div>
  <div class="header-title">Estudio de Seguridad <span class="header-title-company">· { escape(empresa_name) }</span></div>
  <div class="header-sub">{ escape(cand_name) } &nbsp;·&nbsp; C.C. { escape(cand_id) }</div>
  <div class="chips">
    <span class="chip">{ escape(_fmt(getattr(est, "estado", None))) }</span>
    { dec_chip }
    <span class="chip chip--prog">Progreso { _pct(pct_val) }</span>
  </div>
</div>

<div class="body-wrap">

<!-- ══ PERFIL + DATOS ══ -->
<div class="sec-head"><div class="sec-bar"></div><div class="sec-title">Datos del candidato</div><div class="sec-line"></div></div>
<div class="card">
  <div class="profile-block">
    { photo_block }
    <div class="profile-data">{ cand_table }</div>
  </div>
</div>

<!-- ══ RESUMEN ══ -->
<div class="sec-head"><div class="sec-bar"></div><div class="sec-title">Resumen del estudio</div><div class="sec-line"></div></div>
<div class="card nobreak">
  <div class="summary-grid">
    <div class="summary-cell"><div class="num">{total}</div><div class="lbl">Items totales</div></div>
    <div class="summary-cell"><div class="num" style="color:#34d399">{validados}</div><div class="lbl">Validados</div></div>
    <div class="summary-cell"><div class="num" style="color:#f87171">{hallazgos}</div><div class="lbl">Hallazgos</div></div>
    <div class="summary-cell"><div class="num">{pct_val}%</div><div class="lbl">Progreso</div>
      <div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:{pct_val}%"></div></div>
    </div>
  </div>
  <table style="width:100%;margin-top:4mm;font-size:9pt;border-collapse:collapse;">
    <tr>
      <td style="padding:2px 6px;color:#94a3b8;font-size:8.5pt;font-weight:600;text-transform:uppercase;">Autorizacion</td>
      <td style="padding:2px 6px;">{'<span class="badge badge--ok">Firmada</span>' if getattr(est,'autorizacion_firmada',False) else '<span class="badge badge--warn">Pendiente</span>'}</td>
      <td style="padding:2px 6px;color:#94a3b8;font-size:8.5pt;font-weight:600;text-transform:uppercase;">Enviado</td>
      <td style="padding:2px 6px;">{ escape(_fdate(enviado_at)) }</td>
      <td style="padding:2px 6px;color:#94a3b8;font-size:8.5pt;font-weight:600;text-transform:uppercase;">Cerrado</td>
      <td style="padding:2px 6px;">{ escape(_fdate(finalizado_at)) }</td>
    </tr>
  </table>
  { f'<div class="note">{escape(_fmt(getattr(est,"observacion_analista", None)))}</div>' if getattr(est,'observacion_analista', None) else '' }
</div>

<!-- ══ IRREGULARIDADES ══ -->
<div class="sec-head"><div class="sec-bar"></div><div class="sec-title">Irregularidades reportadas</div><div class="sec-line"></div></div>
<div class="card">
  <table class="dtable">
    <colgroup><col style="width:26%"><col style="width:16%"><col style="width:58%"></colgroup>
    <thead><tr><th>Modulo</th><th>Estado</th><th>Detalle</th></tr></thead>
    <tbody>{ irr_body or '<tr><td colspan="3" style="text-align:center;color:#94a3b8;padding:6px;">Sin irregularidades registradas.</td></tr>' }</tbody>
  </table>
</div>

<!-- ══ SECCIONES DINÁMICAS ══ -->
{''.join(sections)}

<!-- ══ CONSENTIMIENTOS ══ -->
<div class="sec-head"><div class="sec-bar"></div><div class="sec-title">Consentimientos y autorizacion</div><div class="sec-line"></div></div>
<div class="card">
  <table class="dtable">
    <colgroup><col style="width:50%"><col style="width:20%"><col style="width:30%"></colgroup>
    <thead><tr><th>Tipo</th><th>Estado</th><th>Fecha firma</th></tr></thead>
    <tbody>{''.join(cons_rows)}</tbody>
  </table>
</div>

<!-- ══ ANALISIS DE RIESGO ══ -->
<div class="sec-head"><div class="sec-bar"></div><div class="sec-title">Analisis de riesgo y resumen ejecutivo ({style_title})</div><div class="sec-line"></div></div>
<div class="card nobreak">
  <div class="exec-block">

    <!-- Score box -->
    <div class="exec-score-box {nivel_css}">
      <div class="elbl">Score</div>
      <div class="enum">{ score_display }</div>
      <div class="enivel">{ nivel_label }</div>
    </div>

    <!-- Texto ejecutivo -->
    <div class="exec-text">
      <p class="lead">{ exec_lead }</p>
      <ul class="exec-bullets">{ exec_bullets_html }</ul>
    </div>

  </div>

  <!-- Mapa de calor -->
  { heatmap_html }
</div>

<div class="report-footer">
  <span>eConfia &mdash; Seguridad &amp; Verificacion</span>
  <span>Estudio #{est.id} &nbsp;&bull;&nbsp; { escape(empresa_name) } &nbsp;&bull;&nbsp; { datetime.now().strftime("%d/%m/%Y") }</span>
</div>

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

def generar_pdf_estudio(est: Estudio, request, report_style="gerencial"):
    html = _build_html(est, request, report_style=report_style)
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

    report_style = _normalize_report_style(request.GET.get("style"))

    if request.GET.get("debug") == "1":
        return HttpResponse(_build_html(est, request, report_style=report_style), content_type="text/html")

    pdf_bytes, renderer = generar_pdf_estudio(est, request, report_style=report_style)
    resp = HttpResponse(pdf_bytes, content_type="application/pdf")
    # Obtener nombre y apellido del candidato
    candidato = getattr(getattr(est, "solicitud", None), "candidato", None)
    nombre = getattr(candidato, "nombre", "") if candidato else ""
    apellido = getattr(candidato, "apellido", "") if candidato else ""
    # Construir nombre de archivo solo con datos válidos
    partes = ["Estudio_De_Seguridad_N", str(est.id)]
    if nombre:
      partes.append(nombre)
    if apellido:
      partes.append(apellido)
    nombre_archivo = "_".join(partes).replace(" ", "_") + ".pdf"
    resp["Content-Disposition"] = f'attachment; filename="{nombre_archivo}"'
    resp["X-PDF-Renderer"] = renderer
    return resp
