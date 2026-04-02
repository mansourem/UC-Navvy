import tkinter as tk
from tkinter import filedialog, messagebox
from tkinter import ttk
import json
import tkintermapview
import math
from PIL import Image, ImageTk, ImageDraw
from tkintermapview.utility_functions import decimal_to_osm

#TODO: - Add Option to export nodes and edges as seperate json files.  Either a new button or change existing functionality.

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

manual_edge_mode = False

# When back button (on my mouse) is pressed, redraw icons
def on_back_button(event):
    redraw()

# =========================
# UI
# =========================

root = tk.Tk()
root.title("Map Node Editor")
root.bind("<Button-4>", on_back_button)

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

tk.Label(panel, text="Start Node ID").pack()
start_node_id_var = tk.IntVar(value=1)
tk.Entry(panel, textvariable=start_node_id_var).pack()

def set_start_node_id():
    global node_counter
    node_counter = start_node_id_var.get()

tk.Button(panel, text="Set Node Counter", command=set_start_node_id).pack(pady=2)

tk.Label(panel, text="Start Edge ID").pack()
start_edge_id_var = tk.IntVar(value=1)
tk.Entry(panel, textvariable=start_edge_id_var).pack()

def set_start_edge_id():
    global edge_counter
    edge_counter = start_edge_id_var.get()

tk.Button(panel, text="Set Edge Counter", command=set_start_edge_id).pack(pady=2)

redraw_btn = tk.Button(panel, text="Redraw", command=lambda: redraw())
redraw_btn.pack()

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
# PIN MARKER IMAGES
# =========================

pin_icon_size = 25

img = Image.open("MapPin.png").resize((pin_icon_size, pin_icon_size))
marker_img = ImageTk.PhotoImage(img)

img = Image.open("MapPinSelected.png").resize((pin_icon_size, pin_icon_size))
selected_marker_img = ImageTk.PhotoImage(img)

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

tk.Label(panel, text="Rotation", font=("Arial", 12, "bold")).pack(pady=(5,5))

rotation_label = tk.Label(panel, text=f"Angle: {rotation_angle:.1f}°")
rotation_label.pack()

def rotate_map(angle_delta):
    global rotation_angle
    rotation_angle += angle_delta
    rotation_angle %= 360
    rotation_label.config(text=f"Angle: {rotation_angle:.1f}°")
    _create_floorplan_shapes()
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

def toggle_manual_edge():
    global manual_edge_mode
    manual_edge_mode = True  #not manual_edge_mode
    status_label.config(text="Mode: Manual Edge" if manual_edge_mode else "Mode: Add")

tk.Button(panel, text="Manual Edge", command=toggle_manual_edge).pack(pady=2)

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
    elif manual_edge_mode:
        status_label.config(text="Mode: Manual Edge")
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
    enforce_rules(from_user=False)


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

    enforce_rules(from_user=False)

    redraw()

# =========================
# LOAD JSON
# =========================

def load_json():
    global nodes, edges, node_counter, edge_counter, selected_node, rotation_angle, rotation_center_lat, rotation_center_lng

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

floorplan_geojson = None
floorplan_shapes = []
floorplan_visible = True
floorplan_photo = None

# Simplification level (higher = more aggressive, fewer points)
FLOORPLAN_SIMPLIFY_TOLERANCE = 0.00001  # degrees (~1m) - balanced performance/detail
FLOORPLAN_STRONG_SIMPLIFY_TOLERANCE = 0.00005  # degrees (~5m) - stronger for very long paths
FLOORPLAN_MAX_PATHS = 1000  # reduced for performance while keeping most walls
FLOORPLAN_MAX_POINTS_PER_PATH = 100  # reduced for smoother interaction


