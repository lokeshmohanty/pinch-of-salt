use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Article {
    pub id: Option<i64>,
    pub title: String,
    pub link: String,
    pub description: String,
    pub content: Option<String>,
    pub author: Option<String>,
    pub published: Option<DateTime<Utc>>,
    pub source_name: String,
    pub tags: Vec<String>,
    pub cluster_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Fact {
    pub statement: String,
    pub confidence: f32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Cluster {
    pub id: String,
    pub title: String,
    pub summary: String,
    pub facts: Vec<Fact>,
    pub first_seen: DateTime<Utc>,
    pub last_updated: DateTime<Utc>,
}
