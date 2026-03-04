use crate::models::Article;
use feed_rs::parser;
use reqwest::Client;
use std::time::Duration;
use anyhow::Result;

pub struct Scraper {
    client: Client,
}

impl Scraper {
    pub fn new() -> Self {
        Self {
            client: Client::builder()
                .timeout(Duration::from_secs(10))
                .user_agent("PinchOfSalt/0.1.0")
                .build()
                .unwrap_or_default(),
        }
    }

    pub async fn fetch_feed(&self, url: &str, source_name: &str) -> Result<Vec<Article>> {
        let content = self.client.get(url).send().await?.bytes().await?;
        let feed = parser::parse(&content[..])
            .map_err(|e| anyhow::anyhow!("Failed to parse feed: {}", e))?;

        let articles = feed.entries.into_iter().map(|entry| {
            Article {
                id: None,
                title: entry.title.map(|t| t.content).unwrap_or_default(),
                link: entry.links.first().map(|l| l.href.clone()).unwrap_or_default(),
                description: entry.summary.map(|s| s.content).unwrap_or_default(),
                content: entry.content.map(|c| c.body.unwrap_or_default()),
                author: entry.authors.first().map(|a| a.name.clone()),
                published: entry.published.map(|dt| dt.into()),
                source_name: source_name.to_string(),
                tags: entry.categories.into_iter().map(|c| c.term).collect(),
                cluster_id: None,
            }
        }).collect();

        Ok(articles)
    }
}
