#!/usr/bin/env python3
"""
generate_graph.py

Generate walkable path graphs (nodes + edges JSON) from building floorplan GeoJSON files.

Each Layer_XX.geojson file is one floor.  ALL LineString features are treated as
walls or obstacles.  Walkable corridor paths are derived from the Voronoi diagram
of points sampled along those walls: a Voronoi ridge (the equidistant centre-line
between two wall segments) is a viable walking path only when the clearance on
both sides is within the ADA-compliant range:

  ADA minimum clear width : 36 in = 0.914 m  →  clearance ≥ 0.457 m each side
  "close to ADA" lower bound used here        →  clearance ≥ ADA_MIN_CLEARANCE_M
  upper bound (outside / atrium filter)       →  clearance ≤ MAX_CLEARANCE_M

Stair and elevator features are still detected geometrically and stitched
across adjacent floors with inter-floor edges.

Usage:
    python3 generate_graph.py <building> [floorplans_dir] [output_dir]

Examples:
    python3 generate_graph.py baldwin
    python3 generate_graph.py baldwin /home/elaine/senior_design/floorplans ./graphs
"""

import json
import math
import os
import sys
from collections import defaultdict

import numpy as np
from scipy.spatial import Voronoi, cKDTree
from shapely.geometry import LineString, Point
from shapely.ops import unary_union
from shapely.strtree import STRtree
import networkx as nx


# ── Default paths ──────────────────────────────────────────────────────────
FLOORPLANS_DIR = "/home/elaine/senior_design/floorplans"
OUTPUT_DIR     = os.path.join(os.path.dirname(os.path.abspath(__file__)), "graphs")

# ── Walkable-path (Voronoi) thresholds ────────────────────────────────────
# At lat ~39°N:  1° lng ≈ 86 500 m,  1° lat ≈ 111 300 m
MIN_LINE_LEN        = 4e-6    # ~0.35 m — wall lines shorter than this are noise
SNAP_TOL            = 3e-6    # ~0.26 m — endpoint snapping tolerance for graph nodes
WALL_SAMPLE_STEP_M  = 0.40    # sample a wall point every 0.40 m for Voronoi
ADA_MIN_CLEARANCE_M = 0.38    # half of ~30 in — "close to ADA" lower bound
#                               (ADA 36 in / 2 = 0.457 m; 0.38 m ≈ 30 in / 2)
MAX_CLEARANCE_M     = 5.0     # half-width upper bound — wider than 10 m = outside

# ── Stair / elevator detection thresholds ─────────────────────────────────
PARALLEL_TOL      = 0.26              # rad (~15°) — max angle diff for parallel lines
STAIR_BEAR_BIN    = math.radians(8)   # bearing bucket width (8°)
STAIR_CELL        = 8e-5              # ~7 m spatial cell
STAIR_MIN_COUNT   = 5                 # min parallel lines to call it a stairwell
STAIR_MIN_LEN_M   = 0.5              # min step-line length (m)
STAIR_MAX_LEN_M   = 3.5              # max step-line length (m)
STAIR_MAX_BOX_M   = 12.0             # max bbox side length (m)
STAIR_CLUSTER_M   = 10.0             # merge stair candidates within this distance

# ── Elevator detection thresholds ──────────────────────────────────────────
ELEV_CELL         = 5e-5             # ~4.3 m spatial cell
ELEV_MIN_COUNT    = 3
ELEV_MAX_COUNT    = 20
ELEV_MIN_BOX_M    = 1.0             # min bbox side (m)
ELEV_MAX_BOX_M    = 5.5             # max bbox side (m)
ELEV_MIN_ASPECT   = 0.25            # min w/h ratio
ELEV_MAX_ASPECT   = 4.0             # max w/h ratio
ELEV_BEAR_SPREAD  = 40.0            # min bearing spread in degrees (mixed directions)
ELEV_CLUSTER_M    = 5.0             # merge elevator candidates within this distance

# ── Inter-floor stitching ──────────────────────────────────────────────────
INTERFLOOR_MATCH_M = 8.0            # same stair/elevator on adjacent floors if within this


# ── Geometry helpers ───────────────────────────────────────────────────────

def haversine(lng1: float, lat1: float, lng2: float, lat2: float) -> float:
    R   = 6_371_000
    f1  = math.radians(lat1)
    f2  = math.radians(lat2)
    df  = math.radians(lat2 - lat1)
    dl  = math.radians(lng2 - lng1)
    a   = math.sin(df / 2) ** 2 + math.cos(f1) * math.cos(f2) * math.sin(dl / 2) ** 2
    return R * 2 * math.asin(math.sqrt(min(a, 1.0)))


def undirected_bearing(coords: list) -> float:
    dx = coords[-1][0] - coords[0][0]
    dy = coords[-1][1] - coords[0][1]
    return math.atan2(dy, dx) % math.pi


