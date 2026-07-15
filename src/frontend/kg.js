let indexData = null;

async function initKG() {
    try {
        const res = await fetch(`data/index.json?v=${Date.now()}`);
        indexData = await res.json();
        renderGraph();
    } catch (err) {
        console.error('Failed to load index for KG:', err);
    }
}

function renderGraph() {
    if (!indexData) return;

    const nodes = [];
    const edges = [];
    const nodeIds = new Set();

    // 1. Build nodes from clusters
    indexData.clusters.forEach(c => {
        nodeIds.add(c.id);
        nodes.push({
            id: c.id,
            label: c.title,
            title: `📌 ${c.title}\nCategory: ${c.category || 'N/A'}\nGeography: ${c.geography || 'N/A'}\nDate: ${c.last_updated || 'N/A'}`,
            font: { size: 14, color: '#ffffff', face: 'Nunito', multi: 'html' },
            shape: 'box',
            margin: 12,
            widthConstraint: { maximum: 220 },
            color: {
                background: '#312e81',
                border: '#818cf8',
                highlight: { background: '#4338ca', border: '#a5b4fc' }
            },
            borderWidth: 2
        });
    });

    // 2. Build edges from parent_cluster_ids
    indexData.clusters.forEach(c => {
        (c.parent_cluster_ids || []).forEach(parentId => {
            if (nodeIds.has(parentId)) {
                edges.push({
                    from: parentId,
                    to: c.id,
                    arrows: { to: { enabled: true, scaleFactor: 1.2 } },
                    color: { color: '#818cf8', highlight: '#a5b4fc' },
                    width: 3,
                    smooth: { type: 'cubicBezier' }
                });
            }
        });
    });

    const container = document.getElementById('kg-container');
    const data = { nodes: new vis.DataSet(nodes), edges: new vis.DataSet(edges) };

    // Use hierarchical layout only if we have DAG links, otherwise use physics
    const hasDAGLinks = edges.length > 0;

    const options = hasDAGLinks ? {
        layout: {
            hierarchical: {
                direction: 'UD',
                sortMethod: 'directed',
                nodeSpacing: 200,
                levelSeparation: 120
            }
        },
        physics: false,
        interaction: { hover: true, tooltipDelay: 200 },
        nodes: { font: { face: 'Nunito' } }
    } : {
        physics: {
            forceAtlas2Based: {
                gravitationalConstant: -40,
                centralGravity: 0.005,
                springLength: 180,
                springConstant: 0.15
            },
            solver: 'forceAtlas2Based',
            stabilization: { iterations: 200 }
        },
        interaction: { hover: true, tooltipDelay: 200 },
        nodes: { font: { face: 'Nunito' } }
    };

    new vis.Network(container, data, options);
}

initKG();
