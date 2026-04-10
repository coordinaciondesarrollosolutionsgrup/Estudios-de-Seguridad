"""
Script para borrar los datos de estudios creados.

Uso:
    python manage.py shell < scripts/borrar_estudios.py

    O bien, ejecutar directamente con Django configurado:
    python scripts/borrar_estudios.py

Opciones de filtrado (editar las variables al inicio del bloque principal):
    - EMPRESA_ID       : borrar solo estudios de una empresa específica (None = todas)
    - ESTADO           : borrar solo estudios en un estado específico (None = todos)
    - SOLO_CONTAR      : si True, solo muestra el conteo sin borrar nada
"""

import os
import sys
import django

# ── Configuración de Django (solo si se ejecuta directamente, no desde manage.py shell) ──
if not os.environ.get("DJANGO_SETTINGS_MODULE"):
    # Ajusta la ruta si tu manage.py está en otro lugar
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    sys.path.insert(0, BASE_DIR)
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
    django.setup()

# ── Importaciones después de django.setup() ──
from apps.studies.models import (
    Estudio,
    Solicitud,
    EstudioReferencia,
    SlotDisponibilidadAnalista,
    DisponibilidadReunionCandidato,
    ReunionVirtualAgendada,
    DisponibilidadAnalista,
)

# ────────────────────────────────────────────────────────────────────────────────
# PARÁMETROS  —  edita aquí antes de ejecutar
# ────────────────────────────────────────────────────────────────────────────────
EMPRESA_ID  = None   # int o None  →  ej. 3  para borrar solo estudios de la empresa 3
ESTADO      = None   # str o None  →  ej. "EN_CAPTURA" | "EN_REVISION" | "DEVUELTO" | "CERRADO"
SOLO_CONTAR = False  # True = modo seguro (solo muestra cuántos se borrarían, sin borrar)
# ────────────────────────────────────────────────────────────────────────────────


def construir_queryset():
    """Devuelve un queryset de Estudio según los filtros configurados."""
    qs = Estudio.objects.select_related("solicitud", "solicitud__empresa", "solicitud__candidato")

    if EMPRESA_ID is not None:
        qs = qs.filter(solicitud__empresa_id=EMPRESA_ID)

    if ESTADO is not None:
        qs = qs.filter(estado=ESTADO)

    return qs


def mostrar_resumen(estudios_qs):
    total = estudios_qs.count()
    print(f"\n{'='*60}")
    print(f"  Estudios encontrados con los filtros actuales: {total}")

    if EMPRESA_ID:
        print(f"  Filtro empresa ID : {EMPRESA_ID}")
    if ESTADO:
        print(f"  Filtro estado     : {ESTADO}")

    if total == 0:
        print("  No hay nada que borrar.")
        print(f"{'='*60}\n")
        return 0

    # Desglose por estado
    from django.db.models import Count
    por_estado = (
        estudios_qs
        .values("estado")
        .annotate(cantidad=Count("id"))
        .order_by("estado")
    )
    print("\n  Desglose por estado:")
    for row in por_estado:
        print(f"    {row['estado']:<20} {row['cantidad']}")

    print(f"{'='*60}\n")
    return total


def borrar_estudios(estudios_qs):
    """
    Borra en cascada todos los registros relacionados al estudio y luego
    la solicitud asociada. Django maneja ON DELETE CASCADE para los modelos
    que lo declaran, pero los borramos explícitamente para más claridad.
    """
    ids_estudios = list(estudios_qs.values_list("id", flat=True))
    ids_solicitudes = list(estudios_qs.values_list("solicitud_id", flat=True))

    if not ids_estudios:
        print("No hay estudios para borrar.")
        return

    print("Borrando registros relacionados...\n")

    # 1. ReunionVirtualAgendada  (antes de liberar slots de DisponibilidadAnalista)
    reuniones = ReunionVirtualAgendada.objects.filter(estudio_id__in=ids_estudios)
    n_reuniones = reuniones.count()
    reuniones.delete()
    print(f"  ReunionVirtualAgendada      : {n_reuniones} eliminadas")

    # 2. Liberar slots globales del analista que apuntaban a estos estudios
    slots_globales = DisponibilidadAnalista.objects.filter(estudio_reservado_id__in=ids_estudios)
    n_slots_g = slots_globales.count()
    slots_globales.update(estudio_reservado=None, estado="DISPONIBLE")
    print(f"  DisponibilidadAnalista      : {n_slots_g} liberados (estado → DISPONIBLE)")

    # 3. DisponibilidadReunionCandidato
    disp_candidato = DisponibilidadReunionCandidato.objects.filter(estudio_id__in=ids_estudios)
    n_disp = disp_candidato.count()
    disp_candidato.delete()
    print(f"  DisponibilidadReunionCand.  : {n_disp} eliminadas")

    # 4. SlotDisponibilidadAnalista (slots viejos por estudio)
    slots = SlotDisponibilidadAnalista.objects.filter(estudio_id__in=ids_estudios)
    n_slots = slots.count()
    slots.delete()
    print(f"  SlotDisponibilidadAnalista  : {n_slots} eliminados")

    # 5. EstudioReferencia
    referencias = EstudioReferencia.objects.filter(estudio_id__in=ids_estudios)
    n_ref = referencias.count()
    referencias.delete()
    print(f"  EstudioReferencia           : {n_ref} eliminadas")

    # 6. EstudioItem (se borra en cascada desde Estudio, pero contamos primero)
    try:
        from apps.studies.models import EstudioItem
        items = EstudioItem.objects.filter(estudio_id__in=ids_estudios)
        n_items = items.count()
        items.delete()
        print(f"  EstudioItem                 : {n_items} eliminados")
    except ImportError:
        pass

    # 7. Estudio
    n_estudios = len(ids_estudios)
    Estudio.objects.filter(id__in=ids_estudios).delete()
    print(f"  Estudio                     : {n_estudios} eliminados")

    # 8. Solicitud
    n_solicitudes = Solicitud.objects.filter(id__in=ids_solicitudes).delete()[0]
    print(f"  Solicitud                   : {n_solicitudes} eliminadas")

    print(f"\n  ✓ Proceso completado. {n_estudios} estudio(s) borrados en total.\n")


def main():
    estudios_qs = construir_queryset()
    total = mostrar_resumen(estudios_qs)

    if total == 0:
        return

    if SOLO_CONTAR:
        print("  Modo SOLO_CONTAR activado — no se borrará nada.")
        print("  Cambia SOLO_CONTAR = False para ejecutar el borrado.\n")
        return

    confirmacion = input(
        f"  ¿Confirmas el borrado de {total} estudio(s) y sus datos relacionados? [s/N]: "
    ).strip().lower()

    if confirmacion != "s":
        print("\n  Operación cancelada.\n")
        return

    borrar_estudios(estudios_qs)


if __name__ == "__main__":
    main()