def are_parallel(b1: float, b2: float) -> bool:
    diff = abs(b1 - b2) % math.pi
    return diff < PARALLEL_TOL or diff > (math.pi - PARALLEL_TOL)


def bbox_dims_m(geom) -> tuple[float, float]:
    b = geom.bounds   # minx, miny, maxx, maxy
    w = haversine(b[0], b[1], b[2], b[1])
    h = haversine(b[0], b[1], b[0], b[3])
    return w, h


def cluster_by_distance(points: list[tuple], max_dist_m: float) -> list[tuple]:
    """
    Greedy single-linkage cluster of (lng, lat) points.
    Returns list of cluster centroids (lng, lat).
    """
    if not points:
        return []
    clusters: list[list] = []
    for pt in points:
        merged = False
        for cl in clusters:
            rep = cl[0]
            if haversine(pt[0], pt[1], rep[0], rep[1]) <= max_dist_m:
                cl.append(pt)
                merged = True
                break
        if not merged:
            clusters.append([pt])
    return [
        (sum(c[0] for c in cl) / len(cl), sum(c[1] for c in cl) / len(cl))
        for cl in clusters
    ]


# ── Walkable path detection (Voronoi / ADA clearance) ─────────────────────

def find_walkable_paths(features: list) -> list[tuple[LineString, list]]:
    """
    Derive viable walking-path segments from wall geometry using a Voronoi approach.

    All LineString features are treated as walls/obstacles.  Points are sampled
    densely along every wall, then a Voronoi diagram is computed.  Each Voronoi
    ridge (the locus equidistant from two wall segments) is a natural corridor
    centre-line candidate.

    A ridge is kept only when the perpendicular clearance at BOTH endpoints is
    within [ADA_MIN_CLEARANCE_M, MAX_CLEARANCE_M]:
      • below ADA_MIN_CLEARANCE_M  → space is too narrow to walk through
      • above MAX_CLEARANCE_M      → probably outside the building or an atrium

    Clearance at each Voronoi vertex is computed exactly as the distance to the
    nearest wall sample point (by the Voronoi definition, all closer points are
    farther away, so this is the true minimum clearance at that vertex).

    Returns a list of (LineString, coords) tuples compatible with build_graph().
    """
    # ── 1. Parse wall LineStrings ──
    walls = []
    for f in features:
        g = f.get("geometry", {})
        if g.get("type") != "LineString":
            continue
        coords = g["coordinates"]
        if len(coords) < 2:
            continue
        ls = LineString(coords)
        if ls.length < MIN_LINE_LEN:
            continue
        walls.append((ls, coords))

    if not walls:
        return []

    # ── 2. Sample dense points along every wall ──
    sample_pts: list[list[float]] = []
    for ls, coords in walls:
        total_m = sum(
            haversine(coords[k][0], coords[k][1], coords[k+1][0], coords[k+1][1])
            for k in range(len(coords) - 1)
        )
        n = max(2, int(total_m / WALL_SAMPLE_STEP_M))
        for i in range(n + 1):
            pt = ls.interpolate(i / n, normalized=True)
            sample_pts.append([pt.x, pt.y])

    pts_arr = np.array(sample_pts)

    if len(pts_arr) < 4:
        return []

    # ── 3. Voronoi diagram ──
    try:
        vor = Voronoi(pts_arr)
    except Exception:
        return []

    if len(vor.vertices) == 0:
        return []

    # ── 4. Clearance at every Voronoi vertex ──
    # By the Voronoi definition, each vertex is equidistant from its 3+ nearest
    # input points and all other input points are strictly farther away.
    # Therefore  dist(vertex, nearest input point) = true minimum clearance.
    kd              = cKDTree(pts_arr)
    clearance_deg, _ = kd.query(vor.vertices, workers=-1)

    # Convert from degrees to metres using the latitude scale (conservative).
    avg_lat        = float(pts_arr[:, 1].mean())
    m_per_deg      = 111_300.0 * math.cos(math.radians(avg_lat))  # lng scale
    clearance_m    = clearance_deg * m_per_deg

    # ── 5. Filter ridges by ADA clearance ──
    viable: list[tuple[LineString, list]] = []
    for i, j in vor.ridge_vertices:
        if i == -1 or j == -1:          # infinite ridge — skip
            continue
        c1 = clearance_m[i]
        c2 = clearance_m[j]
        if (c1 >= ADA_MIN_CLEARANCE_M and c2 >= ADA_MIN_CLEARANCE_M
                and c1 <= MAX_CLEARANCE_M and c2 <= MAX_CLEARANCE_M):
            v1    = vor.vertices[i].tolist()
            v2    = vor.vertices[j].tolist()
            seg   = LineString([v1, v2])
            viable.append((seg, [v1, v2]))

    return viable


# ── Vision-based corridor detection (image processing) ────────────────────

