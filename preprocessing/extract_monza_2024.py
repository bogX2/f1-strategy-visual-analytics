"""
F1 Performance Insight — Data Extraction Script
Gran Premio d'Italia 2024 — Monza
==============================================
Estrae tutti i dati necessari dalla FastF1 API e li salva in CSV/JSON
pronti per essere consumati dalla web app D3.js.

Output files:
  - laps_enriched.csv       → dati giro per giro (per Line Chart e PCP)
  - stints_features.csv     → feature aggregate per stint (per PCA)
  - pit_stops.csv           → dettaglio pit stop
  - weather_raw.csv         → dati meteo raw
  - race_info.json          → metadata della gara + AS index
  - driver_info.json        → colori e abbreviazioni piloti

Requisiti:
  pip install fastf1 pandas numpy scipy
"""

import fastf1
import fastf1.plotting
import pandas as pd
import numpy as np
from scipy import stats
from scipy.interpolate import interp1d
import json
import os
import warnings
warnings.filterwarnings("ignore")

# ─────────────────────────────────────────────
# CONFIGURAZIONE
# ─────────────────────────────────────────────

YEAR       = 2024
GRAND_PRIX = "Italian"   # nome ufficiale FastF1
SESSION    = "R"         # R = Race
OUTPUT_DIR = "./data"

os.makedirs(OUTPUT_DIR, exist_ok=True)
#fastf1.Cache.enable_cache("./f1_cache")   # evita di riscaricare ogni volta


# ─────────────────────────────────────────────
# 1. CARICAMENTO SESSIONE
# ─────────────────────────────────────────────

print("=" * 60)
print(f"Caricamento: {YEAR} {GRAND_PRIX} GP — {SESSION}")
print("=" * 60)

session = fastf1.get_session(YEAR, GRAND_PRIX, SESSION)
session.load(laps=True, telemetry=False, weather=True, messages=True)

print(f"✓ {session.event['EventName']} — "
      f"{session.event['EventDate'].strftime('%d %B %Y')}")
print(f"  Circuito : {session.event['Location']}, {session.event['Country']}")
print(f"  Piloti   : {len(session.drivers)}")


# ─────────────────────────────────────────────
# 2. METEO — interpolato su ogni giro
# ─────────────────────────────────────────────

print("\n[1/5] Dati meteo...")

weather_raw = session.weather_data.copy()
weather_raw["TimeSeconds"] = weather_raw["Time"].dt.total_seconds()

# Crea interpolatori lineari per ogni variabile meteo
weather_interp = {}
for col in ["AirTemp", "TrackTemp", "Humidity", "Pressure",
            "WindSpeed", "Rainfall"]:
    if col in weather_raw.columns:
        mask = weather_raw[col].notna()
        if mask.sum() >= 2:
            weather_interp[col] = interp1d(
                weather_raw.loc[mask, "TimeSeconds"],
                weather_raw.loc[mask, col],
                kind="linear",
                bounds_error=False,
                fill_value="extrapolate"
            )

weather_raw.to_csv(os.path.join(OUTPUT_DIR, "weather_raw.csv"), index=False)
print(f"  ✓ Variabili meteo disponibili: {list(weather_interp.keys())}")


# ─────────────────────────────────────────────
# 3. LAPS ENRICHED — giro per giro
# ─────────────────────────────────────────────

print("\n[2/5] Dataset giri (laps_enriched)...")

laps_all   = session.laps.copy()
laps_clean = laps_all.dropna(subset=["LapTime"]).copy()

# Converti timedelta → secondi float (più semplice per D3.js)
laps_clean["LapTimeSeconds"]  = laps_clean["LapTime"].dt.total_seconds()
laps_clean["Sector1Seconds"]  = laps_clean["Sector1Time"].dt.total_seconds()
laps_clean["Sector2Seconds"]  = laps_clean["Sector2Time"].dt.total_seconds()
laps_clean["Sector3Seconds"]  = laps_clean["Sector3Time"].dt.total_seconds()
laps_clean["LapStartSeconds"] = laps_clean["LapStartTime"].dt.total_seconds()

# Interpola meteo su ogni giro
for col, interp_fn in weather_interp.items():
    laps_clean[col] = interp_fn(laps_clean["LapStartSeconds"])

# Colori team ufficiali
team_colors  = {}
driver_teams = {}
for drv in session.drivers:
    try:
        dlaps = session.laps.pick_drivers(drv)
        if len(dlaps) > 0:
            team = dlaps.iloc[0]["Team"]
            driver_teams[drv] = team
            team_colors[team] = fastf1.plotting.get_team_color(
                team, session=session
            )
    except Exception:
        pass

