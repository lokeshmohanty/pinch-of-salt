import json
import re
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


def _repair_truncated_json(raw: str) -> str:
    """Attempt to repair JSON that was truncated mid-generation.

    The most common failure mode is the model running out of tokens while
    writing the ``parent_cluster_ids`` array, producing something like:

        { ... "parent_cluster_ids": ["abc-123", "def-45

    Strategy:
      1. Try ``json.loads`` as-is — return immediately if valid.
      2. Progressively strip trailing partial tokens (partial strings, partial
         array items) and close open brackets/braces.
      3. If repair succeeds, drop ``parent_cluster_ids`` entries that look
         like truncated UUIDs (length < 36).
    """
    # Fast path: already valid
    try:
        json.loads(raw)
        return raw
    except json.JSONDecodeError:
        pass

    # Strip trailing characters that are clearly mid-token
    repaired = raw.rstrip()

    # If we're in the middle of a string, close it
    # Count unescaped quotes to determine if we're inside a string
    in_string = False
    for i, ch in enumerate(repaired):
        if ch == '"' and (i == 0 or repaired[i - 1] != '\\'):
            in_string = not in_string
    if in_string:
        # Remove the partial string value back to the last quote, or just close it
        repaired += '"'

    # Close any open arrays and objects
    open_brackets = repaired.count('[') - repaired.count(']')
    open_braces = repaired.count('{') - repaired.count('}')

    # Before closing, strip trailing comma (invalid trailing comma in JSON)
    repaired = repaired.rstrip().rstrip(',').rstrip()

    repaired += ']' * max(0, open_brackets)
    repaired += '}' * max(0, open_braces)

    try:
        parsed = json.loads(repaired)
    except json.JSONDecodeError:
        # More aggressive: strip back to the last complete key-value pair
        # Find the last successfully closed value (last complete ',' or '}' or ']')
        for trim_to in [repaired.rfind('",'), repaired.rfind('"],'), repaired.rfind('],')]:
            if trim_to == -1:
                continue
            candidate = repaired[:trim_to + 1].rstrip(',').rstrip()
            open_brackets = candidate.count('[') - candidate.count(']')
            open_braces = candidate.count('{') - candidate.count('}')
            candidate += ']' * max(0, open_brackets)
            candidate += '}' * max(0, open_braces)
            try:
                parsed = json.loads(candidate)
                repaired = candidate
                break
            except json.JSONDecodeError:
                continue
        else:
            # Could not repair
            raise ValueError(f"Could not repair truncated JSON")

    # Clean up truncated parent_cluster_ids — valid UUIDs are 36 chars
    if isinstance(parsed.get('parent_cluster_ids'), list):
        parsed['parent_cluster_ids'] = [
            pid for pid in parsed['parent_cluster_ids']
            if isinstance(pid, str) and len(pid) == 36
        ]

    return json.dumps(parsed)


class Extractor:
    def __init__(self, db):
        self.db = db
        # Initialize the embedding model (MiniLM is small and fast)
        # Note: You may see "UNEXPECTED" for 'embeddings.position_ids' in logs.
        self.embedder = SentenceTransformer('all-MiniLM-L6-v2')
        self.law_rag = LawRAG()
        
        # Initialize local LLM for extraction
        from transformers import pipeline, GenerationConfig
        model_id = "Qwen/Qwen3-0.6B"
        print(f"    🤖 Loading {model_id} model...")
        self.pipe = pipeline(
            "text-generation",
            model=model_id,
            device_map="auto",
            trust_remote_code=True
        )
        # Replace the model's generation_config entirely to eliminate
        # deprecation warnings about conflicting parameters.
        self.pipe.model.generation_config = GenerationConfig(
            max_new_tokens=2048,
            do_sample=False,
            # Preserve the model's special token IDs
            bos_token_id=151643,
            eos_token_id=[151645, 151643],
            pad_token_id=151643,
        )

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

        messages = [
            {"role": "system", "content": "You are a factual news aggregator and historian."},
            # /no_think disables Qwen3's chain-of-thought <think> blocks,
            # freeing the entire token budget for the JSON output.
            {"role": "user", "content": f"/no_think\n{prompt}\n\nReports:\n{combined_text}"}
        ]

        print("    🧠 Generating extraction using local model...")
        outputs = self.pipe(messages)
        content = outputs[0]["generated_text"][-1]["content"]
        
        # Strip Qwen3 <think>...</think> reasoning blocks before JSON extraction
        # (safety net in case /no_think is ignored or model still emits empty tags)
        content = re.sub(r'<think>.*?</think>', '', content, flags=re.DOTALL).strip()
        content = re.sub(r'<think>.*', '', content, flags=re.DOTALL).strip()
        
        # Robustly extract JSON block in case model outputs markdown or trailing text
        start_idx = content.find('{')
        end_idx = content.rfind('}')
        if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
            content = content[start_idx:end_idx+1]
        elif start_idx != -1:
            # No closing brace found — JSON was truncated, take everything from '{'
            content = content[start_idx:]

        # Try to parse, repairing truncated JSON if needed
        try:
            extracted = ExtractedCluster.model_validate_json(content)
        except Exception as first_err:
            # Attempt to repair truncated JSON before giving up
            try:
                repaired = _repair_truncated_json(content)
                extracted = ExtractedCluster.model_validate_json(repaired)
                print(f"    🔧 Repaired truncated JSON (dropped partial parent_cluster_ids)")
            except Exception:
                print(f"⚠️ JSON parsing failed: {first_err}. Returning fallback cluster.")
                print("--- DEBUG: RAW LLM OUTPUT ---")
                print(content[:500])
                print("-----------------------------")
                # Provide a safe fallback cluster
                return Cluster(
                    title=articles[0].title,
                    summary=articles[0].description[:200] + "...",
                    facts=[
                        Fact(statement="Extraction failed.", confidence=0.0),
                        Fact(statement="Using fallback data.", confidence=0.0),
                    ],
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