def _zhang_suen_thin(binary: np.ndarray) -> np.ndarray:
    """
    Vectorised Zhang-Suen binary thinning (skeletonisation).

    Iteratively removes border pixels from a binary object until only a
    1-pixel-wide skeleton remains.  Used as a fallback when scikit-image
    is not installed.

    Reference: Zhang & Suen, "A fast parallel algorithm for thinning digital
    patterns", CACM 27(3), 1984.
    """
    img = binary.astype(np.uint8)

    def _neighbors(s: np.ndarray):
        # Pad with zeros so edge pixels have zero-valued neighbours
        p = np.pad(s, 1)
        P2 = p[:-2, 1:-1]   # N
        P3 = p[:-2, 2:]     # NE
        P4 = p[1:-1, 2:]    # E
        P5 = p[2:,  2:]     # SE
        P6 = p[2:,  1:-1]   # S
        P7 = p[2:,  :-2]    # SW
        P8 = p[1:-1, :-2]   # W
        P9 = p[:-2, :-2]    # NW
        return P2, P3, P4, P5, P6, P7, P8, P9

    while True:
        P2, P3, P4, P5, P6, P7, P8, P9 = _neighbors(img)

        B = P2 + P3 + P4 + P5 + P6 + P7 + P8 + P9
        # 0→1 transitions in the ordered circular sequence N NE E SE S SW W NW N
        A = ((1-P2)*P3 + (1-P3)*P4 + (1-P4)*P5 + (1-P5)*P6
           + (1-P6)*P7 + (1-P7)*P8 + (1-P8)*P9 + (1-P9)*P2)

        base = (img == 1) & (B >= 2) & (B <= 6) & (A == 1)
        m1 = base & (P2 * P4 * P6 == 0) & (P4 * P6 * P8 == 0)
        img[m1] = 0

        # Recompute neighbours after step-1 deletions
        P2, P3, P4, P5, P6, P7, P8, P9 = _neighbors(img)
        B = P2 + P3 + P4 + P5 + P6 + P7 + P8 + P9
        A = ((1-P2)*P3 + (1-P3)*P4 + (1-P4)*P5 + (1-P5)*P6
           + (1-P6)*P7 + (1-P7)*P8 + (1-P8)*P9 + (1-P9)*P2)

        base = (img == 1) & (B >= 2) & (B <= 6) & (A == 1)
        m2 = base & (P2 * P4 * P8 == 0) & (P2 * P6 * P8 == 0)
        img[m2] = 0

        if not m1.any() and not m2.any():
            break

    return img.astype(bool)


