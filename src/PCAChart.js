import * as d3 from 'd3';

export function drawPCAChart(pcaData, containerId, callbacks, selectedStints = []) {
    const container = d3.select(containerId);
    container.selectAll("*").remove(); 
    container.style("position", "relative"); 

    if (!pcaData || !pcaData.stints) return;

    // 1. LETTURA DATI
    const data = pcaData.stints.map(d => ({
        ...d,
        PC1: +d.PC1,
        PC2: +d.PC2
    }));

    // Recupero varianza (es. [65.4, 20.1])
    const variance = pcaData.variance || [0, 0];

    const width = container.node().clientWidth;
    const height = container.node().clientHeight;
    if (width === 0 || height === 0) return;

    const margin = { top: 20, right: 20, bottom: 35, left: 40 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = container.append("svg")
        .attr("width", "100%")
        .attr("height", "100%")
        .style("display", "block")
        .on("dblclick", (event) => {
            event.preventDefault();
            if (callbacks && callbacks.onReset) callbacks.onReset();
        });

    const g = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    // 2. SCALE (Range fisso per i punti, senza rScale)
    const xExt = d3.extent(data, d => d.PC1);
    const yExt = d3.extent(data, d => d.PC2);
    const padX = (xExt[1] - xExt[0]) * 0.15 || 1;
    const padY = (yExt[1] - yExt[0]) * 0.15 || 1;

    const xScale = d3.scaleLinear().domain([xExt[0] - padX, xExt[1] + padX]).range([0, innerWidth]);
    const yScale = d3.scaleLinear().domain([yExt[0] - padY, yExt[1] + padY]).range([innerHeight, 0]); 

    // 3. ASSI CON VARIANZA SPIEGATA
    // 3. ASSI CON VARIANZA SPIEGATA
g.append("g")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(d3.axisBottom(xScale).ticks(6))
    .attr("color", "#888") // Uniformato
    .append("text")
    .attr("x", innerWidth)
    .attr("y", 35)
    .attr("fill", "#888") // Cambiato da #f5f5f5
    .attr("text-anchor", "end")
    .style("font-weight", "bold")
    .text(`PC1 (${variance[0].toFixed(1)}%)`);

g.append("g")
    .call(d3.axisLeft(yScale).ticks(6))
    .attr("color", "#888")
    .append("text")
    .attr("x", +30)          // leggermente a sinistra dell'asse
    .attr("y", -10)         // sopra l'asse Y
    .attr("fill", "#888")
    .attr("text-anchor", "end")
    .style("font-weight", "bold")
    .text(`PC2 (${variance[1].toFixed(1)}%)`);

    // 4. BRUSH
    const brush = d3.brush()
        .extent([[0, 0], [innerWidth, innerHeight]])
        .on("end", brushed);
    
    g.append("g").attr("class", "brush").call(brush);

    // 5. PUNTI (Minimalisti: colore neutro e raggio fisso)
    // 5. PUNTI
    const tooltip = d3.select("#tooltip");

    // Funzione helper per i colori delle mescole
    const getCompoundColor = (compound) => {
        if (compound === 'SOFT') return '#e10600';     // Rosso
        if (compound === 'MEDIUM') return '#ffeb3b';   // Giallo
        if (compound === 'HARD') return '#ffffff';     // Bianco
        if (compound === 'INTERMEDIATE') return '#39B54A'; // Verde (opzionale)
        if (compound === 'WET') return '#00AEEF';      // Blu (opzionale)
        return '#cccccc'; // Fallback
    };

    const points = g.append("g").attr("class", "points").selectAll("circle")
        .data(data)
        .enter()
        .append("circle")
        .attr("cx", d => xScale(d.PC1))
        .attr("cy", d => yScale(d.PC2))
        .attr("r", 5) // Raggio fisso
        .attr("fill", d => getCompoundColor(d.Compound)) // <-- COLORE DINAMICO IN BASE ALLA MESCOLA
        .attr("stroke", d => selectedStints.some(s => s.StintID === d.StintID) ? "#00ff00" : "#15151e")
        .attr("stroke-width", d => selectedStints.some(s => s.StintID === d.StintID) ? 2 : 0.5)
        .style("opacity", d => (selectedStints.length === 0) ? 0.8 : (selectedStints.some(s => s.StintID === d.StintID) ? 1 : 0.2)) // Aumentata un po' l'opacità base per far risaltare i colori
        .style("cursor", "pointer")
        .on("click", (event, d) => callbacks?.onStintClick?.([d]))
      // ... (codice precedente dei punti)
.on("mouseover", function(event, d) {
    d3.select(this)
        .attr("r", 8) 
        .attr("stroke", "#ffffff")
        .attr("stroke-width", 2)
        .raise();
    
    // Tooltip Compatto (Strategia 1)
    tooltip.classed("hidden", false)
        .html(`
            <div style="border-left: 4px solid #888; padding-left: 8px;">
                <div style="font-weight: bold; font-size: 0.9rem; margin-bottom: 4px; display: flex; justify-content: space-between; gap: 15px;">
                    <span>${d.Driver} <span style="font-weight:normal; color:#aaa;">#${d.StintNumber || d.StintID}</span></span>
                    <span style="color:${getCompoundColor(d.Compound)}">${d.Compound}</span>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px 12px; font-size: 0.75rem; background: rgba(255,255,255,0.03); padding: 6px; border-radius: 4px;">
                    <div>Laps: <b>${d.TotalLaps}</b></div>
                    <div>Deg: <b>${d.DegradationSlope ? d.DegradationSlope.toFixed(3) : 'N/A'}</b></div>
                    <div style="grid-column: span 2; color: #00ffcc; font-family: monospace; border-top: 1px solid #444; padding-top: 2px;">
                        PC1: ${d.PC1.toFixed(2)} | PC2: ${d.PC2.toFixed(2)}
                    </div>
                </div>
            </div>
        `);
    
    updatePCATooltipPosition(event);
})
.on("mousemove", (event) => updatePCATooltipPosition(event))
// ... (codice successivo on("mouseout"))
        .on("mouseout", function(event, d) {
            tooltip.classed("hidden", true);
            const isSelected = selectedStints.some(s => s.StintID === d.StintID);
            d3.select(this)
                .attr("r", 5)
                .attr("stroke", isSelected ? "#00ff00" : "#15151e")
                .attr("stroke-width", isSelected ? 2 : 0.5);
        });

    function brushed(event) {
        const selection = event.selection;
        if (!selection) {
            if (callbacks && callbacks.onStintClick) callbacks.onStintClick([]);
            return;
        }
        const [[x0, y0], [x1, y1]] = selection;
        const geometricallySelected = data.filter(d => {
            const cx = xScale(d.PC1);
            const cy = yScale(d.PC2);
            return cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1;
        });
        if (callbacks && callbacks.onStintClick) callbacks.onStintClick(geometricallySelected);
    }
}

function updatePCATooltipPosition(event) {
    const tooltip = d3.select("#tooltip");
    const node = tooltip.node();
    if (!node) return;

    const rect = node.getBoundingClientRect();
    const padding = 20;
    const verticalDistance = 120; // Grande offset per non coprire i cluster di punti
    
    let x = event.pageX - (rect.width / 2); // Centra orizzontalmente
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