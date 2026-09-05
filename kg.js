let indexData = null;

// Category color palette
const CATEGORY_COLORS = {
    'Technical':     { bg: '#312e81', border: '#818cf8', highlight: '#4338ca', highlightBorder: '#a5b4fc' },
    'Business':      { bg: '#7c2d12', border: '#fb923c', highlight: '#9a3412', highlightBorder: '#fdba74' },
    'Political':     { bg: '#1e3a5f', border: '#60a5fa', highlight: '#1e40af', highlightBorder: '#93c5fd' },
    'Science':       { bg: '#064e3b', border: '#34d399', highlight: '#065f46', highlightBorder: '#6ee7b7' },
    'Health':        { bg: '#701a75', border: '#e879f9', highlight: '#86198f', highlightBorder: '#f0abfc' },
    'Sports':        { bg: '#78350f', border: '#fbbf24', highlight: '#92400e', highlightBorder: '#fcd34d' },
    'Entertainment': { bg: '#831843', border: '#f472b6', highlight: '#9d174d', highlightBorder: '#f9a8d4' },
    'General':       { bg: '#1e293b', border: '#94a3b8', highlight: '#334155', highlightBorder: '#cbd5e1' },
};

function getColor(category) {
    return CATEGORY_COLORS[category] || CATEGORY_COLORS['General'];
}

async function initKG() {
    try {
        const res = await fetch(`data/index.json?v=${Date.now()}`);
        indexData = await res.json();
        buildFilters();
        renderGraph();
    } catch (err) {
        console.error('Failed to load index for KG:', err);
        document.getElementById('kg-container').innerHTML =
            '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#ef4444;">Failed to load knowledge graph data.</div>';
    }
}

function buildFilters() {
    if (!indexData) return;
    const categories = [...new Set(indexData.clusters.map(c => c.category).filter(Boolean))].sort();
    const catSelect = document.getElementById('kg-category-filter');
    if (catSelect) {
        categories.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat;
            opt.textContent = cat;
            catSelect.appendChild(opt);
        });
    }
}

/**
 * Compute hierarchical levels from the DAG.
 * Roots (no parents) get level 0 at the top.
 * Children get level = max(parent levels) + 1.
 * Latest clusters (by date) among roots are placed first (level 0).
 */
function computeLevels(clusters, clusterMap) {
    const levels = new Map();
    const childrenOf = new Map(); // parentId -> [childIds]
    const parentOf = new Map();   // childId -> [parentIds]

    clusters.forEach(c => {
        const validParents = (c.parent_cluster_ids || []).filter(pid => clusterMap.has(pid));
        parentOf.set(c.id, validParents);
        validParents.forEach(pid => {
            if (!childrenOf.has(pid)) childrenOf.set(pid, []);
            childrenOf.get(pid).push(c.id);
        });
    });

    // Find roots (no valid parents)
    const roots = clusters.filter(c => (parentOf.get(c.id) || []).length === 0);

    // BFS from roots to assign levels
    const queue = [];
    roots.forEach(c => {
        levels.set(c.id, 0);
        queue.push(c.id);
    });

    let head = 0;
    while (head < queue.length) {
        const nodeId = queue[head++];
        const nodeLevel = levels.get(nodeId);
        const children = childrenOf.get(nodeId) || [];
        children.forEach(childId => {
            const currentLevel = levels.get(childId);
            const newLevel = nodeLevel + 1;
            // A child's level is the max of all its parents' levels + 1
            if (currentLevel === undefined || newLevel > currentLevel) {
                levels.set(childId, newLevel);
                queue.push(childId);
            }
        });
    }

    // Any unvisited nodes (disconnected or cycles) get level 0
    clusters.forEach(c => {
        if (!levels.has(c.id)) levels.set(c.id, 0);
    });

    return levels;
}

