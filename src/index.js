import './index.scss';
import * as d3 from 'd3';

// functionality import
import { drawStrategyGantt } from './StrategyGantt.js';
import { drawLineChart } from './LineChart.js';
import { drawParallelCoordinates } from './ParallelCoordinates.js';
import { drawPCAChart } from './PCAChart.js';
import { drawRankingsChart } from './RankingsChart.js';

// data import
import rawStintsData from '../data/stints_features.csv'; 
import rawLapsData from '../data/laps_enriched.csv'; 
import pcaData from '../data/pca_data.json';

// =========================================================
// COSTANTI GLOBALI
// =========================================================
const COMPOUND_COLORS = {
    "SOFT":         "#e10600",
    "MEDIUM":       "#ffeb3b",
    "HARD":         "#ffffff",
    "INTERMEDIATE": "#4caf50",
    "WET":          "#2196f3",
};

const TEAM_COLORS = {
    "Ferrari":          "#e8002d",
    "McLaren":          "#ff8000",
    "Mercedes":         "#27f4d2",
    "Red Bull Racing":  "#3671c6",
    "Aston Martin":     "#229971",
    "Alpine":           "#0093cc",
    "Williams":         "#64c4ff",
    "RB":               "#6692ff",
    "Kick Sauber":      "#52e252",
    "Haas F1 Team":     "#ffffff"
};

// =========================================================
// UTILITY
// =========================================================
function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `${r}, ${g}, ${b}`;
}

// =========================================================
// LEGENDA
// =========================================================
function createLegends() {
    const compoundContainer = document.getElementById('compound-legend');
    if (compoundContainer) {
        compoundContainer.innerHTML = '';
        Object.entries(COMPOUND_COLORS).forEach(([name, color], index) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'compound-wear-row';
            wrapper.style.cssText = "margin-bottom: 4px; display: flex; flex-direction: column; gap: 1px;";
            wrapper.innerHTML = `
                <div style="display: flex; justify-content: space-between; font-size: 0.65rem; font-weight: bold;">
                    <span>${name}</span>
                    ${index === 0 ? '<span style="font-weight: normal; color: #888;">New → Worn</span>' : ''}
                </div>
                <div class="wear-bar" style="width:100%; height: 5px; border-radius: 2px;
                    background: linear-gradient(to right, ${color}, rgba(${hexToRgb(color)}, 0.1));"></div>
            `;
            compoundContainer.appendChild(wrapper);
        });
    }

    const eventContainer = document.getElementById('event-legend');
    if (eventContainer) {
        eventContainer.innerHTML = `
            <div class="legend-item" style="margin-right: 15px;">
                <svg width="14" height="14"><polygon points="0,0 12,0 6,10" fill="#ff3b3b"/></svg>
                <span style="margin-left:5px; font-size: 0.7rem;">Pit Stop</span>
            </div>
            <div class="legend-item">
                <svg width="14" height="14"><path d="M2 14 L2 2 L10 4 L10 10 L2 8 Z" fill="#ffd400"/></svg>
                <span style="margin-left:5px; font-size: 0.7rem;">Safety Car</span>
            </div>
        `;
    }
}

