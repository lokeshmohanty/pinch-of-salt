import { CreateMLCEngine } from "https://esm.run/@mlc-ai/web-llm";

let indexData = null;
let llmEngine = null;
let currentNewsContext = "";
let currentFilter = 'all';
let currentGeo = 'all';
let currentType = 'all';

async function loadIndex() {
    try {
        const res = await fetch(`data/index.json?v=${Date.now()}`);
        indexData = await res.json();
        console.log(`Loaded index: ${indexData.clusters.length} clusters, ${indexData.articles.length} articles`);
        renderNews();
    } catch (err) {
        console.error('Failed to load index:', err);
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

function renderNews() {
    if (!indexData) return;

    const grid = document.getElementById('news-grid');
    grid.innerHTML = '';

    // Combine and filter
    let items = [];

    if (currentFilter !== 'single') {
        indexData.clusters.forEach(c => {
            if (currentGeo !== 'all' && c.geography !== currentGeo) return;
            if (currentType !== 'all' && c.category !== currentType) return;
            items.push({ type: 'cluster', ...c, date: c.last_updated });
        });
    }

    if (currentFilter !== 'multi') {
        indexData.articles.forEach(a => {
            if (currentGeo !== 'all' && a.geography !== currentGeo) return;
            if (currentType !== 'all' && a.category !== currentType) return;
            items.push({ type: 'article', ...a });
        });
    }

    // Sort by date descending
    items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    if (items.length === 0) {
        grid.innerHTML = '<div class="no-news">No news events found.</div>';
        return;
    }

    items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'article-card';
        card.onclick = () => openModal(item.type, item.id);

        const badge = item.type === 'cluster'
            ? `<span class="source-badge">${item.source_count || '?'} Sources</span>`
            : '<span class="source-badge">Single Report</span>';
        const consensus = item.type === 'cluster'
            ? Math.min((item.source_count || 1) * 20, 100)
            : 100;

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
                    <span style="display: block;">${item.date ? new Date(item.date).toLocaleDateString() : ''}</span>
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
        try {
            const res = await fetch(`data/clusters/${id}.json?v=${Date.now()}`);
            const cluster = await res.json();

            // Facts
            let factsHtml = '<h3>Consolidated Verified Facts</h3><div class="common-facts">';
            if (cluster.facts && cluster.facts.length > 0) {
                cluster.facts.forEach(f => {
                    factsHtml += `<div class="fact-item"><div>${f.statement}</div></div>`;
                });
            } else {
                factsHtml += '<div>No specific facts extracted for this cluster yet.</div>';
            }
            factsHtml += '</div>';

            // Sources
            let sourcesHtml = '<h3>Reporting Sources</h3>';
            if (cluster.sources && cluster.sources.length > 0) {
                cluster.sources.forEach(s => {
                    sourcesHtml += `
                        <div class="source-item">
                            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
                                <span class="source-badge" style="margin-bottom: 0;">${s.source_name}</span>
                                <a href="${s.link}" target="_blank" class="source-link">View Original ↗</a>
                            </div>
                            <h4 style="margin-bottom: 0.5rem;">${s.title}</h4>
                            <p style="font-size: 0.9rem; color: var(--text-muted);">${s.description}</p>
                        </div>
                    `;
                });
            }

            // Related Past Events (parent clusters from DAG)
            let relatedHtml = '';
            const parentIds = cluster.parent_cluster_ids || [];
            const parentClusters = parentIds
                .map(pid => indexData.clusters.find(c => c.id === pid))
                .filter(Boolean);

            if (parentClusters.length > 0) {
                relatedHtml = '<h3 style="margin-top: 2rem;">🔗 Related Past Events</h3>';
                relatedHtml += '<div style="border-left: 3px solid var(--primary); padding-left: 1.5rem; margin-top: 1rem;">';
                parentClusters.forEach(p => {
                    relatedHtml += `
                        <div class="source-item" style="cursor: pointer;" onclick="closeModal(); setTimeout(() => openModal('cluster', '${p.id}'), 300);">
                            <h4 style="color: #a5b4fc; margin-bottom: 0.25rem;">${p.title}</h4>
                            <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.25rem;">${p.summary || ''}</p>
                            <span style="font-size: 0.75rem; color: var(--text-muted);">${p.last_updated ? new Date(p.last_updated).toLocaleDateString() : ''}</span>
                        </div>
                    `;
                });
                relatedHtml += '</div>';
            }

            currentNewsContext = "Facts: " + (cluster.facts && cluster.facts.length > 0
                ? cluster.facts.map(f => f.statement).join(". ")
                : "None");

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
        } catch (err) {
            console.error('Failed to load cluster details:', err);
            body.innerHTML = '<div class="error">Failed to load cluster details.</div>';
        }
    } else {
        const article = indexData.articles.find(a => a.id === id);
        if (!article) {
            body.innerHTML = '<div class="error">Article not found.</div>';
            return;
        }

        currentNewsContext = "Article: " + (article.summary || article.title);

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
                    <span class="source-badge" style="margin-bottom: 0;">${article.source_name}</span>
                </div>
                <h4 style="font-size: 1.5rem; margin-bottom: 1rem;">${article.title}</h4>
                <p style="line-height: 1.8;">${article.summary}</p>
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
loadIndex();
