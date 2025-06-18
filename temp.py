#!/usr/bin/env python3

import json

with open("nodes.json",'r') as n:
    nodes = json.load(n)

print(nodes)