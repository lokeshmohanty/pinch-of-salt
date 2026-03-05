from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.cluster import DBSCAN
from typing import List
import numpy as np
from models import Article

class Processor:
    def cluster_articles(self, articles: List[Article]) -> List[List[Article]]:
        if not articles:
            return []
        if len(articles) == 1:
            return [articles]
            
        texts = [f"{a.title} {a.description}" for a in articles]
        
        vectorizer = TfidfVectorizer(stop_words='english')
        tfidf_matrix = vectorizer.fit_transform(texts)
        
        # eps 0.7 (similarity 0.3) for broader clustering on short texts
        clustering = DBSCAN(eps=0.7, min_samples=1, metric='cosine').fit(tfidf_matrix.toarray())
        
        labels = clustering.labels_
        clusters = {}
        for idx, label in enumerate(labels):
            if label not in clusters:
                clusters[label] = []
            clusters[label].append(articles[idx])
            
        return list(clusters.values())
