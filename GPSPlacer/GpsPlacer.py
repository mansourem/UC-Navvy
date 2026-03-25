import tkinter as tk
from tkinter import filedialog
from tkinter import ttk
import json
import tkintermapview
import math

#TODO: - edited ada values not saving to json or between selections


# =========================
# DATA MODELS
# =========================

class Node:
    def __init__(self, id, lat, lng, building="Outside", floor=None,
                 entrance=False, ada=True, type="outdoor"):
        self.id = str(id)
        self.lat = lat
        self.lng = lng
        self.building = building
        self.floor = floor
        self.entrance = entrance
        self.ada = ada
        self.type = type

class Edge:
    def __init__(self, id, from_id, to_id, type="corridor", ada=True):
        self.id = str(id)
        self.from_id = from_id
        self.to_id = to_id
        self.type = type
        self.ada = ada

# =========================
# STATE
# =========================

nodes = []
edges = []

node_counter = 1
edge_counter = 1

selected_node = None

connect_mode = False
pending_from = None

auto_connect = False
last_node = None

select_mode = False

# ROTATION STATE
rotation_angle = 0.0
rotation_center_lat = 39.1338
rotation_center_lng = -84.5165

# Guard to prevent trace callbacks from running while programmatically
# updating UI widgets (e.g., when populating the editor from a node)
ui_update_suppressed = False

# =========================
# UI
# =========================

root = tk.Tk()
root.title("Map Node Editor")

main_frame = tk.Frame(root)
main_frame.pack(fill="both", expand=True)

map_widget = tkintermapview.TkinterMapView(main_frame, width=800, height=600)
map_widget.pack(side="left", fill="both", expand=True)

map_widget.set_position(39.1338, -84.5165)
map_widget.set_zoom(16)

panel = tk.Frame(main_frame, width=300)
panel.pack(side="right", fill="y")

tk.Label(panel, text="Node Editor", font=("Arial", 14)).pack(pady=10)

status_label = tk.Label(panel, text="Mode: Add")
status_label.pack()

# =========================
# SETTINGS DATA (EXPANDED)
# =========================

floors = ["B", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]
buildings = ["Outside",
    "60 West Charlton", "Alms Building", "Armory Fieldhouse", "Aronoff Center",
    "Arts & Sciences Hall", "Baldwin Hall", "Blegen Library", "Braunstein Hall",
    "Calhoun Hall", "Corbett Cntr Perform Arts", "Clifton Court Hall",
    "College of Law Building", "Crosley Tower", "DAAP Studio Annex", "Dabney Hall",
    "Daniels Hall", "Dieterle Vocal Arts Cntr", "Dyer Hall", "Edwards Center",
    "Emery Hall", "French Hall", "Geology-Physics", "Langsam Library",
    "Carl H. Lindner Hall", "Lindner Center", "Mantei Center", "MarketPointe at Siddall",
    "Memorial Hall", "Morgens Hall", "Marian Spencer Hall", "Nippert Stadium",
    "Old Chemistry Building", "Campus Recreation Center", "Rhodes Hall",
    "Rieveschl Hall", "Sheakley APC-IPF", "Schneider Hall", "Scioto Hall",
    "Shoemaker Multipurp Cntr", "Siddall Hall", "Steger Student Life Cntr",
    "Swift Hall", "Teachers College", "Trabert-Talbert Tennis", "Tangeman University Cntr",
    "Turner Hall", "University Pavilion", "Van Wormer Hall", "Varsity Village Baseball",
    "Wolfson Center", "Zimmer Hall"
]

# =========================
# PERSISTENT EDIT PANEL VARS
# =========================

building_var = tk.StringVar(value="Outside")
floor_var = tk.StringVar(value="0")

entrance_var = tk.BooleanVar(value=False)
elevator_var = tk.BooleanVar(value=False)
stair_var = tk.BooleanVar(value=False)
ada_var = tk.BooleanVar(value=True)

