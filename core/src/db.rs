use rusqlite::{params, Connection};
use crate::models::Article;

pub struct Database {
    conn: Connection,
}

impl Database {
    pub fn new(path: &str) -> anyhow::Result<Self> {
        let conn = Connection::open(path)?;
        let db = Self { conn };
        db.init_tables()?;
        Ok(db)
    }

    fn init_tables(&self) -> anyhow::Result<()> {
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS clusters (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                summary TEXT,
                first_seen TEXT,
                last_updated TEXT
            )",
            [],
        )?;

        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS cluster_facts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                cluster_id TEXT,
                statement TEXT NOT NULL,
                confidence REAL,
                FOREIGN KEY(cluster_id) REFERENCES clusters(id)
            )",
            [],
        )?;

        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS articles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                cluster_id TEXT,
                title TEXT NOT NULL,
                link TEXT UNIQUE NOT NULL,
                description TEXT,
                published TEXT,
                source_name TEXT,
                processed_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(cluster_id) REFERENCES clusters(id)
            )",
            [],
        )?;

        Ok(())
    }

    pub fn save_cluster(&self, cluster: &crate::models::Cluster) -> anyhow::Result<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO clusters (id, title, summary, first_seen, last_updated)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                cluster.id,
                cluster.title,
                cluster.summary,
                cluster.first_seen.to_rfc3339(),
                cluster.last_updated.to_rfc3339()
            ],
        )?;

        // Clear and rewrite facts for simplicity in this demo
        self.conn.execute("DELETE FROM cluster_facts WHERE cluster_id = ?1", params![cluster.id])?;
        for fact in &cluster.facts {
            self.conn.execute(
                "INSERT INTO cluster_facts (cluster_id, statement, confidence) VALUES (?1, ?2, ?3)",
                params![cluster.id, fact.statement, fact.confidence],
            )?;
        }
        Ok(())
    }

    pub fn save_article(&self, article: &Article) -> anyhow::Result<()> {
        self.conn.execute(
            "INSERT OR IGNORE INTO articles (cluster_id, title, link, description, published, source_name)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                article.cluster_id,
                article.title,
                article.link,
                article.description,
                article.published.map(|dt| dt.to_rfc3339()),
                article.source_name
            ],
        )?;
        Ok(())
    }

    // We can add more helpers here as needed
}
