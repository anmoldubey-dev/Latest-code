# Singleton routing engine instance for use across the app
from .engine import RoutingEngine

routing_engine = RoutingEngine()
routing_engine.load_rules()
