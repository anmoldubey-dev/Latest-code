"""
File Summary:
Neo4j client wrapper for HAUP v3.0. Provides connection management and basic
graph operations for customer relationship and knowledge graph storage.

====================================================================
SYSTEM PIPELINE FLOW
====================================================================

Neo4jClient()
||
├── __init__()  [Method] ---------------------------------> Initialize connection config
│       │
│       ├── Load config from graph_config.json -----------> Neo4j URI, credentials
│       └── Create driver pool --------------------------> Connection pooling
│
├── connect()  [Method] ----------------------------------> Establish Neo4j connection
│       │
│       ├── neo4j.GraphDatabase.driver() ----------------> Create driver instance
│       ├── verify_connectivity() -----------------------> Test connection
│       └── create_constraints() ------------------------> Setup indexes and constraints
│
├── close()  [Method] ------------------------------------> Close connection pool
│
├── create_node()  [Method] ------------------------------> Create single node
│       │
│       ├── Build Cypher CREATE query -------------------> Node with properties
│       └── Execute transaction -------------------------> Commit to Neo4j
│
├── create_relationship()  [Method] ----------------------> Create edge between nodes
│       │
│       ├── Build Cypher MATCH + CREATE query -----------> Relationship with properties
│       └── Execute transaction -------------------------> Commit to Neo4j
│
├── batch_create_nodes()  [Method] -----------------------> Bulk node creation
│       │
│       ├── Chunk nodes into batches -------------------> Batch size from config
│       ├── UNWIND Cypher query -------------------------> Efficient bulk insert
│       └── Execute per batch ---------------------------> Commit batches
│
├── batch_create_relationships()  [Method] ---------------> Bulk relationship creation
│       │
│       ├── Chunk relationships into batches ------------> Batch size from config
│       ├── UNWIND Cypher query -------------------------> Efficient bulk insert
│       └── Execute per batch ---------------------------> Commit batches
│
├── query()  [Method] ------------------------------------> Execute custom Cypher query
│       │
│       ├── Parse query parameters ----------------------> Named parameters
│       ├── Execute in transaction ----------------------> Read or write
│       └── Return results ------------------------------> List of records
│
├── get_node_by_id()  [Method] ---------------------------> Fetch node by ID
│
├── get_neighbors()  [Method] ----------------------------> Get connected nodes
│       │
│       ├── MATCH pattern with relationship -------------> Traverse edges
│       ├── Apply hop limit -----------------------------> Max depth
│       └── Return neighbor nodes -----------------------> With relationships
│
├── find_similar_nodes()  [Method] -----------------------> Similarity-based search
│       │
│       ├── Query by similarity score -------------------> Cosine threshold
│       ├── SIMILAR_TO relationship ---------------------> Pre-computed edges
│       └── Return ranked results -----------------------> Sorted by score
│
└── get_statistics()  [Method] ---------------------------> Graph statistics
        │
        ├── Count nodes by label ------------------------> Customer, Entity, etc.
        ├── Count relationships by type -----------------> SIMILAR_TO, KNOWS, etc.
        └── Return summary dict -------------------------> Overview metrics

====================================================================
FUNCTION / CLASS ENTRY POINT MARKERS
====================================================================
"""

import json
import logging
from pathlib import Path
from typing import Dict, List, Optional, Any
from neo4j import GraphDatabase, Driver, Session

logger = logging.getLogger("haup.neo4j_client")


