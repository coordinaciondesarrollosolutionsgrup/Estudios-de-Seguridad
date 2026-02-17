# apps/studies/geo_views.py
import time
import requests
from django.http import JsonResponse
from django.views.decorators.http import require_GET
from django.views.decorators.csrf import csrf_exempt

API_BASE = "https://api-colombia.com/api/v1"

_cache = {
    "departments": {"ts": 0, "data": []},
    "cities": {}  # key: dep_id -> {"ts":..., "data":[...]}
}
TTL = 60 * 60 * 24  # 24h

def _fresh(ts):
    return (time.time() - ts) < TTL

@require_GET
def departamentos(request):
    q = request.GET.get("q", "").strip().lower()
    if not _fresh(_cache["departments"]["ts"]):
        resp = requests.get(f"{API_BASE}/Department", timeout=10)
        resp.raise_for_status()
        data = resp.json() or []
        # normalizamos a id/nombre
        norm = [{"id": str(d.get("id")), "nombre": d.get("name")} for d in data]
        _cache["departments"] = {"ts": time.time(), "data": norm}

    data = _cache["departments"]["data"]
    if q:
        data = [d for d in data if q in (d["nombre"] or "").lower()]
    return JsonResponse(data, safe=False)

@require_GET
def municipios(request):
    dep_id = request.GET.get("dep_id")
    q = request.GET.get("q", "").strip().lower()
    if not dep_id:
        return JsonResponse({"detail":"Falta dep_id"}, status=400)

    cache_key = str(dep_id)
    if cache_key not in _cache["cities"] or not _fresh(_cache["cities"][cache_key]["ts"]):
        resp = requests.get(f"{API_BASE}/Department/{dep_id}/cities", timeout=10)
        resp.raise_for_status()
        data = resp.json() or []
        norm = [{"id": str(c.get("id")), "nombre": c.get("name")} for c in data]
        _cache["cities"][cache_key] = {"ts": time.time(), "data": norm}

    data = _cache["cities"][cache_key]["data"]
    if q:
        data = [c for c in data if q in (c["nombre"] or "").lower()]
    return JsonResponse(data, safe=False)