def _rdp_reduce(coords, epsilon):
    if len(coords) < 3:
        return coords

    # point format: (lat, lng)
    start = coords[0]
    end = coords[-1]

    max_dist = 0.0
    index = 0

    x1, y1 = start
    x2, y2 = end

    for i in range(1, len(coords) - 1):
        x0, y0 = coords[i]
        # line-point distance (perpendicular)
        if x1 == x2 and y1 == y2:
            dist = math.hypot(x0 - x1, y0 - y1)
        else:
            num = abs((y2 - y1) * x0 - (x2 - x1) * y0 + x2 * y1 - y2 * x1)
            den = math.hypot(y2 - y1, x2 - x1)
            dist = num / den

        if dist > max_dist:
            max_dist = dist
            index = i

    if max_dist > epsilon:
        left = _rdp_reduce(coords[:index + 1], epsilon)
        right = _rdp_reduce(coords[index:], epsilon)
        return left[:-1] + right
    else:
        return [start, end]


def simplify_coords(coords, epsilon=FLOORPLAN_SIMPLIFY_TOLERANCE):
    if len(coords) < 3:
        return coords
    return _rdp_reduce(coords, epsilon)


def clear_floorplan():
    global floorplan_shapes, floorplan_photo
    for shape in floorplan_shapes:
        try:
            map_widget.canvas.delete(shape)
        except Exception:
            pass
    floorplan_shapes = []
    floorplan_photo = None


def load_floorplan():
    global floorplan_geojson
    path = filedialog.askopenfilename(filetypes=[("GeoJSON files", "*.geojson;*.json")])
    if not path:
        return

    with open(path, "r") as f:
        data = json.load(f)

    if not isinstance(data, dict) or "features" not in data:
        messagebox.showerror("Load Floorplan", "Selected file is not valid GeoJSON.")
        return

    floorplan_geojson = data
    center = _create_floorplan_shapes()
    if center:
        map_widget.set_position(*center)
        _create_floorplan_shapes()  # Recreate at new position
    redraw()