tk.Label(panel, text="Building").pack()
building_menu = ttk.Combobox(panel, state="readonly", textvariable=building_var, values=buildings)
building_menu.current(0)
building_menu.pack()

tk.Label(panel, text="Floor").pack()
floor_menu = ttk.Combobox(panel, state="readonly", textvariable=floor_var, values=floors)
floor_menu.current(1)
floor_menu.pack()

entrance_cb = tk.Checkbutton(panel, text="Entrance", variable=entrance_var)
entrance_cb.pack()

elevator_cb = tk.Checkbutton(panel, text="Elevator", variable=elevator_var)
elevator_cb.pack()

stair_cb = tk.Checkbutton(panel, text="Staircase", variable=stair_var)
stair_cb.pack()

ada_cb = tk.Checkbutton(panel, text="ADA", variable=ada_var)
ada_cb.pack()

# =========================
# ROTATION CONTROLS
# =========================

tk.Label(panel, text="Rotation", font=("Arial", 12, "bold")).pack(pady=(20,5))

rotation_label = tk.Label(panel, text=f"Angle: {rotation_angle:.1f}°")
rotation_label.pack()

def rotate_map(angle_delta):
    global rotation_angle
    rotation_angle += angle_delta
    rotation_angle %= 360
    rotation_label.config(text=f"Angle: {rotation_angle:.1f}°")
    redraw()

tk.Button(panel, text="↺ 90°", command=lambda: rotate_map(-90)).pack(pady=1)
tk.Button(panel, text="↻ 90°", command=lambda: rotate_map(90)).pack(pady=1)
tk.Button(panel, text="↺ 10°", command=lambda: rotate_map(-10)).pack(pady=1)
tk.Button(panel, text="↻ 10°", command=lambda: rotate_map(10)).pack(pady=1)
tk.Button(panel, text="Reset", command=lambda: rotate_map(-rotation_angle)).pack(pady=(5,10))

# Mode buttons
connect_btn = tk.Button(panel, command=lambda: None)
connect_btn.pack(pady=2)

auto_btn = tk.Button(panel, command=lambda: None)
auto_btn.pack(pady=2)

select_btn = tk.Button(panel, command=lambda: None)
select_btn.pack(pady=2)


# =========================
# ROTATION MATH
# =========================

def rotate_point(lat, lng, center_lat, center_lng, angle_deg):
    angle_rad = math.radians(angle_deg)
    cos_a = math.cos(angle_rad)
    sin_a = math.sin(angle_rad)
    
    x = (lng - center_lng) * 111320 * math.cos(math.radians(center_lat))
    y = (lat - center_lat) * 110540
    
    x_new = x * cos_a - y * sin_a
    y_new = x * sin_a + y * cos_a
    
    new_lat = center_lat + y_new / 110540
    new_lng = center_lng + x_new / (111320 * math.cos(math.radians(center_lat)))
    
    return new_lat, new_lng

def get_rotated_coords(lat, lng):
    return rotate_point(lat, lng, rotation_center_lat, rotation_center_lng, rotation_angle)

# =========================
# MODE LABELS
# =========================

def update_mode_labels():
    connect_btn.config(text=f"Connect: {'ON' if connect_mode else 'OFF'}")
    auto_btn.config(text=f"Auto Path: {'ON' if auto_connect else 'OFF'}")
    select_btn.config(text=f"Select Mode: {'ON' if select_mode else 'OFF'}")

    if connect_mode:
        status_label.config(text="Mode: Connect")
    elif select_mode:
        status_label.config(text="Mode: Select")
    elif auto_connect:
        status_label.config(text="Mode: Auto Path")
    else:
        status_label.config(text="Mode: Add")

# =========================
# FIXED: POPULATE EDITOR (CORRECT TYPE LOGIC)
# =========================

