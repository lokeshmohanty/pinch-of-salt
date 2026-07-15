import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "src/python")))

from models import Article
from extractor import Extractor
from db import ZKStore

db = ZKStore("data")
extractor = Extractor(db)

dummy_article_1 = Article(
    title="U.S. and India announce new joint semiconductor research initiative",
    link="https://example.com/1",
    description="The United States and India have partnerned to launch a new research initiative to develop advanced semiconductor designs.",
    source_name="Global News"
)

dummy_article_2 = Article(
    title="US-India partnership to build advanced chip design lab",
    link="https://example.com/2",
    description="Under a new partnership agreement, a new chip design lab will be established with joint funding from US and India.",
    source_name="Tech Times"
)

print("Running extractor...")
try:
    res = extractor.extract_cluster_info([dummy_article_1, dummy_article_2])
    print("Result:")
    print(res)
except Exception as e:
    print(f"Exception raised in test: {e}")
