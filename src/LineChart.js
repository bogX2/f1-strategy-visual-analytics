import * as d3 from 'd3';

const TEAM_COLORS = {
    "Ferrari": "#e8002d",
    "McLaren": "#ff8000",
    "Mercedes": "#27f4d2",
    "Red Bull Racing": "#3671c6",
    "Aston Martin": "#229971",
    "Alpine": "#0093cc",
    "Williams": "#64c4ff",
    "RB": "#6692ff",
    "Kick Sauber": "#52e252",
    "Haas F1 Team": "#ffffff"
};

// 1. Palette Lampprecht (Coerente con RankingsChart)
const lampprechtPalette = [
    // P1 - P5: Verdi (da verde scuro a foresta, molto saturi)
    "#004d00", "#008000", "#228b22", "#32cd32", "#7cfc00", 
    
    // P6 - P10: Gialli/Lime (Ora più differenziati: da lime a giallo oro)
    "#befd2d", "#d4ff00", "#ffff00", "#ffd700", "#ffcc00", 
    
    // P11 - P15: Arancioni (Passaggio netto dal giallo all'ambra/arancio)
    "#ffaa00", "#ff8c00", "#ff7b00", "#ff6200", "#ff4500", 
    
    // P16 - P20: Rossi (Da rosso vivo a bordeaux scuro)
    "#ff0000", "#e60000", "#cc0000", "#990000", "#660000"
];
const getRankColor = (position) => {
    const index = Math.max(0, Math.min(Math.floor(position) - 1, lampprechtPalette.length - 1));
    return lampprechtPalette[index];
};