laps_clean["TeamColor"] = laps_clean["Driver"].map(
    lambda d: team_colors.get(driver_teams.get(d, ""), "#888888")
)

# Flag giri speciali
laps_clean["IsSafetyCar"] = laps_clean["TrackStatus"].str.contains(
    "4|6", na=False)
laps_clean["IsInLap"]     = laps_clean["PitInTime"].notna()
laps_clean["IsOutLap"]    = laps_clean["PitOutTime"].notna()
laps_clean["IsFirstLap"]  = laps_clean["LapNumber"] == 1

# Giro "pulito" = valido per analisi del degrado
# (esclude SC, in-lap, out-lap, primo giro)
laps_clean["IsCleanLap"] = (
    ~laps_clean["IsSafetyCar"] &
    ~laps_clean["IsInLap"]     &
    ~laps_clean["IsOutLap"]    &
    ~laps_clean["IsFirstLap"]  &
    laps_clean["LapTimeSeconds"].notna()
)

# Colonne da esportare
cols_laps = [
    "Driver", "Team", "LapNumber", "Stint",
    "LapTimeSeconds", "Sector1Seconds", "Sector2Seconds", "Sector3Seconds",
    "Compound", "TyreLife", "FreshTyre",
    "SpeedI1", "SpeedI2", "SpeedFL", "SpeedST",
    "AirTemp", "TrackTemp", "Humidity", "WindSpeed", "Rainfall",
    "IsInLap", "IsOutLap", "IsSafetyCar", "IsFirstLap", "IsCleanLap",
    "Position", "TeamColor", "LapStartSeconds", "TrackStatus"
]
cols_ok = [c for c in cols_laps if c in laps_clean.columns]
laps_export = laps_clean[cols_ok].copy()

# Riempi NaN numerici con 0 per sicurezza
for col in ["SpeedI1", "SpeedI2", "SpeedFL", "SpeedST",
            "Sector1Seconds", "Sector2Seconds", "Sector3Seconds"]:
    if col in laps_export.columns:
        laps_export[col] = laps_export[col].fillna(0)

laps_export.to_csv(os.path.join(OUTPUT_DIR, "laps_enriched.csv"), index=False)
AS = len(laps_export) * len(cols_ok)
print(f"  ✓ {len(laps_export)} giri × {len(cols_ok)} colonne")
print(f"  AS Index = {AS:,} "
      f"{'✅' if 10_000 <= AS <= 50_000 else '⚠ fuori range'}")


# ─────────────────────────────────────────────
# 4. STINTS FEATURES — aggregato per PCA
# ─────────────────────────────────────────────

print("\n[3/5] Dataset stint (stints_features per PCA)...")

COMPOUND_ENC = {"SOFT": 0, "MEDIUM": 1, "HARD": 2,
                "INTERMEDIATE": 3, "WET": 4, "UNKNOWN": 1}

stint_records = []

