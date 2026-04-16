# Kafka — Voice AI Core Event Bus

## What this does
Kafka acts as the event bus between services:
- call_events topic  → routing decisions, call start/end
- transcripts topic  → STT output per turn
- ai_responses topic → LLM output per turn

## Run Kafka WITHOUT Docker (KRaft mode — no ZooKeeper needed)

Requires Java 11+:
```bash
java -version   # check
sudo apt install -y default-jdk   # if missing
```

Download Kafka:
```bash
wget https://downloads.apache.org/kafka/3.7.0/kafka_2.13-3.7.0.tgz
tar -xzf kafka_2.13-3.7.0.tgz -C /home/swayam/Documents/VoiceAicore/infrastructure/kafka/
cd /home/swayam/Documents/VoiceAicore/infrastructure/kafka/kafka_2.13-3.7.0
```

One-time setup (KRaft — no ZooKeeper):
```bash
KAFKA_CLUSTER_ID="$(bin/kafka-storage.sh random-uuid)"
bin/kafka-storage.sh format -t $KAFKA_CLUSTER_ID -c config/kraft/server.properties
```

Start Kafka:
```bash
bin/kafka-server-start.sh config/kraft/server.properties
```

Create topics:
```bash
bin/kafka-topics.sh --create --topic call_events   --bootstrap-server localhost:9092 --partitions 3 --replication-factor 1
bin/kafka-topics.sh --create --topic transcripts    --bootstrap-server localhost:9092 --partitions 3 --replication-factor 1
bin/kafka-topics.sh --create --topic ai_responses   --bootstrap-server localhost:9092 --partitions 3 --replication-factor 1
```

## Python client (in serviceA)
```bash
pip install aiokafka
```

## Files
- `producer.py`  — async Kafka producer helper (to be built)
- `consumer.py`  — async Kafka consumer helper (to be built)
- `topics.py`    — topic name constants
