from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
import uuid

class Article(BaseModel):
    id: Optional[int] = None
    title: str
    link: str
    description: str
    content: Optional[str] = None
    author: Optional[str] = None
    published: Optional[datetime] = None
    source_name: str
    tags: List[str] = Field(default_factory=list)
    cluster_id: Optional[str] = None
    geography: Optional[str] = "Global"
    category: Optional[str] = "General"

class Fact(BaseModel):
    statement: str
    confidence: float

class Cluster(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    summary: str
    facts: List[Fact]
    geography: str = "Global"
    category: str = "General"
    parent_cluster_ids: List[str] = Field(default_factory=list)
    first_seen: datetime = Field(default_factory=datetime.utcnow)
    last_updated: datetime = Field(default_factory=datetime.utcnow)
