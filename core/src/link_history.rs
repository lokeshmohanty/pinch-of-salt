use crate::models::{Event, HistoricalEvent};
use std::fs;
use anyhow::{Result, Context};

pub struct HistoryLinker {
    historical_events: Vec<HistoricalEvent>,
}

impl HistoryLinker {
    pub fn new(path: &str) -> Result<Self> {
        let content = fs::read_to_string(path).context("Failed to read history data")?;
        let historical_events: Vec<HistoricalEvent> = serde_json::from_str(&content)?;
        Ok(Self { historical_events })
    }

    pub fn link_event(&self, event: &mut Event) {
        // Simple keyword matching for demonstration
        // In a real scenario, this would use vector embeddings or entity linking
        for hist in &self.historical_events {
            if event.title.contains(&hist.title) || event.description.contains(&hist.title) {
                event.linked_history_ids.push(hist.id.clone());
            }
            
            // Link by entities if present
            for entity in &event.entities {
                if hist.description.contains(entity) {
                    event.linked_history_ids.push(hist.id.clone());
                    break;
                }
            }
        }
        
        event.linked_history_ids.sort();
        event.linked_history_ids.dedup();
    }
}