// =========================================================
// DASHBOARD PRINCIPALE
// =========================================================
function initDashboard() {

    // ---------------------------------------------------------
    // PARSING DATI
    // ---------------------------------------------------------
    const stintsData = rawStintsData.map(d => ({
        ...d,
        LapStart:         +d.LapStart,
        LapEnd:           +d.LapEnd,
        StintNumber:      +d.StintNumber,
        AvgLapTime:       +d.AvgLapTime,
        DegradationSlope: +d.DegradationSlope,
        TyreLifeStart:    +d.TyreLifeStart,
        TotalLaps:        +d.TotalLaps
    }));

    const validLaps = rawLapsData.filter(d => +d.LapTimeSeconds > 0);
    const validDeg  = stintsData.filter(d => d.DegradationSlope > 0);

    // ---------------------------------------------------------
    // STATISTICHE GLOBALI (fisse per la sidebar)
    // ---------------------------------------------------------
    const totalPitStops   = stintsData.filter(d => d.StintNumber > 1).length;
    const maxLaps         = d3.max(rawLapsData, d => +d.LapNumber) || 0;
    const globalAvgLapTime    = d3.mean(validLaps, d => +d.LapTimeSeconds);
    const globalAvgDegradation = d3.mean(validDeg, d => d.DegradationSlope);
    const fastestLap      = validLaps.reduce((min, p) => +p.LapTimeSeconds < +min.LapTimeSeconds ? p : min, validLaps[0]);

    const validTrackTemps = rawLapsData.filter(d => +d.TrackTemp > 0).map(d => +d.TrackTemp);
    const avgTrackTemp    = validTrackTemps.length ? d3.mean(validTrackTemps) : 0;
    const validAirTemps   = rawLapsData.filter(d => +d.AirTemp > 0).map(d => +d.AirTemp);
    const avgAirTemp      = validAirTemps.length ? d3.mean(validAirTemps) : 0;

    const compoundCounts  = d3.rollup(stintsData, v => v.length, d => d.Compound);
    const softCount  = compoundCounts.get("SOFT")  || 0;
    const medCount   = compoundCounts.get("MEDIUM") || 0;
    const hardCount  = compoundCounts.get("HARD")   || 0;

    const globalOverviewHTML = `
        <div style="margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid #333344;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <h2 style="color: #f30303; margin: 0; font-size: 1.1rem; text-transform: uppercase; letter-spacing: 1px;">
                    Monza 2024
                </h2>
                <span style="background: #333344; color: #fff; padding: 3px 6px; font-weight: bold;
                    border-radius: 6px; font-size: 0.8rem; white-space: nowrap;">
                    ${maxLaps} LAPS
                </span>
            </div>
            <div style="background: rgba(162,0,255,0.08); padding: 5px; border-radius: 4px;
                border: 1px solid rgba(162,0,255,0.25); margin-bottom: 8px;">
                <div style="font-size: 0.60rem; color: #a200ff; text-transform: uppercase; font-weight: bold;">Fastest Lap</div>
                <div style="display: flex; justify-content: space-between; align-items: baseline; margin-top: 2px;">
                    <span style="font-size: 0.8rem; font-weight: bold; color: #fff;">
                        ${fastestLap ? fastestLap.Driver : 'N/A'}
                    </span>
                    <span style="font-size: 0.8rem; font-family: monospace; color: #f5f5f5;">
                        ${fastestLap ? (+fastestLap.LapTimeSeconds).toFixed(3) + 's' : '-'}
                    </span>
                </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 8px;">
                <div style="background: rgba(255,255,255,0.03); padding: 5px; border-radius: 4px; border-left: 2px solid #00a1fe;">
                    <div style="font-size: 0.58rem; color: #888894; text-transform: uppercase;">Avg Degradation</div>
                    <div style="font-size: 0.82rem; font-weight: bold; color: #fff;">
                        ${globalAvgDegradation.toFixed(3)} <span style="font-size: 0.58rem; font-weight: normal;">s/l</span>
                    </div>
                </div>
                <div style="background: rgba(255,255,255,0.03); padding: 5px; border-radius: 4px; border-left: 2px solid #00a1fe;">
                    <div style="font-size: 0.58rem; color: #888894; text-transform: uppercase;">Pit Stops</div>
                    <div style="font-size: 0.82rem; font-weight: bold; color: #fff;">${totalPitStops}</div>
                </div>
            </div>
            <div style="font-size: 0.80rem; color: #888894; display: flex; justify-content: space-between; margin-bottom: 6px;">
                <span>Track: <strong style="color: #eee;">${avgTrackTemp.toFixed(1)}°C</strong></span>
                <span>Air: <strong style="color: #eee;">${avgAirTemp.toFixed(1)}°C</strong></span>
            </div>
            <div style="font-size: 0.80rem; display: flex; align-items: center;">
                <strong style="margin-right: 8px; font-size: 0.62rem; color: #888894; text-transform: uppercase;">Compounds:</strong>
                <div style="display: flex; gap: 10px; font-family: monospace;">
                    <span style="color:#e10600;">S: ${softCount}</span>
                    <span style="color:#ffeb3b;">M: ${medCount}</span>
                    <span style="color:#ffffff;">H: ${hardCount}</span>
                </div>
            </div>
        </div>
    `;

    // ---------------------------------------------------------
    // HELPER: aggiorna sidebar
    // ---------------------------------------------------------
    const updateSidebar = (specificHTML = "") => {
        const panel = document.querySelector("#analytics-panel");
        if (!panel) return;

        const analyticsHeader = specificHTML ? `
            <div style="margin-top: 12px; margin-bottom: 8px;">
                <h3 style="color: #888; font-size: 0.80rem; text-transform: uppercase;
                    letter-spacing: 1px; margin: 0;">Analytics</h3>
            </div>
        ` : '';

        const content = specificHTML || `
            <div style="color: #555; font-style: italic; font-size: 0.80rem;
                text-align: center; margin-top: 12px;">
                Select data for comparison
            </div>
        `;

        panel.innerHTML = globalOverviewHTML + analyticsHeader +
            '<div class="selection-details">' + content + '</div>';
    };

    // ---------------------------------------------------------
    // HELPER: HTML statistiche comparative con toggle PACE / DEG
    // ---------------------------------------------------------
    const getComparativeStatsHTML = (selectedLaps, selectedStints, globalAvgPace, globalAvgDeg) => {
        if (!selectedLaps.length || !selectedStints.length) return '';

        const localAvgPace = d3.mean(selectedLaps, d => +d.LapTimeSeconds);
        const deltaPace    = localAvgPace - globalAvgPace;
        const isFasterPace = deltaPace < 0;

        const localAvgDeg  = d3.mean(selectedStints, d => d.DegradationSlope);
        const deltaDeg     = localAvgDeg - globalAvgDeg;
        const isBetterDeg  = deltaDeg < 0;

        return `
            <div style="margin-top: 6px; padding-top: 6px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                    <div style="display: flex; gap: 4px; background: rgba(255,255,255,0.05);
                        border-radius: 4px; padding: 2px;">
                        <button id="btn-toggle-pace"
                            style="cursor:pointer; background: #00ffcc; color: #000; border:none;
                            border-radius: 3px; font-size: 0.62rem; font-weight: bold; padding: 2px 6px;">
                            PACE
                        </button>
                        <button id="btn-toggle-deg"
                            style="cursor:pointer; background: transparent; color: #888894; border:none;
                            border-radius: 3px; font-size: 0.62rem; font-weight: bold; padding: 2px 6px;">
                            DEG
                        </button>
                    </div>
                </div>

                <div id="view-pace" style="display: flex; align-items: center; justify-content: space-between;">
                    <div style="width: 40%; font-size: 0.78rem; padding-right: 5px;">
                        <div style="font-size: 1.05rem; font-weight: bold; color: #fff; margin-bottom: 4px;">
                            ${localAvgPace.toFixed(3)}s
                        </div>
                        <div style="color: ${isFasterPace ? '#4caf50' : '#e10600'}; font-weight: bold; font-size: 0.80rem;">
                            ${isFasterPace ? '▼' : '▲'} ${Math.abs(deltaPace).toFixed(3)}s
                        </div>
                        <div style="font-size: 0.62rem; color: #888894;">vs Global</div>
                    </div>
                    <div id="sidebar-boxplot-pace" style="width: 60%; height: 110px;"></div>
                </div>

                <div id="view-deg" style="display: none; align-items: center; justify-content: space-between;">
                    <div style="width: 40%; font-size: 0.78rem; padding-right: 5px;">
                        <div style="font-size: 1.0rem; font-weight: bold; color: #fff; margin-bottom: 4px;">
                            ${localAvgDeg.toFixed(3)}
                        </div>
                        <div style="color: ${isBetterDeg ? '#4caf50' : '#e10600'}; font-weight: bold; font-size: 0.80rem;">
                            ${isBetterDeg ? '▼' : '▲'} ${Math.abs(deltaDeg).toFixed(3)}
                        </div>
                        <div style="font-size: 0.62rem; color: #888894;">vs Global (s/l)</div>
                    </div>
                    <div id="sidebar-boxplot-deg" style="width: 60%; height: 110px;"></div>
                </div>
            </div>
        `;
    };

    // ---------------------------------------------------------
    // HELPER: attiva bottoni toggle PACE / DEG dopo render DOM
    // ---------------------------------------------------------
    function attachToggleButtons() {
        const btnPace = document.getElementById('btn-toggle-pace');
        const btnDeg  = document.getElementById('btn-toggle-deg');
        const viewPace = document.getElementById('view-pace');
        const viewDeg  = document.getElementById('view-deg');
        if (!btnPace || !btnDeg) return;

        btnPace.onclick = () => {
            viewPace.style.display = 'flex';
            viewDeg.style.display  = 'none';
            btnPace.style.background = '#00ffcc'; btnPace.style.color = '#000';
            btnDeg.style.background  = 'transparent'; btnDeg.style.color = '#888894';
        };
        btnDeg.onclick = () => {
            viewPace.style.display = 'none';
            viewDeg.style.display  = 'flex';
            btnDeg.style.background  = '#ff00ff'; btnDeg.style.color = '#000';
            btnPace.style.background = 'transparent'; btnPace.style.color = '#888894';
        };
    }

    // ---------------------------------------------------------
    // HELPER: aggiorna tutti i grafici + sidebar (caso standard)
    // ---------------------------------------------------------
    function commonUpdate(selectedStints, selectedLaps) {
        drawStrategyGantt(stintsData, "#gantt-chart", callbacks, selectedStints);
        drawLineChart(rawLapsData, "#line-chart", callbacks, selectedStints);
        drawParallelCoordinates(rawLapsData, "#pcp-chart", callbacks, selectedStints);
        drawPCAChart(pcaData, "#pca-chart", callbacks, selectedStints);
        drawRankingsChart(rawLapsData, "#position-chart", callbacks, selectedStints);

        updateSidebar(getComparativeStatsHTML(selectedLaps, selectedStints, globalAvgLapTime, globalAvgDegradation));

        if (selectedLaps.length > 0 && selectedStints.length > 0) {
            drawComparativeBoxplot(
                validLaps, selectedLaps, "Global", "Selected",
                "#888894", "#00ffcc", 0.15, 0.8,
                "#sidebar-boxplot-pace", d => +d.LapTimeSeconds, "s"
            );
            drawComparativeBoxplot(
                validDeg, selectedStints, "Global", "Selected",
                "#888894", "#ff00ff", 0.15, 0.8,
                "#sidebar-boxplot-deg", d => +d.DegradationSlope, "s/l"
            );
            attachToggleButtons();
        }
    }

    // ---------------------------------------------------------
    // CALLBACKS
    // ---------------------------------------------------------
    const callbacks = {

        // ---- RESET ----
        onReset: () => {
            drawStrategyGantt(stintsData, "#gantt-chart", callbacks, []);
            drawLineChart(rawLapsData, "#line-chart", callbacks, []);
            drawParallelCoordinates(rawLapsData, "#pcp-chart", callbacks, []);
            drawPCAChart(pcaData, "#pca-chart", callbacks, []);
            drawRankingsChart(rawLapsData, "#position-chart", callbacks, []);
            updateSidebar("");
        },

        // ---- CLICK STINT (Gantt) ----
        onStintClick: (selectedData) => {
            if (!selectedData || selectedData.length === 0) {
                callbacks.onReset();
                return;
            }

            let finalSelection = [];
            const driverName = selectedData[0].Driver;

            // Se non ha StintID → selezione intera corsa del pilota
            if (!selectedData[0].StintID) {
                finalSelection = stintsData.filter(s => s.Driver === driverName);
            } else {
                finalSelection = selectedData;
            }

            // Ridisegna tutti i grafici
            drawStrategyGantt(stintsData, "#gantt-chart", callbacks, finalSelection);
            drawLineChart(rawLapsData, "#line-chart", callbacks, finalSelection);
            drawParallelCoordinates(rawLapsData, "#pcp-chart", callbacks, finalSelection);
            drawPCAChart(pcaData, "#pca-chart", callbacks, finalSelection);
            drawRankingsChart(rawLapsData, "#position-chart", callbacks, finalSelection);

            // CASO A: TESTA A TESTA — 2 stint selezionati
            if (finalSelection.length === 2 && finalSelection[0].StintID) {
                const s1 = finalSelection[0];
                const s2 = finalSelection[1];

                const laps1 = validLaps.filter(d =>
                    d.Driver === s1.Driver &&
                    +d.LapNumber >= s1.LapStart && +d.LapNumber <= s1.LapEnd
                );
                const laps2 = validLaps.filter(d =>
                    d.Driver === s2.Driver &&
                    +d.LapNumber >= s2.LapStart && +d.LapNumber <= s2.LapEnd
                );

                const avg1  = d3.mean(laps1, d => +d.LapTimeSeconds);
                const avg2  = d3.mean(laps2, d => +d.LapTimeSeconds);
                const delta = Math.abs(avg1 - avg2);
                const fasterDriver = avg1 < avg2 ? s1.Driver : s2.Driver;

                const label1 = `${s1.Driver} (${s1.Compound[0]})`;
                const label2 = `${s2.Driver} (${s2.Compound[0]})`;
                const color1 = COMPOUND_COLORS[s1.Compound] || '#888';
                const color2 = COMPOUND_COLORS[s2.Compound] || '#fff';

                const specificHTML = `
                    <div style="margin-top: 10px; padding-top: 10px;">
                        <h3 style="color: #888; font-size: 0.80rem; text-transform: uppercase;
                            margin-bottom: 6px;">Pace 1 vs 1</h3>
                        <div style="display: flex; align-items: center; justify-content: space-between;">
                            <div style="width: 40%; font-size: 0.78rem; padding-right: 5px;">
                                <div style="font-size: 0.80rem; font-weight: bold; color: #fff; margin-bottom: 5px;">
                                    ${label1}<br>vs<br>${label2}
                                </div>
                                <div style="color: #4caf50; font-weight: bold; font-size: 0.78rem; margin-top: 5px;">
                                    ${fasterDriver}
                                </div>
                                <div style="font-size: 0.68rem; color: #888894;">
                                    ${delta.toFixed(3)}s faster
                                </div>
                            </div>
                            <div id="sidebar-boxplot-pace" style="width: 60%; height: 110px;"></div>
                        </div>
                    </div>
                `;
                updateSidebar(specificHTML);

                drawComparativeBoxplot(
                    laps1, laps2, label1, label2,
                    color1, color2, 0.8, 0.8,
                    "#sidebar-boxplot-pace", d => +d.LapTimeSeconds, "s"
                );

            } else {
                // CASO B: Selezione standard (1 stint o driver completo)
                const selectedLaps = validLaps.filter(d =>
                    finalSelection.some(s =>
                        d.Driver === s.Driver &&
                        +d.LapNumber >= s.LapStart && +d.LapNumber <= s.LapEnd
                    )
                );
                updateSidebar(
                    getComparativeStatsHTML(selectedLaps, finalSelection, globalAvgLapTime, globalAvgDegradation)
                );

                if (selectedLaps.length > 0) {
                    drawComparativeBoxplot(
                        validLaps, selectedLaps, "Global", "Selected",
                        "#888894", "#00ffcc", 0.15, 0.8,
                        "#sidebar-boxplot-pace", d => +d.LapTimeSeconds, "s"
                    );
                    drawComparativeBoxplot(
                        validDeg, finalSelection, "Global", "Selected",
                        "#888894", "#ff00ff", 0.15, 0.8,
                        "#sidebar-boxplot-deg", d => +d.DegradationSlope, "s/l"
                    );
                    attachToggleButtons();
                }
            }
        },

        // ---- BRUSH PCP (Parallel Coordinates) ----
        // IMPORTANTE: non chiamare mai drawParallelCoordinates() qui dentro.
        // Il PCP gestisce il proprio highlighting internamente (clickedStints / selections).
        // Ridisegnarlo distruggerebbe brush e stato, selezionando tutte le linee.
        onPCPBrush: (activeStints) => {
            if (!activeStints || activeStints.length === 0) {
                // Aggiorna solo gli ALTRI grafici, il PCP si è già auto-resettato
                drawStrategyGantt(stintsData, "#gantt-chart", callbacks, []);
                drawLineChart(rawLapsData, "#line-chart", callbacks, []);
                drawPCAChart(pcaData, "#pca-chart", callbacks, []);
                drawRankingsChart(rawLapsData, "#position-chart", callbacks, []);
                updateSidebar("");
                return;
            }

            // Traduzione: dati PCP aggregati → stint reali del dataset
            const selectedStints = stintsData.filter(stint =>
                activeStints.some(active =>
                    active.Driver === stint.Driver &&
                    Math.max(active.LapStart, stint.LapStart) <= Math.min(active.LapEnd, stint.LapEnd)
                )
            );

            // Giri corrispondenti agli stint selezionati
            const selectedLaps = validLaps.filter(d =>
                selectedStints.some(s =>
                    d.Driver === s.Driver &&
                    +d.LapNumber >= s.LapStart && +d.LapNumber <= s.LapEnd
                )
            );

            // Aggiorna tutti gli ALTRI grafici — MAI il PCP stesso
            drawStrategyGantt(stintsData, "#gantt-chart", callbacks, selectedStints);
            drawLineChart(rawLapsData, "#line-chart", callbacks, selectedStints);
            drawPCAChart(pcaData, "#pca-chart", callbacks, selectedStints);
            drawRankingsChart(rawLapsData, "#position-chart", callbacks, selectedStints);

            // Sidebar con toggle PACE / DEG
            updateSidebar(
                getComparativeStatsHTML(selectedLaps, selectedStints, globalAvgLapTime, globalAvgDegradation)
            );

            if (selectedLaps.length > 0 && selectedStints.length > 0) {
                drawComparativeBoxplot(
                    validLaps, selectedLaps, "Global", "Selected",
                    "#888894", "#00ffcc", 0.15, 0.8,
                    "#sidebar-boxplot-pace", d => +d.LapTimeSeconds, "s"
                );
                drawComparativeBoxplot(
                    validDeg, selectedStints, "Global", "Selected",
                    "#888894", "#ff00ff", 0.15, 0.8,
                    "#sidebar-boxplot-deg", d => +d.DegradationSlope, "s/l"
                );
                attachToggleButtons();
            }
        },

        // ---- BRUSH RANKING CHART ----
        onRankingBrush: (selectedDrivers, minLap, maxLap) => {
            if (!selectedDrivers || selectedDrivers.length === 0) {
                drawRankingsChart(rawLapsData, "#position-chart", callbacks, []);
                updateSidebar("");
                return;
            }

            const selectedStints = stintsData.filter(s =>
                selectedDrivers.includes(s.Driver) &&
                s.LapStart <= maxLap && s.LapEnd >= minLap
            );
            const selectedLaps = validLaps.filter(d =>
                selectedDrivers.includes(d.Driver) &&
                +d.LapNumber >= minLap && +d.LapNumber <= maxLap
            );

            commonUpdate(selectedStints, selectedLaps);
        },

        // ---- BRUSH PCA ----
        onPCABrush: (activeStints) => {
            if (!activeStints || activeStints.length === 0) {
                drawStrategyGantt(stintsData, "#gantt-chart", callbacks, []);
                drawLineChart(rawLapsData, "#line-chart", callbacks, []);
                drawParallelCoordinates(rawLapsData, "#pcp-chart", callbacks, []);
                drawRankingsChart(rawLapsData, "#position-chart", callbacks, []);
                updateSidebar("");
                return;
            }

            // Traduzione punti PCA → stint reali
            const selectedStints = stintsData.filter(stint =>
                activeStints.some(p =>
                    (p.StintID && p.StintID === stint.StintID) ||
                    (p.Driver === stint.Driver && p.StintNumber === stint.StintNumber) ||
                    (p.Driver === stint.Driver && p.LapStart === stint.LapStart)
                )
            );
            const selectedLaps = validLaps.filter(d =>
                selectedStints.some(s =>
                    d.Driver === s.Driver &&
                    +d.LapNumber >= s.LapStart && +d.LapNumber <= s.LapEnd
                )
            );

            drawStrategyGantt(stintsData, "#gantt-chart", callbacks, selectedStints);
            drawLineChart(rawLapsData, "#line-chart", callbacks, selectedStints);
            drawParallelCoordinates(rawLapsData, "#pcp-chart", callbacks, selectedStints);
            drawRankingsChart(rawLapsData, "#position-chart", callbacks, selectedStints);

            updateSidebar(
                `<div style="margin-top:8px;">
                    <h3 style="color:#00ffcc; font-size:0.85rem; margin-bottom:4px;">PCA Cluster Selected</h3>
                    <p style="font-size:0.82rem;">Stints in cluster: <strong>${selectedStints.length}</strong></p>
                </div>` +
                getComparativeStatsHTML(selectedLaps, selectedStints, globalAvgLapTime, globalAvgDegradation)
            );

            if (selectedLaps.length > 0 && selectedStints.length > 0) {
                drawComparativeBoxplot(
                    validLaps, selectedLaps, "Global", "Selected",
                    "#888894", "#00ffcc", 0.15, 0.8,
                    "#sidebar-boxplot-pace", d => +d.LapTimeSeconds, "s"
                );
                drawComparativeBoxplot(
                    validDeg, selectedStints, "Global", "Selected",
                    "#888894", "#ff00ff", 0.15, 0.8,
                    "#sidebar-boxplot-deg", d => +d.DegradationSlope, "s/l"
                );
                attachToggleButtons();
            }
        },

        // ---- PIT CLICK ----
        onPitClick: (pitData) => { /* reserved for future use */ }
    };

    // Render iniziale
    callbacks.onReset();
}

