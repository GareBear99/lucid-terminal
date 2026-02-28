#!/bin/bash
# Quick zodiac test
cd "$(dirname "$0")/.."

echo "Testing zodiac queries:"
echo ""

queries=(
    "What is a Virgo?"
    "When is Aries season?"
    "What zodiac sign is someone born in August?"
    "If I was born on March 25th what am I?"
    "What are the traits of a Leo?"
    "What element is associated with Scorpio?"
)

for query in "${queries[@]}"; do
    echo "========================================="
    echo "Query: $query"
    echo "========================================="
    echo "$query" | python3 lucifer.py 2>/dev/null | grep -A 10 "💬"
    echo ""
done
