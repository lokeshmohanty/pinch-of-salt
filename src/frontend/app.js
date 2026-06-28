import { CreateMLCEngine } from "https://esm.run/@mlc-ai/web-llm";

let db = null;
let llmEngine = null;
let currentNewsContext = "";


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

        currentNewsContext = "Facts: " + (factsRes.length > 0 ? factsRes[0].values.map(v => v[0]).join(". ") : "None");

        let chatHtml = `
        <div style="margin-top: 2rem; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 1.5rem;">
            <h3>Ask the Local AI (Qwen-0.5B WASM)</h3>
            <p id="llm-status" style="font-size: 0.85rem; color: #fbbf24;">AI is ready (Runs completely locally). Type to initialize.</p>
            <div id="llm-chat-history" style="max-height: 200px; overflow-y: auto; margin-bottom: 1rem; font-size: 0.9rem; display: flex; flex-direction: column; gap: 0.5rem;"></div>
            <div style="display: flex; gap: 0.5rem;">
                <input type="text" id="llm-input" placeholder="Ask about this news..." style="flex-grow: 1; padding: 0.5rem; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.2); color: white; border-radius: 4px;" onkeypress="if(event.key === 'Enter') askLLM()">
                <button onclick="askLLM()" style="padding: 0.5rem 1rem; background: var(--primary); color: white; border: none; border-radius: 4px; cursor: pointer;">Ask</button>
            </div>
        </div>`;

        body.innerHTML = factsHtml + sourcesHtml + relatedHtml + chatHtml;
    } else {
        const res = db.exec(`SELECT * FROM articles WHERE id = ${id}`);
        const cols = res[0].columns;
        const a = {}; cols.forEach((c, i) => a[c] = res[0].values[0][i]);
        currentNewsContext = "Article Description: " + a.description;
        
        let chatHtml = `
        <div style="margin-top: 2rem; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 1.5rem;">
            <h3>Ask the Local AI (Qwen-0.5B WASM)</h3>
            <p id="llm-status" style="font-size: 0.85rem; color: #fbbf24;">AI is ready (Runs completely locally). Type to initialize.</p>
            <div id="llm-chat-history" style="max-height: 200px; overflow-y: auto; margin-bottom: 1rem; font-size: 0.9rem; display: flex; flex-direction: column; gap: 0.5rem;"></div>
            <div style="display: flex; gap: 0.5rem;">
                <input type="text" id="llm-input" placeholder="Ask about this news..." style="flex-grow: 1; padding: 0.5rem; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.2); color: white; border-radius: 4px;" onkeypress="if(event.key === 'Enter') askLLM()">
                <button onclick="askLLM()" style="padding: 0.5rem 1rem; background: var(--primary); color: white; border: none; border-radius: 4px; cursor: pointer;">Ask</button>
            </div>
        </div>`;

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
        ` + chatHtml;
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

window.askLLM = async function() {
    const input = document.getElementById('llm-input');
    const status = document.getElementById('llm-status');
    const history = document.getElementById('llm-chat-history');
    
    if (!input.value.trim()) return;
    
    const userMessage = input.value.trim();
    input.value = "";
    
    // Append user message
    history.innerHTML += `<div style="background: rgba(255,255,255,0.05); padding: 0.5rem; border-radius: 4px;"><b>You:</b> ${userMessage}</div>`;
    
    try {
        if (!llmEngine) {
            status.innerText = "Initializing Local AI... (Downloading/Loading 0.5B WASM Model to GPU ~ vài GB, takes 1-2 mins first time)";
            llmEngine = await CreateMLCEngine("Qwen2.5-0.5B-Instruct-q4f16_1-MLC", {
                initProgressCallback: (progress) => {
                    status.innerText = `Loading Web LLM: ${(progress.progress * 100).toFixed(1)}%`;
                }
            });
            status.innerText = "AI System Online.";
        }
        
        status.innerText = "AI is thinking...";
        
        const messages = [
            { role: "system", content: "You are a helpful assistant analyzing news. Use the provided context to answer questions accurately and completely based ONLY on the context." },
            { role: "user", content: `Context: ${currentNewsContext}\n\nQuestion: ${userMessage}` }
        ];
        
        const reply = await llmEngine.chat.completions.create({
            messages,
        });
        
        history.innerHTML += `<div style="background: rgba(30, 64, 175, 0.2); padding: 0.5rem; border-radius: 4px;"><b>AI:</b> ${reply.choices[0].message.content}</div>`;
        history.scrollTop = history.scrollHeight;
        status.innerText = "AI is ready.";
        
    } catch (err) {
        console.error("LLM Error: ", err);
        status.innerText = "Error running locally: " + err.message;
        history.innerHTML += `<div style="color: #ef4444; padding: 0.5rem;"><b>System:</b> Failed to run inference.</div>`;
    }
}

// Expose variables due to module scope
window.closeModal = closeModal;
window.filterNews = filterNews;
window.applyFilters = applyFilters;
window.openModal = openModal;

// Start the app
initDB();
