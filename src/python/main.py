import os
import sys
from dotenv import load_dotenv
from db import ZKStore
from scraper import Scraper
from processor import Processor
from extractor import Extractor

def main():
    load_dotenv()
    print("🚀 Pinch of Salt Python Core starting...")

    db = ZKStore("data")
    scraper = Scraper()
    processor = Processor()
    extractor = Extractor(db)

    seed_mode = not db.has_clusters()
    if seed_mode:
        print('🌱 No existing clusters found. Entering 1-Year Historical Seed Mode.')
    else:
        print(f'⏳ Found existing cluster history. Incremental 24-hour fetch mode.')

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

    multi_count = sum(1 for c in clusters if len(c) > 1)
    idx = 0
    skipped = 0
    for cluster_articles in clusters:
        if len(cluster_articles) > 1:
            idx += 1
            # Skip clusters where ALL articles are already processed
            cluster_links = {a.link for a in cluster_articles}
            if cluster_links.issubset(db._known_links):
                skipped += 1
                continue
            print(f'Processing cluster {idx}/{multi_count}... ({len(cluster_links - db._known_links)} new articles)')
            try:
                cluster_info = extractor.extract_cluster_info(cluster_articles)
                # Attach source articles to the cluster
                cluster_info.sources = [
                    {
                        'title': a.title,
                        'link': a.link,
                        'description': a.description,
                        'source_name': a.source_name,
                        'published': a.published.isoformat() if a.published else None
                    }
                    for a in cluster_articles
                ]
                db.save_cluster(cluster_info)
            except Exception as e:
                print(f'  Extraction failed: {e}')
                import traceback
                traceback.print_exc()
                # Save articles individually as fallback
                for article in cluster_articles:
                    db.save_article(article)
        else:
            # Skip standalone articles already known
            if cluster_articles[0].link in db._known_links:
                skipped += 1
                continue
            db.save_article(cluster_articles[0])

    if skipped:
        print(f'⏩ Skipped {skipped} already-processed items.')

    db.build_index()
    print("✅ Processing complete!")

if __name__ == "__main__":
    main()
