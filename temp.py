#!/usr/bin/env python3

import json
import networkx as nx

graph = nx.Graph()

with open("nodes.json",'r') as n:
    nodes = json.load(n)

for node in nodes["nodes"]:
    print(node)
    print("-----------------")
    graph.add_node(node)

print(list(graph.nodes))
# print(nodes)