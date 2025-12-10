import feedparser
import yaml

def load_feeds_from_yaml(filename='../data/feeds.yaml'):
    with open(filename, 'r') as file:
        data = yaml.safe_load(file)
        return data.get('feeds', [])

def fetch_rss_feeds(feed_sources, max_articles_per_source = 15):
    all_articles = []
    
    for feed_source in feed_sources:
        print(f"Fetching {feed_source['name']}...")
        try:
            feed = feedparser.parse(feed_source['url'])
            
            for entry in feed.entries[:max_articles_per_source]:
                article = {
                    'title': entry.get('title', 'No title'),
                    'link': entry.get('link', '#'),
                    'description': entry.get('summary', entry.get('description', 'No description')),
                    'published': entry.get('published', 'No date'),
                    'source': feed_source['name'],
                    'tags': feed_source['tags'],
                }
                all_articles.append(article)
                
        except Exception as e:
            print(f"Error fetching {feed_source['name']}: {e}")
    
    return all_articles
