import * as d3 from 'd3';

// Colori ufficiali delle mescole F1
const COMPOUND_COLORS = {
    "SOFT": "#e10600",
    "MEDIUM": "#ffeb3b",
    "HARD": "#ffffff",
    "INTERMEDIATE": "#4caf50",
    "WET": "#2196f3",
    "UNKNOWN": "#888888"
};

// MODIFICA 1: Eliminata la variabile let selectedStints locale.
// MODIFICA 2: Aggiunto selectedStints = [] come parametro per ricevere lo stato globale
export function drawStrategyGantt(rawData, containerId, callbacks, selectedStints = []) {
    // 1. PULIZIA E PREPARAZIONE DATI
    const data = rawData.map(d => ({
        ...d,
        LapStart: +d.LapStart || 0,
        LapEnd: +d.LapEnd || 0,
        TotalLaps: +d.TotalLaps || 0,
        StintNumber: +d.StintNumber || 1,
        AvgLapTime: +d.AvgLapTime || 0,
        DegradationSlope: +d.DegradationSlope || 0,
        TyreLifeStart: +d.TyreLifeStart || 0
    })).filter(d => d.LapEnd > 0);

    // 2. SETUP CONTENITORE E DIMENSIONI
    const container = d3.select(containerId);
    container.selectAll("*").remove();

    const containerNode = container.node();
    const width = containerNode.clientWidth || 800;
    const height = containerNode.clientHeight || 400;
    
    const margin = { top: 5, right: 15, bottom: 25, left: 35 }; 
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = container.append("svg")
        .attr("width", "100%")
        .attr("height", "100%")
        .style("display", "block") // (Aggiungi questa se manca, aiuta con i resize)
        // --- NUOVO: Listener per il Reset Globale ---
        .on("dblclick", function(event) {
            event.preventDefault(); // Evita selezioni di testo accidentali
            if (callbacks && callbacks.onReset) {
                callbacks.onReset();
            }
        });
        // --------------------------------------------

    // 3. DEFINIZIONE GRADIENTI PER DEGRADO GOMMA
    const defs = svg.append("defs");
    Object.keys(COMPOUND_COLORS).forEach(compound => {
        const gradient = defs.append("linearGradient")
            .attr("id", `grad-${compound}`)
            .attr("x1", "0%").attr("y1", "0%")
            .attr("x2", "100%").attr("y2", "0%");

        gradient.append("stop")
            .attr("offset", "0%")
            .attr("stop-color", COMPOUND_COLORS[compound])
            .attr("stop-opacity", 1); 

        gradient.append("stop")
            .attr("offset", "100%")
            .attr("stop-color", COMPOUND_COLORS[compound])
            .attr("stop-opacity", 0.3); 
    });

    const g = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    // 4. SCALE
    const drivers = Array.from(new Set(data.map(d => d.Driver)));
    const maxLap = d3.max(data, d => d.LapEnd);

    const xScale = d3.scaleLinear()
        .domain([1, maxLap])
        .range([0, innerWidth]);

    const yScale = d3.scaleBand()
        .domain(drivers)
        .range([0, innerHeight])
        .padding(0.15);

    // Griglia Verticale
    g.append("g")
        .attr("class", "grid")
        .attr("color", "#333344")
        .attr("stroke-opacity", 0.3)
        .attr("stroke-dasharray", "3,3")
        .call(d3.axisBottom(xScale)
            .tickSize(innerHeight)
            .tickFormat("") 
            .ticks(Math.round(maxLap / 5)) 
        )
        .select(".domain").remove();

    // 5. ASSI
   // 5. ASSI
g.append("g")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(d3.axisBottom(xScale)
        .ticks(Math.round(maxLap / 5))
        .tickFormat(d => `L${d}`)
    )
    .attr("color", "#888")
    .selectAll("text")
    .style("fill", "#888"); // Cambiato da #f5f5f5

g.append("g")
    .call(d3.axisLeft(yScale))
    .attr("color", "#888")
    .selectAll("text")
    .style("fill", "#888") // Cambiato da #f5f5f5
    .style("font-weight", "bold")
    .style("font-size", "12px");

    g.select(".domain").remove();

// --- 6. TOOLTIP E HELPER SELEZIONE ---
const tooltip = d3.select("#tooltip");
const isStintSelected = (d) => selectedStints.some(s => s.Driver === d.Driver && s.StintNumber === d.StintNumber);

// --- 7. DISEGNO DEGLI STINT ---
const stintsGroup = g.append("g").attr("class", "stints-layer");

stintsGroup.selectAll(".stint-rect")
    .data(data)
    .enter()
    .append("rect")
    .attr("class", "stint-rect")
    .attr("x", d => xScale(d.LapStart))
    .attr("y", d => yScale(d.Driver))
    .attr("width", d => Math.max(0, xScale(d.LapEnd) - xScale(d.LapStart)))
    .attr("height", yScale.bandwidth())
    .attr("fill", d => `url(#grad-${d.Compound})`)
    .attr("stroke", d => isStintSelected(d) ? "#00ff00" : "#15151e")
    .attr("stroke-width", d => isStintSelected(d) ? 3 : 1.5)
    .style("cursor", "pointer")
    .on("mouseover", function(event, d) {
        d3.select(this)
            .attr("stroke", "#ffffff")
            .attr("stroke-width", 2);

        tooltip.classed("hidden", false)
            .html(`
                <div style="border-left: 4px solid ${COMPOUND_COLORS[d.Compound] || '#888'}; padding-left: 8px;">
                    <div style="font-weight: bold; font-size: 0.95rem; margin-bottom: 4px; display: flex; justify-content: space-between;">
                        <span>${d.Driver} <span style="font-weight:normal; color:#aaa;">#${d.StintNumber}</span></span>
                        <span style="color:${COMPOUND_COLORS[d.Compound]}">${d.Compound}</span>
                    </div>

                    <div style="display: grid; grid-template-columns: 1.2fr 1fr; gap: 4px 10px; font-size: 0.75rem; background: rgba(255,255,255,0.03); padding: 6px; border-radius: 4px;">
                        <div>Laps: <b>${d.LapStart}-${d.LapEnd}</b></div>
                        <div>Total: <b>${d.TotalLaps}</b></div>
                        <div>Avg Time: <b>${d.AvgLapTime.toFixed(3)}s</b></div>
                        <div>Degrad: <b>${d.DegradationSlope.toFixed(3)}</b></div>
                    </div>
                </div>
            `);
        updateTooltipPosition(event);
    })
    .on("mousemove", (event) => updateTooltipPosition(event))
    .on("mouseout", function(event, d) {
        const isSelected = isStintSelected(d);
        d3.select(this).attr("stroke", isSelected ? "#00ff00" : "#15151e")
                       .attr("stroke-width", isSelected ? 3 : 1.5);
        tooltip.classed("hidden", true);
    })
.on("mousemove", function(event) {
    updateTooltipPosition(event);
})
    
        .on("mouseout", function(event, d) {
            const isSelected = isStintSelected(d);
            d3.select(this).attr("stroke", isSelected ? "#00ff00" : "#15151e")
                           .attr("stroke-width", isSelected ? 3 : 1.5);
            tooltip.classed("hidden", true);
        })
        .on("click", function(event, d) {
            // MODIFICA 4: Crea una copia locale dello stato per manipolarla
            let newSelection = [...selectedStints];
            const index = newSelection.findIndex(s => s.Driver === d.Driver && s.StintNumber === d.StintNumber);
            
            if (index > -1) {
                newSelection.splice(index, 1); // Deseleziona
            } else {
                if (newSelection.length >= 2) newSelection.shift(); 
                newSelection.push(d); // Aggiunge (max 2)
            }

            // Invia i nuovi dati a index.js, che forzerà il re-render di tutti i grafici!
            if (callbacks && callbacks.onStintClick) {
                callbacks.onStintClick(newSelection);
            }
        });

    // 8. IDENTIFICAZIONE PIT STOPS E DISEGNO MARKERS
    const pitStops = data.filter(d => {
        return data.some(n => n.Driver === d.Driver && n.StintNumber === d.StintNumber + 1);
    });

    const pitsGroup = g.append("g").attr("class", "pits-layer");

    const pitMarkers = pitsGroup.selectAll(".pit-marker")
        .data(pitStops)
        .enter()
        .append("g")
        .attr("class", "pit-marker")
        .attr("transform", d => `translate(${xScale(d.LapEnd)}, ${yScale(d.Driver)})`)
        .style("cursor", "pointer")
        .on("click", function(event, d) {
            if (callbacks && callbacks.onPitClick) {
                callbacks.onPitClick({ driver: d.Driver, lap: d.LapEnd });
            }
        });

    pitMarkers.append("line")
        .attr("x1", 0).attr("y1", 0)
        .attr("x2", 0).attr("y2", yScale.bandwidth())
        .attr("stroke", "#15151e")
        .attr("stroke-width", 2);

    const triangle = d3.symbol().type(d3.symbolTriangle).size(30);
    pitMarkers.append("path")
        .attr("d", triangle)
        .attr("transform", "translate(0, -5) rotate(180)")
        .attr("fill", "#e10600")
        .on("mouseover", function(event, d) {
            d3.select(this).attr("fill", "#ffffff").attr("transform", "translate(0, -5) scale(1.5) rotate(180)");
            tooltip.classed("hidden", false)
                   .html(`<strong>Pit Stop</strong><br>Driver: ${d.Driver}<br>Lap: ${d.LapEnd}`)
                   .style("left", (event.pageX + 10) + "px")
                   .style("top", (event.pageY - 20) + "px");
        })
        .on("mouseout", function() {
            d3.select(this).attr("fill", "#e10600").attr("transform", "translate(0, -5) rotate(180)");
            tooltip.classed("hidden", true);
        });
}

   // ... resto del codice (on click, ecc.)

