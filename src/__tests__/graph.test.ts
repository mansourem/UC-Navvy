import { describe, it, expect } from 'vitest';
import { findPath, nodeMap } from '../graph';
import type { Graph, GraphNode, GraphEdge } from '../graph';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function node(id: number, lat: number, lng: number, overrides: Partial<GraphNode> = {}): GraphNode {
  return { id, lat, lng, floor: null, entrance: false, ada: true, type: 'walkway', ...overrides };
}

function edge(id: number, from: number, to: number, overrides: Partial<GraphEdge> = {}): GraphEdge {
  return { id, from, to, weight: 10, type: 'walkway', ada: true, ...overrides };
}

// ─── nodeMap ──────────────────────────────────────────────────────────────────

describe('nodeMap', () => {
  it('returns a Map keyed by node id', () => {
    const graph: Graph = { nodes: [node(1, 0, 0), node(2, 1, 1)], edges: [] };
    const map = nodeMap(graph);
    expect(map.size).toBe(2);
    expect(map.get(1)?.id).toBe(1);
    expect(map.get(2)?.lat).toBe(1);
  });

  it('returns an empty Map for an empty graph', () => {
    expect(nodeMap({ nodes: [], edges: [] }).size).toBe(0);
  });

  it('last entry wins when duplicate ids exist', () => {
    const graph: Graph = { nodes: [node(1, 0, 0), node(1, 9, 9)], edges: [] };
    expect(nodeMap(graph).get(1)?.lat).toBe(9);
  });
});

// ─── findPath ─────────────────────────────────────────────────────────────────