def find_corridors_via_vision(
    features:  list,
    floor_num: int,
    building:  str,
) -> list[tuple[LineString, list]]:
    """
    Identify corridor centre-lines using local image processing — no external
    API or model required.

    Pipeline
    --------
    1.  Rasterise all wall LineStrings onto a greyscale image (walls = black).
    2.  Compute a Euclidean distance transform: each open pixel's value is its
        distance to the nearest wall pixel.
    3.  Threshold at [ADA_MIN_CLEARANCE_M, MAX_CLEARANCE_M] to keep only
        pixels that are (a) wide enough to walk through and (b) inside the
        building (not exterior open space).
    4.  Skeletonise the walkable mask to a 1-pixel-wide medial axis using
        scikit-image's skeletonize() if available, or the built-in
        Zhang-Suen thinning as a fallback.
    5.  Trace adjacent skeleton pixels into geographic (LineString, coords)
        segments compatible with build_graph().

    Requires matplotlib (rendering).  scikit-image is optional but recommended
    for better skeletonisation quality.
    """
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        print("  Warning: matplotlib not available — vision method requires it; "
              "falling back to voronoi.")
        return find_walkable_paths(features)

    from scipy.ndimage import distance_transform_edt

    # ── 1. Parse wall LineStrings ──────────────────────────────────────────
    walls = []
    for f in features:
        g = f.get("geometry", {})
        if g.get("type") != "LineString":
            continue
        coords = g["coordinates"]
        if len(coords) < 2:
            continue
        total_m = sum(
            haversine(coords[k][0], coords[k][1], coords[k+1][0], coords[k+1][1])
            for k in range(len(coords) - 1)
        )
        if total_m < 0.05:
            continue
        walls.append(coords)

    if not walls:
        return []

    # ── 2. Coordinate bounds ───────────────────────────────────────────────
    all_lngs = [c[0] for w in walls for c in w]
    all_lats  = [c[1] for w in walls for c in w]
    min_lng, max_lng = min(all_lngs), max(all_lngs)
    min_lat, max_lat = min(all_lats), max(all_lats)
    lng_span = max_lng - min_lng or 1e-9
    lat_span = max_lat - min_lat or 1e-9

    w_m = haversine(min_lng, min_lat, max_lng, min_lat)
    h_m = haversine(min_lng, min_lat, min_lng, max_lat)

    # Image resolution: ~0.3 m/px gives enough detail for ADA corridors
    IMG_W = max(256, min(1024, int(w_m / 0.30)))
    IMG_H = max(256, min(1024, int(h_m / 0.30)))

    # pixels per metre (use the same scale in both axes for distance transform)
    px_per_m = IMG_W / max(w_m, 0.1)

    def to_px(lng: float, lat: float) -> tuple[float, float]:
        x = (lng - min_lng) / lng_span * IMG_W
        y = (lat - min_lat) / lat_span * IMG_H
        return x, y   # matplotlib: y=0 at bottom

    # ── 3. Rasterise walls ─────────────────────────────────────────────────
    DPI     = 100
    fig, ax = plt.subplots(figsize=(IMG_W / DPI, IMG_H / DPI), dpi=DPI)
    ax.set_facecolor("white")
    fig.patch.set_facecolor("white")

    for wall in walls:
        xs = [(c[0] - min_lng) / lng_span * IMG_W for c in wall]
        ys = [(c[1] - min_lat) / lat_span * IMG_H for c in wall]
        ax.plot(xs, ys, color="black", linewidth=1.5,
                solid_capstyle="round", solid_joinstyle="round")

    ax.set_xlim(0, IMG_W)
    ax.set_ylim(0, IMG_H)
    ax.axis("off")
    plt.subplots_adjust(left=0, right=1, top=1, bottom=0)
    fig.canvas.draw()

    # Extract pixel buffer — shape (H, W, 4) RGBA, row 0 = top of image
    buf  = np.frombuffer(fig.canvas.buffer_rgba(), dtype=np.uint8)
    pH, pW = fig.canvas.get_width_height()[::-1]   # (height, width)
    arr  = buf.reshape(pH, pW, 4)
    plt.close(fig)

    # Flip vertically: matplotlib y=0 is bottom; pixel row 0 is image top.
    # After flip, row 0 = lat=min_lat (south), row pH-1 = lat=max_lat (north).
    arr = arr[::-1, :, :]

    # Wall mask: pixels darker than threshold
    grey     = arr[:, :, :3].mean(axis=2)
    wall_px  = grey < 200                   # True = wall

    # ── 4. Distance transform + ADA threshold ─────────────────────────────
    # distance_transform_edt: each True pixel's distance to nearest False pixel
    # We want: distance of open pixels to nearest wall pixel.
    dist_px  = distance_transform_edt(~wall_px)

    ada_px   = ADA_MIN_CLEARANCE_M * px_per_m
    max_px   = MAX_CLEARANCE_M     * px_per_m

    walkable = (~wall_px) & (dist_px >= ada_px) & (dist_px <= max_px)

    if not walkable.any():
        print(f"  Warning: no ADA-compliant open space found on floor {floor_num}")
        return []

    # ── 5. Skeletonise ─────────────────────────────────────────────────────
    try:
        from skimage.morphology import skeletonize as ski_skel
        skel = ski_skel(walkable)
    except ImportError:
        skel = _zhang_suen_thin(walkable)

    # ── 6. Trace skeleton pixels → geographic segments ─────────────────────
    # Each adjacent pair of skeleton pixels becomes one short LineString.
    # Only traverse right (dc=1) and up (dr=1) to avoid duplicate edges.
    def px_to_geo(col: int, row: int) -> tuple[float, float]:
        lng = col / max(pW - 1, 1) * lng_span + min_lng
        lat = row / max(pH - 1, 1) * lat_span + min_lat
        return (lng, lat)

    rows, cols = np.where(skel)
    viable: list[tuple[LineString, list]] = []

    for r, c in zip(rows.tolist(), cols.tolist()):
        for dr, dc in ((0, 1), (1, 0)):
            nr, nc = r + dr, c + dc
            if nr < skel.shape[0] and nc < skel.shape[1] and skel[nr, nc]:
                p1  = px_to_geo(c,  r)
                p2  = px_to_geo(nc, nr)
                seg = LineString([p1, p2])
                viable.append((seg, [p1, p2]))

    return viable


# ── Stair detection ────────────────────────────────────────────────────────

