import * as d3 from 'd3';

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
    const index = Math.max(0, Math.min(position - 1, lampprechtPalette.length - 1));
    return lampprechtPalette[index];
};

export function drawRankingsChart(data, containerId, callbacks, selectedStints = []) {
    const container = d3.select(containerId);
    container.selectAll("*").remove();

    const node = container.node();
    const margin = { top: 15, right: 35, bottom: 20, left: 20 };
    const width = node.clientWidth - margin.left - margin.right;
    const height = node.clientHeight - margin.top - margin.bottom;

    const svgBase = container.append("svg")
        .attr("width", "100%")
        .attr("height", "100%")
        .style("display", "block")
        .on("dblclick", function(event) {
            event.preventDefault(); 
            if (callbacks && callbacks.onReset) callbacks.onReset();
        });

    const svg = svgBase.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    const xScale = d3.scaleLinear().domain(d3.extent(data, d => +d.LapNumber)).range([0, width]);
    const yScale = d3.scaleLinear().domain([1, d3.max(data, d => +d.Position)]).range([0, height]);

    // Assi
    svg.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(xScale).ticks(10).tickFormat(d => `L${d}`))
        .attr("color", "#888");

    svg.append("g")
        .call(d3.axisLeft(yScale).ticks(10))
        .attr("color", "#888");

    // --- RIPRISTINO BRUSH 2D (RETTANGOLARE) ---
    const brush = d3.brush()
        .extent([[0, 0], [width, height]])
        .on("end", brushed);

    // Il brush viene aggiunto sopra un rettangolo invisibile per catturare bene i movimenti
    svg.append("g")
        .attr("class", "brush")
        .call(brush);

    function brushed(event) {
        if (!event.selection) {
            // Se il brush viene cancellato, non resettiamo tutto necessariamente, 
            // ma se vuoi il comportamento originale: callbacks.onRankingBrush([], null, null);
            return;
        }

        const [[x0, y0], [x1, y1]] = event.selection;
        const minLap = Math.floor(xScale.invert(x0));
        const maxLap = Math.ceil(xScale.invert(x1));
        const posTop = yScale.invert(y0);
        const posBottom = yScale.invert(y1);

        // Seleziona solo i piloti che hanno almeno un punto (giro) dentro il box
        const selectedDriversSet = new Set();
        data.forEach(d => {
            const lap = +d.LapNumber;
            const pos = +d.Position;
            if (lap >= minLap && lap <= maxLap && pos >= posTop && pos <= posBottom) {
                selectedDriversSet.add(d.Driver);
            }
        });

        if (callbacks.onRankingBrush) {
            callbacks.onRankingBrush(Array.from(selectedDriversSet), minLap, maxLap);
        }
        
        // Puliamo il brush visivo dopo la selezione per permettere di vedere le linee
        d3.select(this).call(brush.move, null);
    }

    const lineGenerator = d3.line()
        .x(d => xScale(+d.LapNumber))
        .y(d => yScale(+d.Position))
        .curve(d3.curveMonotoneX);

    const dataByDriver = d3.group(data, d => d.Driver);
    const hasSelection = selectedStints.length > 0;
    const selectedDriversNames = new Set(selectedStints.map(s => s.Driver));

    const linesGroup = svg.append("g").attr("class", "lines-group");

    dataByDriver.forEach((laps, driver) => {
        const isSelected = selectedDriversNames.has(driver);
        const lastLap = laps[laps.length - 1];
        const finalPos = +lastLap.Position;
        const driverColor = getRankColor(finalPos);

        const path = linesGroup.append("path")
            .datum(laps)
            .attr("fill", "none")
            .attr("stroke", driverColor)
            .attr("stroke-width", isSelected ? 5.0 : 3.0)
            .attr("opacity", hasSelection ? (isSelected ? 1 : 0.15) : 1)
            .attr("d", lineGenerator)
            .style("stroke-linejoin", "round") 
            .style("stroke-linecap", "round")
            .style("cursor", "pointer")
            .style("transition", "opacity 0.2s, stroke-width 0.2s");

        // Cartellino Nome Pilota
        if (isSelected) {
            path.raise();
            svg.append("text")
                .attr("x", xScale(lastLap.LapNumber) + 8)
                .attr("y", yScale(lastLap.Position))
                .attr("dy", "0.35em")
                .style("font-size", "11px")
                .style("font-weight", "bold")
                .style("fill", driverColor)
                .text(driver);
        }

        // --- 1. HTML COMPATTO NEL MOUSEOVER ---
// Cerca la sezione .on("mouseover") all'interno di drawRankingsChart

path.on("mouseover", function(event) {
    if (!isSelected) {
        d3.select(this).attr("stroke-width", 4.5).attr("opacity", 1).raise();
    }
    
    const lastLapNumber = d3.max(data, d => +d.LapNumber);
    const lastLapData = data.filter(d => +d.LapNumber === lastLapNumber);
    const winner = lastLapData.find(d => +d.Position === 1);
    const currentDriverFinal = lastLapData.find(d => d.Driver === driver);
    const teamName = laps[0].Team || "N/A";
    
    let timeInfo = "";
    if (currentDriverFinal && winner) {
        if (driver === winner.Driver) {
            timeInfo = `<span style="color: #ffd400; font-weight: bold;">🏆 WINNER</span>`;
        } else {
            const gap = currentDriverFinal.LapStartSeconds - winner.LapStartSeconds;
            timeInfo = `Gap: <b>+${gap.toFixed(3)}s</b>`;
        }
    }

    d3.select("#tooltip").classed("hidden", false)
        .html(`
            <div style="border-left: 4px solid ${driverColor}; padding-left: 8px;">
                <div style="font-weight: bold; font-size: 0.9rem; margin-bottom: 4px; display: flex; justify-content: space-between; gap: 15px;">
                    <span>${driver}</span>
                    <span style="color:#aaa; font-weight:normal; font-size:0.75rem;">${teamName}</span>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px 12px; font-size: 0.75rem; background: rgba(255,255,255,0.03); padding: 6px; border-radius: 4px;">
                    <div>Final Pos: <b>P${finalPos}</b></div>
                    <div>${timeInfo}</div>
                </div>
            </div>
        `);
    
    updateRankingsTooltipPosition(event);
})

        .on("mouseout", function() {
            if (!isSelected) {
                d3.select(this)
                    .attr("stroke-width", 3.0)
                    .attr("opacity", hasSelection ? 0.15 : 1);
            }
            d3.select("#tooltip").classed("hidden", true);
        })
        .on("click", function(event) {
            if (!callbacks.onRankingBrush) return;

            let newSelectedDrivers = new Set(selectedDriversNames);
            const isMultiSelect = event.ctrlKey || event.metaKey;

            if (isMultiSelect) {
                if (newSelectedDrivers.has(driver)) {
                    newSelectedDrivers.delete(driver);
                } else {
                    newSelectedDrivers.add(driver);
                }
            } else {
                if (newSelectedDrivers.has(driver) && newSelectedDrivers.size === 1) {
                    newSelectedDrivers.clear();
                } else {
                    newSelectedDrivers.clear();
                    newSelectedDrivers.add(driver);
                }
            }

            const driversArray = Array.from(newSelectedDrivers);

            if (driversArray.length === 0) {
                callbacks.onRankingBrush([], null, null);
            } else {
                let minLap = Infinity;
                let maxLap = -Infinity;
                driversArray.forEach(dName => {
                    const dLaps = dataByDriver.get(dName);
                    if (dLaps) {
                        const start = d3.min(dLaps, l => +l.LapNumber);
                        const end = d3.max(dLaps, l => +l.LapNumber);
                        if (start < minLap) minLap = start;
                        if (end > maxLap) maxLap = end;
                    }
                });
                callbacks.onRankingBrush(driversArray, minLap, maxLap);
            }
        });
    });
}

// --- 2. LOGICA DI POSIZIONAMENTO (Strategia 2) ---

function updateRankingsTooltipPosition(event) {
    const tooltip = d3.select("#tooltip");
    const node = tooltip.node();
    if (!node) return;

    const rect = node.getBoundingClientRect();
    const padding = 20;
    const verticalDistance = 120; // Grande offset per liberare la visuale sulle linee
    
    let x = event.pageX - (rect.width / 2);
    let y = event.pageY - rect.height - verticalDistance; // Di base SOPRA

    // Inversione se siamo troppo in alto (Strategia 2)
    if (event.clientY < (rect.height + verticalDistance + padding)) {
        y = event.pageY + verticalDistance; // Sposta SOTTO
    }

    // Vincoli orizzontali
    if (x < padding) x = padding;
    if (x + rect.width > window.innerWidth - padding) {
        x = window.innerWidth - rect.width - padding;
    }

    tooltip
        .style("left", x + "px")
        .style("top", y + "px")
        .style("transform", "none");
}