// =========================================================
// BOXPLOT COMPARATIVO
// =========================================================
function drawComparativeBoxplot(
    data1, data2, label1, label2,
    color1, color2, opacity1, opacity2,
    containerSelector, valueAccessor, unit
) {
    const container = d3.select(containerSelector);
    container.selectAll("*").remove();
    container.style("overflow", "hidden").style("width", "100%");

    if (!data1 || !data2 || data1.length === 0 || data2.length === 0) return;

    const isSingleSelection = data2.length === 1;

    function getBoxplotStats(data) {
        let vals = data
            .map(valueAccessor)
            .filter(d => d !== null && !isNaN(d))
            .sort(d3.ascending);

        if (vals.length === 0) return null;

        // Pulizia outlier F1
        if (unit === 's') {
            if (vals[0] > 10) {
                const fastest = vals[0];
                vals = vals.filter(v => v <= fastest * 1.10);
            }
        } else if (unit === 's/l') {
            vals = vals.filter(v => v >= -0.1 && v <= 0.4);
        }

        const q1     = d3.quantile(vals, 0.25);
        const median = d3.quantile(vals, 0.50);
        const q3     = d3.quantile(vals, 0.75);
        const iqr    = q3 - q1;
        const minVal = Math.max(vals[0], q1 - 1.5 * iqr);
        const maxVal = Math.min(vals[vals.length - 1], q3 + 1.5 * iqr);
        const outliers = vals.filter(v => v < minVal || v > maxVal);

        return { q1, median, q3, iqr, min: minVal, max: maxVal, outliers, vals };
    }

    const stats1 = getBoxplotStats(data1);
    let stats2 = null;
    let singleValue = null;

    if (isSingleSelection) {
        singleValue = valueAccessor(data2[0]);
    } else {
        stats2 = getBoxplotStats(data2);
    }

    if (!stats1 || (!stats2 && !isSingleSelection)) return;

    // Dimensioni
    const node   = container.node();
    const width  = (node ? node.getBoundingClientRect().width : 200) || 200;
    const height = 130;
    const margin = { top: 15, right: 15, bottom: 25, left: 40 };

    const svg = container.append("svg")
        .attr("width", "100%")
        .attr("height", height)
        .style("display", "block");

    // Scale
    let yMin = stats1.min;
    let yMax = stats1.max;
    if (isSingleSelection) {
        yMin = Math.min(yMin, singleValue);
        yMax = Math.max(yMax, singleValue);
    } else {
        yMin = Math.min(yMin, stats2.min);
        yMax = Math.max(yMax, stats2.max);
    }

    const padding = (yMax - yMin) * 0.15;
    const yScale  = d3.scaleLinear()
        .domain([yMin - padding, yMax + padding])
        .range([height - margin.bottom, margin.top]);

    const xScale = d3.scaleBand()
        .domain(isSingleSelection ? [label1] : [label1, label2])
        .range([margin.left, width - margin.right])
        .paddingInner(0.4);

    // Griglia
    svg.append("g")
        .attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(yScale).ticks(4).tickSize(-(width - margin.left - margin.right)).tickFormat(""))
        .selectAll("line").attr("stroke", "rgba(255,255,255,0.05)");

    // Asse Y
    svg.append("g")
        .attr("transform", `translate(${margin.left},0)`)
        .call(
            d3.axisLeft(yScale).ticks(4)
              .tickFormat(d => d.toFixed(unit === 's/l' ? 3 : 1) + (unit === 's' ? 's' : ''))
        )
        .selectAll("text")
        .style("fill", "#888894")
        .style("font-size", "8px")
        .style("font-family", "monospace");

    // Asse X
    svg.append("g")
        .attr("transform", `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(xScale))
        .selectAll("text")
        .style("fill", "#fff")
        .style("font-size", "9px")
        .style("font-weight", "bold");

    svg.selectAll(".domain").remove();

    // Funzione disegno box
    function drawBox(stats, name, color, opacity) {
        const x      = xScale(name);
        const w      = xScale.bandwidth();
        const center = x + w / 2;
        const g      = svg.append("g");

        // Baffo verticale
        g.append("line")
            .attr("x1", center).attr("x2", center)
            .attr("y1", yScale(stats.min)).attr("y2", yScale(stats.max))
            .attr("stroke", color).attr("stroke-width", 1.2);

        // Box IQR
        g.append("rect")
            .attr("x", x).attr("width", w)
            .attr("y", yScale(stats.q3))
            .attr("height", Math.max(1, yScale(stats.q1) - yScale(stats.q3)))
            .attr("fill", color).attr("fill-opacity", opacity)
            .attr("stroke", color).attr("stroke-width", 1.2);

        // Mediana
        g.append("line")
            .attr("x1", x).attr("x2", x + w)
            .attr("y1", yScale(stats.median)).attr("y2", yScale(stats.median))
            .attr("stroke", "#fff").attr("stroke-width", 2);

        // Outlier
        g.selectAll(".outlier")
            .data(stats.outliers)
            .enter()
            .append("circle")
            .attr("cx", center)
            .attr("cy", d => yScale(d))
            .attr("r", 2)
            .attr("fill", color)
            .attr("opacity", 0.3);
    }

    // Disegna box principale (distribuzione globale)
    drawBox(stats1, label1, color1, opacity1);

    if (isSingleSelection) {
        // Valore singolo sovrapposto
        const center = xScale(label1) + xScale.bandwidth() / 2;

        svg.append("circle")
            .attr("cx", center)
            .attr("cy", yScale(singleValue))
            .attr("r", 5)
            .attr("fill", color2)
            .attr("stroke", "#fff")
            .attr("stroke-width", 1.5)
            .style("filter", "drop-shadow(0px 0px 2px rgba(0,0,0,0.5))");

        svg.append("text")
            .attr("x", center + 8)
            .attr("y", yScale(singleValue))
            .attr("dy", "0.35em")
            .style("fill", color2)
            .style("font-size", "9px")
            .style("font-weight", "bold")
            .text(singleValue.toFixed(3));

    } else {
        // Due boxplot a confronto
        drawBox(stats2, label2, color2, opacity2);
    }
}

// =========================================================
// INIT
// =========================================================
document.addEventListener('DOMContentLoaded', () => {
    initDashboard();
    createLegends();
});