for driver in laps_clean["Driver"].unique():
    drv_laps = (laps_clean[laps_clean["Driver"] == driver]
                .sort_values("LapNumber"))

    for stint_num in drv_laps["Stint"].unique():
        stint_laps = drv_laps[drv_laps["Stint"] == stint_num].copy()
        clean      = stint_laps[stint_laps["IsCleanLap"]].copy()

        # Serve almeno 3 giri puliti per una regressione significativa
        if len(clean) < 3:
            continue

        compound = (stint_laps["Compound"].mode()[0]
                    if not stint_laps["Compound"].isna().all()
                    else "UNKNOWN")

        # Regressione lineare: LapTime ~ progressione giro nello stint
        # slope > 0 = degrado (si rallenta), slope < 0 = miglioramento
        x = np.arange(len(clean))
        y = clean["LapTimeSeconds"].values
        slope, intercept, r_val, p_val, std_err = stats.linregress(x, y)

        rec = {
            # ── Identificatori (non entrano nella PCA) ──────────
            "Driver"          : driver,
            "Team"            : stint_laps.iloc[0]["Team"],
            "TeamColor"       : stint_laps.iloc[0]["TeamColor"],
            "StintNumber"     : int(stint_num),
            "StintID"         : f"{driver}_S{int(stint_num)}",
            "Label"           : f"{driver}-{compound[0]}{int(stint_num)}",
            "Compound"        : compound,
            "LapStart"        : int(stint_laps["LapNumber"].min()),
            "LapEnd"          : int(stint_laps["LapNumber"].max()),
            "TotalLaps"       : int(len(stint_laps)),
            "CleanLaps"       : int(len(clean)),

            # ── FEATURE 1: Avg Lap Time ──────────────────────────
            # Velocità media dello stint — distingue stint veloci/lenti
            "AvgLapTime"      : float(clean["LapTimeSeconds"].mean()),

            # ── FEATURE 2: Degradation Slope (s/giro) ───────────
            # La feature più importante: quanto rallenta ogni giro
            # Positivo = degrado, Negativo = miglioramento (track evolution)
            "DegradationSlope": float(slope),

            # ── FEATURE 3: Stint Length ──────────────────────────
            # Stint lunghi → strategia conservativa
            # Stint corti  → strategia aggressiva / problema
            "StintLength"     : int(len(stint_laps)),

            # ── FEATURE 4: Tyre Life Start ───────────────────────
            # 0 = gomma nuova, >0 = gomma usata (set precedente)
            "TyreLifeStart"   : int(stint_laps["TyreLife"].min()),

            # ── FEATURE 5: Avg Track Temperature ────────────────
            # Temperature alte → degrado più rapido
            "AvgTrackTemp"    : float(stint_laps["TrackTemp"].mean())
                                if "TrackTemp" in stint_laps.columns else 30.0,

            # ── FEATURE 6: Compound Encoded ──────────────────────
            # Permette alla PCA di separare le mescole
            "CompoundEncoded" : COMPOUND_ENC.get(compound, 1),

            # ── Extra per il frontend (non usati nella PCA) ──────
            "RegressionR2"    : float(r_val ** 2),
            "RegressionIntercept": float(intercept),
            "LapTimeStd"      : float(clean["LapTimeSeconds"].std()),
            "BestLapTime"     : float(clean["LapTimeSeconds"].min()),
            "WorstLapTime"    : float(clean["LapTimeSeconds"].max()),
            "AvgSpeedST"      : float(stint_laps["SpeedST"].mean())
                                if "SpeedST" in stint_laps.columns else 0.0,
            "AvgAirTemp"      : float(stint_laps["AirTemp"].mean())
                                if "AirTemp" in stint_laps.columns else 25.0,
            "HasSafetyCar"    : bool(stint_laps["IsSafetyCar"].any()),

            # Serie dei lap time (JSON array per sparkline nel frontend)
            "LapTimeSeries"   : json.dumps(
                clean["LapTimeSeconds"].round(3).tolist()
            ),
        }
        stint_records.append(rec)

stints_df = pd.DataFrame(stint_records)

# Z-score del degrado per compound (per identificare outlier)
stints_df["DegradationZScore"] = 0.0
for compound in stints_df["Compound"].unique():
    mask = stints_df["Compound"] == compound
    if mask.sum() > 1:
        m = stints_df.loc[mask, "DegradationSlope"].mean()
        s = stints_df.loc[mask, "DegradationSlope"].std()
        if s > 0:
            stints_df.loc[mask, "DegradationZScore"] = (
                stints_df.loc[mask, "DegradationSlope"] - m
            ) / s

# Flag outlier: |z-score| > 1.5
stints_df["IsOutlier"] = stints_df["DegradationZScore"].abs() > 1.5

stints_df.to_csv(
    os.path.join(OUTPUT_DIR, "stints_features.csv"), index=False
)
stints_df.to_json(
    os.path.join(OUTPUT_DIR, "stints_features.json"), index=False
)

print(f"  ✓ {len(stints_df)} stint totali")
print(f"  Compound:\n{stints_df['Compound'].value_counts().to_string()}")
print(f"  Outlier rilevati: {stints_df['IsOutlier'].sum()}")


# ─────────────────────────────────────────────
# 5. PIT STOPS
# ─────────────────────────────────────────────

print("\n[4/5] Pit stop...")

pit_records = []
for driver in laps_clean["Driver"].unique():
    drv_laps = (laps_clean[laps_clean["Driver"] == driver]
                .sort_values("LapNumber"))
    in_laps  = drv_laps[drv_laps["IsInLap"]]

    for _, in_lap in in_laps.iterrows():
        lap_num      = int(in_lap["LapNumber"])
        out_lap_rows = drv_laps[drv_laps["LapNumber"] == lap_num + 1]

        pit_records.append({
            "Driver"        : driver,
            "Team"          : in_lap["Team"],
            "TeamColor"     : in_lap["TeamColor"],
            "PitLap"        : lap_num,
            "CompoundBefore": in_lap["Compound"],
            "CompoundAfter" : out_lap_rows.iloc[0]["Compound"]
                              if len(out_lap_rows) > 0 else "UNKNOWN",
            "StintBefore"   : int(in_lap["Stint"]),
            "StintAfter"    : int(out_lap_rows.iloc[0]["Stint"])
                              if len(out_lap_rows) > 0
                              else int(in_lap["Stint"]) + 1,
            "InLapTime"     : float(in_lap["LapTimeSeconds"]),
            "OutLapTime"    : float(out_lap_rows.iloc[0]["LapTimeSeconds"])
                              if len(out_lap_rows) > 0 else None,
            "TrackTemp"     : float(in_lap["TrackTemp"])
                              if "TrackTemp" in in_lap.index else 30.0,
        })

