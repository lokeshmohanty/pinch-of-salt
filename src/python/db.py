import sqlite3
import json
import sqlite_vec
from sqlite_vec import serialize_float32
from datetime import datetime
from typing import List, Optional
from models import Article, Cluster

class Database:
    def __init__(self, path: str):
        self.conn = sqlite3.connect(path)
        self.conn.row_factory = sqlite3.Row
        
        self.conn.enable_load_extension(True)
        sqlite_vec.load(self.conn)
        self.conn.enable_load_extension(False)
        
        self.init_tables()

    def init_tables(self):
        cursor = self.conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS clusters (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                summary TEXT,
                geography TEXT,
                category TEXT,
                first_seen TEXT,
                last_updated TEXT
            )
        """)
        # We use a 384-dimensional vector (all-MiniLM-L6-v2)
        cursor.execute("""
            CREATE VIRTUAL TABLE IF NOT EXISTS vec_clusters USING vec0(
                embedding float[384]
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS cluster_facts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                cluster_id TEXT,
                statement TEXT NOT NULL,
                confidence REAL,
                FOREIGN KEY(cluster_id) REFERENCES clusters(id)
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS articles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                cluster_id TEXT,
                title TEXT NOT NULL,
                link TEXT UNIQUE NOT NULL,
                description TEXT,
                published TEXT,
                source_name TEXT,
                geography TEXT,
                category TEXT,
                processed_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(cluster_id) REFERENCES clusters(id)
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS cluster_links (
                parent_id TEXT,
                child_id TEXT,
                PRIMARY KEY (parent_id, child_id),
                FOREIGN KEY(parent_id) REFERENCES clusters(id),
                FOREIGN KEY(child_id) REFERENCES clusters(id)
            )
        """)
        self.conn.commit()

    def save_cluster(self, cluster: Cluster):
        cursor = self.conn.cursor()
        cursor.execute(
            "INSERT OR REPLACE INTO clusters (id, title, summary, geography, category, first_seen, last_updated) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (cluster.id, cluster.title, cluster.summary, cluster.geography, cluster.category,
             cluster.first_seen.isoformat(), cluster.last_updated.isoformat())
        )
        rowid = cursor.lastrowid
        
        # If we have an embedding, save it into the virtual table linked to the cluster's rowid
        if cluster.embedding:
            cursor.execute(
                "INSERT INTO vec_clusters(rowid, embedding) VALUES (?, ?)",
                (rowid, serialize_float32(cluster.embedding))
            )
        
        # Save links
        for parent_id in cluster.parent_cluster_ids:
            cursor.execute(
                "INSERT OR IGNORE INTO cluster_links (parent_id, child_id) VALUES (?, ?)",
                (parent_id, cluster.id)
            )

        # Clear and rewrite facts
        cursor.execute("DELETE FROM cluster_facts WHERE cluster_id = ?", (cluster.id,))
        for fact in cluster.facts:
            cursor.execute(
                "INSERT INTO cluster_facts (cluster_id, statement, confidence) VALUES (?, ?, ?)",
                (cluster.id, fact.statement, fact.confidence)
            )
        self.conn.commit()

    def search_similar_clusters(self, query_embedding: List[float], limit: int = 5) -> List[dict]:
        cursor = self.conn.cursor()
        query_bytes = serialize_float32(query_embedding)
        
        # We join the virtual table vec_clusters against the actual clusters via rowid
        cursor.execute('''
            SELECT c.id, c.title, c.summary, c.last_updated, v.distance
            FROM vec_clusters v
            JOIN clusters c ON v.rowid = c.rowid
            WHERE v.embedding MATCH ? AND k = ?
            ORDER BY v.distance
        ''', (query_bytes, limit))
        
        results = []
        for row in cursor.fetchall():
            results.append({
                "id": row["id"],
                "title": row["title"],
                "summary": row["summary"],
                "last_updated": row["last_updated"],
                "distance": row["distance"]
            })
        return results

    def save_article(self, article: Article):
        cursor = self.conn.cursor()
        cursor.execute(
            """INSERT OR REPLACE INTO articles 
               (cluster_id, title, link, description, published, source_name, geography, category)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (article.cluster_id, article.title, article.link, 
             article.description, article.published.isoformat() if article.published else None, 
             article.source_name, article.geography, article.category)
        )
        self.conn.commit()