"""================= Startup class Neo4jClient ================="""
class Neo4jClient:
    """
    Neo4j client for HAUP knowledge graph and customer relationships.
    Handles connection pooling, batch operations, and graph queries.
    """

    """================= Startup method __init__ ================="""
    def __init__(self, config_path: str = "graph_config.json"):
        """Initialize Neo4j client with configuration"""
        self.config_path = Path(config_path)
        self.config = self._load_config()
        self.driver: Optional[Driver] = None
        self._connected = False
        
        logger.info(f"Neo4j client initialized with config from {config_path}")
    """================= End method __init__ ================="""

    """================= Startup method _load_config ================="""
    def _load_config(self) -> Dict:
        """Load configuration from JSON file"""
        try:
            with open(self.config_path, 'r') as f:
                config = json.load(f)
            return config
        except Exception as e:
            logger.error(f"Failed to load config from {self.config_path}: {e}")
            # Return default config
            return {
                "neo4j": {
                    "uri": "bolt://localhost:7687",
                    "user": "neo4j",
                    "password": "",
                    "database": "neo4j"
                }
            }
    """================= End method _load_config ================="""

    """================= Startup method connect ================="""
    def connect(self) -> bool:
        """Establish connection to Neo4j database"""
        try:
            neo4j_config = self.config.get("neo4j", {})
            
            logger.info(f"Connecting to Neo4j at {neo4j_config.get('uri')}")
            
            self.driver = GraphDatabase.driver(
                neo4j_config.get("uri", "bolt://localhost:7687"),
                auth=(
                    neo4j_config.get("user", "neo4j"),
                    neo4j_config.get("password", "password")
                ),
                max_connection_lifetime=neo4j_config.get("max_connection_lifetime", 3600),
                max_connection_pool_size=neo4j_config.get("max_connection_pool_size", 50),
                connection_timeout=neo4j_config.get("connection_timeout", 30),
                encrypted=neo4j_config.get("encrypted", False)
            )
            
            # Verify connectivity
            self.driver.verify_connectivity()
            self._connected = True
            
            logger.info("✅ Successfully connected to Neo4j")
            
            # Create constraints and indexes
            self._create_constraints()
            
            return True
            
        except Exception as e:
            logger.error(f"❌ Failed to connect to Neo4j: {e}")
            self._connected = False
            return False
    """================= End method connect ================="""

    """================= Startup method _create_constraints ================="""
    def _create_constraints(self):
        """Create indexes and constraints for optimal performance"""
        constraints = [
            # Customer node constraints
            "CREATE CONSTRAINT customer_id IF NOT EXISTS FOR (c:Customer) REQUIRE c.id IS UNIQUE",
            "CREATE INDEX customer_email IF NOT EXISTS FOR (c:Customer) ON (c.email)",
            "CREATE INDEX customer_name IF NOT EXISTS FOR (c:Customer) ON (c.name)",
            
            # Entity node constraints (for knowledge graph)
            "CREATE CONSTRAINT entity_id IF NOT EXISTS FOR (e:Entity) REQUIRE e.id IS UNIQUE",
            "CREATE INDEX entity_type IF NOT EXISTS FOR (e:Entity) ON (e.type)",
            "CREATE INDEX entity_name IF NOT EXISTS FOR (e:Entity) ON (e.name)",
            
            # Vector node constraints (links to pgvector)
            "CREATE CONSTRAINT vector_id IF NOT EXISTS FOR (v:Vector) REQUIRE v.rowid IS UNIQUE",
        ]
        
        for constraint_query in constraints:
            try:
                with self.driver.session(database=self.config["neo4j"].get("database", "neo4j")) as session:
                    session.run(constraint_query)
                logger.debug(f"Created constraint: {constraint_query[:50]}...")
            except Exception as e:
                # Constraint might already exist
                logger.debug(f"Constraint creation skipped: {str(e)[:100]}")
    """================= End method _create_constraints ================="""

    """================= Startup method close ================="""
    def close(self):
        """Close Neo4j connection"""
        if self.driver:
            self.driver.close()
            self._connected = False
            logger.info("Neo4j connection closed")
    """================= End method close ================="""

    """================= Startup method is_connected ================="""
    def is_connected(self) -> bool:
        """Check if connected to Neo4j"""
        return self._connected and self.driver is not None
    """================= End method is_connected ================="""

    """================= Startup method create_node ================="""
    def create_node(self, label: str, properties: Dict[str, Any]) -> Optional[int]:
        """
        Create a single node in Neo4j
        
        Args:
            label: Node label (e.g., 'Customer', 'Entity')
            properties: Node properties as dict
            
        Returns:
            Node ID if successful, None otherwise
        """
        try:
            with self.driver.session(database=self.config["neo4j"].get("database", "neo4j")) as session:
                query = f"""
                CREATE (n:{label} $props)
                RETURN id(n) as node_id
                """
                result = session.run(query, props=properties)
                record = result.single()
                return record["node_id"] if record else None
                
        except Exception as e:
            logger.error(f"Failed to create node: {e}")
            return None
    """================= End method create_node ================="""

    """================= Startup method create_relationship ================="""
    def create_relationship(
        self,
        from_label: str,
        from_id: str,
        to_label: str,
        to_id: str,
        rel_type: str,
        properties: Optional[Dict[str, Any]] = None
    ) -> bool:
        """
        Create a relationship between two nodes
        
        Args:
            from_label: Source node label
            from_id: Source node ID property value
            to_label: Target node label
            to_id: Target node ID property value
            rel_type: Relationship type (e.g., 'SIMILAR_TO', 'KNOWS')
            properties: Optional relationship properties
            
        Returns:
            True if successful, False otherwise
        """
        try:
            props = properties or {}
            
            with self.driver.session(database=self.config["neo4j"].get("database", "neo4j")) as session:
                query = f"""
                MATCH (a:{from_label} {{id: $from_id}})
                MATCH (b:{to_label} {{id: $to_id}})
                MERGE (a)-[r:{rel_type}]->(b)
                SET r += $props
                RETURN r
                """
                result = session.run(
                    query,
                    from_id=from_id,
                    to_id=to_id,
                    props=props
                )
                return result.single() is not None
                
        except Exception as e:
            logger.error(f"Failed to create relationship: {e}")
            return False
    """================= End method create_relationship ================="""

    """================= Startup method batch_create_nodes ================="""
    def batch_create_nodes(self, label: str, nodes: List[Dict[str, Any]]) -> int:
        """
        Bulk create nodes using UNWIND for efficiency
        
        Args:
            label: Node label
            nodes: List of node property dicts
            
        Returns:
            Number of nodes created
        """
        if not nodes:
            return 0
            
        try:
            batch_size = self.config.get("graph_build", {}).get("batch_size", 1000)
            total_created = 0
            
            with self.driver.session(database=self.config["neo4j"].get("database", "neo4j")) as session:
                for i in range(0, len(nodes), batch_size):
                    batch = nodes[i:i + batch_size]
                    
                    query = f"""
                    UNWIND $nodes as node
                    MERGE (n:{label} {{id: node.id}})
                    SET n += node
                    RETURN count(n) as created
                    """
                    
                    result = session.run(query, nodes=batch)
                    record = result.single()
                    total_created += record["created"] if record else 0
                    
                    logger.debug(f"Created batch {i//batch_size + 1}: {len(batch)} nodes")
            
            logger.info(f"✅ Created {total_created} {label} nodes")
            return total_created
            
        except Exception as e:
            logger.error(f"Failed to batch create nodes: {e}")
            return 0
    """================= End method batch_create_nodes ================="""

    """================= Startup method batch_create_relationships ================="""
    def batch_create_relationships(
        self,
        from_label: str,
        to_label: str,
        rel_type: str,
        relationships: List[Dict[str, Any]]
    ) -> int:
        """
        Bulk create relationships using UNWIND
        
        Args:
            from_label: Source node label
            to_label: Target node label
            rel_type: Relationship type
            relationships: List of dicts with 'from_id', 'to_id', and optional properties
            
        Returns:
            Number of relationships created
        """
        if not relationships:
            return 0
            
        try:
            batch_size = self.config.get("similarity_linking", {}).get("batch_size", 500)
            total_created = 0
            
            with self.driver.session(database=self.config["neo4j"].get("database", "neo4j")) as session:
                for i in range(0, len(relationships), batch_size):
                    batch = relationships[i:i + batch_size]
                    
                    # Debug: log first relationship in batch
                    if i == 0:
                        logger.info(f"Sample relationship: {batch[0]}")
                    
                    query = f"""
                    UNWIND $rels as rel
                    MATCH (a:{from_label} {{id: rel.from_id}})
                    MATCH (b:{to_label} {{id: rel.to_id}})
                    MERGE (a)-[r:{rel_type}]->(b)
                    SET r += rel.properties
                    RETURN count(r) as created
                    """
                    
                    result = session.run(query, rels=batch)
                    record = result.single()
                    created_count = record["created"] if record else 0
                    total_created += created_count
                    
                    logger.debug(f"Created relationship batch {i//batch_size + 1}: {created_count}/{len(batch)} edges")
            
            logger.info(f"✅ Created {total_created} {rel_type} relationships")
            return total_created
            
        except Exception as e:
            logger.error(f"Failed to batch create relationships: {e}")
            return 0
    """================= End method batch_create_relationships ================="""

    """================= Startup method query ================="""
    def query(self, cypher: str, parameters: Optional[Dict] = None) -> List[Dict]:
        """
        Execute a custom Cypher query
        
        Args:
            cypher: Cypher query string
            parameters: Query parameters
            
        Returns:
            List of result records as dicts
        """
        try:
            params = parameters or {}
            
            with self.driver.session(database=self.config["neo4j"].get("database", "neo4j")) as session:
                result = session.run(cypher, **params)
                return [dict(record) for record in result]
                
        except Exception as e:
            logger.error(f"Query failed: {e}")
            return []
    """================= End method query ================="""

    """================= Startup method get_node_by_id ================="""
    def get_node_by_id(self, label: str, node_id: str) -> Optional[Dict]:
        """Get a node by its ID property"""
        results = self.query(
            f"MATCH (n:{label} {{id: $id}}) RETURN n",
            {"id": node_id}
        )
        return results[0]["n"] if results else None
    """================= End method get_node_by_id ================="""

    """================= Startup method get_neighbors ================="""
    def get_neighbors(
        self,
        label: str,
        node_id: str,
        rel_type: Optional[str] = None,
        max_hops: int = 1
    ) -> List[Dict]:
        """
        Get neighboring nodes connected to a given node
        
        Args:
            label: Node label
            node_id: Node ID
            rel_type: Optional relationship type filter
            max_hops: Maximum traversal depth
            
        Returns:
            List of neighbor nodes with relationship info
        """
        rel_pattern = f"[r:{rel_type}]" if rel_type else "[r]"
        hop_pattern = f"*1..{max_hops}" if max_hops > 1 else ""
        
        query = f"""
        MATCH (n:{label} {{id: $id}})-{rel_pattern}{hop_pattern}-(neighbor)
        RETURN neighbor, type(r) as rel_type, properties(r) as rel_props
        LIMIT 100
        """
        
        return self.query(query, {"id": node_id})
    """================= End method get_neighbors ================="""

    """================= Startup method find_similar_nodes ================="""
    def find_similar_nodes(
        self,
        label: str,
        node_id: str,
        min_similarity: float = 0.7,
        limit: int = 10
    ) -> List[Dict]:
        """
        Find similar nodes based on SIMILAR_TO relationships
        
        Args:
            label: Node label
            node_id: Source node ID
            min_similarity: Minimum similarity score
            limit: Max results
            
        Returns:
            List of similar nodes with similarity scores
        """
        query = f"""
        MATCH (n:{label} {{id: $id}})-[r:SIMILAR_TO]-(similar:{label})
        WHERE r.score >= $min_sim
        RETURN similar, r.score as similarity
        ORDER BY r.score DESC
        LIMIT $limit
        """
        
        return self.query(query, {
            "id": node_id,
            "min_sim": min_similarity,
            "limit": limit
        })
    """================= End method find_similar_nodes ================="""

    """================= Startup method get_statistics ================="""
    def get_statistics(self) -> Dict[str, Any]:
        """Get graph statistics"""
        try:
            stats = {}
            
            # Count nodes by label
            node_counts = self.query("""
                MATCH (n)
                RETURN labels(n)[0] as label, count(n) as count
            """)
            stats["nodes"] = {r["label"]: r["count"] for r in node_counts}
            
            # Count relationships by type
            rel_counts = self.query("""
                MATCH ()-[r]->()
                RETURN type(r) as rel_type, count(r) as count
            """)
            stats["relationships"] = {r["rel_type"]: r["count"] for r in rel_counts}
            
            # Total counts
            stats["total_nodes"] = sum(stats["nodes"].values())
            stats["total_relationships"] = sum(stats["relationships"].values())
            
            return stats
            
        except Exception as e:
            logger.error(f"Failed to get statistics: {e}")
            return {}
    """================= End method get_statistics ================="""

"""================= End class Neo4jClient ================="""
