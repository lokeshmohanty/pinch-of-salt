let db = null;

async function initDB() {
    const sqlPromise = initSqlJs({
        locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.6.2/${file}`
    });

    const dataPromise = fetch('data/pinch.db').then(res => res.arrayBuffer());

    try {
        const [SQL, buf] = await Promise.all([sqlPromise, dataPromise]);
        db = new SQL.Database(new Uint8Array(buf));
        console.log("Database loaded successfully");
        renderNews();
    } catch (err) {
        console.error("Failed to load database:", err);
        document.getElementById('news-grid').innerHTML =
            '<div class="error">Failed to load news archive. Please try again later.</div>';
    }
}

function renderNews(filter = 'all') {
    if (!db) return;

    // Query clusters (events with multiple sources) and stand-alone articles
    let query = `
        SELECT 'cluster' as type, id, title, summary, last_updated as date
        FROM clusters
        UNION ALL
        SELECT 'article' as type, id, title, description as summary, published as date
        FROM articles
        WHERE cluster_id IS NULL
        ORDER BY date DESC
    `;

    if (filter === 'multi') {
        query = `
            SELECT 'cluster' as type, id, title, summary, last_updated as date
            FROM clusters
            ORDER BY date DESC
        `;
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

        const badge = item.type === 'cluster' ? '<span class="source-badge">Multi-Source Event</span>' : '<span class="source-badge">Single Report</span>';

        card.innerHTML = `
            ${badge}
            <h2 class="article-title">${item.title}</h2>
            <p class="article-description">${item.summary.substring(0, 150)}...</p>
            <div class="article-meta">
                <span>Updated: ${new Date(item.date).toLocaleDateString()}</span>
                <span>Click to compare sources →</span>
            </div>
        `;
        grid.appendChild(card);
    });
}

async function openModal(type, id) {
    const modal = document.getElementById('compare-modal');
    const body = document.getElementById('modal-body');
    modal.style.display = 'block';
    body.innerHTML = 'Loading comparison...';

    if (type === 'cluster') {
        // Fetch common facts
        const factsRes = db.exec(`SELECT statement, confidence FROM cluster_facts WHERE cluster_id = '${id}'`);
        const articlesRes = db.exec(`SELECT title, source_name, link, description FROM articles WHERE cluster_id = '${id}'`);

        let factsHtml = '<h3>Common Verified Facts</h3><div class="common-facts">';
        if (factsRes.length > 0) {
            factsRes[0].values.forEach(v => {
                factsHtml += `<div class="fact-item">${v[0]} <span style="font-size: 0.7rem; color: var(--primary)">(Conf: ${Math.round(v[1] * 100)}%)</span></div>`;
            });
        }
        factsHtml += '</div>';

        let sourcesHtml = '<h3>Reports from Sources</h3>';
        if (articlesRes.length > 0) {
            const cols = articlesRes[0].columns;
            articlesRes[0].values.forEach(v => {
                const a = {}; cols.forEach((c, i) => a[c] = v[i]);
                sourcesHtml += `
                    <div class="source-item">
                        <strong>${a.source_name}</strong>: <a href="${a.link}" target="_blank">${a.title}</a>
                        <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.5rem;">${a.description}</p>
                    </div>
                `;
            });
        }
        body.innerHTML = factsHtml + sourcesHtml;
    } else {
        const res = db.exec(`SELECT * FROM articles WHERE id = ${id}`);
        const cols = res[0].columns;
        const a = {}; cols.forEach((c, i) => a[c] = res[0].values[0][i]);
        body.innerHTML = `
            <h3>Single Source Report</h3>
            <div class="source-item">
                <strong>${a.source_name}</strong>: <a href="${a.link}" target="_blank">${a.title}</a>
                <p style="margin-top: 1rem;">${a.description}</p>
            </div>
        `;
    }
}

function closeModal() {
    document.getElementById('compare-modal').style.display = 'none';
}

function filterNews(type) {
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    renderNews(type);
}

window.onclick = function (event) {
    const modal = document.getElementById('compare-modal');
    if (event.target == modal) closeModal();
}

// Start the app
initDB();