def detect_stairs(features: list) -> list[tuple[float, float]]:
    """
    Detect stairwell centroids on a floor.

    Signature: clusters of 5+ parallel short lines (~0.5–3.5 m, step width)
    all at the same bearing, in a tight bounding box (≤ 12 m per side).

    Returns list of (lng, lat) centroids.
    """
    items = []
    for f in features:
        g = f.get("geometry", {})
        if g.get("type") != "LineString":
            continue
        coords = g["coordinates"]
        if len(coords) < 2:
            continue
        L = haversine(coords[0][0], coords[0][1], coords[-1][0], coords[-1][1])
        if not (STAIR_MIN_LEN_M <= L <= STAIR_MAX_LEN_M):
            continue
        ls = LineString(coords)
        items.append((ls, coords, undirected_bearing(coords),
                      ls.centroid.x, ls.centroid.y))

    if not items:
        return []

    # Bucket by bearing + spatial location
    buckets: dict = defaultdict(list)
    for it in items:
        bb = round(it[2] / STAIR_BEAR_BIN)
        sx = round(it[3] / STAIR_CELL)
        sy = round(it[4] / STAIR_CELL)
        buckets[(bb, sx, sy)].append(it)

    raw_centroids = []
    for group in buckets.values():
        if len(group) < STAIR_MIN_COUNT:
            continue
        union = unary_union([it[0] for it in group])
        w, h  = bbox_dims_m(union)
        if w > STAIR_MAX_BOX_M or h > STAIR_MAX_BOX_M:
            continue
        c = union.centroid
        raw_centroids.append((c.x, c.y))

    return cluster_by_distance(raw_centroids, STAIR_CLUSTER_M)


# ── Elevator detection ─────────────────────────────────────────────────────

def detect_elevators(features: list) -> list[tuple[float, float]]:
    """
    Detect elevator shaft centroids on a floor.

    Signature: small (1–5.5 m each side) mixed-bearing clusters of 3–20 lines.
    Mixed bearings (>40° spread) come from the rectangle outline + diagonal lines.

    Returns list of (lng, lat) centroids.
    """
    items = []
    for f in features:
        g = f.get("geometry", {})
        if g.get("type") != "LineString":
            continue
        coords = g["coordinates"]
        if len(coords) < 2:
            continue
        L = haversine(coords[0][0], coords[0][1], coords[-1][0], coords[-1][1])
        if L < 0.05:          # skip zero-length / degenerate features
            continue
        ls = LineString(coords)
        items.append((ls, undirected_bearing(coords), ls.centroid.x, ls.centroid.y))

    if not items:
        return []

    cells: dict = defaultdict(list)
    for it in items:
        key = (round(it[2] / ELEV_CELL), round(it[3] / ELEV_CELL))
        cells[key].append(it)

    raw_centroids = []
    for group in cells.values():
        n = len(group)
        if not (ELEV_MIN_COUNT <= n <= ELEV_MAX_COUNT):
            continue
        union = unary_union([it[0] for it in group])
        w, h  = bbox_dims_m(union)
        if not (ELEV_MIN_BOX_M <= w <= ELEV_MAX_BOX_M):
            continue
        if not (ELEV_MIN_BOX_M <= h <= ELEV_MAX_BOX_M):
            continue
        if h > 0 and not (ELEV_MIN_ASPECT <= w / h <= ELEV_MAX_ASPECT):
            continue
        bears = sorted(it[1] for it in group)
        spread = math.degrees(bears[-1] - bears[0])
        if spread < ELEV_BEAR_SPREAD:
            continue
        c = union.centroid
        raw_centroids.append((c.x, c.y))

    return cluster_by_distance(raw_centroids, ELEV_CLUSTER_M)


# ── Graph simplification ───────────────────────────────────────────────────

def _simplify_graph(G: nx.Graph, node_type: dict) -> nx.Graph:
    """
    Collapse chains of degree-2 corridor nodes into single edges (O(N)).

    A long hallway that was represented as hundreds of fine-grained nodes
    (one per skeleton pixel or polyline vertex) becomes a single edge between
    its two end-points (junctions, stairs, elevators, etc.).

    A node is eligible for removal when ALL of these hold:
      • exactly 2 neighbours in the current graph
      • its type is "corridor" (stairs, elevators, entrances, ramps are kept)

    For each junction anchor, the algorithm traces outward through every
    attached chain of collapsible nodes until it reaches another junction,
    then replaces the whole chain with one direct edge whose weight is the
    sum of the individual edge weights along the chain.
    """
    KEEP = {"stair", "elevator", "entrance", "ramp", "room"}

    def is_junction(n: int) -> bool:
        return G.degree(n) != 2 or node_type.get(n, "corridor") in KEEP

    next_eid = max((d.get("id", 0) for _, _, d in G.edges(data=True)), default=0) + 1
    visited: set[int] = set()   # intermediate nodes already claimed by a chain

    for anchor in list(G.nodes()):
        if anchor not in G or not is_junction(anchor):
            continue

        for start in list(G.neighbors(anchor)):
            if start not in G or start in visited or is_junction(start):
                continue

            # ── Trace the chain: anchor → start → … → far_end ──────────────
            intermediates: list[int] = [start]
            visited.add(start)

            total_w = G.edges[anchor, start].get("weight", 0.0)
            all_ada = G.edges[anchor, start].get("ada", True)

            prev, curr = anchor, start
            while not is_junction(curr):
                nexts = [n for n in G.neighbors(curr) if n != prev]
                if len(nexts) != 1:
                    break                    # dead-end or unexpected branch
                nxt = nexts[0]
                total_w += G.edges[curr, nxt].get("weight", 0.0)
                all_ada  = all_ada and G.edges[curr, nxt].get("ada", True)
                prev, curr = curr, nxt
                if is_junction(curr) or curr in visited:
                    break
                intermediates.append(curr)
                visited.add(curr)

            far_end = curr
            if far_end == anchor or not intermediates:
                continue

            # ── Replace chain with a direct edge ────────────────────────────
            G.remove_nodes_from(intermediates)
            if not G.has_edge(anchor, far_end):
                G.add_edge(anchor, far_end,
                           id=next_eid,
                           weight=round(total_w, 3),
                           etype="corridor",
                           ada=all_ada)
                next_eid += 1

    return G


