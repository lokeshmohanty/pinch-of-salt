use crate::models::Fact;
use anyhow::{Result, Context};
use reqwest::Client;
use std::env;

pub struct FactExtractor {
    _client: Client,
    _api_key: String,
}

impl FactExtractor {
    pub fn new() -> Result<Self> {
        let api_key = env::var("NEWS_PROC_API_KEY").context("NEWS_PROC_API_KEY not set")?;
        Ok(Self {
            _client: Client::new(),
            _api_key: api_key,
        })
    }

    pub async fn extract_cluster_info(&self, articles: &[crate::models::Article]) -> Result<crate::models::Cluster> {
        let combined_text = articles.iter()
            .map(|a| format!("Source: {}\nTitle: {}\nDescription: {}", a.source_name, a.title, a.description))
            .collect::<Vec<_>>()
            .join("\n\n---\n\n");

        let _prompt = format!(
            "Compare the following news reports from different sources about the same event. \n\
            Extract a unified title, a 2-sentence summary, and a list of verified facts common to at least most reports.\n\
            Assign a confidence score to each fact.\n\n\
            Format the output as JSON: \n\
            {{ \"title\": \"...\", \"summary\": \"...\", \"facts\": [{{ \"statement\": \"...\", \"confidence\": 0.9 }}] }}\n\n\
            Reports:\n{}",
            combined_text
        );

        // Mocking LLM extraction
        let mut facts = Vec::new();
        facts.push(Fact { statement: "Common fact extracted from multiple sources".to_string(), confidence: 0.95 });

        Ok(crate::models::Cluster {
            id: uuid::Uuid::new_v4().to_string(),
            title: "Consolidated: ".to_string() + &articles[0].title,
            summary: "Unified summary of the event based on multiple sources.".to_string(),
            facts,
            first_seen: chrono::Utc::now(),
            last_updated: chrono::Utc::now(),
        })
    }
}
