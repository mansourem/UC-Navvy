import json
import networkx as nx
import matplotlib.pyplot as plt

# Load nodes
with open('nodes.json', 'r') as f:
    nodes_data = json.load(f)['nodes']

# Load edges
with open('edges.json', 'r') as f:
    edges_data = json.load(f)['paths']

G = nx.Graph()

# Add nodes with lat/lon as attributes
positions = {}
entrance_nodes = []
for node in nodes_data:
    node_id = node['node_id']
    lat = node['latitude']
    lon = node['longitude']
    G.add_node(node_id, **node)
    positions[node_id] = (lon, lat)  # (x, y) = (longitude, latitude)
    if node.get('entrance', False):  # <-- This line adds entrance nodes
        entrance_nodes.append(node_id)

# Add edges
for path in edges_data:
    node = path['node']
    for target in path['connections']:
        if not G.has_edge(node, target):  # Avoid duplicate edges
            G.add_edge(node, target)

# Build node color list
node_colors = []
for n in G.nodes():
    if n in entrance_nodes:
        node_colors.append('silver')  # Entrance nodes
    else:
        node_colors.append('indianred')    # Regular nodes

# Draw the graph
plt.figure(figsize=(12, 8))
nx.draw(G, 
        pos=positions, 
        with_labels=True, 
        node_size=100, 
        node_color= node_colors, 
        edge_color='gray', 
        font_size=8
)
plt.xlabel("Longitude")
plt.ylabel("Latitude")
plt.title("Campus Map Graph")
plt.gca().set_aspect('equal', adjustable='datalim')
plt.show()