# ── Graph construction ─────────────────────────────────────────────────────

def _node_key(lng: float, lat: float) -> tuple[int, int]:
    return (round(lng / SNAP_TOL), round(lat / SNAP_TOL))


def build_graph(
    paths:      list[tuple],
    stairs:     list[tuple[float, float]],
    elevators:  list[tuple[float, float]],
    floor_num:  int,
    id_offset:  int = 0,
) -> tuple[list, list, dict, dict]:
    """
    Build node/edge graph from ADA-viable path segments plus stair/elevator nodes.

    Returns (nodes, edges, stair_nodes, elevator_nodes) where stair_nodes and
    elevator_nodes map node_id → (lng, lat) for inter-floor stitching later.
    """
    G           = nx.Graph()
    node_map    = {}        # snap-key → node_id
    node_coords = {}        # node_id → (lng, lat)
    node_type   = {}        # node_id → type string
    nid         = id_offset
    eid         = id_offset

    def get_node(lng: float, lat: float, ntype: str = "corridor") -> int:
        nonlocal nid
        key = _node_key(lng, lat)
        if key not in node_map:
            node_map[key] = nid
            node_coords[nid] = (lng, lat)
            node_type[nid]   = ntype
            G.add_node(nid)
            nid += 1
        return node_map[key]

    # ── Corridor edges ──
    if paths:
        unioned = unary_union([p[0] for p in paths])

        def _flatten(g):
            if g.geom_type == "LineString":
                return [g]
            if g.geom_type == "MultiLineString":
                return list(g.geoms)
            result = []
            for sub in g.geoms:
                result.extend(_flatten(sub))
            return result

        for seg in _flatten(unioned):
            coords = list(seg.coords)
            for k in range(len(coords) - 1):
                u = get_node(coords[k][0],   coords[k][1])
                v = get_node(coords[k+1][0], coords[k+1][1])
                if u == v or G.has_edge(u, v):
                    continue
                dist = haversine(coords[k][0], coords[k][1],
                                 coords[k+1][0], coords[k+1][1])
                G.add_edge(u, v, id=eid, weight=round(dist, 3),
                           etype="corridor", ada=True)
                eid += 1

    # ── Stair nodes ──
    stair_node_ids: dict[int, tuple] = {}
    for lng, lat in stairs:
        n = get_node(lng, lat, "stair")
        node_type[n] = "stair"
        stair_node_ids[n] = (lng, lat)
        # Connect to nearest corridor node within 10 m (intra-floor = corridor type)
        _connect_special_to_corridor(G, n, lng, lat, node_coords, node_type,
                                     eid, max_dist_m=10.0, etype="corridor")
        eid += 1

    # ── Elevator nodes ──
    elev_node_ids: dict[int, tuple] = {}
    for lng, lat in elevators:
        n = get_node(lng, lat, "elevator")
        node_type[n] = "elevator"
        elev_node_ids[n] = (lng, lat)
        _connect_special_to_corridor(G, n, lng, lat, node_coords, node_type,
                                     eid, max_dist_m=10.0, etype="corridor")
        eid += 1

    # ── Simplify: collapse degree-2 corridor chains ────────────────────────
    before_n = G.number_of_nodes()
    before_e = G.number_of_edges()
    _simplify_graph(G, node_type)
    after_n  = G.number_of_nodes()
    after_e  = G.number_of_edges()
    if before_n > after_n:
        print(f"    simplified: {before_n}→{after_n} nodes, "
              f"{before_e}→{after_e} edges "
              f"(-{before_n - after_n} nodes, -{before_e - after_e} edges)")

    # ── Serialise ──
    nodes = [
        {
            "id":       n,
            "lat":      round(node_coords[n][1], 9),
            "lng":      round(node_coords[n][0], 9),
            "floor":    floor_num,
            "entrance": False,
            "ada":      node_type.get(n) not in ("stair",),
            "type":     node_type.get(n, "corridor"),
            "label":    "",
        }
        for n in G.nodes()
    ]

    edges = [
        {
            "id":       data["id"],
            "from":     u,
            "to":       v,
            "weight":   data["weight"],
            "type":     data.get("etype", "corridor"),
            "ada":      data.get("ada", True),
            "directed": False,
        }
        for u, v, data in G.edges(data=True)
    ]

    return nodes, edges, stair_node_ids, elev_node_ids


