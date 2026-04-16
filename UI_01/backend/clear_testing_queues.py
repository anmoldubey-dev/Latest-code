import asyncio
import os
from dotenv import load_dotenv

# Load the environment variables from .env
load_dotenv()

from callcenter import db

async def clear_it():
    await db.init_db()
    result = await db.clear_queues()
    print("Queues cleared:", result)

if __name__ == "__main__":
    asyncio.run(clear_it())
