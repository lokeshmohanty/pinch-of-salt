let db = null;

async function initDB() {
    const sqlPromise = initSqlJs({
        locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.6.2/${file}`
    });

    const dataPromise = fetch(`data/pinch.db?v=${Date.now()}`).then(res => res.arrayBuffer());

    try {
        const [SQL, buf] = await Promise.all([sqlPromise, dataPromise]);
        db = new SQL.Database(new Uint8Array(buf));
        console.log("Database loaded successfully");
        renderNews();
    } catch (err) {
        console.error("Failed to load database:", err);
        document.getElementById('news-grid').innerHTML =
            '<div class="error">Failed to load news archive. Please try again later.</div>';
    } finally {
        const splash = document.getElementById('loading-splash');
        if (splash) {
            splash.style.opacity = '0';
            setTimeout(() => {
                splash.style.display = 'none';
            }, 600);
        }
    }
}

let currentFilter = 'all';
let currentGeo = 'all';
let currentType = 'all';

function renderNews() {
    if (!db) return;

    // Build the query dynamically based on all filters
    let clusterWhere = [];
    let articleWhere = ["cluster_id IS NULL"];

    if (currentGeo !== 'all') {
        clusterWhere.push(`geography = '${currentGeo}'`);
        articleWhere.push(`geography = '${currentGeo}'`);
    }
    if (currentType !== 'all') {
        clusterWhere.push(`category = '${currentType}'`);
        articleWhere.push(`category = '${currentType}'`);
    }

    let clusterPart = "SELECT 'cluster' as type, id, title, summary, last_updated as date FROM clusters";
    if (clusterWhere.length > 0) {
        clusterPart += " WHERE " + clusterWhere.join(" AND ");
    }

    let articlePart = "SELECT 'article' as type, id, title, description as summary, published as date FROM articles";
    if (articleWhere.length > 0) {
        articlePart += " WHERE " + articleWhere.join(" AND ");
    }

    let query = "";
    if (currentFilter === 'multi') {
        query = clusterPart + " ORDER BY date DESC";
    } else {
        query = `${clusterPart} UNION ALL ${articlePart} ORDER BY date DESC`;
    }

    const res = db.exec(query);
    const grid = document.getElementById('news-grid');
    grid.innerHTML = '';

    if (res.length === 0 || res[0].values.length === 0) {
        grid.innerHTML = '<div class="no-news">No news events found.</div>';
        return;
    }

    const columns = res[0].columns;
    const rows = res[0].values;

    rows.forEach(row => {
        const item = {};
        columns.forEach((col, i) => item[col] = row[i]);

        const card = document.createElement('div');
        card.className = 'article-card';
        card.onclick = () => openModal(item.type, item.id);

        const badge = item.type === 'cluster' ? '<span class="source-badge">Multi-Source Analysis</span>' : '<span class="source-badge">Single Report</span>';
        const consensus = item.type === 'cluster' ? 85 : 100;

        card.innerHTML = `
            ${badge}
            <h2 class="article-title">${item.title}</h2>
            <p class="article-description">${item.summary}</p>
            <div class="article-meta">
                <div style="flex-grow: 1">
                    <span style="display: block; font-size: 0.7rem; text-transform: uppercase; margin-bottom: 2px;">Source Consensus</span>
                    <div class="consensus-meter">
                        <div class="consensus-fill" style="width: ${consensus}%"></div>
                    </div>
                </div>
                <div style="text-align: right; padding-left: 1rem;">
                    <span style="display: block;">${new Date(item.date).toLocaleDateString()}</span>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

async function openModal(type, id) {
    const modal = document.getElementById('compare-modal');
    const body = document.getElementById('modal-body');

    modal.classList.add('show');
    body.innerHTML = `
        <div style="text-align: center; padding: 3rem;">
            <div class="loading-spinner"></div>
            <p>Analyzing cross-source facts...</p>
        </div>
    `;

    if (type === 'cluster') {
        const factsRes = db.exec(`SELECT statement, confidence FROM cluster_facts WHERE cluster_id = '${id}'`);
        const articlesRes = db.exec(`SELECT title, source_name, link, description FROM articles WHERE cluster_id = '${id}'`);

        let factsHtml = '<h3>Consolidated Verified Facts</h3><div class="common-facts">';
        if (factsRes.length > 0) {
            factsRes[0].values.forEach(v => {
                factsHtml += `<div class="fact-item"><div>${v[0]}</div></div>`;
            });
        } else {
            factsHtml += '<div>No specific facts extracted for this cluster yet.</div>';
        }
        factsHtml += '</div>';

        let sourcesHtml = '<h3>Reporting Sources</h3>';
        if (articlesRes.length > 0) {
            const cols = articlesRes[0].columns;
            articlesRes[0].values.forEach(v => {
                const a = {}; cols.forEach((c, i) => a[c] = v[i]);
                sourcesHtml += `
                    <div class="source-item">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
                            <span class="source-badge" style="margin-bottom: 0;">${a.source_name}</span>
                            <a href="${a.link}" target="_blank" class="source-link">View Original ↗</a>
                        </div>
                        <h4 style="margin-bottom: 0.5rem;">${a.title}</h4>
                        <p style="font-size: 0.9rem; color: var(--text-muted);">${a.description}</p>
                    </div>
                `;
            });
        }

        // Related Past Events (parent nodes in the DAG)
        let relatedHtml = '';
        const parentsRes = db.exec(`SELECT c.id, c.title, c.summary, c.last_updated FROM cluster_links cl JOIN clusters c ON cl.parent_id = c.id WHERE cl.child_id = '${id}'`);
        if (parentsRes.length > 0 && parentsRes[0].values.length > 0) {
            relatedHtml = '<h3 style="margin-top: 2rem;">🔗 Related Past Events</h3>';
            relatedHtml += '<div style="border-left: 3px solid var(--primary); padding-left: 1.5rem; margin-top: 1rem;">';
            parentsRes[0].values.forEach(v => {
                relatedHtml += `
                    <div class="source-item" style="cursor: pointer;" onclick="closeModal(); setTimeout(() => openModal('cluster', '${v[0]}'), 300);">
                        <h4 style="color: #a5b4fc; margin-bottom: 0.25rem;">${v[1]}</h4>
                        <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.25rem;">${v[2] || ''}</p>
                        <span style="font-size: 0.75rem; color: var(--text-muted);">${v[3] ? new Date(v[3]).toLocaleDateString() : ''}</span>
                    </div>
                `;
            });
            relatedHtml += '</div>';
        }

        body.innerHTML = factsHtml + sourcesHtml + relatedHtml;
    } else {
        const res = db.exec(`SELECT * FROM articles WHERE id = ${id}`);
        const cols = res[0].columns;
        const a = {}; cols.forEach((c, i) => a[c] = res[0].values[0][i]);
        body.innerHTML = `
            <h3>Single Source Analysis</h3>
            <div class="source-item">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
                    <span class="source-badge" style="margin-bottom: 0;">${a.source_name}</span>
                    <a href="${a.link}" target="_blank" class="source-link">View Original ↗</a>
                </div>
                <h4 style="font-size: 1.5rem; margin-bottom: 1rem;">${a.title}</h4>
                <p style="line-height: 1.8;">${a.description}</p>
            </div>
        `;
    }
}

function closeModal() {
    document.getElementById('compare-modal').classList.remove('show');
}

function filterNews(type) {
    currentFilter = type;
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.innerText.toLowerCase().includes(type) || (type === 'all' && btn.innerText === 'All Events'));
    });
    renderNews();
}

function applyFilters() {
    currentGeo = document.getElementById('geo-filter').value;
    currentType = document.getElementById('type-filter').value;
    renderNews();
}

window.onclick = function (event) {
    const modal = document.getElementById('compare-modal');
    if (event.target == modal) closeModal();
}

// Start the app
initDB();