def _connect_special_to_corridor(
    G, special_id, lng, lat, node_coords, node_type, eid,
    max_dist_m=10.0, etype="stair"
):
    """Connect a stair/elevator node to its nearest corridor node."""
    best_id   = None
    best_dist = max_dist_m + 1

    for nid, (nlng, nlat) in node_coords.items():
        if nid == special_id:
            continue
        if node_type.get(nid) not in ("corridor",):
            continue
        d = haversine(lng, lat, nlng, nlat)
        if d < best_dist:
            best_dist = d
            best_id   = nid

    if best_id is not None and not G.has_edge(special_id, best_id):
        G.add_edge(special_id, best_id, id=eid, weight=round(best_dist, 3),
                   etype=etype, ada=(etype != "stair"))


# ── Inter-floor stitching ──────────────────────────────────────────────────

def stitch_floors(
    all_nodes: list[dict],
    all_edges: list[dict],
    stair_nodes_by_floor: dict[int, dict],
    elev_nodes_by_floor:  dict[int, dict],
    floors: list[int],
) -> tuple[list[dict], list[dict]]:
    """
    Add inter-floor edges between stair/elevator nodes that appear on
    adjacent floors at the same location (within INTERFLOOR_MATCH_M).
    """
    next_edge_id = max((e["id"] for e in all_edges), default=0) + 1

    def _link(nodes_a: dict, nodes_b: dict, etype: str, ada: bool):
        nonlocal next_edge_id
        for na_id, (lnga, lata) in nodes_a.items():
            for nb_id, (lngb, latb) in nodes_b.items():
                d = haversine(lnga, lata, lngb, latb)
                if d <= INTERFLOOR_MATCH_M:
                    all_edges.append({
                        "id":       next_edge_id,
                        "from":     na_id,
                        "to":       nb_id,
                        "weight":   round(d, 3),
                        "type":     etype,
                        "ada":      ada,
                        "directed": False,
                    })
                    next_edge_id += 1

    for i in range(len(floors) - 1):
        fa, fb = floors[i], floors[i + 1]
        _link(stair_nodes_by_floor.get(fa, {}),
              stair_nodes_by_floor.get(fb, {}), "stair", False)
        _link(elev_nodes_by_floor.get(fa, {}),
              elev_nodes_by_floor.get(fb, {}), "elevator", True)

    return all_nodes, all_edges


# ── Main ───────────────────────────────────────────────────────────────────

def process_building(building: str, floorplans_dir: str, output_dir: str,
                     geojson_out: bool = False,
                     method: str = "voronoi") -> None:
    """
    method : "voronoi"  — ADA-clearance Voronoi path detection (default)
             "vision"   — Claude vision model identifies corridors from the rendered image
    """
    bdir = os.path.join(floorplans_dir, building)
    if not os.path.isdir(bdir):
        sys.exit(f"Building directory not found: {bdir}")

    floor_files: list[tuple[int, str]] = []
    for fname in os.listdir(bdir):
        if fname.startswith("Layer_") and fname.endswith(".geojson"):
            stem = fname[len("Layer_"):-len(".geojson")]
            if stem.isdigit():
                floor_files.append((int(stem), os.path.join(bdir, fname)))
    floor_files.sort()

    if not floor_files:
        sys.exit(f"No Layer_XX.geojson files found in {bdir}")

    all_nodes:  list[dict] = []
    all_edges:  list[dict] = []
    stair_by_floor: dict[int, dict] = {}
    elev_by_floor:  dict[int, dict] = {}
    id_offset = 0
    floors    = []

    for floor_num, fpath in floor_files:
        with open(fpath) as f:
            geojson = json.load(f)
        features = geojson.get("features", [])

        if method == "vision":
            paths = find_corridors_via_vision(features, floor_num, building)
        else:
            paths = find_walkable_paths(features)

        stairs    = detect_stairs(features)
        elevators = detect_elevators(features)

        nodes, edges, stair_ids, elev_ids = build_graph(
            paths, stairs, elevators, floor_num, id_offset
        )

        print(
            f"  floor {floor_num:02d}  {len(features):4d} features"
            f"  [{method}]  {len(paths):4d} path segs"
            f"  {len(stairs):2d} stairs  {len(elevators):2d} elevators"
            f"  →  {len(nodes):4d} nodes  {len(edges):4d} edges"
        )

        all_nodes.extend(nodes)
        all_edges.extend(edges)
        stair_by_floor[floor_num] = stair_ids
        elev_by_floor[floor_num]  = elev_ids
        floors.append(floor_num)
        id_offset += len(nodes) + 1

    # Stitch adjacent floors together via stair/elevator edges
    all_nodes, all_edges = stitch_floors(
        all_nodes, all_edges, stair_by_floor, elev_by_floor, floors
    )

    interfloor = sum(1 for e in all_edges if e["type"] in ("stair", "elevator"))
    print(f"\n  Inter-floor edges added: {interfloor}")

    os.makedirs(output_dir, exist_ok=True)
    out_path = os.path.join(output_dir, f"{building}_graph.json")
    if os.path.exists(out_path):
        os.remove(out_path)
    with open(out_path, "w") as f:
        json.dump(
            {"building": building, "nodes": all_nodes, "edges": all_edges},
            f, indent=2,
        )

    print(f"\nWrote {out_path}")
    print(f"Total: {len(all_nodes)} nodes, {len(all_edges)} edges")

    if geojson_out:
        geo_path = os.path.join(output_dir, f"{building}_graph.geojson")
        write_geojson(all_nodes, all_edges, geo_path)
        print(f"Wrote {geo_path}")


