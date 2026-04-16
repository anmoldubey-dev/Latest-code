import json
from typing import Dict
from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        # Maps agent_id → active WebSocket connection
        self.active_agents:     Dict[str, WebSocket] = {}
        # Maps agent_id → department the agent is currently serving
        self.agent_departments: Dict[str, str]       = {}

    async def connect(self, agent_id: str, websocket: WebSocket, department: str = "General"):
        await websocket.accept()
        self.active_agents[agent_id]     = websocket
        self.agent_departments[agent_id] = department
        print(f"Agent {agent_id} connected to Global Ring  dept={department}")

    def disconnect(self, agent_id: str):
        self.active_agents.pop(agent_id, None)
        self.agent_departments.pop(agent_id, None)
        print(f"Agent {agent_id} disconnected.")

    # ── Broadcast helpers ─────────────────────────────────────────────────────

    async def broadcast_incoming_call(self, call_data: dict):
        """Broadcast ringing event to ALL agents (used by main.py /api/calls/initiate)."""
        message = {"type": "incoming_call", "data": call_data}
        dead = []
        for agent_id, conn in list(self.active_agents.items()):
            try:
                await conn.send_text(json.dumps(message))
            except Exception as e:
                print(f"Dropped connection for {agent_id}: {e}")
                dead.append(agent_id)
        for agent_id in dead:
            self.disconnect(agent_id)

    async def send_to_agent(self, agent_id: str, message: dict) -> bool:
        """Send a message to one specific agent. Returns True if delivered."""
        conn = self.active_agents.get(agent_id)
        if not conn:
            return False
        try:
            await conn.send_text(json.dumps(message))
            return True
        except Exception:
            self.disconnect(agent_id)
            return False

    async def broadcast_to_department(self, department: str, message: dict):
        """
        Send to agents registered for `department`.
        Falls back to all-agents broadcast if nobody matches.
        """
        targets = [
            aid for aid, dept in self.agent_departments.items()
            if dept.lower() == department.lower()
        ]
        if not targets:
            await self.broadcast_incoming_call(message["data"] if message.get("type") == "incoming_call" else message)
            return
        dead = []
        for aid in targets:
            conn = self.active_agents.get(aid)
            if not conn:
                continue
            try:
                await conn.send_text(json.dumps(message))
            except Exception:
                dead.append(aid)
        for aid in dead:
            self.disconnect(aid)

    async def broadcast_call_accepted(self, call_id: str, accepted_by: str):
        """Tells all agents the call was taken so the popup disappears."""
        message = {"type": "call_accepted", "data": {"call_id": call_id, "accepted_by": accepted_by}}
        for conn in list(self.active_agents.values()):
            try:
                await conn.send_text(json.dumps(message))
            except Exception:
                pass

    async def broadcast_call_cancelled(self, call_id: str):
        """Tells all agents to dismiss the ringing popup for this call."""
        message = {"type": "call_cancelled", "data": {"call_id": call_id}}
        for conn in list(self.active_agents.values()):
            try:
                await conn.send_text(json.dumps(message))
            except Exception:
                pass


# Global instance to be imported by our routes
manager = ConnectionManager()