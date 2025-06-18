#!/usr/bin/env python3

import matplotlib.pyplot as plt
import json
import networkx as nx

graph = nx.Graph()

with open("nodes.json",'r') as n:
    nodes = json.load(n)

node_with_attribute = []
for node in nodes["nodes"]:
    # print(node)
    # print("-----------------")
    node_id = node.pop("node_id")
    node_with_attribute.append((node_id, node))
graph.add_nodes_from(node_with_attribute)


print(graph.nodes(data=True))