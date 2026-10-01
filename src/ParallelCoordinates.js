import * as d3 from 'd3';

const COMPOUND_COLORS = {
    "SOFT":         "#e10600",
    "MEDIUM":       "#ffeb3b",
    "HARD":         "#ffffff",
    "INTERMEDIATE": "#4caf50",
    "WET":          "#2196f3",
    "UNKNOWN":      "#888888"
};

export function drawParallelCoordinates(rawData, containerId, callbacks, selectedStints = []) {

    // =========================================================
    // 1. AGGREGAZIONE E CALCOLO ANALYTICS
    // =========================================================
    const stintsMap = new Map();
    let currentStint = null;
    let prevLap = null;

    const bestS1 = d3.min(rawData, d => +d.Sector1Seconds > 0 ? +d.Sector1Seconds : Infinity);
    const bestS2 = d3.min(rawData, d => +d.Sector2Seconds > 0 ? +d.Sector2Seconds : Infinity);
    const bestS3 = d3.min(rawData, d => +d.Sector3Seconds > 0 ? +d.Sector3Seconds : Infinity);

    const sortedData = rawData.slice().sort((a, b) =>
        d3.ascending(a.Driver, b.Driver) || d3.ascending(+a.LapNumber, +b.LapNumber)
    );

    sortedData.forEach(d => {
        const lapNum   = +d.LapNumber;
        const tyreLife = +d.TyreLife;

        if (
            !currentStint ||
            d.Driver !== prevLap.Driver ||
            tyreLife < prevLap.TyreLife ||
            d.Compound !== prevLap.Compound
        ) {
            if (currentStint && currentStint.laps.length > 0) {
                stintsMap.set(currentStint.id, currentStint);
            }
            currentStint = {
                id:       `${d.Driver}_${lapNum}`,
                Driver:   d.Driver,
                Compound: d.Compound || "UNKNOWN",
                LapStart: lapNum,
                LapEnd:   lapNum,
                laps:     []
            };
        }

        currentStint.LapEnd = lapNum;

        if (+d.Sector1Seconds > 0 && +d.Sector2Seconds > 0 && +d.Sector3Seconds > 0) {
            currentStint.laps.push({
                s1:    +d.Sector1Seconds,
                s2:    +d.Sector2Seconds,
                s3:    +d.Sector3Seconds,
                speed: +d.SpeedST,
                speedFL: +d.SpeedFL, // Recupero Speed FL
                time:  +d.LapTimeSeconds,
                trackTemp: +d.TrackTemp
            });
        }
        prevLap = d;
    });

    if (currentStint && currentStint.laps.length > 0) {
        stintsMap.set(currentStint.id, currentStint);
    }

    const validData = Array.from(stintsMap.values()).map(s => {
        const avgS1 = d3.mean(s.laps, l => l.s1);
        const avgS2 = d3.mean(s.laps, l => l.s2);
        const avgS3 = d3.mean(s.laps, l => l.s3);

        return {
            StintID:           s.id,
            Driver:            s.Driver,
            Compound:          s.Compound,
            LapStart:          s.LapStart,
            LapEnd:            s.LapEnd,
            StintLength:       s.laps.length,
            StintNumber:       s.StintNumber,
            "Track Temp":      d3.mean(s.laps, l => l.trackTemp),
            "S1 Delta":        avgS1 - bestS1,
            "S2 Delta":        avgS2 - bestS2,
            "S3 Delta":        avgS3 - bestS3,
            "Speed ST":        d3.mean(s.laps, l => l.speed),
            "Speed FL":        d3.mean(s.laps, l => l.speedFL), // Media Speed FL
            "Consistency Std": d3.deviation(s.laps, l => l.time) || 0
        };
    }).filter(d => d.StintLength > 2);

    if (!validData || validData.length === 0) return;

    const hasSelection = selectedStints && selectedStints.length > 0;

    // =========================================================
    // 2. SETUP CONTENITORE
    // =========================================================
    const container = d3.select(containerId);
    container.selectAll("*").remove();

    const node        = container.node();
    const width       = node.clientWidth  || 800;
    const height      = node.clientHeight || 300;
    const margin      = { top: 35, right: 25, bottom: 15, left: 25 };
    const innerWidth  = width  - margin.left - margin.right;
    const innerHeight = height - margin.top  - margin.bottom;

    const svg = container.append("svg")
        .attr("width",  "100%")
        .attr("height", "100%")
        .on("dblclick", event => {
            event.preventDefault();
            clickedStints.clear();
            selections.clear();
            applyLineStyles();
            if (callbacks?.onReset) callbacks.onReset();
        });

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    // =========================================================
    // 3. SCALE (Aggiunta Speed FL alle dimensioni)
    // =========================================================
    const dimensions = [
        "StintLength", "Track Temp", "S1 Delta", "S2 Delta", "S3 Delta", "Speed ST", "Speed FL", "Consistency Std"
    ];

    const y = {};
    dimensions.forEach(dim => {
        const extent = d3.extent(validData, d => +d[dim]);
        if (dim.includes("Delta") || dim.includes("Std")) {
            y[dim] = d3.scaleLinear().domain(extent).range([0, innerHeight]);
        } else {
            y[dim] = d3.scaleLinear().domain(extent).range([innerHeight, 0]);
        }
    });

    const x = d3.scalePoint().range([0, innerWidth]).padding(0.8).domain(dimensions);
    const lineGenerator = d => d3.line()(dimensions.map(p => [x(p), y[p](d[p])]));
    const tooltip = d3.select("#tooltip");

    // =========================================================
    // STATO SELEZIONE
    // =========================================================
    const clickedStints = new Set();
    const selections    = new Map();

    function isLineActive(d) {
        if (selections.size > 0) {
            return Array.from(selections).every(([dim, sel]) =>
                +d[dim] >= sel[0] && +d[dim] <= sel[1]
            );
        }
        if (clickedStints.size > 0) {
            return clickedStints.has(d.StintID);
        }
        if (hasSelection) {
            return selectedStints.some(s =>
                s.Driver === d.Driver &&
                Math.max(+s.LapStart, +d.LapStart) <= Math.min(+s.LapEnd, +d.LapEnd)
            );
        }
        return true;
    }

    function getLineOpacity(d) {
        const anySel = selections.size > 0 || clickedStints.size > 0 || hasSelection;
        if (!anySel) return 0.4;
        return isLineActive(d) ? 0.9 : 0.05;
    }

    function getLineWidth(d) {
        const anySel = selections.size > 0 || clickedStints.size > 0 || hasSelection;
        if (!anySel) return 1.5;
        return isLineActive(d) ? 2.5 : 1.5;
    }

    function applyLineStyles() {
        lines
            .style("opacity",      d => getLineOpacity(d))
            .style("stroke-width", d => getLineWidth(d))
            .each(function(d) { if(isLineActive(d)) d3.select(this).raise(); });
    }

    // =========================================================
    // 4. DISEGNO LINEE
    // =========================================================
    const lines = g.append("g")
        .attr("class", "lines")
        .selectAll("path")
        .data(validData)
        .enter()
        .append("path")
        .attr("d", lineGenerator)
        .style("fill",         "none")
        .style("stroke",        d => COMPOUND_COLORS[d.Compound] || COMPOUND_COLORS["UNKNOWN"])
        .style("stroke-width", 1.5)
        .style("opacity",      0.4)
        .style("cursor",       "pointer")
        .on("mouseover", function(event, d) {
            d3.select(this).style("stroke-width", 4).style("opacity", 1).raise();
            tooltip.classed("hidden", false).style("opacity", 1)
                .html(`
                    <div style="border-left:3px solid ${COMPOUND_COLORS[d.Compound] || '#888'}; padding-left:8px;">
                        <div style="font-weight:600; font-size:0.9rem; display:flex; justify-content:space-between; margin-bottom:4px;">
                            <span>${d.Driver} <span style="font-weight:400; color:#aaa;">(${d.Compound})</span></span>
                            <span style="color:#aaa; font-weight:400; font-size:0.75rem;">L${d.LapStart}-${d.LapEnd}</span>
                        </div>
                        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:4px 8px; font-size:0.72rem; background:rgba(255,255,255,0.03); padding:6px; border-radius:4px;">
                            <div style="color:#00ffcc;">S1: <b>+${d["S1 Delta"].toFixed(3)}s</b></div>
                            <div style="color:#00ffcc;">S2: <b>+${d["S2 Delta"].toFixed(3)}s</b></div>
                            <div style="color:#00ffcc;">S3: <b>+${d["S3 Delta"].toFixed(3)}s</b></div>
                            <div style="grid-column:span 3; border-top:1px solid #444; margin:2px 0;"></div>
                            <div>Speed ST: <b>${d["Speed ST"] ? d["Speed ST"].toFixed(0) : "N/A"}</b></div>
                            <div>Speed FL: <b>${d["Speed FL"] ? d["Speed FL"].toFixed(0) : "N/A"}</b></div>
                            <div>Track: <b>${d["Track Temp"] ? d["Track Temp"].toFixed(1) : "N/A"}°C</b></div>
                        </div>
                    </div>
                `);
            updateTooltipPosition(event);
        })
        .on("mousemove", updateTooltipPosition)
       // In ParallelCoordinates.js
.on("mouseleave", function(event, d) {
    // Nascondi il tooltip
    tooltip.classed("hidden", true);
    
    // IMPORTANTE: Non settare .style("opacity", 0) qui se gli altri grafici non la resettano.
    // Oppure, se vuoi resettarla, assicurati di farlo ovunque.
    
    // Ripristina lo stile della linea
    d3.select(this)
        .style("stroke-width", getLineWidth(d))
        .style("opacity", getLineOpacity(d));
})
        .on("click", function(event, d) {
            event.stopPropagation();
            selections.clear();
            svg.selectAll(".brush").call(d3.brushY().move, null);
            if (clickedStints.has(d.StintID)) clickedStints.delete(d.StintID);
            else { clickedStints.clear(); clickedStints.add(d.StintID); }
            applyLineStyles();
            if (callbacks?.onPCPBrush) {
                const selected = clickedStints.size === 0 ? [] : validData.filter(v => clickedStints.has(v.StintID));
                callbacks.onPCPBrush(selected);
            }
        });

    // =========================================================
    // 5. ASSI E BRUSH
    // =========================================================
    const axes = g.selectAll(".axis")
        .data(dimensions).enter().append("g").attr("class", "axis")
        .attr("transform", d => `translate(${x(d)},0)`)
        .each(function(d) { d3.select(this).call(d3.axisLeft(y[d]).ticks(5)); });

    axes.selectAll("text").style("fill", "#888").style("font-size", "10px");
    axes.selectAll("path, line").style("stroke", "#888");
    axes.append("text").style("text-anchor", "middle").attr("y", -15).text(d => d)
        .style("fill", "#888").style("font-weight", "bold").style("font-size", "11px");

    axes.append("g").attr("class", "brush").each(function(d) {
        d3.select(this).call(d3.brushY().extent([[-15, 0], [15, innerHeight]]).on("start brush end", e => brushed(e, d)));
    });

    function brushed(event, dim) {
        const selection = event.selection;
        if (!selection) selections.delete(dim);
        else {
            clickedStints.clear();
            const val1 = y[dim].invert(selection[0]), val2 = y[dim].invert(selection[1]);
            selections.set(dim, [Math.min(val1, val2), Math.max(val1, val2)]);
        }
        applyLineStyles();
        if (callbacks?.onPCPBrush) {
            const filtered = selections.size === 0 ? [] : validData.filter(d => 
                Array.from(selections).every(([dm, sel]) => +d[dm] >= sel[0] && +d[dm] <= sel[1])
            );
            callbacks.onPCPBrush(filtered);
        }
    }

    applyLineStyles();
}

function updateTooltipPosition(event) {
    const tooltip = d3.select("#tooltip");
    const node = tooltip.node();
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const padding = 20, verticalOffset = 120;
    let tx = event.pageX - rect.width / 2, ty = event.pageY - rect.height - verticalOffset;
    if (event.clientY < rect.height + verticalOffset + padding) ty = event.pageY + verticalOffset;
    if (tx < padding) tx = padding;
    if (tx + rect.width > window.innerWidth - padding) tx = window.innerWidth - rect.width - padding;
    tooltip.style("left", tx + "px").style("top", ty + "px").style("transform", "none");
}