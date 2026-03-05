import os
import sys
from dotenv import load_dotenv
from db import Database
from scraper import Scraper
from processor import Processor
from extractor import Extractor

def main():
    load_dotenv()
    print("🚀 Pinch of Salt Python Core starting...")

    db = Database("data/pinch.db")
    scraper = Scraper()
    processor = Processor()
    extractor = Extractor(db)

    # Check if DB is empty
    cursor = db.conn.cursor()
    cursor.execute("SELECT count(*) FROM articles")
    db_empty = cursor.fetchone()[0] == 0
    
    seed_mode = db_empty
    if seed_mode:
        print("🌱 Database is empty. Entering 1-Year Historical Seed Mode.")
    else:
        print("⏳ Database has existing history. Incremental 24-hour fetch mode.")

    import yaml
    
    with open("data/feeds.yaml", "r") as f:
        config = yaml.safe_load(f)
        
    sources = []
    for feed in config.get("feeds", []):
        sources.append((feed["name"], feed["url"]))
    
    # If seeding, explicitly inject an aggressive historical feed for context building
    if seed_mode:
        sources.append(("Google News Global (1 Year)", "https://news.google.com/rss/search?q=when:1y&hl=en-US&gl=US&ceid=US:en"))
        sources.append(("Google News India (1 Year)", "https://news.google.com/rss/search?q=when:1y+location:India&hl=en-IN&gl=IN&ceid=IN:en"))

    all_articles = []
    for name, url in sources:
        print(f"Fetching from {name}...")
        try:
            articles = scraper.fetch_feed(url, name, seed_mode=seed_mode)
            print(f"  Found {len(articles)} articles.")
            all_articles.extend(articles)
        except Exception as e:
            print(f"  Error fetching from {name}: {e}")

    print(f"Clustering {len(all_articles)} articles...")
    clusters = processor.cluster_articles(all_articles)
    print(f"Identified {len(clusters)} clusters.")

    for cluster_articles in clusters:
        if len(cluster_articles) > 1:
            print(f"Processing cluster of {len(cluster_articles)} sources...")
            try:
                cluster_info = extractor.extract_cluster_info(cluster_articles)
                db.save_cluster(cluster_info)
                for article in cluster_articles:
                    article.cluster_id = cluster_info.id
                    article.geography = cluster_info.geography
                    article.category = cluster_info.category
                    db.save_article(article)
            except Exception as e:
                print(f"  Extraction failed: {e}")
                import traceback
                traceback.print_exc()
                for article in cluster_articles:
                    db.save_article(article)
        else:
            db.save_article(cluster_articles[0])

    print("✅ Processing complete!")

if __name__ == "__main__":
    main()
