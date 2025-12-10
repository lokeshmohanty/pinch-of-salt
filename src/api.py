from typing import Union
from fastapi import FastAPI

from lib.rss import load_feeds_from_yaml, fetch_rss_feeds

app = FastAPI()

@app.get("/")
def read_root():
    return {"Hello": "World"}

@app.get("/sources")
def list_sources():
    sources = load_feeds_from_yaml("./data/feeds.yaml")
    return sources

@app.get("/articles")
def list_articles(sources: Union[str, None] = None):
    rss_sources = load_feeds_from_yaml("./data/feeds.yaml")
    sources = [rss_sources[int(x)] for x in sources.split(',')] if sources else rss_sources
    feeds = fetch_rss_feeds(sources)
    return feeds

