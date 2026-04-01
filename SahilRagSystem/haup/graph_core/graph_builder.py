"""
File Summary:
Graph builder for HAUP v3.0. Constructs knowledge graph from pgvector embeddings
and PostgreSQL source data. Creates customer nodes and similarity relationships.

====================================================================
SYSTEM PIPELINE FLOW
====================================================================

GraphBuilder()
||
├── __init__()  [Method] ---------------------------------> Initialize with clients
│       │
│       ├── Neo4jClient ---------------------------------> Graph database
│       ├── PgvectorClient ------------------------------> Vector database
│       ├── PostgreSQL connection -----------------------> Source data
│       └── Load config ---------------------------------> graph_config.json
│
├── build_graph()  [Method] ------------------------------> Main graph construction
│       │
│       ├── [STEP 1] Extract customer data --------------> From PostgreSQL
│       │       │
│       │       ├── Query source table ------------------> Get all users
│       │       └── Transform to nodes ------------------> Customer properties
│       │
│       ├── [STEP 2] Create customer nodes --------------> Batch insert to Neo4j
│       │       │
│       │       └── batch_create_nodes() ----------------> Efficient bulk insert
│       │
│       ├── [STEP 3] Build similarity links -------------> From vector embeddings
│       │       │
│       │       ├── Query pgvector ----------------------> Get all vectors
│       │       ├── Compute similarities ----------------> Cosine similarity
│       │       ├── Filter by threshold -----------------> Min similarity score
│       │       └── Create SIMILAR_TO edges -------------> Relationship creation
│       │
│       └── [STEP 4] Extract knowledge entities ---------> Optional NLP extraction
│               │
│               ├── Entity extraction -------------------> Organizations, locations
│               ├── Create entity nodes -----------------> Entity label
│               └── Link to customers -------------------> MENTIONS relationships
│
├── _extract_customers()  [Method] -----------------------> Get customer data from DB
│       │
│       ├── Connect to PostgreSQL -----------------------> Source database
│       ├── SELECT * FROM users -------------------------> Fetch all rows
│       └── Return list of dicts ------------------------> Customer records
│
├── _build_similarity_graph()  [Method] ------------------> Create similarity edges
│       │
│       ├── Fetch all vectors from pgvector -------------> With IDs
│       ├── Compute pairwise similarities ---------------> Cosine distance
│       ├── Filter by threshold -------------------------> Keep high similarity
│       ├── Limit edges per node ------------------------> Max connections
│       └── Batch create relationships ------------------> SIMILAR_TO edges
│
├── _extract_entities()  [Method] ------------------------> NLP entity extraction
│       │
│       ├── Load spaCy model ----------------------------> en_core_web_sm
│       ├── Process customer text -----------------------> NER pipeline
│       ├── Extract entities ----------------------------> PERSON, ORG, LOC
│       ├── Filter by confidence ------------------------> Min threshold
│       └── Return entity list --------------------------> With types
│
└── get_build_statistics()  [Method] ---------------------> Progress tracking
        │
        ├── Query Neo4j statistics ----------------------> Node/edge counts
        └── Return summary dict --------------------------> Build progress

====================================================================
FUNCTION / CLASS ENTRY POINT MARKERS
====================================================================
"""

import logging
import psycopg2
import numpy as np
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime

logger = logging.getLogger("haup.graph_builder")