def _create_floorplan_shapes():
    global floorplan_shapes, floorplan_photo
    clear_floorplan()
    if not floorplan_geojson or not floorplan_visible:
        return

    raw_paths = []

    def append_path(raw_path):
        if len(raw_path) < 2:
            return
        raw_paths.append(raw_path)

    for feature in floorplan_geojson.get("features", []):
        geom = feature.get("geometry")
        if not geom:
            continue
        gtype = geom.get("type")
        coords = geom.get("coordinates")

        if gtype == "LineString":
            p = [(lat, lng) for lng, lat in (c[:2] for c in coords)]
            append_path(p)
        elif gtype == "MultiLineString":
            for line in coords:
                p = [(lat, lng) for lng, lat in (c[:2] for c in line)]
                append_path(p)
        elif gtype == "Polygon":
            for ring in coords:
                p = [(lat, lng) for lng, lat in (c[:2] for c in ring)]
                if p and p[0] != p[-1]:
                    p.append(p[0])
                append_path(p)
        elif gtype == "MultiPolygon":
            for poly in coords:
                for ring in poly:
                    p = [(lat, lng) for lng, lat in (c[:2] for c in ring)]
                    if p and p[0] != p[-1]:
                        p.append(p[0])
                    append_path(p)
        else:
            continue

    if not raw_paths:
        return None

    # Calculate bounds
    all_points = [pt for p in raw_paths for pt in p]
    lats = [pt[0] for pt in all_points]
    lngs = [pt[1] for pt in all_points]
    min_lat, max_lat = min(lats), max(lats)
    min_lng, max_lng = min(lngs), max(lngs)

    # Use current zoom for tile calculations
    tile_zoom = round(map_widget.zoom)

    # Get canvas positions
    try:
        tile_position_min = decimal_to_osm(min_lat, min_lng, tile_zoom)
        tile_position_max = decimal_to_osm(max_lat, max_lng, tile_zoom)
    except Exception as e:
        return None
    
    widget_tile_width = map_widget.lower_right_tile_pos[0] - map_widget.upper_left_tile_pos[0]
    widget_tile_height = map_widget.lower_right_tile_pos[1] - map_widget.upper_left_tile_pos[1]
    
    if widget_tile_width <= 0 or widget_tile_height <= 0:
        return None
    
    canvas_min_x = ((tile_position_min[0] - map_widget.upper_left_tile_pos[0]) / widget_tile_width) * map_widget.width
    canvas_min_y = ((tile_position_min[1] - map_widget.upper_left_tile_pos[1]) / widget_tile_height) * map_widget.height
    canvas_max_x = ((tile_position_max[0] - map_widget.upper_left_tile_pos[0]) / widget_tile_width) * map_widget.width
    canvas_max_y = ((tile_position_max[1] - map_widget.upper_left_tile_pos[1]) / widget_tile_height) * map_widget.height

    canvas_left = min(canvas_min_x, canvas_max_x)
    canvas_right = max(canvas_min_x, canvas_max_x)
    canvas_top = min(canvas_min_y, canvas_max_y)
    canvas_bottom = max(canvas_min_y, canvas_max_y)

    # Image size based on canvas bounds
    image_width = int(canvas_right - canvas_left)
    image_height = int(canvas_bottom - canvas_top)

    if image_width <= 0 or image_height <= 0:
        return None

    # Create image with scaled size
    image = Image.new('RGBA', (image_width, image_height), (0,0,0,0))
    draw = ImageDraw.Draw(image)

    # Draw paths using current zoom level
    for path in raw_paths:
        if len(path) < 2:
            continue
        # Convert to image coordinates
        image_points = []
        for lat, lng in path:
            tile_position = decimal_to_osm(lat, lng, tile_zoom)
            cx = ((tile_position[0] - map_widget.upper_left_tile_pos[0]) / widget_tile_width) * map_widget.width
            cy = ((tile_position[1] - map_widget.upper_left_tile_pos[1]) / widget_tile_height) * map_widget.height
            ix = cx - canvas_left
            iy = cy - canvas_top
            image_points.extend([ix, iy])
        if len(image_points) >= 4:
            draw.line(image_points, fill='blue', width=1)

    # Create photo
    photo = ImageTk.PhotoImage(image)

    # Calculate center
    center_lat = (min_lat + max_lat) / 2
    center_lng = (min_lng + max_lng) / 2

    # Get canvas position of center using current zoom
    tile_position_center = decimal_to_osm(center_lat, center_lng, tile_zoom)
    canvas_center_x = ((tile_position_center[0] - map_widget.upper_left_tile_pos[0]) / widget_tile_width) * map_widget.width
    canvas_center_y = ((tile_position_center[1] - map_widget.upper_left_tile_pos[1]) / widget_tile_height) * map_widget.height

    # Place image centered on center
    place_x = canvas_center_x - image_width / 2
    place_y = canvas_center_y - image_height / 2

    # Add to canvas
    floorplan_image_id = map_widget.canvas.create_image(place_x, place_y, image=photo, anchor='nw')
    floorplan_shapes = [floorplan_image_id]

    # Store photo to prevent garbage collection
    floorplan_photo = photo

    # Ensure proper z-order
    map_widget.manage_z_order()

    return ((min_lat + max_lat) / 2, (min_lng + max_lng) / 2)

# Zoom button control functions removed as unneeded
# def zoom_in():
#     new_zoom = map_widget.zoom + 2
#     map_widget.set_zoom(new_zoom)
#     _create_floorplan_shapes()

# def zoom_out():
#     new_zoom = max(map_widget.zoom - 2, 0)
#     map_widget.set_zoom(new_zoom)
#     _create_floorplan_shapes()

def move(dx, dy):
    global rotation_center_lat, rotation_center_lng
    rotation_center_lat += dx
    rotation_center_lng += dy
    _create_floorplan_shapes()
    redraw()


def toggle_floorplan_visibility():
    global floorplan_visible
    floorplan_visible = not floorplan_visible
    if not floorplan_visible:
        clear_floorplan()
    else:
        _create_floorplan_shapes()
    redraw()

