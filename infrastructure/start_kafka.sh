#!/usr/bin/env bash
# Start Kafka in KRaft mode (no ZooKeeper, no Docker)
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KAFKA_DIR="$SCRIPT_DIR/kafka/kafka_2.13-3.7.0"

# Use conda Java
export JAVA_HOME="$(dirname $(dirname $(/home/swayam/miniconda3/envs/serviceA/bin/python3 -c "import subprocess; print(subprocess.check_output(['which','java'],text=True,env={'PATH':'/home/swayam/miniconda3/envs/serviceA/bin:$PATH'}).strip())")))"
export PATH="$JAVA_HOME/bin:$PATH"

if [[ ! -d "$KAFKA_DIR" ]]; then
    echo " Kafka not found at $KAFKA_DIR"
    echo " Download: wget https://archive.apache.org/dist/kafka/3.7.0/kafka_2.13-3.7.0.tgz"
    echo "           tar -xzf kafka_2.13-3.7.0.tgz -C $SCRIPT_DIR/kafka/"
    exit 1
fi

STORAGE="$SCRIPT_DIR/kafka/data"
CFG="$KAFKA_DIR/config/kraft/server.properties"

# First run: format storage
if [[ ! -d "$STORAGE/meta.properties" && ! -f "$STORAGE/meta.properties" ]]; then
    echo " First run — formatting Kafka KRaft storage..."
    mkdir -p "$STORAGE"
    # Patch storage dir in config
    sed -i "s|log.dirs=.*|log.dirs=$STORAGE|" "$CFG"
    CLUSTER_ID="$("$KAFKA_DIR/bin/kafka-storage.sh" random-uuid)"
    "$KAFKA_DIR/bin/kafka-storage.sh" format -t "$CLUSTER_ID" -c "$CFG"
fi

echo " Starting Kafka on :9092 (KRaft, no ZooKeeper)..."
"$KAFKA_DIR/bin/kafka-server-start.sh" "$CFG" &
KAFKA_PID=$!
echo " Kafka PID=$KAFKA_PID"
sleep 4

# Create topics if not exist
for topic in call_events transcripts ai_responses ivr_events; do
    "$KAFKA_DIR/bin/kafka-topics.sh" --create \
        --topic "$topic" \
        --bootstrap-server localhost:9092 \
        --partitions 3 --replication-factor 1 \
        --if-not-exists 2>/dev/null || true
done
echo " Topics created: call_events transcripts ai_responses ivr_events"
echo " Kafka ready at localhost:9092"