"""================= Startup class GraphBuilder ================="""
class GraphBuilder:
    """
    Builds knowledge graph from pgvector embeddings and PostgreSQL data.
    Creates customer nodes and similarity-based relationships.
    """

    """================= Startup method __init__ ================="""
    def __init__(
        self,
        neo4j_client,
        pgvector_client,
        pg_connection_string: str,
        source_table: str = "users",
        config: Optional[Dict] = None
    ):
        """
        Initialize graph builder
        
        Args:
            neo4j_client: Neo4jClient instance
            pgvector_client: PgvectorClient instance
            pg_connection_string: PostgreSQL connection string
            source_table: Source data table name
            config: Optional config dict (from graph_config.json)
        """
        self.neo4j = neo4j_client
        self.pgvector = pgvector_client
        self.pg_conn_string = pg_connection_string
        self.source_table = source_table
        self.config = config or {}
        
        logger.info(f"GraphBuilder initialized for table '{source_table}'")
    """================= End method __init__ ================="""

    """================= Startup method build_graph ================="""
    def build_graph(self, enable_knowledge_extraction: bool = False) -> Dict[str, Any]:
        """
        Build complete knowledge graph
        
        Args:
            enable_knowledge_extraction: Enable NLP entity extraction
            
        Returns:
            Statistics dict with node/edge counts
        """
        logger.info("🚀 Starting graph build process...")
        start_time = datetime.now()
        
        stats = {
            "customers_created": 0,
            "similarity_edges": 0,
            "entities_created": 0,
            "entity_edges": 0,
            "elapsed_seconds": 0
        }
        
        try:
            # STEP 1: Extract and create customer nodes
            logger.info("STEP 1: Extracting customer data from PostgreSQL...")
            customers = self._extract_customers()
            logger.info(f"  → Found {len(customers)} customers")
            
            if customers:
                logger.info("STEP 1.1: Creating customer nodes in Neo4j...")
                stats["customers_created"] = self.neo4j.batch_create_nodes("Customer", customers)
                logger.info(f"  ✅ Created {stats['customers_created']} customer nodes")
            
            # STEP 2: Build similarity graph from vectors
            if self.config.get("similarity_linking", {}).get("enabled", True):
                logger.info("STEP 2: Building similarity relationships...")
                stats["similarity_edges"] = self._build_similarity_graph()
                logger.info(f"  ✅ Created {stats['similarity_edges']} similarity edges")
            
            # STEP 3: Extract knowledge entities (optional)
            if enable_knowledge_extraction and self.config.get("knowledge_graph", {}).get("enabled", False):
                logger.info("STEP 3: Extracting knowledge entities...")
                entities, entity_links = self._extract_entities(customers)
                
                if entities:
                    stats["entities_created"] = self.neo4j.batch_create_nodes("Entity", entities)
                    logger.info(f"  ✅ Created {stats['entities_created']} entity nodes")
                
                if entity_links:
                    stats["entity_edges"] = self.neo4j.batch_create_relationships(
                        "Customer", "Entity", "MENTIONS", entity_links
                    )
                    logger.info(f"  ✅ Created {stats['entity_edges']} entity relationships")
            
            # Calculate elapsed time
            elapsed = (datetime.now() - start_time).total_seconds()
            stats["elapsed_seconds"] = int(elapsed)
            
            logger.info(f"✅ Graph build completed in {elapsed:.1f}s")
            logger.info(f"   Customers: {stats['customers_created']}")
            logger.info(f"   Similarity edges: {stats['similarity_edges']}")
            logger.info(f"   Entities: {stats['entities_created']}")
            
            return stats
            
        except Exception as e:
            logger.error(f"❌ Graph build failed: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return stats
    """================= End method build_graph ================="""

    """================= Startup method _extract_customers ================="""
    def _extract_customers(self) -> List[Dict[str, Any]]:
        """Extract customer data from PostgreSQL"""
        try:
            conn = psycopg2.connect(self.pg_conn_string)
            cursor = conn.cursor()
            
            # Get all customers
            cursor.execute(f'SELECT * FROM "{self.source_table}"')
            columns = [desc[0] for desc in cursor.description]
            rows = cursor.fetchall()
            
            cursor.close()
            conn.close()
            
            # Transform to node format
            customers = []
            for row in rows:
                customer = dict(zip(columns, row))
                
                # Ensure 'id' field exists (required for Neo4j)
                if 'id' not in customer:
                    logger.warning(f"Row missing 'id' field: {customer}")
                    continue
                
                # Convert all values to JSON-serializable types
                node = {}
                for key, value in customer.items():
                    if value is None:
                        continue
                    elif isinstance(value, (str, int, float, bool)):
                        node[key] = value
                    else:
                        node[key] = str(value)
                
                customers.append(node)
            
            return customers
            
        except Exception as e:
            logger.error(f"Failed to extract customers: {e}")
            return []
    """================= End method _extract_customers ================="""

    """================= Startup method _build_similarity_graph ================="""
    def _build_similarity_graph(self) -> int:
        """
        Build similarity graph from pgvector embeddings
        
        Returns:
            Number of similarity edges created
        """
        try:
            sim_config = self.config.get("similarity_linking", {})
            threshold = sim_config.get("cosine_threshold", 0.75)
            max_edges = sim_config.get("max_edges_per_node", 10)
            
            logger.info(f"  Similarity threshold: {threshold}")
            logger.info(f"  Max edges per node: {max_edges}")
            
            # Fetch all vectors from pgvector
            logger.info("  Fetching vectors from pgvector...")
            all_data = self.pgvector.get(include=["embeddings", "metadatas"])
            
            if not all_data or not all_data.get("ids"):
                logger.warning("  No vectors found in pgvector")
                return 0
            
            ids = all_data["ids"]
            embeddings = all_data["embeddings"]
            metadatas = all_data.get("metadatas", [{}] * len(ids))
            
            logger.info(f"  Processing {len(ids)} vectors...")
            
            # Convert to numpy array for efficient computation
            vectors = np.array(embeddings)
            
            # Normalize vectors for cosine similarity
            norms = np.linalg.norm(vectors, axis=1, keepdims=True)
            vectors_normalized = vectors / (norms + 1e-10)
            
            # Compute similarity matrix (cosine similarity)
            similarity_matrix = np.dot(vectors_normalized, vectors_normalized.T)
            
            # Build relationships
            relationships = []
            
            for i, node_id in enumerate(ids):
                # Get similarities for this node
                similarities = similarity_matrix[i]
                
                # Get top-k similar nodes (excluding self)
                similar_indices = np.argsort(similarities)[::-1][1:max_edges+1]
                
                for j in similar_indices:
                    sim_score = float(similarities[j])
                    
                    # Only create edge if above threshold
                    if sim_score >= threshold:
                        # Convert IDs to int to match Neo4j node IDs
                        from_id = int(node_id) if isinstance(node_id, str) else node_id
                        to_id = int(ids[j]) if isinstance(ids[j], str) else ids[j]
                        
                        relationships.append({
                            "from_id": from_id,
                            "to_id": to_id,
                            "properties": {
                                "score": sim_score,
                                "created_at": datetime.now().isoformat()
                            }
                        })
            
            logger.info(f"  Found {len(relationships)} similarity relationships")
            
            # Batch create relationships
            if relationships:
                return self.neo4j.batch_create_relationships(
                    "Customer", "Customer", "SIMILAR_TO", relationships
                )
            
            return 0
            
        except Exception as e:
            logger.error(f"Failed to build similarity graph: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return 0
    """================= End method _build_similarity_graph ================="""

    """================= Startup method _extract_entities ================="""
    def _extract_entities(
        self,
        customers: List[Dict[str, Any]]
    ) -> Tuple[List[Dict], List[Dict]]:
        """
        Extract named entities from customer data using spaCy
        
        Args:
            customers: List of customer records
            
        Returns:
            Tuple of (entity_nodes, entity_relationships)
        """
        try:
            kg_config = self.config.get("knowledge_graph", {})
            
            if not kg_config.get("entity_extraction", False):
                return [], []
            
            # Try to import spaCy
            try:
                import spacy
            except ImportError:
                logger.warning("spaCy not installed. Skipping entity extraction.")
                logger.warning("Install with: pip install spacy && python -m spacy download en_core_web_sm")
                return [], []
            
            # Load spaCy model
            model_name = kg_config.get("spacy_model", "en_core_web_sm")
            logger.info(f"  Loading spaCy model: {model_name}")
            
            try:
                nlp = spacy.load(model_name)
            except OSError:
                logger.warning(f"spaCy model '{model_name}' not found. Skipping entity extraction.")
                logger.warning(f"Download with: python -m spacy download {model_name}")
                return [], []
            
            # Extract entities
            entities_dict = {}  # entity_name -> entity_data
            relationships = []
            
            min_confidence = kg_config.get("min_entity_confidence", 0.7)
            extract_orgs = kg_config.get("extract_organizations", True)
            extract_locs = kg_config.get("extract_locations", True)
            extract_persons = kg_config.get("extract_persons", True)
            
            logger.info(f"  Extracting entities from {len(customers)} customers...")
            
            for customer in customers:
                customer_id = str(customer.get("id"))
                
                # Combine text fields for entity extraction
                text_parts = []
                for key, value in customer.items():
                    if isinstance(value, str) and len(value) > 0:
                        text_parts.append(value)
                
                if not text_parts:
                    continue
                
                text = " ".join(text_parts)
                
                # Process with spaCy
                doc = nlp(text)
                
                for ent in doc.ents:
                    # Filter by entity type
                    if ent.label_ == "ORG" and not extract_orgs:
                        continue
                    if ent.label_ == "GPE" and not extract_locs:  # GPE = Geo-Political Entity
                        continue
                    if ent.label_ == "PERSON" and not extract_persons:
                        continue
                    
                    # Create entity node
                    entity_key = f"{ent.label_}:{ent.text}"
                    
                    if entity_key not in entities_dict:
                        entities_dict[entity_key] = {
                            "id": entity_key,
                            "name": ent.text,
                            "type": ent.label_,
                            "created_at": datetime.now().isoformat()
                        }
                    
                    # Create relationship
                    relationships.append({
                        "from_id": customer_id,
                        "to_id": entity_key,
                        "properties": {
                            "context": text[:200],  # Store context snippet
                            "created_at": datetime.now().isoformat()
                        }
                    })
            
            entities = list(entities_dict.values())
            logger.info(f"  Extracted {len(entities)} unique entities")
            
            return entities, relationships
            
        except Exception as e:
            logger.error(f"Failed to extract entities: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return [], []
    """================= End method _extract_entities ================="""

    """================= Startup method get_build_statistics ================="""
    def get_build_statistics(self) -> Dict[str, Any]:
        """Get current graph statistics"""
        return self.neo4j.get_statistics()
    """================= End method get_build_statistics ================="""

"""================= End class GraphBuilder ================="""
