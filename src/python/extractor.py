from typing import List, Union
import os
import requests
from pydantic import BaseModel, Field, field_validator
import httpx
from models import Article, Cluster, Fact

class ExtractedCluster(BaseModel):
    title: str
    summary: str
    facts: List[Union[Fact, str]]
    geography: str = Field(..., description="The primary geography discussed (e.g., India, US, Global, Middle East)")
    category: str = Field(..., description="The news category (e.g., Technical, Geopolitical, Economic, Sports, General)")
    tags: List[str] = Field(default_factory=list, description="3-5 relevant keywords or tags")
    parent_cluster_ids: List[str] = Field(default_factory=list)

    @field_validator('facts')
    @classmethod
    def convert_strings_to_facts(cls, v):
        return [Fact(statement=f, confidence=0.95) if isinstance(f, str) else f for f in v]

from sentence_transformers import SentenceTransformer
from rag import LawRAG

class Extractor:
    def __init__(self, db):
        self.api_key = os.getenv("HF_TOKEN")
        self.base_url = "https://router.huggingface.co/v1"
        self.model = "meta-llama/Meta-Llama-3-8B-Instruct"
        self.db = db
        # Initialize the embedding model (MiniLM is small and fast)
        # Note: You may see "UNEXPECTED" for 'embeddings.position_ids' in logs.
        self.embedder = SentenceTransformer('all-MiniLM-L6-v2')
        self.law_rag = LawRAG()

    def extract_cluster_info(self, articles: List[Article]) -> Cluster:
        combined_text = "\n\n---\n\n".join([
            f"Source: {a.source_name}\nTitle: {a.title}\nDescription: {a.description}"
            for a in articles
        ])
        
        # 1. Generate a preliminary summary vector to find similar past events
        preliminary_text = " ".join([a.title for a in articles])
        preliminary_embedding = self.embedder.encode(preliminary_text).tolist()
        
        # 2. Query vector database for top-5 most similar past events
        similar_past_events = self.db.search_similar_clusters(preliminary_embedding, limit=5)
        
        context_str = ""
        if similar_past_events:
            context_str = "\n\nExisting recent events for context:\n" + "\n".join([
                f"- ID: {ev['id']}, Title: {ev['title']}, Summary: {ev['summary']}" 
                for ev in similar_past_events
            ])
            
        law_context_str = ""
        legal_keywords = {"court", "law", "judge", "supreme court", "high court", "bail", "petition", "judgement", "judgment", "tribunal", "hearing", "justice", "verdict"}
        preliminary_text_lower = preliminary_text.lower()
        if any(keyword in preliminary_text_lower for keyword in legal_keywords):
            print(f"    ⚖️ Legal keyword detected. Fetching RAG context from Indian Kanoon...")
            law_context = self.law_rag.search(preliminary_text)
            if law_context:
                # Truncate context to ~1500 chars to avoid model context limits
                law_context_str = f"\n\n{law_context[:1500]}...\n" if len(law_context) > 1500 else f"\n\n{law_context}\n"
            
        prompt = (
            "Compare the following news reports from different sources about the SAME event. "
            "Extract a unified title, a 2-sentence summary, exactly 3-5 verified facts, "
            "the primary geography (e.g., specific country or 'Global'), "
            "a category (one of: Technical, Geopolitical, Economic, Sports, General, Medical, Research), "
            "and 3-5 relevant thematic tags/keywords. "
            f"{context_str}"
            f"{law_context_str}\n\n"
            "CRITICAL INSTRUCTION: Review the 'Existing recent events' carefully. If this current event is related to, "
            "shares the same narrative, or is a continuation/consequence of ANY of those existing events, "
            "you MUST include their IDs in the 'parent_cluster_ids' list. Be aggressive in linking related historical events to form a knowledge graph. "
            "Otherwise leave it empty.\n\n"
            "Return ONLY the requested JSON structure in EXACTLY this format:\n"
            "{\n"
            "  \"title\": \"Unified title\",\n"
            "  \"summary\": \"2-sentence summary\",\n"
            "  \"facts\": [\"Fact 1\", \"Fact 2\", \"Fact 3\"],\n"
            "  \"geography\": \"Global or specific country\",\n"
            "  \"category\": \"Geopolitical/Technical/India/etc\",\n"
            "  \"tags\": [\"keyword1\", \"keyword2\", ...],\n"
            "  \"parent_cluster_ids\": [\"id-1\", \"id-2\", ...]\n"
            "}"
        )

        headers = {"Authorization": f"Bearer {self.api_key}"}
        
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": "You are a factual news aggregator and historian."},
                {"role": "user", "content": f"{prompt}\n\nReports:\n{combined_text}"}
            ],
            "max_tokens": 2000
        }

        response = requests.post(f"{self.base_url}/chat/completions", headers=headers, json=payload)
        
        if response.status_code != 200:
            print(f"================ ERROR {response.status_code} RESPONSE ===============")
            print(response.text)
            print("==================================================")
            
        response.raise_for_status()
        data = response.json()
        
        content = data["choices"][0]["message"]["content"]
        
        # Robustly extract JSON block in case Llama outputs markdown or trailing text
        start_idx = content.find('{')
        end_idx = content.rfind('}')
        if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
            content = content[start_idx:end_idx+1]

        try:
            extracted = ExtractedCluster.model_validate_json(content)
        except Exception as e:
            print(f"⚠️ JSON parsing failed: {e}. Returning fallback cluster.")
            # Provide a safe fallback cluster
            return Cluster(
                title=articles[0].title,
                summary=articles[0].description[:200] + "...",
                facts=["Extraction failed.", "Using fallback data."],
                geography="Global",
                category="General",
                parent_cluster_ids=[],
                embedding=self.embedder.encode(articles[0].title).tolist()
            )
        
        if extracted.parent_cluster_ids:
            print(f"    🔗 Linked to past events: {extracted.parent_cluster_ids}")
        else:
            print(f"    ⏳ No narrative links found.")
        
        # 3. Generate the final high-quality embedding based on the LLM's unified title and summary
        final_embedding_text = f"{extracted.title}. {extracted.summary}"
        final_embedding = self.embedder.encode(final_embedding_text).tolist()

        return Cluster(
            title=extracted.title,
            summary=extracted.summary,
            facts=extracted.facts,
            geography=extracted.geography,
            category=extracted.category,
            tags=extracted.tags,
            parent_cluster_ids=extracted.parent_cluster_ids,
            embedding=final_embedding
        )