export function drawLineChart(rawData, containerId, callbacks, selectedStints = []) {
    const data = rawData.map(d => ({
        ...d,
        LapNumber: +d.LapNumber,
        LapTime: +d.LapTimeSeconds,
        Position: +d.Position,
        TyreLife: +d.TyreLife,
        Driver: d.Driver,
        Team: d.Team,
        IsSafetyCar: d.IsSafetyCar === "True" || d.IsSafetyCar === "true"
    })).filter(d => d.LapNumber > 0 && d.LapTime > 0);

    if (!data || data.length === 0) return; 

    const hasSelection = selectedStints && selectedStints.length > 0;
    const isDriverSelected = (driver) => hasSelection && selectedStints.some(s => s.Driver === driver);
    const isLapInSelectedStints = (driver, lap) => hasSelection && selectedStints.some(s => s.Driver === driver && lap >= s.LapStart && lap <= s.LapEnd);

    // --- LOGICA COLORI PER PILOTA ---
    const driverColors = new Map();
    const lapsByDriver = d3.group(data, d => d.Driver);
    
    // Calcoliamo i colori basati sulla posizione finale
    lapsByDriver.forEach((laps, driver) => {
        const sorted = laps.sort((a, b) => a.LapNumber - b.LapNumber);
        const finalPos = sorted[sorted.length - 1].Position;
        driverColors.set(driver, getRankColor(finalPos));
    });

    // --- SETUP SCALARE ---
    const sortedLapTimes = data.map(d => d.LapTime).sort(d3.ascending);
    const minLapTime = sortedLapTimes[0];
    const p90LapTime = d3.quantile(sortedLapTimes, 0.90); 

    const container = d3.select(containerId);
    container.selectAll("*").remove();

    const containerNode = container.node();
    const width = containerNode.clientWidth;
    const height = containerNode.clientHeight;
    const margin = { top: 15, right: 0, bottom: 17, left: 33 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = container.append("svg")
        .attr("width", "100%")
        .attr("height", "100%")
        .on("dblclick", function(event) {
            event.preventDefault();
            if (callbacks && callbacks.onReset) callbacks.onReset();
        });

    // --- DEFINIZIONE FILTRI PER PROFONDITÀ ---
    const defs = svg.append("defs");
    
    // Filtro per dare un leggero stacco tra le linee (drop shadow leggera)
    const filter = defs.append("filter")
        .attr("id", "line-shadow")
        .attr("x", "-20%")
        .attr("y", "-20%")
        .attr("width", "140%")
        .attr("height", "140%");
    filter.append("feGaussianBlur")
        .attr("in", "SourceAlpha")
        .attr("stdDeviation", "0.8");
    filter.append("feOffset")
        .attr("dx", "0")
        .attr("dy", "0.5")
        .attr("result", "offsetblur");
    const feMerge = filter.append("feMerge");
    feMerge.append("feMergeNode");
    feMerge.append("feMergeNode").attr("in", "SourceGraphic");

    defs.append("clipPath")
        .attr("id", "clip")
        .append("rect")
        .attr("width", innerWidth)
        .attr("height", innerHeight);

    const g = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    const xScale = d3.scaleLinear().domain(d3.extent(data, d => d.LapNumber)).range([0, innerWidth]);
    const yScale = d3.scaleLinear().domain([p90LapTime, minLapTime - 0.5]).range([innerHeight, 0]).clamp(true);
    const FixedRadius = 2.5;

    // --- ASSI E GRIGLIA ---
    g.append("g")
        .attr("class", "grid")
        .attr("stroke-opacity", 0.1)
        .attr("color", "#888")
        .call(d3.axisLeft(yScale).ticks(8).tickSize(-innerWidth).tickFormat(""));

    g.append("g")
        .attr("transform", `translate(0,${innerHeight})`)
        .call(d3.axisBottom(xScale).tickFormat(d => `L${d}`))
        .attr("color", "#888")
        .selectAll("text")
        .style("fill", "#888");

    g.append("g")
        .call(d3.axisLeft(yScale).ticks(8).tickFormat(d => d.toFixed(1) + "s"))
        .attr("color", "#888")
        .selectAll("text")
        .style("fill", "#888");

    const plotArea = g.append("g").attr("clip-path", "url(#clip)");

    // Bande Safety Car
    const scLaps = Array.from(new Set(data.filter(d => d.IsSafetyCar).map(d => d.LapNumber)));
    plotArea.selectAll(".sc-band").data(scLaps).enter().append("rect")
        .attr("x", d => xScale(d - 0.5)).attr("y", 0)
        .attr("width", d => xScale(d + 0.5) - xScale(d - 0.5))
        .attr("height", innerHeight).attr("fill", "#ffffff").attr("opacity", 0.05);

    const lineGenerator = d3.line()
        .x(d => xScale(d.LapNumber))
        .y(d => yScale(d.LapTime))
        .defined(d => !isNaN(d.LapTime) && d.LapTime > 0)
        .curve(d3.curveMonotoneX);

    const linesGroup = plotArea.append("g");
    const circlesGroup = plotArea.append("g");
    const tooltip = d3.select("#tooltip");

    // --- DISEGNO LINEE E PUNTI ---
    lapsByDriver.forEach((laps, driver) => {
        const color = driverColors.get(driver);
        const isThisDriverSelected = isDriverSelected(driver);

        linesGroup.append("path")
            .datum(laps)
            .attr("fill", "none")
            .attr("stroke", color)
            // Aumentati spessori base: da 1.2 a 2.2 per visibilità a riposo
            .attr("stroke-width", hasSelection ? (isThisDriverSelected ? 4.0 : 0.8) : 2.2)
            // Opacità aumentata: da 0.6 a 0.8 per colori più vivaci a riposo
            .attr("opacity", hasSelection ? (isThisDriverSelected ? 1 : 0.1) : 0.8)
            .attr("d", lineGenerator)
            .style("stroke-linejoin", "round")
            .style("stroke-linecap", "round")
            .style("filter", "url(#line-shadow)") // Applica lo stacco tra le linee
            .style("transition", "stroke-width 0.2s, opacity 0.2s");

        circlesGroup.selectAll(`.circle-${driver}`)
            .data(laps).enter().append("circle")
            .attr("cx", d => xScale(d.LapNumber))
            .attr("cy", d => yScale(d.LapTime))
            .attr("r", d => FixedRadius)
            .attr("fill", color)
            .attr("opacity", d => isLapInSelectedStints(d.Driver, d.LapNumber) ? 1 : 0)
            .attr("stroke", "#ffffff")
            .attr("stroke-width", 0.5)
           
.on("mouseover", function(event, d) {
    // 1. Logica di evidenziazione (esistente)
    d3.select(this.parentNode.parentNode).selectAll("path")
        .filter(pathData => pathData && pathData[0].Driver === d.Driver)
        .raise()
        .attr("stroke-width", 4.5)
        .attr("opacity", 1);

    d3.select(this)
        .attr("opacity", 1)
        .attr("stroke-width", 2)
        .attr("r", FixedRadius + 2)
        .raise();

    // 2. Definizione colori per il tooltip
    const compColor = d.Compound === 'SOFT' ? '#e10600' : d.Compound === 'MEDIUM' ? '#ffeb3b' : '#ffffff';
    const driverColor = driverColors.get(d.Driver);

    // 3. Tooltip Compatto (Strategia 1)
    tooltip.classed("hidden", false)
        .html(`
            <div style="border-left: 4px solid ${driverColor}; padding-left: 8px;">
                <div style="font-weight: bold; font-size: 0.9rem; margin-bottom: 4px; display: flex; justify-content: space-between; gap: 15px;">
                    <span>${d.Driver}</span>
                    <span style="color:#aaa; font-weight:normal; font-size:0.75rem;">Lap L${d.LapNumber}</span>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px 12px; font-size: 0.75rem; background: rgba(255,255,255,0.03); padding: 6px; border-radius: 4px;">
                    <div>Time: <b style="color:#fff;">${d.LapTime.toFixed(3)}s</b></div>
                    <div>Speed: <b style="color:#00ffcc;">${d.SpeedST || 'N/A'}</b></div>
                    <div>Tyre: <b style="color:${compColor}">${d.Compound}</b></div>
                    <div>Age: <b>${d.TyreLife} laps</b></div>
                    ${d.IsSafetyCar ? '<div style="grid-column: span 2; color: #ffd400; font-weight: bold; font-size: 0.7rem; border-top: 1px solid #444; padding-top:2px;">⚠️ SAFETY CAR</div>' : ''}
                </div>
            </div>
        `);
    
    // 4. Posizionamento (Strategia 2)
    updateLineChartTooltipPosition(event);
})
.on("mousemove", function(event) {
    updateLineChartTooltipPosition(event);
})
.on("mouseout", function(event, d) {
    const selected = isLapInSelectedStints(d.Driver, d.LapNumber);
    const isThisDriverSelected = isDriverSelected(d.Driver);

    // Ripristina la linea
    d3.select(this.parentNode.parentNode).selectAll("path")
        .filter(pathData => pathData && pathData[0].Driver === d.Driver)
        .attr("stroke-width", hasSelection ? (isThisDriverSelected ? 4.0 : 0.8) : 2.2)
        .attr("opacity", hasSelection ? (isThisDriverSelected ? 1 : 0.1) : 0.8);

    d3.select(this)
        .attr("opacity", selected ? 1 : 0)
        .attr("r", FixedRadius)
        .attr("stroke-width", 0.5);
        
    tooltip.classed("hidden", true);
});

// --- FUORI dalla funzione drawLineChart (o in fondo al file) ---

function updateLineChartTooltipPosition(event) {
    const tooltip = d3.select("#tooltip");
    const node = tooltip.node();
    if (!node) return;

    const rect = node.getBoundingClientRect();
    const padding = 20;
    const verticalDistance = 120; // Grande offset per non coprire il groviglio di linee
    
    let x = event.pageX - (rect.width / 2); // Centra rispetto al mouse
    let y = event.pageY - rect.height - verticalDistance; // Default: Sopra

    // Inversione se tocca il bordo superiore (Strategia 2)
    if (event.clientY < (rect.height + verticalDistance + padding)) {
        y = event.pageY + verticalDistance; // Sposta Sotto
    }

    // Vincoli laterali
    if (x < padding) x = padding;
    if (x + rect.width > window.innerWidth - padding) {
        x = window.innerWidth - rect.width - padding;
    }

    tooltip
        .style("left", x + "px")
        .style("top", y + "px")
        .style("transform", "none");
}
});

    // --- ANALISI STINT SELEZIONATI (Regressione e Crossover) ---
    if (hasSelection) {
        selectedStints.forEach(stint => {
            if (!stint.LapStart || stint.DegradationSlope === undefined) return;

            const startX = xScale(stint.LapStart);
            const endX = xScale(stint.LapEnd);
            const midLap = (stint.LapStart + stint.LapEnd) / 2;
            const startY = yScale(stint.AvgLapTime - (midLap - stint.LapStart) * stint.DegradationSlope);
            const endY = yScale(stint.AvgLapTime + (stint.LapEnd - midLap) * stint.DegradationSlope);

            // Retta di regressione (Degrado)
            plotArea.append("line")
                .attr("x1", startX).attr("y1", startY).attr("x2", endX).attr("y2", endY)
                .attr("stroke", "#ffffff").attr("stroke-width", 2.5).attr("stroke-dasharray", "4,4")
                .style("filter", "drop-shadow(0px 0px 2px rgba(255,255,255,0.4))");

            // Banda colore del Team
            plotArea.append("polygon")
                .attr("points", `${startX},${startY-10} ${endX},${endY-10} ${endX},${endY+10} ${startX},${startY+10}`)
                .attr("fill", TEAM_COLORS[stint.Team] || "#ffffff").attr("opacity", 0.15).lower();
        });

        // Calcolo Crossover Point (solo se 2 stint selezionati)
        if (selectedStints.length === 2) {
            const s1 = selectedStints[0], s2 = selectedStints[1];
            const m1 = s1.DegradationSlope, m2 = s2.DegradationSlope;
            if (m1 !== m2) {
                const q1 = s1.AvgLapTime - (m1 * ((s1.LapStart + s1.LapEnd) / 2));
                const q2 = s2.AvgLapTime - (m2 * ((s2.LapStart + s2.LapEnd) / 2));
                const crossoverLap = (q2 - q1) / (m1 - m2);

                if (crossoverLap > 0 && crossoverLap < 100) {
                    const cx = xScale(crossoverLap);
                    plotArea.append("line").attr("x1", cx).attr("y1", 0).attr("x2", cx).attr("y2", innerHeight)
                        .attr("stroke", "#ff00ff").attr("stroke-width", 2.5).attr("stroke-dasharray", "5,5");
                    plotArea.append("text").attr("x", cx + 8).attr("y", 20).attr("fill", "#ff00ff")
                        .style("font-weight", "bold")
                        .style("text-shadow", "0px 0px 3px rgba(0,0,0,0.8)")
                        .text(`Crossover L${Math.round(crossoverLap)}`);
                }
            }
        }
    }
}