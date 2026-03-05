import requests
from bs4 import BeautifulSoup
import re

class LawRAG:
    """Retrieval-Augmented Generation module for Indian legal context."""
    
    def __init__(self):
        self.base_url = "https://indiankanoon.org"
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }

    def _extract_keywords(self, text: str) -> str:
        """Extract a simplified query from the article title/summary for searching."""
        # Remove common stop words and punctuation for a basic search string
        text = re.sub(r'[^\w\s]', '', text.lower())
        stopwords = {'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'}
        words = [w for w in text.split() if w not in stopwords]
        # Take up to the first 5 significant words to keep the query broad enough
        return " ".join(words[:5])

    def search(self, query_context: str, limit: int = 3) -> str:
        """Search Indian Kanoon and return formatted case context."""
        search_query = self._extract_keywords(query_context)
        
        try:
            # We use the /search/?formInput= endpoint
            response = requests.get(
                f"{self.base_url}/search/?formInput={requests.utils.quote(search_query)}", 
                headers=self.headers, 
                timeout=10
            )
            response.raise_for_status()
            
            soup = BeautifulSoup(response.content, 'html.parser')
            results = soup.find_all('div', class_='result_title')
            snippets = soup.find_all('div', class_='headline')
            
            context_blocks = []
            for i in range(min(limit, len(results))):
                title = results[i].get_text(strip=True)
                # Kanoon snippets usually have search terms bolded, we just want the text
                snippet = snippets[i].get_text(strip=True) if i < len(snippets) else "No summary available."
                context_blocks.append(f"Case: {title}\nSummary: {snippet}")
                
            if context_blocks:
                return "External Law Context (Indian Kanoon):\n" + "\n\n".join(context_blocks)
            return ""
            
        except Exception as e:
            print(f"  Law RAG search failed for '{search_query}': {e}")
            return ""

if __name__ == "__main__":
    # Test the RAG module directly
    rag = LawRAG()
    res = rag.search("Supreme Court grants bail to politician in money laundering case")
    print(res)