def populate_editor(node):
    """Populate editor with node's exact properties - FIXED type logic"""
    # Basic properties
    global ui_update_suppressed
    ui_update_suppressed = True
    try:
        building_var.set(node.building)
        floor_var.set(node.floor if node.floor else "")

        # Reset all checkboxes first
        entrance_var.set(False)
        elevator_var.set(False)
        stair_var.set(False)
        ada_var.set(node.ada)

        # Normalize type string and accept common synonyms (case-insensitive)
        t = (str(node.type) if node.type is not None else "").lower()
        if t in ("entrance", "entry", "door"):
            entrance_var.set(True)
        elif t in ("stair", "staircase", "stairs", "stairway"):
            stair_var.set(True)
        elif t in ("elevator", "lift"):
            elevator_var.set(True)
        # Note: "outdoor" and "corridor" have no checkboxes
    finally:
        ui_update_suppressed = False

    # Apply rules once UI reflects the node
    enforce_rules()


def clear_selection():
    """Clear any active selection and reset editor UI."""
    global selected_node, ui_update_suppressed
    selected_node = None
    ui_update_suppressed = True
    try:
        building_var.set("Outside")
        floor_var.set("0")
        entrance_var.set(False)
        elevator_var.set(False)
        stair_var.set(False)
        ada_var.set(True)
    finally:
        ui_update_suppressed = False
    redraw()

# =========================
# LOAD JSON
# =========================

def load_json():
    global nodes, edges, node_counter, edge_counter, selected_node, rotation_angle

    path = filedialog.askopenfilename(filetypes=[("JSON files", "*.json")])
    if not path:
        return

    with open(path, "r") as f:
        data = json.load(f)

    nodes.clear()
    edges.clear()

    for n in data.get("nodes", []):
        nodes.append(Node(**n))

    for e in data.get("edges", []):
        edges.append(Edge(e["id"], e["from"], e["to"], e["type"], e["ada"]))

    rot_data = data.get("rotation", {})
    rotation_angle = rot_data.get("angle", 0.0)
    rotation_center_lat = rot_data.get("center_lat", 39.1338)
    rotation_center_lng = rot_data.get("center_lng", -84.5165)
    
    rotation_label.config(text=f"Angle: {rotation_angle:.1f}°")

    node_counter = max([int(n.id) for n in nodes], default=0) + 1
    edge_counter = max([int(e.id) for e in edges], default=0) + 1

    selected_node = None
    pending_from = None
    last_node = None

    if nodes:
        map_widget.set_position(nodes[0].lat, nodes[0].lng)
        # Center map on first node but do NOT auto-select — clear any selection
        clear_selection()

    redraw()

# =========================
# MAP CONTROLS
# =========================

def zoom_in():
    map_widget.set_zoom(map_widget.zoom + 1)

def zoom_out():
    map_widget.set_zoom(map_widget.zoom - 1)

def move(dx, dy):
    global rotation_center_lat, rotation_center_lng
    rotation_center_lat += dx
    rotation_center_lng += dy
    redraw()

# Assign commands
tk.Button(panel, text="Load JSON", command=load_json).pack(pady=2)
tk.Button(panel, text="Zoom +", command=zoom_in).pack()
tk.Button(panel, text="Zoom -", command=zoom_out).pack()

# =========================
# NODE CREATION WITH PERSISTENT SETTINGS
# =========================

def create_node_from_settings(lat, lng):
    node = Node(
        node_counter, lat, lng,
        building=building_var.get(),
        floor=None if building_var.get() == "Outside" else floor_var.get(),
        entrance=entrance_var.get(),
        ada=ada_var.get()
    )
    
    if entrance_var.get():
        node.type = "entrance"
    elif stair_var.get():
        node.type = "stair"
    elif elevator_var.get():
        node.type = "elevator"
    elif node.building == "Outside":
        node.type = "outdoor"
    else:
        node.type = "corridor"
    
    return node

# =========================
# NODE LOGIC (SELECTION ONLY)
# =========================