# Assign commands
tk.Button(panel, text="Load JSON", command=load_json).pack(pady=2)
tk.Button(panel, text="Load Floorplan", command=load_floorplan).pack(pady=2)
tk.Button(panel, text="Toggle Floorplan", command=toggle_floorplan_visibility).pack(pady=2)
# Zoom Buttons disabled.  Map provides enough control without additional buttons
#tk.Button(panel, text="Zoom +", command=zoom_in).pack()
#tk.Button(panel, text="Zoom -", command=zoom_out).pack()

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

def enforce_rules(from_user=False):
    if ui_update_suppressed:
        return

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
        if from_user:
            ada_var.set(False)
    else:
        ada_cb.config(state="normal")
        if from_user and not entrance_var.get():
            ada_var.set(True)

# Event bindings
def _on_entrance_change(*a):
    if ui_update_suppressed:
        return
    enforce_rules(from_user=True)
    update_selected_node_from_ui()

def _on_stair_change(*a):
    if ui_update_suppressed:
        return
    enforce_rules(from_user=True)
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
    global selected_node, pending_from, connect_mode, manual_edge_mode

    if not nodes:
        return

    orig_coords = rotate_point(coords[0], coords[1], rotation_center_lat, rotation_center_lng, -rotation_angle)
    lat, lng = orig_coords

    closest = min(nodes, key=lambda n: distance(lat, lng, n.lat, n.lng))

    if distance(lat, lng, closest.lat, closest.lng) > 0.0005:
        return
    
    if manual_edge_mode:
        prompt_for_edge_target(closest)
        manual_edge_mode = False
        update_mode_labels()
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
    if manual_edge_mode:
        select_nearest_node(coords)
        return
    
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

    offset = pixel_to_lat_offset(pin_icon_size // 2, map_widget.zoom)

    for n in nodes:
        r_lat, r_lng = get_rotated_coords(n.lat, n.lng)
        markers.append(map_widget.set_marker(
            r_lat + offset,
            r_lng,
            text=n.id,
            icon=selected_marker_img if n == selected_node else marker_img
            #marker_color_circle="#2ef24d" if n == selected_node else "white"
        ))

    _create_floorplan_shapes()

def pixel_to_lat_offset(pixels, zoom):
    # meters per pixel (approx)
    meters_per_pixel = 156543.03392 * math.cos(math.radians(map_widget.get_position()[0])) / (2 ** zoom)
    
    # convert meters to latitude degrees
    return (pixels * meters_per_pixel) / 110540

def prompt_for_edge_target(start_node):
    popup = tk.Toplevel(root)
    popup.title("Enter Target Node ID")

    tk.Label(popup, text=f"From Node {start_node.id} to:").pack()

    target_var = tk.StringVar()
    tk.Entry(popup, textvariable=target_var).pack()

    def confirm():
        target_id = target_var.get()

        # Find existing node OR allow non-existent
        target_node = next((n for n in nodes if n.id == target_id), None)

        if target_node:
            connect_nodes(start_node, target_node)
        else:
            # Create edge to non-existing node (allowed per your TODO)
            edges.append(Edge(
                edge_counter,
                start_node.id,
                target_id,
                type="corridor",
                ada=start_node.ada
            ))
            globals()['edge_counter'] += 1

        popup.destroy()
        redraw()

    tk.Button(popup, text="Create Edge", command=confirm).pack()

# =========================
# MAP STATE TRACKING
# =========================

last_map_position = None
last_map_zoom = None

def check_map_changed():
    """Periodically check if map position/zoom changed and redraw floorplan"""
    global last_map_position, last_map_zoom
    
    current_position = map_widget.get_position()
    current_zoom = map_widget.zoom
    
    # Redraw if position or zoom changed
    if (last_map_position != current_position or last_map_zoom != current_zoom):
        last_map_position = current_position
        last_map_zoom = current_zoom
        _create_floorplan_shapes()
    
    # Check again in 500ms
    root.after(500, check_map_changed)

# =========================
# INITIALIZE
# =========================

update_mode_labels()
redraw()

# Start monitoring map changes
check_map_changed()

# =========================
# RUN
# =========================

root.mainloop()