describe('findPath', () => {
  describe('basic pathfinding', () => {
    it('finds a path through a linear A→B→C graph', () => {
      const graph: Graph = {
        nodes: [node(1, 0, 0), node(2, 0, 1), node(3, 0, 2)],
        edges: [edge(1, 1, 2), edge(2, 2, 3)],
      };
      const result = findPath(graph, 1, 3, false);
      expect(result).not.toBeNull();
      expect(result!.nodes).toEqual([1, 2, 3]);
      expect(result!.edges).toHaveLength(2);
    });

    it('returns null when no path exists (disconnected graph)', () => {
      const graph: Graph = {
        nodes: [node(1, 0, 0), node(2, 0, 1)],
        edges: [], // no edges
      };
      expect(findPath(graph, 1, 2, false)).toBeNull();
    });

    it('returns a single-node path when start equals end', () => {
      const graph: Graph = { nodes: [node(1, 0, 0)], edges: [] };
      const result = findPath(graph, 1, 1, false);
      expect(result).not.toBeNull();
      expect(result!.nodes).toEqual([1]);
      expect(result!.edges).toHaveLength(0);
    });

    it('returns null when start node id does not exist in graph', () => {
      const graph: Graph = { nodes: [node(1, 0, 0)], edges: [] };
      expect(findPath(graph, 99, 1, false)).toBeNull();
    });

    it('returns null when end node id does not exist in graph', () => {
      const graph: Graph = { nodes: [node(1, 0, 0)], edges: [] };
      expect(findPath(graph, 1, 99, false)).toBeNull();
    });

    it('chooses the shorter of two available paths', () => {
      // 1→2→3 costs 20, direct 1→3 costs 100
      const graph: Graph = {
        nodes: [node(1, 0, 0), node(2, 0, 1), node(3, 0, 2)],
        edges: [
          edge(1, 1, 2, { weight: 10 }),
          edge(2, 2, 3, { weight: 10 }),
          edge(3, 1, 3, { weight: 100 }),
        ],
      };
      const result = findPath(graph, 1, 3, false);
      expect(result!.nodes).toEqual([1, 2, 3]);
    });

    it('handles a diamond-shaped graph and picks the cheaper branch', () => {
      // 1 → 2 → 4 (cost 5+5=10) vs 1 → 3 → 4 (cost 1+100=101)
      const graph: Graph = {
        nodes: [node(1, 0, 0), node(2, 0, 1), node(3, 0, 2), node(4, 0, 3)],
        edges: [
          edge(1, 1, 2, { weight: 5 }),
          edge(2, 2, 4, { weight: 5 }),
          edge(3, 1, 3, { weight: 1 }),
          edge(4, 3, 4, { weight: 100 }),
        ],
      };
      const result = findPath(graph, 1, 4, false);
      expect(result!.nodes).toEqual([1, 2, 4]);
    });
  });

  describe('bidirectional edges', () => {
    it('traverses an undirected edge in both directions', () => {
      const graph: Graph = {
        nodes: [node(1, 0, 0), node(2, 0, 1)],
        edges: [edge(1, 1, 2)], // directed not set → bidirectional
      };
      expect(findPath(graph, 1, 2, false)).not.toBeNull();
      expect(findPath(graph, 2, 1, false)).not.toBeNull();
    });

    it('blocks reverse traversal of a directed edge', () => {
      const graph: Graph = {
        nodes: [node(1, 0, 0), node(2, 0, 1)],
        edges: [edge(1, 1, 2, { directed: true })],
      };
      expect(findPath(graph, 1, 2, false)).not.toBeNull();
      expect(findPath(graph, 2, 1, false)).toBeNull();
    });
  });

  describe('ADA filtering', () => {
    it('returns null when the only path goes through a non-ADA node', () => {
      const graph: Graph = {
        nodes: [node(1, 0, 0), node(2, 0, 1, { ada: false }), node(3, 0, 2)],
        edges: [edge(1, 1, 2), edge(2, 2, 3)],
      };
      expect(findPath(graph, 1, 3, true)).toBeNull();
    });

    it('finds the path without ADA constraint on the same graph', () => {
      const graph: Graph = {
        nodes: [node(1, 0, 0), node(2, 0, 1, { ada: false }), node(3, 0, 2)],
        edges: [edge(1, 1, 2), edge(2, 2, 3)],
      };
      expect(findPath(graph, 1, 3, false)).not.toBeNull();
    });

    it('routes around a non-ADA node when an accessible alternative exists', () => {
      // Direct: 1→2 (non-ADA node). Accessible: 1→3→2 (all ADA)
      const graph: Graph = {
        nodes: [node(1, 0, 0), node(2, 0, 2), node(3, 0, 1, { ada: true })],
        edges: [
          edge(1, 1, 2, { ada: false, weight: 1 }),
          edge(2, 1, 3, { ada: true,  weight: 5 }),
          edge(3, 3, 2, { ada: true,  weight: 5 }),
        ],
      };
      const result = findPath(graph, 1, 2, true);
      expect(result).not.toBeNull();
      expect(result!.nodes).toEqual([1, 3, 2]);
    });

    it('skips non-ADA edges when adaOnly=true', () => {
      // 1→2 directly via a non-ADA edge; accessible detour via 1→3→2
      const graph: Graph = {
        nodes: [node(1, 0, 0), node(2, 0, 2), node(3, 0, 1)],
        edges: [
          edge(1, 1, 2, { ada: false, weight: 1 }),
          edge(2, 1, 3, { ada: true,  weight: 5 }),
          edge(3, 3, 2, { ada: true,  weight: 5 }),
        ],
      };
      const result = findPath(graph, 1, 2, true);
      expect(result).not.toBeNull();
      expect(result!.nodes).toEqual([1, 3, 2]);
    });

    it('returns null when the start node is non-ADA and adaOnly=true', () => {
      const graph: Graph = {
        nodes: [node(1, 0, 0, { ada: false }), node(2, 0, 1)],
        edges: [edge(1, 1, 2)],
      };
      expect(findPath(graph, 1, 2, true)).toBeNull();
    });

    it('returns null when the end node is non-ADA and adaOnly=true', () => {
      const graph: Graph = {
        nodes: [node(1, 0, 0), node(2, 0, 1, { ada: false })],
        edges: [edge(1, 1, 2)],
      };
      expect(findPath(graph, 1, 2, true)).toBeNull();
    });
  });

  describe('edge weight handling', () => {
    it('treats a weight of 0 or missing as 1 (fallback)', () => {
      // weight 0 coerces to the fallback 1 inside findPath
      const graph: Graph = {
        nodes: [node(1, 0, 0), node(2, 0, 1)],
        edges: [edge(1, 1, 2, { weight: 0 })],
      };
      const result = findPath(graph, 1, 2, false);
      expect(result).not.toBeNull();
    });
  });
});
