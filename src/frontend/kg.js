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

    // Fetch Clusters
    const clustersRes = db.exec("SELECT id, title, category, first_seen FROM clusters");
    // Fetch Links
    const linksRes = db.exec("SELECT parent_id, child_id FROM cluster_links");

    const nodes = [];
    const edges = [];

    if (clustersRes.length > 0) {
        clustersRes[0].values.forEach(row => {
            nodes.push({
                id: row[0],
                label: row[1],
                title: `Category: ${row[2]} | Date: ${row[3]}`,
                font: { size: 14, color: '#ffffff', face: 'Nunito' },
                color: {
                    background: '#6366f1',
                    border: '#4f46e5',
                    highlight: { background: '#818cf8', border: '#6366f1' }
                }
            });
        });
    }

    if (linksRes.length > 0) {
        linksRes[0].values.forEach(row => {
            edges.push({
                from: row[0],
                to: row[1],
                arrows: 'to',
                color: { color: 'rgba(99, 102, 241, 0.4)', highlight: '#6366f1' },
                width: 2
            });
        });
    }

    const container = document.getElementById('kg-container');
    const data = { nodes: new vis.DataSet(nodes), edges: new vis.DataSet(edges) };
    const options = {
        layout: {
            hierarchical: {
                direction: 'UD',
                sortMethod: 'directed',
                nodeSpacing: 250,
                levelSeparation: 150
            }
        },
        physics: false, // Hierarchical layout usually works better without physics
        nodes: {
            shape: 'box',
            margin: 10,
            widthConstraint: { maximum: 200 }
        }
    };

    new vis.Network(container, data, options);
}

initKG();
