# Copyright: IQGeo Limited 2010-2023

import geojson
from myworldapp.modules.comms.server.networks.connection_trace_node import ConnectionTraceNode
from myworldapp.modules.comms.server.networks.segment_trace_node import SegmentTraceNode
from myworldapp.modules.comms.server.networks.port_trace_node import PortTraceNode
from myworldapp.modules.comms.server.networks.pseudo_connection_trace_node import (
    PseudoConnectionTraceNode,
)

from myworldapp.core.server.io.myw_json_feature_ostream import MywJsonFeatureOStream


class DevDbPathFinder:
    """
    Class to assist with debugging path finder and providing results as a schematic type
    diagram.

    Copy this to the end of the PathFinderManager.findPaths:

        from myworldapp.modules.comms_dev_db.server.api.dev_db_path_finder import DevDbPathFinder

        dpf = DevDbPathFinder()
        dpf.dumpAsDOT(route_path_start, "/tmp/route_tree.dot", specials=[from_urn, to_urn])
        dpf.dumpAsDOT(root_node, "/tmp/fiber_tree.dot")

    """

    def __init__(self, db_view):
        self.db_view = db_view

    def dumpFeaturesAsGeoJSON(self, feature_urns, filename):

        with MywJsonFeatureOStream(filename, {}) as js:
            for urn in feature_urns:
                feature = self.db_view.get(urn)
                geom = feature._primary_geom_field.geom()

                properties = {"name": urn}
                props = {"id": urn, "geometry": geom, "properties": properties}
                props["bbox"] = geom.bounds

                js.writeFeature(props)

    def dumpAsGeoJSON(self, tree, filename):

        stack = [tree]
        features = []

        with MywJsonFeatureOStream(filename, {}) as js:

            while stack:
                node = stack.pop()

                geom = node.feature._primary_geom_field.geom()

                properties = {"name": self.labelFor(node)}
                props = {"id": node.node_id, "geometry": geom, "properties": properties}
                props["bbox"] = geom.bounds

                js.writeFeature(props)

                stack.extend(node.children)

    def dumpAsDOT(self, tree, filename, specials=[]):
        """
        Dump graph as DOT file. twopi is the layout engine that gives quick and best results
        See https://graphviz.org/docs/layouts/twopi/

        layout=twopi;
        ranksep=4;
        ratio=auto;
        overlap_scaling=10

        """
        with open(filename, "w") as out:
            out.write(
                f"""
digraph mygraph {{
  fontname="Helvetica,Arial,sans-serif";
  root="{hex(id(tree))}";
  node [fontname="Helvetica,Arial,sans-serif"]
  edge [fontname="Helvetica,Arial,sans-serif"]
  node [shape=box];
"""
            )

            self.dumpNodeAndChildren(out, tree, specials)
            out.write("}")

    def dumpNodeAndChildren(self, out, node, specials):
        label = self.labelFor(node, specials)

        out.write(f'"{hex(id(node))}" [label="{label}"]\n')
        for child in node.children:
            out.write(f'"{hex(id(node))}" -> "{hex(id(child))}"\n')

        for child in node.children:
            self.dumpNodeAndChildren(out, child, specials)

    def labelFor(self, node, specials=[]):
        class_name = node.__class__.__name__

        conns = ""
        if isinstance(node, PseudoConnectionTraceNode):
            conns = f"{node.from_pins} -> {node.to_pins}"
        if isinstance(node, ConnectionTraceNode):
            conns = f"{node.from_} -> {node.to_}"

        sv = node._node_sort_value if hasattr(node, "_node_sort_value") else ""

        if node.node_id in specials:
            label = f"** {class_name} score={sv} **\n{node.node_id} {conns}"
        else:
            label = f"{class_name} score={sv}\n{node.node_id} {conns}"
        return label
