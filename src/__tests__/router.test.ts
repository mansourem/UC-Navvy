import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateRoute, planRoute } from '../router';
import type { Graph, GraphNode, GraphEdge } from '../graph';

// ─── validateRoute ────────────────────────────────────────────────────────────

describe('validateRoute', () => {
  it('rejects an unknown start building', () => {
    const result = validateRoute({ startBuilding: 'notabuilding', endBuilding: 'tuc', adaOnly: false });
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/notabuilding/);
  });

  it('rejects an unknown end building', () => {
    const result = validateRoute({ startBuilding: 'tuc', endBuilding: 'notabuilding', adaOnly: false });
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/notabuilding/);
  });

  it('rejects when start and end building are the same', () => {
    const result = validateRoute({ startBuilding: 'tuc', endBuilding: 'tuc', adaOnly: false });
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/same/i);
  });

  it('accepts a valid request with two different known buildings', () => {
    const result = validateRoute({ startBuilding: 'tuc', endBuilding: 'baldwin', adaOnly: false });
    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('accepts a valid ADA request', () => {
    const result = validateRoute({ startBuilding: 'tuc', endBuilding: 'braunstein', adaOnly: true });
    expect(result.valid).toBe(true);
  });

  it('rejects when both buildings are unknown', () => {
    const result = validateRoute({ startBuilding: 'foo', endBuilding: 'bar', adaOnly: false });
    expect(result.valid).toBe(false);
    // The first unknown building (start) is reported
    expect(result.reason).toMatch(/foo/);
  });
});

// ─── planRoute ────────────────────────────────────────────────────────────────
// These tests mock loadGraph so no network calls are made.

vi.mock('../graph', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../graph')>();
  return { ...actual, loadGraph: vi.fn() };
});

import { loadGraph } from '../graph';
const mockLoadGraph = vi.mocked(loadGraph);

// Minimal outdoor graph near TUC and Baldwin Hall campus coordinates.
// TUC center:    [-84.5174, 39.1318] → lat 39.1318, lng -84.5174
// Baldwin center: [-84.5167, 39.1328] → lat 39.1328, lng -84.5167
// Nodes are placed near those centers to ensure _nearestNode resolves correctly.
function makeOutdoorNode(id: number, lat: number, lng: number): GraphNode {
  return { id, lat, lng, floor: null, entrance: false, ada: true, type: 'walkway' };
}
function makeEdge(id: number, from: number, to: number, weight = 50): GraphEdge {
  return { id, from, to, weight, type: 'walkway', ada: true };
}

const SIMPLE_GRAPH: Graph = {
  nodes: [
    makeOutdoorNode(1, 39.1318, -84.5174), // near TUC
    makeOutdoorNode(2, 39.1322, -84.5171), // midpoint
    makeOutdoorNode(3, 39.1328, -84.5167), // near Baldwin
  ],
  edges: [
    makeEdge(1, 1, 2, 50),
    makeEdge(2, 2, 3, 50),
  ],
};

describe('planRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when the route request is invalid', async () => {
    await expect(
      planRoute({ startBuilding: 'notabuilding', endBuilding: 'tuc', adaOnly: false }),
    ).rejects.toThrow(/notabuilding/);
  });

  it('throws when start and end are the same building', async () => {
    await expect(
      planRoute({ startBuilding: 'tuc', endBuilding: 'tuc', adaOnly: false }),
    ).rejects.toThrow(/same/i);
  });

  it('returns a RouteResult with correct shape when a path is found', async () => {
    mockLoadGraph.mockResolvedValue(SIMPLE_GRAPH);

    const result = await planRoute({ startBuilding: 'tuc', endBuilding: 'baldwin', adaOnly: false });

    expect(result.isFallback).toBe(false);
    expect(result.isAda).toBe(false);
    expect(result.routeGeoJSON.type).toBe('FeatureCollection');
    expect(result.endpointsGeoJSON.type).toBe('FeatureCollection');
    expect(result.endpointsGeoJSON.features).toHaveLength(2);
    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.indoorSegments).toEqual([]);
  });

  it('result steps always start at the origin and end at the destination', async () => {
    mockLoadGraph.mockResolvedValue(SIMPLE_GRAPH);

    const result = await planRoute({ startBuilding: 'tuc', endBuilding: 'baldwin', adaOnly: false });
    const first = result.steps[0];
    const last  = result.steps[result.steps.length - 1];

    expect(first.type).toBe('info');
    expect(first.text).toContain('Tangeman University Center');
    expect(last.type).toBe('arrive');
    expect(last.text).toContain('Baldwin Hall');
  });

  it('sets isAda=true when adaOnly is requested', async () => {
    mockLoadGraph.mockResolvedValue(SIMPLE_GRAPH);

    const result = await planRoute({ startBuilding: 'tuc', endBuilding: 'baldwin', adaOnly: true });
    expect(result.isAda).toBe(true);
  });

  it('falls back and marks isFallback=true when the graph has no path', async () => {
    // Disconnected graph — no edges at all
    const emptyGraph: Graph = { nodes: SIMPLE_GRAPH.nodes, edges: [] };
    mockLoadGraph.mockResolvedValue(emptyGraph);

    const result = await planRoute({ startBuilding: 'tuc', endBuilding: 'baldwin', adaOnly: false });
    expect(result.isFallback).toBe(true);
    expect(result.routeGeoJSON.features).toHaveLength(1);
  });

  it('falls back gracefully when loadGraph throws', async () => {
    mockLoadGraph.mockRejectedValue(new Error('Network error'));

    const result = await planRoute({ startBuilding: 'tuc', endBuilding: 'baldwin', adaOnly: false });
    expect(result.isFallback).toBe(true);
  });

  it('includes an ADA warning step when no ADA path exists', async () => {
    // Graph where nodes are non-ADA, forcing ADA retry to fail and fall back to non-ADA route
    const nonAdaGraph: Graph = {
      nodes: SIMPLE_GRAPH.nodes.map(n => ({ ...n, ada: false })),
      edges: SIMPLE_GRAPH.edges,
    };
    mockLoadGraph.mockResolvedValue(nonAdaGraph);

    const result = await planRoute({ startBuilding: 'tuc', endBuilding: 'baldwin', adaOnly: true });
    // When ADA path fails but non-ADA path succeeds, an ADA fallback warning is shown
    const hasAdaWarning = result.steps.some(s => s.type === 'warning' && /ADA/i.test(s.text));
    expect(hasAdaWarning).toBe(true);
  });

  it('bounds covers at least two distinct points', async () => {
    mockLoadGraph.mockResolvedValue(SIMPLE_GRAPH);

    const result = await planRoute({ startBuilding: 'tuc', endBuilding: 'baldwin', adaOnly: false });
    expect(result.bounds).not.toBeNull();
    const [[swLng, swLat], [neLng, neLat]] = result.bounds!;
    expect(neLng).toBeGreaterThanOrEqual(swLng);
    expect(neLat).toBeGreaterThanOrEqual(swLat);
  });

  it('endpoint GeoJSON has start and end marker types', async () => {
    mockLoadGraph.mockResolvedValue(SIMPLE_GRAPH);

    const result = await planRoute({ startBuilding: 'tuc', endBuilding: 'baldwin', adaOnly: false });
    const markerTypes = result.endpointsGeoJSON.features.map(f => f.properties?.markerType);
    expect(markerTypes).toContain('start');
    expect(markerTypes).toContain('end');
  });
});
