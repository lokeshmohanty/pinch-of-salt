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
    extractor = Extractor()

    sources = [
        ("BBC News", "http://feeds.bbci.co.uk/news/world/rss.xml"),
        ("Al Jazeera", "https://www.aljazeera.com/xml/rss/all.xml"),
        ("NYT World", "https://rss.nytimes.com/services/xml/rss/nyt/World.xml"),
    ]

    all_articles = []
    for name, url in sources:
        print(f"Fetching from {name}...")
        try:
            articles = scraper.fetch_feed(url, name)
            print(f"  Found {len(articles)} articles.")
            all_articles.extend(articles)
        except Exception as e:
            print(f"  Error fetching from {name}: {e}")

    print(f"Clustering {len(all_articles)} articles...")
    clusters = processor.cluster_articles(all_articles)
    print(f"Identified {len(clusters)} clusters.")

    # Fetch existing clusters for context
    existing_events = []
    cursor = db.conn.cursor()
    cursor.execute("SELECT id, title FROM clusters ORDER BY last_updated DESC LIMIT 20")
    existing_events = [{"id": r[0], "title": r[1]} for r in cursor.fetchall()]

    for cluster_articles in clusters:
        if len(cluster_articles) > 1:
            print(f"Processing cluster of {len(cluster_articles)} sources...")
            try:
                cluster_info = extractor.extract_cluster_info(cluster_articles, existing_events)
                db.save_cluster(cluster_info)
                for article in cluster_articles:
                    article.cluster_id = cluster_info.id
                    article.geography = cluster_info.geography
                    article.category = cluster_info.category
                    db.save_article(article)
            except Exception as e:
                print(f"  Extraction failed: {e}")
                for article in cluster_articles:
                    db.save_article(article)
        else:
            db.save_article(cluster_articles[0])

    print("✅ Processing complete!")

if __name__ == "__main__":
    main()
