import json
import os
import hashlib
import numpy as np
from pathlib import Path
from typing import List, Optional
from models import Cluster, Fact

class ZKStore:
    def __init__(self, data_dir: str):
        self.data_dir = Path(data_dir)
        self.clusters_dir = self.data_dir / 'clusters'
        self.articles_dir = self.data_dir / 'articles'
        self.clusters_dir.mkdir(parents=True, exist_ok=True)
        self.articles_dir.mkdir(parents=True, exist_ok=True)
        
        # Load all embeddings into memory for similarity search
        self._embedding_cache = {}  # {cluster_id: np.array}
        self._cluster_meta_cache = {}  # {cluster_id: {title, summary, last_updated}}
        self._known_links = set()  # All article links already processed
        self._load_existing_data()
    
    def _load_existing_data(self):
        """Load embeddings, metadata, and known links from existing files."""
        for f in self.clusters_dir.glob('*.json'):
            try:
                data = json.loads(f.read_text())
                cid = data['id']
                if data.get('embedding'):
                    self._embedding_cache[cid] = np.array(data['embedding'], dtype=np.float32)
                self._cluster_meta_cache[cid] = {
                    'id': cid,
                    'title': data.get('title', ''),
                    'summary': data.get('summary', ''),
                    'last_updated': data.get('last_updated', '')
                }
                # Track all source links in this cluster
                for src in data.get('sources', []):
                    if src.get('link'):
                        self._known_links.add(src['link'].strip())
            except (json.JSONDecodeError, KeyError):
                continue
        
        for f in self.articles_dir.glob('*.json'):
            try:
                data = json.loads(f.read_text())
                if data.get('link'):
                    self._known_links.add(data['link'].strip())
            except (json.JSONDecodeError, KeyError):
                continue
        
        if self._known_links:
            print(f'📋 Loaded {len(self._known_links)} known article links from history.')
    
    def has_clusters(self) -> bool:
        """Check if any clusters exist."""
        return bool(list(self.clusters_dir.glob('*.json')))
    
    def save_cluster(self, cluster: Cluster):
        """Write a cluster to its JSON file."""
        filepath = self.clusters_dir / f'{cluster.id}.json'
        
        data = {
            'id': cluster.id,
            'title': cluster.title,
            'summary': cluster.summary,
            'facts': [{'statement': f.statement, 'confidence': f.confidence} for f in cluster.facts],
            'geography': cluster.geography,
            'category': cluster.category,
            'tags': cluster.tags,
            'parent_cluster_ids': cluster.parent_cluster_ids,
            'embedding': cluster.embedding,
            'first_seen': cluster.first_seen.isoformat(),
            'last_updated': cluster.last_updated.isoformat(),
            'sources': cluster.sources
        }
        
        filepath.write_text(json.dumps(data, indent=2, ensure_ascii=False))
        
        # Update in-memory caches
        if cluster.embedding:
            self._embedding_cache[cluster.id] = np.array(cluster.embedding, dtype=np.float32)
        self._cluster_meta_cache[cluster.id] = {
            'id': cluster.id,
            'title': cluster.title,
            'summary': cluster.summary,
            'last_updated': cluster.last_updated.isoformat()
        }
        for src in cluster.sources:
            if src.get('link'):
                self._known_links.add(src['link'].strip())
    
    def save_article(self, article):
        """Write an unclustered article to its JSON file."""
        # Use sha256 of link as filename for dedup
        article_id = hashlib.sha256(article.link.encode()).hexdigest()[:16]
        filepath = self.articles_dir / f'{article_id}.json'
        
        data = {
            'id': article_id,
            'title': article.title,
            'link': article.link,
            'description': article.description,
            'source_name': article.source_name,
            'published': article.published.isoformat() if article.published else None,
            'geography': article.geography or 'Global',
            'category': article.category or 'General',
            'tags': article.tags
        }
        
        filepath.write_text(json.dumps(data, indent=2, ensure_ascii=False))
        self._known_links.add(article.link.strip())
    
    def search_similar_clusters(self, query_embedding: List[float], limit: int = 5) -> List[dict]:
        """In-memory cosine similarity search over cached embeddings."""
        if not self._embedding_cache:
            return []
        
        query = np.array(query_embedding, dtype=np.float32)
        query_norm = np.linalg.norm(query)
        if query_norm == 0:
            return []
        query = query / query_norm
        
        scores = []
        for cid, emb in self._embedding_cache.items():
            emb_norm = np.linalg.norm(emb)
            if emb_norm == 0:
                continue
            similarity = np.dot(query, emb / emb_norm)
            scores.append((cid, float(similarity)))
        
        scores.sort(key=lambda x: x[1], reverse=True)
        
        results = []
        for cid, score in scores[:limit]:
            meta = self._cluster_meta_cache.get(cid, {})
            results.append({
                'id': cid,
                'title': meta.get('title', ''),
                'summary': meta.get('summary', ''),
                'last_updated': meta.get('last_updated', ''),
                'distance': 1.0 - score  # Convert similarity to distance for compatibility
            })
        return results
    
    def build_index(self):
        """Build data/index.json for the frontend."""
        clusters = []
        for f in sorted(self.clusters_dir.glob('*.json')):
            try:
                data = json.loads(f.read_text())
                clusters.append({
                    'id': data['id'],
                    'title': data.get('title', ''),
                    'summary': data.get('summary', ''),
                    'geography': data.get('geography', 'Global'),
                    'category': data.get('category', 'General'),
                    'tags': data.get('tags', []),
                    'last_updated': data.get('last_updated', ''),
                    'first_seen': data.get('first_seen', ''),
                    'parent_cluster_ids': data.get('parent_cluster_ids', []),
                    'source_count': len(data.get('sources', []))
                })
            except (json.JSONDecodeError, KeyError):
                continue
        
        articles = []
        for f in sorted(self.articles_dir.glob('*.json')):
            try:
                data = json.loads(f.read_text())
                articles.append({
                    'id': data.get('id', f.stem),
                    'title': data.get('title', ''),
                    'summary': data.get('description', ''),
                    'geography': data.get('geography', 'Global'),
                    'category': data.get('category', 'General'),
                    'date': data.get('published', ''),
                    'source_name': data.get('source_name', '')
                })
            except (json.JSONDecodeError, KeyError):
                continue
        
        # Sort by date descending
        clusters.sort(key=lambda x: x.get('last_updated', ''), reverse=True)
        articles.sort(key=lambda x: x.get('date', '') or '', reverse=True)
        
        index = {'clusters': clusters, 'articles': articles}
        index_path = self.data_dir / 'index.json'
        index_path.write_text(json.dumps(index, indent=2, ensure_ascii=False))
        print(f'📇 Built index: {len(clusters)} clusters, {len(articles)} articles → {index_path}')
