class Graph:
    def __init__(self, graph: dict = {}):
        self.graph = graph

    def shortest_distance(self, ):
        pass

class GraphNode:
    def __init__(self, latitude:float, longitude:float, inside:bool, elevation:list[int], elevator:bool, entrance:bool):
        self.node_lat = latitude
        self.node_long = longitude
        self.node_in_out = inside
        self.elevation = elevation
        self.elevator = elevator
        self.entrance = entrance

    def find_node():
        pass

    def remove_node():
        pass

class GraphEdge:
    def __init__(self, node1, node2, accessible, hazard_level):
        self.node1 = node1
        self.node2 = node2
        self.accessible = accessible
        self.hazard_level = hazard_level
        self.distance # calculate using node1 and node 2 latitude and longitude

    def find_edge(self, node1, node2):
        return GraphEdge
    
    def remove_edge(self, node1, node2):
        pass

    def edit_hazard_level():
        pass

class Hazard:
    def __init__(self):
        self.hazard_lat
        self.hazard_long
        self.hazard_in_out
        self.hazard_level
        self.hazard_confirmed

    def remove_hazard():
        pass

def report_hazard():
    return Hazard

class Building:
    def __init__(self):
        self.build_name
        self.build_center_lat
        self.build_center_long
        self.build_img

    def remove_building():
        pass