def update_selected_node_from_ui():
    global selected_node
    if not selected_node:
        return

    selected_node.building = building_var.get()
    selected_node.floor = None if building_var.get() == "Outside" else floor_var.get()

    selected_node.entrance = entrance_var.get()
    selected_node.ada = ada_var.get()

    if entrance_var.get():
        selected_node.type = "entrance"
    elif stair_var.get():
        selected_node.type = "stair"
    elif elevator_var.get():
        selected_node.type = "elevator"
    elif selected_node.building == "Outside":
        selected_node.type = "outdoor"
    else:
        selected_node.type = "corridor"

    redraw()

    # After changing the node's type or ADA, update connected edges to keep types/ADA accurate
    def _update_connected_edges(node):
        for e in edges:
            if e.from_id == node.id or e.to_id == node.id:
                other_id = e.to_id if e.from_id == node.id else e.from_id
                other = next((n for n in nodes if n.id == other_id), None)
                if not other:
                    continue
                # Recompute edge type using same rules as connect_nodes
                ta = (str(node.type) if node.type is not None else "").lower()
                tb = (str(other.type) if other.type is not None else "").lower()
                if ta == tb and ta in ("stair", "elevator", "entrance"):
                    e.type = ta
                elif node.building == "Outside" or other.building == "Outside":
                    e.type = "outdoor"
                else:
                    e.type = "corridor"

                e.ada = (node.ada and other.ada)

    _update_connected_edges(selected_node)
    redraw()

def enforce_rules():
    if entrance_var.get():
        elevator_cb.config(state="disabled")
        stair_cb.config(state="disabled")
        elevator_var.set(False)
        stair_var.set(False)
    else:
        elevator_cb.config(state="normal")
        stair_cb.config(state="normal")

    if stair_var.get():
        ada_cb.config(state="disabled")
        ada_var.set(False)
    else:
        ada_cb.config(state="normal")
        ada_var.set(True)

# Event bindings
def _on_entrance_change(*a):
    if ui_update_suppressed:
        return
    enforce_rules()
    update_selected_node_from_ui()

def _on_stair_change(*a):
    if ui_update_suppressed:
        return
    enforce_rules()
    update_selected_node_from_ui()

def _on_elevator_change(*a):
    if ui_update_suppressed:
        return
    update_selected_node_from_ui()

def _on_ada_change(*a):
    if ui_update_suppressed:
        return
    update_selected_node_from_ui()

entrance_var.trace_add("write", _on_entrance_change)
stair_var.trace_add("write", _on_stair_change)
elevator_var.trace_add("write", _on_elevator_change)
ada_var.trace_add("write", _on_ada_change)
building_menu.bind("<<ComboboxSelected>>", lambda e: update_selected_node_from_ui())
floor_menu.bind("<<ComboboxSelected>>", lambda e: update_selected_node_from_ui())

# =========================
# SELECTION & CONNECT
# =========================

def distance(a_lat, a_lng, b_lat, b_lng):
    return math.sqrt((a_lat - b_lat)**2 + (a_lng - b_lng)**2)

def select_nearest_node(coords):
    global selected_node, pending_from, connect_mode

    if not nodes:
        return

    orig_coords = rotate_point(coords[0], coords[1], rotation_center_lat, rotation_center_lng, -rotation_angle)
    lat, lng = orig_coords

    closest = min(nodes, key=lambda n: distance(lat, lng, n.lat, n.lng))

    if distance(lat, lng, closest.lat, closest.lng) > 0.0005:
        return

    if connect_mode:
        if pending_from is None:
            pending_from = closest
        else:
            connect_nodes(pending_from, closest)
            pending_from = None
            connect_mode = False
    else:
        selected_node = closest
        populate_editor(closest)

    redraw()

# =========================
# MAP CLICK
# =========================

def add_node(coords):
    global node_counter, last_node

    orig_coords = rotate_point(coords[0], coords[1], rotation_center_lat, rotation_center_lng, -rotation_angle)
    lat, lng = orig_coords

    node = create_node_from_settings(lat, lng)
    nodes.append(node)
    node_counter += 1

    if auto_connect and last_node:
        connect_nodes(last_node, node)

    last_node = node
    selected_node = node
    populate_editor(node)

    redraw()

def on_map_click(coords):
    if select_mode or connect_mode:
        select_nearest_node(coords)
    else:
        add_node(coords)