// --- FUNZIONE POSITION OTTIMIZZATA (Strategia 1 + 2 con grande offset verticale) ---
function updateTooltipPosition(event) {
    const tooltip = d3.select("#tooltip");
    const node = tooltip.node();
    if (!node) return;

    const rect = node.getBoundingClientRect();
    const padding = 20;            // Distanza minima dai bordi della finestra
    const verticalDistance = 120;  // DISTANZA DAL CURSORE: aumentata per non coprire i dati vicini
    
    let x = event.pageX - (rect.width / 2); // Centra il tooltip orizzontalmente rispetto al mouse
    let y = event.pageY - rect.height - verticalDistance; // Di base, lo posiziona MOLTO SOPRA

    // --- LOGICA DI SICUREZZA PER LA PARTE SUPERIORE ---
    // Se il cursore è nella metà superiore dello schermo o il tooltip esce sopra (y < padding)
    if (event.clientY < (rect.height + verticalDistance + padding)) {
        // Sposta il tooltip MOLTO SOTTO il cursore
        y = event.pageY + verticalDistance;
    }

    // --- CORREZIONI ORIZZONTALI (per non uscire dai lati) ---
    if (x < padding) x = padding;
    if (x + rect.width > window.innerWidth - padding) {
        x = window.innerWidth - rect.width - padding;
    }

    tooltip
        .style("left", x + "px")
        .style("top", y + "px")
        .style("transform", "none"); // Rimuoviamo eventuali trasformazioni CSS che possono interferire
}