pit_df = pd.DataFrame(pit_records)
pit_df.to_csv(os.path.join(OUTPUT_DIR, "pit_stops.csv"), index=False)
print(f"  ✓ {len(pit_df)} pit stop totali")


# ─────────────────────────────────────────────
# 6. RACE INFO + DRIVER INFO  (JSON)
# ─────────────────────────────────────────────

print("\n[5/5] Metadata JSON...")

sc_laps  = sorted(laps_clean[
    laps_clean["TrackStatus"].str.contains("4", na=False)
]["LapNumber"].unique().tolist())
vsc_laps = sorted(laps_clean[
    laps_clean["TrackStatus"].str.contains("6", na=False)
]["LapNumber"].unique().tolist())

race_info = {
    "event": {
        "name"        : session.event["EventName"],
        "year"        : YEAR,
        "circuit"     : session.event["Location"],
        "country"     : session.event["Country"],
        "date"        : session.event["EventDate"].strftime("%Y-%m-%d"),
        "totalLaps"   : int(laps_clean["LapNumber"].max()),
        "totalDrivers": int(len(session.drivers)),
    },
    "weather_summary": {
        "avgAirTemp"  : round(float(weather_raw["AirTemp"].mean()), 1),
        "maxAirTemp"  : round(float(weather_raw["AirTemp"].max()), 1),
        "minAirTemp"  : round(float(weather_raw["AirTemp"].min()), 1),
        "avgTrackTemp": round(float(weather_raw["TrackTemp"].mean()), 1),
        "maxTrackTemp": round(float(weather_raw["TrackTemp"].max()), 1),
        "rainfall"    : bool(weather_raw["Rainfall"].any()),
    },
    "safety_car": {
        "sc_laps" : sc_laps,
        "vsc_laps": vsc_laps,
    },
    "as_index": {
        "rows"      : int(len(laps_export)),
        "dimensions": int(len(cols_ok)),
        "AS"        : int(len(laps_export) * len(cols_ok)),
        "in_range"  : 10_000 <= int(len(laps_export) * len(cols_ok)) <= 50_000
    }
}

with open(os.path.join(OUTPUT_DIR, "race_info.json"), "w") as f:
    json.dump(race_info, f, indent=2, default=str)

driver_info = {}
for drv in session.drivers:
    try:
        dlaps = session.laps.pick_drivers(drv)
        if len(dlaps) == 0:
            continue
        team   = dlaps.iloc[0]["Team"]
        color  = fastf1.plotting.get_team_color(team, session=session)
        result = session.results[session.results["Abbreviation"] == drv]
        driver_info[drv] = {
            "abbreviation" : drv,
            "fullName"     : result.iloc[0]["FullName"]
                             if len(result) > 0 else drv,
            "team"         : team,
            "color"        : color,
            "finalPosition": int(result.iloc[0]["Position"])
                             if len(result) > 0 else 99,
            "stintCount"   : int(len(stints_df[stints_df["Driver"] == drv])),
        }
    except Exception as e:
        print(f"  ⚠ {drv}: {e}")

with open(os.path.join(OUTPUT_DIR, "driver_info.json"), "w") as f:
    json.dump(driver_info, f, indent=2)


# ─────────────────────────────────────────────
# RIEPILOGO
# ─────────────────────────────────────────────

print("\n" + "=" * 60)
print("COMPLETATO — file in ./data/")
print("=" * 60)
for fname in ["laps_enriched.csv", "stints_features.csv",
              "pit_stops.csv", "weather_raw.csv",
              "race_info.json", "driver_info.json"]:
    fpath = os.path.join(OUTPUT_DIR, fname)
    if os.path.exists(fpath):
        kb = os.path.getsize(fpath) / 1024
        print(f"  ✓ {fname:32s} {kb:6.1f} KB")

print(f"\nAS Index : {AS:,} "
      f"({'✅ ok' if 10_000 <= AS <= 50_000 else '⚠ controlla'})")
print(f"Stint PCA: {len(stints_df)}")
print(f"Pit stop : {len(pit_df)}")
print(f"\nProssimo step → python pca_preprocessing.py")