map_widget.add_left_click_map_command(on_map_click)

# =========================
# EDGE CONNECTION
# =========================

def connect_nodes(n1, n2):
    global edge_counter

    for e in edges:
        if (e.from_id == n1.id and e.to_id == n2.id) or \
           (e.from_id == n2.id and e.to_id == n1.id) or \
           (n1.id == n2.id):
            return

    # Determine edge type based on node properties
    def _compute_edge_type(a, b):
        ta = (str(a.type) if a.type is not None else "").lower()
        tb = (str(b.type) if b.type is not None else "").lower()
        specials = ("stair", "elevator", "entrance")
        # If both ends share the same special type, use that (take precedence)
        if ta == tb and ta in specials:
            return ta
        # Otherwise, if either node is outside, it's an outdoor edge
        if a.building == "Outside" or b.building == "Outside":
            return "outdoor"
        # Fallback to corridor
        return "corridor"

    edges.append(Edge(
        edge_counter,
        n1.id,
        n2.id,
        type=_compute_edge_type(n1, n2),
        ada=(n1.ada and n2.ada)
    ))

    edge_counter += 1

# =========================
# MODE TOGGLES
# =========================

def toggle_connect():
    global connect_mode, pending_from
    connect_mode = not connect_mode
    pending_from = None
    update_mode_labels()

def toggle_auto():
    global auto_connect, last_node
    auto_connect = not auto_connect
    last_node = None
    update_mode_labels()

def toggle_select():
    global select_mode
    select_mode = not select_mode
    # If select mode was turned OFF, clear the current selection
    if not select_mode:
        clear_selection()
    update_mode_labels()

connect_btn.config(command=toggle_connect)
auto_btn.config(command=toggle_auto)
select_btn.config(command=toggle_select)

# =========================
# DELETE
# =========================

def delete_selected_node():
    global selected_node

    if not selected_node:
        return

    nid = selected_node.id
    edges[:] = [e for e in edges if e.from_id != nid and e.to_id != nid]
    nodes.remove(selected_node)

    selected_node = None
    redraw()

tk.Button(panel, text="Delete Node", command=delete_selected_node).pack(pady=2)

# =========================
# EXPORT JSON
# =========================

def export_json():
    path = filedialog.asksaveasfilename(defaultextension=".json")
    if not path:
        return

    with open(path, "w") as f:
        json.dump({
            "nodes": [vars(n) for n in nodes],
            "edges": [
                {"id": e.id, "from": e.from_id, "to": e.to_id,
                 "type": e.type, "ada": e.ada}
                for e in edges
            ],
            "rotation": {
                "angle": rotation_angle,
                "center_lat": rotation_center_lat,
                "center_lng": rotation_center_lng
            }
        }, f, indent=4)

tk.Button(panel, text="Export JSON", command=export_json).pack(pady=2)

# =========================
# DRAW (ROTATED)
# =========================

markers = []
lines = []

def redraw():
    global markers, lines

    for m in markers:
        m.delete()
    for l in lines:
        l.delete()

    markers.clear()
    lines.clear()

    for e in edges:
        n1 = next((n for n in nodes if n.id == e.from_id), None)
        n2 = next((n for n in nodes if n.id == e.to_id), None)

        if n1 and n2:
            r1_lat, r1_lng = get_rotated_coords(n1.lat, n1.lng)
            r2_lat, r2_lng = get_rotated_coords(n2.lat, n2.lng)
            
            lines.append(map_widget.set_path(
                [(r1_lat, r1_lng), (r2_lat, r2_lng)],
                color="green" if e.ada else "red"
            ))

    for n in nodes:
        r_lat, r_lng = get_rotated_coords(n.lat, n.lng)
        markers.append(map_widget.set_marker(
            r_lat, r_lng,
            text=n.id,
            marker_color_circle="yellow" if n == selected_node else "red"
        ))

# =========================
# INITIALIZE
# =========================

update_mode_labels()
redraw()

# =========================
# RUN
# =========================

root.mainloop()