function renderGraph(filterCategory) {
    if (!indexData) return;

    let clusters = [...indexData.clusters];

    // Apply category filter — include matching clusters AND their ancestors/descendants
    if (filterCategory && filterCategory !== 'all') {
        const relevantIds = new Set();

        // First pass: find matching clusters
        clusters.forEach(c => {
            if (c.category === filterCategory) {
                relevantIds.add(c.id);
            }
        });

        // Add ancestors (parents, grandparents...)
        const clusterLookup = new Map(clusters.map(c => [c.id, c]));
        const addAncestors = (id) => {
            const c = clusterLookup.get(id);
            if (!c) return;
            (c.parent_cluster_ids || []).forEach(pid => {
                if (clusterLookup.has(pid) && !relevantIds.has(pid)) {
                    relevantIds.add(pid);
                    addAncestors(pid);
                }
            });
        };
        [...relevantIds].forEach(addAncestors);

        // Add immediate children
        clusters.forEach(c => {
            (c.parent_cluster_ids || []).forEach(pid => {
                if (relevantIds.has(pid)) relevantIds.add(c.id);
            });
        });

        clusters = clusters.filter(c => relevantIds.has(c.id));
    }

    const clusterMap = new Map(clusters.map(c => [c.id, c]));
    const levels = computeLevels(clusters, clusterMap);

    const nodes = [];
    const edges = [];

    // Build nodes
    clusters.forEach(c => {
        const color = getColor(c.category);
        const level = levels.get(c.id) || 0;

        const dateStr = c.last_updated
            ? new Date(c.last_updated).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : 'N/A';

        // Truncate title for display
        const displayTitle = c.title.length > 55 ? c.title.substring(0, 52) + '…' : c.title;

        nodes.push({
            id: c.id,
            label: displayTitle,
            level: level,
            title: `📌 ${c.title}\n📂 ${c.category || 'N/A'}\n🌍 ${c.geography || 'N/A'}\n📅 ${dateStr}\n📰 ${c.source_count || '?'} sources`,
            font: { size: 12, color: '#e2e8f0', face: 'Nunito, sans-serif' },
            shape: 'box',
            margin: { top: 8, bottom: 8, left: 12, right: 12 },
            widthConstraint: { minimum: 120, maximum: 240 },
            color: {
                background: color.bg,
                border: color.border,
                highlight: { background: color.highlight, border: color.highlightBorder },
                hover: { background: color.highlight, border: color.highlightBorder }
            },
            borderWidth: 2,
            borderWidthSelected: 3,
            shadow: {
                enabled: true,
                color: 'rgba(0,0,0,0.25)',
                size: 6,
                x: 1,
                y: 2
            }
        });
    });

    // Build edges from parent_cluster_ids (parent → child = top → down)
    clusters.forEach(c => {
        (c.parent_cluster_ids || []).forEach(parentId => {
            if (clusterMap.has(parentId)) {
                edges.push({
                    from: parentId,
                    to: c.id,
                    arrows: { to: { enabled: true, scaleFactor: 0.7, type: 'arrow' } },
                    color: { color: 'rgba(129,140,248,0.35)', highlight: '#a5b4fc', hover: '#a5b4fc' },
                    width: 1.5,
                    smooth: { type: 'cubicBezier', forceDirection: 'vertical', roundness: 0.5 },
                    hoverWidth: 0.5
                });
            }
        });
    });

    const container = document.getElementById('kg-container');
    const data = { nodes: new vis.DataSet(nodes), edges: new vis.DataSet(edges) };

    const options = {
        layout: {
            hierarchical: {
                enabled: true,
                direction: 'UD',
                sortMethod: 'directed',
                shakeTowards: 'roots',
                levelSeparation: 150,
                nodeSpacing: 160,
                treeSpacing: 120,
                blockShifting: true,
                edgeMinimization: true,
                parentCentralization: true
            }
        },
        physics: false,
        interaction: {
            hover: true,
            tooltipDelay: 150,
            navigationButtons: true,
            keyboard: { enabled: true, bindToWindow: false },
            zoomView: true,
            dragView: true,
            multiselect: false
        },
        nodes: {
            font: { face: 'Nunito, sans-serif' },
            chosen: {
                node: function(values) {
                    values.shadowSize = 14;
                    values.shadowColor = 'rgba(99, 102, 241, 0.5)';
                }
            }
        },
        edges: {
            chosen: {
                edge: function(values) { values.width = 3; }
            }
        }
    };

    const network = new vis.Network(container, data, options);

    // Click: open cluster detail
    network.on('click', function(params) {
        if (params.nodes.length > 0) {
            const clusterId = params.nodes[0];
            const cluster = clusterMap.get(clusterId);
            if (cluster) showClusterDetail(clusterId, cluster);
        }
    });

    // Double-click: zoom to node
    network.on('doubleClick', function(params) {
        if (params.nodes.length > 0) {
            network.focus(params.nodes[0], {
                scale: 1.8,
                animation: { duration: 400, easingFunction: 'easeInOutQuad' }
            });
        }
    });

    // Stats
    const maxLevel = Math.max(...[...levels.values()], 0);
    const statsEl = document.getElementById('kg-stats');
    if (statsEl) {
        statsEl.textContent = `${clusters.length} clusters · ${edges.length} connections · ${maxLevel + 1} levels deep`;
    }
}

