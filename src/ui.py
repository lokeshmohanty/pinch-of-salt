import streamlit as st
import requests
from datetime import datetime
import time

# Configuration
API_BASE_URL = "http://localhost:8000"

# Page config
st.set_page_config(
    page_title="RSS News Reader",
    page_icon="📰",
    layout="wide"
)

# Custom CSS
st.markdown("""
<style>
    .article-card {
        background-color: white;
        border-radius: 12px;
        padding: 20px;
        margin-bottom: 20px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        border: 1px solid #e5e7eb;
        transition: box-shadow 0.3s;
    }
    .article-card:hover {
        box-shadow: 0 4px 6px rgba(0,0,0,0.15);
    }
    .article-title {
        font-size: 1.25rem;
        font-weight: 700;
        color: #1f2937;
        margin-bottom: 10px;
        line-height: 1.4;
    }
    .article-description {
        color: #6b7280;
        font-size: 0.95rem;
        margin-bottom: 15px;
        line-height: 1.6;
    }
    .article-meta {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding-top: 15px;
        border-top: 1px solid #f3f4f6;
    }
    .tag-badge {
        display: inline-block;
        background-color: #eff6ff;
        color: #1e40af;
        padding: 4px 10px;
        border-radius: 12px;
        font-size: 0.75rem;
        margin-right: 6px;
        margin-bottom: 6px;
        font-weight: 500;
    }
    .source-name {
        font-weight: 600;
        color: #111827;
        font-size: 0.85rem;
    }
    .date-text {
        color: #9ca3af;
        font-size: 0.8rem;
    }
    .stButton>button {
        width: 100%;
    }
</style>
""", unsafe_allow_html=True)

# Initialize session state
if 'available_sources' not in st.session_state:
    st.session_state.available_sources = []
if 'all_articles' not in st.session_state:
    st.session_state.all_articles = []
if 'selected_source_indices' not in st.session_state:
    st.session_state.selected_source_indices = []

def format_date(date_string):
    """Format date string to relative time"""
    if date_string == 'No date':
        return date_string
    
    try:
        date = datetime.strptime(date_string.split('+')[0].strip(), '%a, %d %b %Y %H:%M:%S')
        now = datetime.now()
        diff = now - date
        
        hours = diff.total_seconds() / 3600
        
        if hours < 1:
            return 'Just now'
        elif hours < 24:
            return f'{int(hours)}h ago'
        elif hours < 48:
            return 'Yesterday'
        else:
            return date.strftime('%b %d, %Y')
    except:
        return date_string

@st.cache_data(ttl=300)
def load_sources():
    """Load available RSS sources from backend"""
    try:
        response = requests.get(f"{API_BASE_URL}/sources", timeout=300)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        st.error(f"Failed to load sources: {e}")
        return []

def load_articles(source_indices=[1,2]):
    """Load articles from backend"""
    try:
        url = f"{API_BASE_URL}/articles"
        if source_indices and len(source_indices) > 0:
            url += f"?sources={','.join(map(str, source_indices))}"
        
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        st.error(f"Failed to load articles: {e}")
        return []

def filter_articles(articles, search_term, selected_tags, selected_source):
    """Filter articles based on search and filters"""
    filtered = articles
    
    # Search filter
    if search_term:
        search_lower = search_term.lower()
        filtered = [
            article for article in filtered
            if search_lower in article['title'].lower() or 
               search_lower in article['description'].lower()
        ]
    
    # Tag filter
    if selected_tags:
        filtered = [
            article for article in filtered
            if any(tag in article['tags'] for tag in selected_tags)
        ]
    
    # Source filter
    if selected_source != 'All Sources':
        filtered = [
            article for article in filtered
            if article['source'] == selected_source
        ]
    
    return filtered

# Main app
st.title("📰 RSS News Reader")
st.markdown("---")

# Load sources
if not st.session_state.available_sources:
    with st.spinner("Loading sources..."):
        st.session_state.available_sources = load_sources()

# Sidebar
with st.sidebar:
    st.header("🔧 Settings")
    
    # Refresh button
    if st.button("🔄 Refresh Articles", use_container_width=True):
        st.cache_data.clear()
        st.session_state.all_articles = []
        st.rerun()
    
    st.markdown("---")
    
    # Backend source filter
    if st.session_state.available_sources:
        st.subheader("📡 Backend Source Filter")
        st.caption("Filters articles at the API level")
        
        backend_sources = st.multiselect(
            "Select sources to fetch:",
            options=range(len(st.session_state.available_sources)),
            format_func=lambda x: st.session_state.available_sources[x]['name'],
            key="backend_source_select"
        )
        
        if backend_sources != st.session_state.selected_source_indices:
            st.session_state.selected_source_indices = backend_sources
            st.session_state.all_articles = []
    
    st.markdown("---")
    
    # Search
    st.subheader("🔍 Search")
    search_term = st.text_input("Search articles:", placeholder="Enter keywords...", label_visibility="collapsed")
    
    st.markdown("---")
    
    # Client-side filters
    st.subheader("🎯 Client-side Filters")
    
    # Extract all unique tags and sources from loaded articles
    all_tags = []
    all_sources = ['All Sources']
    if st.session_state.all_articles:
        all_tags = sorted(list(set(tag for article in st.session_state.all_articles for tag in article['tags'])))
        all_sources.extend(sorted(list(set(article['source'] for article in st.session_state.all_articles))))
    
    # Source filter
    selected_source = st.selectbox("Filter by source:", all_sources)
    
    # Tag filter
    selected_tags = st.multiselect("Filter by tags:", all_tags)
    
    # Clear filters button
    if search_term or selected_tags or selected_source != 'All Sources':
        if st.button("❌ Clear Filters", use_container_width=True):
            st.rerun()

# Load articles if needed
if not st.session_state.all_articles:
    with st.spinner("Loading articles..."):
        st.session_state.all_articles = load_articles(st.session_state.selected_source_indices)

# Filter articles
filtered_articles = filter_articles(
    st.session_state.all_articles,
    search_term,
    selected_tags,
    selected_source
)

# Display results count
st.caption(f"Showing {len(filtered_articles)} of {len(st.session_state.all_articles)} articles")

# Display articles
if not filtered_articles:
    st.info("📭 No articles found matching your criteria.")
else:
    # Create columns for responsive layout
    cols = st.columns(3)
    
    for idx, article in enumerate(filtered_articles):
        col = cols[idx % 3]
        
        with col:
            # Article card
            st.markdown(f"""
            <div class="article-card">
                <div style="margin-bottom: 12px;">
                    {''.join([f'<span class="tag-badge">{tag}</span>' for tag in article['tags'][:3]])}
                </div>
                <div class="article-title">{article['title']}</div>
                <div class="article-description">{article['description'][:200]}...</div>
                <div class="article-meta">
                    <div>
                        <div class="source-name">{article['source']}</div>
                        <div class="date-text">📅 {format_date(article['published'])}</div>
                    </div>
                </div>
            </div>
            """, unsafe_allow_html=True)
            
            # Read article button
            st.link_button("📖 Read Article", article['link'], use_container_width=True)
            
            st.markdown("<br>", unsafe_allow_html=True)

# Footer
st.markdown("---")
st.caption("💡 Tip: Use backend source filters for efficient loading, and client-side filters for quick refinement.")