# ── GeoJSON visualisation output ───────────────────────────────────────────

# Colour each node/edge type so they render distinctly in QGIS / geojson.io
_TYPE_COLOUR = {
    "corridor": "#4a90d9",
    "stair":    "#e67e22",
    "elevator": "#27ae60",
    "ramp":     "#8e44ad",
    "entrance": "#e74c3c",
    "room":     "#95a5a6",
    "outdoor":  "#2ecc71",
}


def write_geojson(nodes: list[dict], edges: list[dict], out_path: str) -> None:
    """
    Write a GeoJSON FeatureCollection where:
      - every node  → Point  feature  (properties: id, floor, type, label, ada, entrance)
      - every edge  → LineString feature  (properties: id, from, to, type, weight, ada)

    Edge coordinates are taken from the node lookup so every edge renders as
    the straight line between its two endpoint nodes.
    """
    nodes_by_id = {n["id"]: n for n in nodes}
    features    = []

    # # ── Node points ──
    # for n in nodes:
    #     colour = _TYPE_COLOUR.get(n["type"], "#cccccc")
    #     features.append({
    #         "type": "Feature",
    #         "geometry": {
    #             "type":        "Point",
    #             "coordinates": [n["lng"], n["lat"]],
    #         },
    #         "properties": {
    #             "id":       n["id"],
    #             "floor":    n["floor"],
    #             "type":     n["type"],
    #             "label":    n.get("label", ""),
    #             "ada":      n["ada"],
    #             "entrance": n["entrance"],
    #             "marker-color":  colour,
    #             "marker-size":   "small",
    #             "marker-symbol": n["type"],
    #         },
    #     })

    # ── Edge linestrings ──
    for e in edges:
        na = nodes_by_id.get(e["from"])
        nb = nodes_by_id.get(e["to"])
        if na is None or nb is None:
            continue
        colour = _TYPE_COLOUR.get(e["type"], "#cccccc")
        features.append({
            "type": "Feature",
            "geometry": {
                "type": "LineString",
                "coordinates": [
                    [na["lng"], na["lat"]], [nb["lng"], nb["lat"]],
                ],},
            "properties": {}
                # "id":     e["id"],
                # "from":   e["from"],
                # "to":     e["to"],
                # "type":   e["type"],
                # "weight": e["weight"],
                # "ada":    e["ada"],
                # "stroke":       colour,
                # "stroke-width": 2,
                # "stroke-opacity": 0.8,
            # },
        })

    if os.path.exists(out_path):
        os.remove(out_path)

    with open(out_path, "w") as f:
        json.dump({"type": "FeatureCollection", "features": features}, f, indent=2)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Generate walkable path graph from building floorplan GeoJSON files."
    )
    parser.add_argument("building",   nargs="?", default="baldwin",
                        help="Building name (default: baldwin)")
    parser.add_argument("floorplans", nargs="?", default=FLOORPLANS_DIR,
                        help="Path to floorplans directory")
    parser.add_argument("output",     nargs="?", default=OUTPUT_DIR,
                        help="Output directory (default: ./graphs)")
    parser.add_argument("--geojson", action="store_true",
                        help="Also write a .geojson file for visualisation")
    parser.add_argument(
        "--method",
        choices=["voronoi", "vision"],
        default="voronoi",
        help=(
            "Path detection method.  "
            "'voronoi' (default): ADA-clearance Voronoi skeleton from wall geometry.  "
            "'vision': send each floor plan image to Claude and let the model "
            "identify corridor centre-lines.  Requires ANTHROPIC_API_KEY."
        ),
    )
    args = parser.parse_args()

    process_building(args.building, args.floorplans, args.output,
                     geojson_out=args.geojson, method=args.method)
