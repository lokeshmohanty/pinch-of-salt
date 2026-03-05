import feedparser
import requests
from datetime import datetime
from bs4 import BeautifulSoup
from typing import List
import time
from time import mktime
from models import Article

class Scraper:
    def __init__(self):
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }

    def fetch_feed(self, url: str, source_name: str, seed_mode: bool = False) -> List[Article]:
        try:
            response = requests.get(url, headers=self.headers, timeout=10)
            response.raise_for_status()
            feed = feedparser.parse(response.content)
        except Exception as e:
            print(f"  Scraper error for {source_name}: {e}")
            return []

        articles = []
        now = datetime.now()
        
        for entry in feed.entries:
            published = None
            if hasattr(entry, 'published_parsed') and entry.published_parsed:
                published = datetime.fromtimestamp(mktime(entry.published_parsed))
            elif hasattr(entry, 'updated_parsed') and entry.updated_parsed:
                published = datetime.fromtimestamp(mktime(entry.updated_parsed))
            
            # If not in seed mode, strictly enforce 24-hour window
            if not seed_mode and published:
                delta = now - published
                if delta.total_seconds() > 86400: # 24 hours
                    continue
            
            summary = entry.get('summary', entry.get('description', 'No description available.'))
            
            articles.append(Article(
                title=entry.get('title', 'No Title'),
                link=entry.get('link', ''),
                description=summary,
                published=published,
                source_name=source_name,
                tags=[tag.term for tag in entry.get('tags', [])]
            ))
        return articles
