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
    parent_cluster_ids: List[str] = Field(default_factory=list)

    @field_validator('facts')
    @classmethod
    def convert_strings_to_facts(cls, v):
        return [Fact(statement=f, confidence=0.95) if isinstance(f, str) else f for f in v]

class Extractor:
    def __init__(self):
        self.api_key = os.getenv("HF_TOKEN")
        self.base_url = "https://router.huggingface.co/v1"
        self.model = "meta-llama/Llama-3.2-3B-Instruct"

    def extract_cluster_info(self, articles: List[Article], existing_events: List[dict] = None) -> Cluster:
        combined_text = "\n\n---\n\n".join([
            f"Source: {a.source_name}\nTitle: {a.title}\nDescription: {a.description}"
            for a in articles
        ])

        context_str = ""
        if existing_events:
            context_str = "\n\nExisting recent events for context:\n" + "\n".join([
                f"- ID: {ev['id']}, Title: {ev['title']}" for ev in existing_events
            ])

        prompt = (
            "Compare the following news reports from different sources about the same event. "
            "Extract a unified title, a 2-sentence summary, exactly 3-5 verified facts, "
            "the primary geography (e.g., specific country or 'Global'), "
            "and a category (one of: Technical, Geopolitical, Economic, Sports, General). "
            "Additionally, check the 'Existing recent events' below. If this current event "
            "is a direct continuation, follow-up, or consequence of any existing events, "
            "list their IDs in the 'parent_cluster_ids' field."
            "Return ONLY the requested JSON structure."
        )

        headers = {"Authorization": f"Bearer {self.api_key}"}
        
        # Use simple requests with Pydantic parsing if instructor is too heavy or needs setup
        # For now, let's use a robust raw approach that mimics the Rust logic but is simpler
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": "You are a factual news aggregator."},
                {"role": "user", "content": f"{prompt}\n\nReports:\n{combined_text}"}
            ],
            "temperature": 0.1,
            "max_tokens": 800,
            "response_format": {"type": "json_object"}
        }

        response = requests.post(f"{self.base_url}/chat/completions", headers=headers, json=payload)
        response.raise_for_status()
        data = response.json()
        
        content = data["choices"][0]["message"]["content"]
        extracted = ExtractedCluster.model_validate_json(content)

        return Cluster(
            title=extracted.title,
            summary=extracted.summary,
            facts=extracted.facts,
            geography=extracted.geography,
            category=extracted.category
        )
