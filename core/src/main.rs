mod models;
mod db;
mod scraper;
mod fact_extractor;

use db::Database;
use scraper::Scraper;
use fact_extractor::FactExtractor;
use crate::models::Article;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenv::dotenv().ok();
    println!("🚀 Pinch of Salt Core Engine starting (Clustering Mode)...");

    let db = Database::new("../data/pinch.db")?;
    let scraper = Scraper::new();
    let extractor = FactExtractor::new().ok();

    // Define stable world news sources
    let sources = vec![
        ("BBC News", "http://feeds.bbci.co.uk/news/world/rss.xml"),
        ("Al Jazeera", "https://www.aljazeera.com/xml/rss/all.xml"),
        ("NYT World", "https://rss.nytimes.com/services/xml/rss/nyt/World.xml"),
    ];

    let mut all_fetched_articles = Vec::new();

    for (name, url) in sources {
        println!("Fetching feeds from {}...", name);
        match scraper.fetch_feed(url, name).await {
            Ok(articles) => {
                println!("Found {} articles from {}", articles.len(), name);
                all_fetched_articles.extend(articles);
            }
            Err(e) => eprintln!("Error fetching {}: {}", name, e),
        }
    }

    // Simple clustering by title similarity (placeholder for more advanced NLP)
    // In a real app, we'd use something like DBSCAN with sentence embeddings
    println!("Clustering {} articles...", all_fetched_articles.len());
    
    // Grouping logic: articles with > 50% shared words in title go into the same cluster
    let mut clusters: Vec<Vec<Article>> = Vec::new();
    
    for article in all_fetched_articles {
        let mut found_cluster = false;
        for cluster in clusters.iter_mut() {
            if is_similar(&article.title, &cluster[0].title) {
                cluster.push(article.clone());
                found_cluster = true;
                break;
            }
        }
        if !found_cluster {
            clusters.push(vec![article]);
        }
    }

    println!("Identified {} clusters.", clusters.len());

    for cluster_articles in clusters {
        if cluster_articles.len() > 1 {
            // Processing cluster with multiple sources
            if let Some(ref ext) = extractor {
                if let Ok(cluster_info) = ext.extract_cluster_info(&cluster_articles).await {
                    db.save_cluster(&cluster_info)?;
                    for mut article in cluster_articles {
                        article.cluster_id = Some(cluster_info.id.clone());
                        db.save_article(&article)?;
                    }
                }
            }
        } else {
            // Single source article - save as is without cluster (or a default cluster)
            db.save_article(&cluster_articles[0])?;
        }
    }

    println!("✅ Processing complete. Database updated.");
    Ok(())
}

fn is_similar(t1: &str, t2: &str) -> bool {
    let s1 = t1.to_lowercase();
    let s2 = t2.to_lowercase();
    let w1: std::collections::HashSet<_> = s1.split_whitespace().collect();
    let w2: std::collections::HashSet<_> = s2.split_whitespace().collect();
    
    let intersection = w1.intersection(&w2).count();
    let union = w1.union(&w2).count();
    
    (intersection as f32 / union as f32) > 0.3 // Simple threshold
}