async function showClusterDetail(clusterId, clusterMeta) {
    const overlay = document.getElementById('kg-detail-overlay');
    const body = document.getElementById('kg-detail-body');
    const title = document.getElementById('kg-detail-title');

    if (!overlay || !body || !title) return;

    title.textContent = clusterMeta.title;
    body.innerHTML = `
        <div style="text-align: center; padding: 2rem;">
            <div class="loading-spinner"></div>
            <p style="color: #94a3b8; margin-top: 1rem;">Loading cluster details…</p>
        </div>
    `;
    overlay.classList.add('show');
    document.body.classList.add('overlay-open');

    try {
        const res = await fetch(`data/clusters/${clusterId}.json?v=${Date.now()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const cluster = await res.json();

        let html = '';

        // Meta badges
        html += `<div class="kg-detail-meta">`;
        if (cluster.category) html += `<span class="kg-badge kg-badge-category">${cluster.category}</span>`;
        if (cluster.geography) html += `<span class="kg-badge kg-badge-geo">${cluster.geography}</span>`;
        if (cluster.last_updated) {
            const d = new Date(cluster.last_updated);
            html += `<span class="kg-badge kg-badge-date">${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>`;
        }
        html += `</div>`;

        // Summary
        if (cluster.summary) {
            html += `<p class="kg-detail-summary">${cluster.summary}</p>`;
        }

        // Facts
        if (cluster.facts && cluster.facts.length > 0) {
            html += `<h3>Verified Facts</h3><ul class="kg-facts-list">`;
            cluster.facts.forEach(f => {
                html += `<li>${f.statement}</li>`;
            });
            html += `</ul>`;
        }

        // Sources
        if (cluster.sources && cluster.sources.length > 0) {
            html += `<h3>Sources (${cluster.sources.length})</h3>`;
            cluster.sources.forEach(s => {
                html += `
                    <div class="kg-source-item">
                        <div class="kg-source-header">
                            <span class="kg-badge kg-badge-source">${s.source_name || 'Unknown'}</span>
                            ${s.link ? `<a href="${s.link}" target="_blank" rel="noopener" class="kg-source-link">View ↗</a>` : ''}
                        </div>
                        <div class="kg-source-title">${s.title || ''}</div>
                        ${s.description ? `<p class="kg-source-desc">${s.description}</p>` : ''}
                    </div>
                `;
            });
        }

        // Related parent clusters
        const parentIds = cluster.parent_cluster_ids || [];
        if (parentIds.length > 0 && indexData) {
            const parents = parentIds
                .map(pid => indexData.clusters.find(c => c.id === pid))
                .filter(Boolean);
            if (parents.length > 0) {
                html += `<h3>🔗 Related Past Events</h3>`;
                parents.forEach(p => {
                    const safeData = JSON.stringify({ title: p.title, category: p.category, geography: p.geography, summary: p.summary, source_count: p.source_count }).replace(/'/g, "\\'").replace(/"/g, '&quot;');
                    html += `
                        <div class="kg-source-item kg-clickable" onclick="closeKGDetail(); setTimeout(() => showClusterDetail('${p.id}', JSON.parse(this.dataset.meta)), 300);" data-meta='${JSON.stringify({ title: p.title, category: p.category, geography: p.geography, summary: p.summary, source_count: p.source_count }).replace(/'/g, "&#39;")}'>
                            <div class="kg-source-title" style="color: #a5b4fc;">${p.title}</div>
                            ${p.summary ? `<p class="kg-source-desc">${p.summary}</p>` : ''}
                        </div>
                    `;
                });
            }
        }

        body.innerHTML = html;
    } catch (err) {
        console.error('Failed to load cluster:', err);
        body.innerHTML = `
            <div class="kg-detail-meta">
                ${clusterMeta.category ? `<span class="kg-badge kg-badge-category">${clusterMeta.category}</span>` : ''}
                ${clusterMeta.geography ? `<span class="kg-badge kg-badge-geo">${clusterMeta.geography}</span>` : ''}
            </div>
            <p class="kg-detail-summary">${clusterMeta.summary || 'No summary available.'}</p>
            <div style="padding: 1rem; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); border-radius: 8px; margin-top: 1rem;">
                <p style="color: #fca5a5; font-size: 0.9rem;">⚠️ Detailed cluster data is not available. Showing summary from index.</p>
            </div>
            <div style="margin-top: 1rem;">
                <span class="kg-badge kg-badge-source">${clusterMeta.source_count || '?'} Sources</span>
            </div>
        `;
    }
}

function closeKGDetail() {
    const overlay = document.getElementById('kg-detail-overlay');
    if (overlay) overlay.classList.remove('show');
    document.body.classList.remove('overlay-open');
}

function filterKG() {
    const cat = document.getElementById('kg-category-filter').value;
    renderGraph(cat);
}

// Expose for inline handlers
window.closeKGDetail = closeKGDetail;
window.filterKG = filterKG;
window.showClusterDetail = showClusterDetail;

initKG();
