let db;

async function initKG() {
    const sqlPromise = initSqlJs({
        locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.6.2/${file}`
    });
    const dataPromise = fetch(`data/pinch.db?v=${Date.now()}`).then(res => res.arrayBuffer());

    const [SQL, buf] = await Promise.all([sqlPromise, dataPromise]);
    db = new SQL.Database(new Uint8Array(buf));

    renderGraph();
}

function renderGraph() {
    if (!db) return;

    const nodes = [];
    const edges = [];
    const nodeIds = new Set();

    // 1. Fetch ALL clusters as primary event nodes
    const clustersRes = db.exec("SELECT id, title, category, geography, first_seen FROM clusters");
    if (clustersRes.length > 0) {
        clustersRes[0].values.forEach(row => {
            nodeIds.add(row[0]);
            nodes.push({
                id: row[0],
                label: row[1],
                title: `📌 ${row[1]}\nCategory: ${row[2] || 'N/A'}\nGeography: ${row[3] || 'N/A'}\nDate: ${row[4] || 'N/A'}`,
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
    }

    // 2. Fetch chronological links between clusters (DAG edges)
    const linksRes = db.exec("SELECT parent_id, child_id FROM cluster_links");
    if (linksRes.length > 0) {
        linksRes[0].values.forEach(row => {
            edges.push({
                from: row[0],
                to: row[1],
                arrows: { to: { enabled: true, scaleFactor: 1.2 } },
                color: { color: '#818cf8', highlight: '#a5b4fc' },
                width: 3,
                smooth: { type: 'cubicBezier' }
            });
        });
    }

    // 3. Fetch articles that belong to clusters (source connections)
    const articlesRes = db.exec("SELECT id, cluster_id, title, source_name FROM articles WHERE cluster_id IS NOT NULL");
    if (articlesRes.length > 0) {
        articlesRes[0].values.forEach(row => {
            const articleNodeId = `article_${row[0]}`;
            if (!nodeIds.has(articleNodeId)) {
                nodeIds.add(articleNodeId);
                nodes.push({
                    id: articleNodeId,
                    label: row[3] || 'Source',
                    title: `📰 ${row[2]}\nSource: ${row[3]}`,
                    font: { size: 11, color: '#94a3b8', face: 'Nunito' },
                    shape: 'dot',
                    size: 10,
                    color: {
                        background: 'rgba(99, 102, 241, 0.15)',
                        border: 'rgba(99, 102, 241, 0.4)',
                        highlight: { background: '#4338ca', border: '#818cf8' }
                    },
                    borderWidth: 1
                });
            }

            edges.push({
                from: row[1],  // cluster_id
                to: articleNodeId,
                arrows: { to: { enabled: true, scaleFactor: 0.6 } },
                color: { color: 'rgba(99, 102, 241, 0.2)', highlight: '#6366f1' },
                width: 1,
                dashes: [4, 4]
            });
        });
    }

    const container = document.getElementById('kg-container');
    const data = { nodes: new vis.DataSet(nodes), edges: new vis.DataSet(edges) };

    // Use hierarchical layout only if we have DAG links, otherwise use physics
    const hasDAGLinks = linksRes.length > 0 && linksRes[0].values.length > 0;

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
