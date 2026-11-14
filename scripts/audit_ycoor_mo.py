#!/usr/bin/env python3
"""One-off Ycoor cadastral audit. No screenshots, guessed geometry or raster tracing."""
import concurrent.futures
import datetime
import json
import pathlib
import time
import urllib.error
import urllib.parse
import urllib.request

SERVICE = "https://sit.vs.ch/arcgis/rest/services/MO/MapServer"
BBOX = [2602986, 1128799, 2603086, 1128899]
LAYERS = {270: "Couverture du sol surfaces", 180: "Eléments linéaires", 190: "Objets divers surfaces", 260: "Bâtiments"}
CATEGORIES = {
    270: {"6":"route / chemin","7":"trottoir","11":"bassin","12":"autre revêtement dur","17":"jardin","19":"autre surface verte","20":"eau stagnante"},
    180: {"26":"sentier", "4":"escalier important", "6":"pont / passerelle"},
}
def fetch_layer(layer):
    params = {
        "where": "1=1",
        "geometry": ",".join(str(n) for n in BBOX),
        "geometryType": "esriGeometryEnvelope",
        "spatialRel": "esriSpatialRelIntersects",
        "inSR": "2056", "outSR": "2056",
        "returnGeometry": "false",
        "outFields": "OBJECTID,GID,GENRE,GENRE_FR",
        "resultRecordCount": "2000", "f": "json"
    }
    url = f"{SERVICE}/{layer}/query?" + urllib.parse.urlencode(params)
    latest_error = None
    for trial in range(2):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Ycoor-Official-Data-Audit/1.0", "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=16) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            if "error" in data:
                raise ValueError(str(data["error"]))
            if not isinstance(data.get("features"), list):
                raise ValueError("JSON without features")
            if data.get("exceededTransferLimit"):
                raise ValueError("Incomplete response: transfer limit exceeded")
            rows = data["features"]
            grouped = {}
            for row in rows:
                a = row.get("attributes", {})
                k = str(a.get("GENRE", "non renseigné"))
                item = grouped.setdefault(k, {"genre":k, "label":CATEGORIES.get(layer,{}).get(k, a.get("GENRE_FR") or "autre"),"count":0,"object_ids":[]})
                item["count"] += 1
                if a.get("OBJECTID") is not None:
                    item["object_ids"].append(a["OBJECTID"])
            return {"layer":layer,"name":LAYERS[layer],"status":"verified","total_intersecting":len(rows),"by_genre":list(grouped.values()),"source":f"{SERVICE}/{layer}","queried_bbox_lv95":BBOX}
        except Exception as e:
            latest_error = f"{type(e).__name__}: {e}"
            if trial == 0:
                time.sleep(1)
    return {"layer":layer, "name":LAYERS[layer], "status":"unavailable","error":latest_error,"total_intersecting":None,"by_genre":[], "source": f"{SERVICE}/{layer}","queried_bbox_lv95":BBOX}

with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    layers = list(pool.map(fetch_layer,LAYERS))
report = {
    "audit": "Ycoor 100m x 100m official cadastral features",
    "center_lv95": {"east":2603036,"north":1128849},
    "envelope_lv95": {"xmin":BBOX[0],"ymin":BBOX[1],"xmax":BBOX[2],"ymax":BBOX[3]},
    "checked_at_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "source": SERVICE,
    "query": "esriSpatialRelIntersects; results include features crossing the square even when their vertices are outside",
    "disclaimer": "Official vector source is not a certified/signed cadastral extract. Failed queries must not be reported as zero.",
    "layers": sorted(layers,key=lambda l:l["layer"])
}
out=pathlib.Path("crans-montana-p058/audit-ycoor.json")
out.parent.mkdir(exist_ok=True,parents=True)
out.write_text(json.dumps(report,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
print(json.dumps({x["layer"]: {"status":x["status"],"count":x["total_intersecting"],"error":x.get("error")} for x in layers},ensure_ascii=False))
