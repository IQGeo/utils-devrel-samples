# Scalability Database Builder
Scripts and Python code to create database suitable for scalability testing and performance testing on large databases. For example, tracing and equipment contents of buildings.

Outline of steps to build the database:
1. Load a comms_dev database into a database called iqg_comms_scale
2. Run the script comms_build_scale_db

The database comprises the following:
* Large fibre ring centred on a fibre exchange called FEX-BHM-01. This comprises a ring of cables, with 16 primary nodes splitting off and 16 secondary nodes per PN (in master)
* Routes and structures translated from OSM street data. Located in the city of Derby, UK (in master).
* Medium, small and tiny sized fibre rings (in the designs perf_medium, perf_small and perf_medium).

Detail of code:
* comms_build_scale_db.py - Top level Python script. Invokes fibre ring builder and uses myw_db to load other data files.
* comms_build_fiber_ring.py - Python code to build fibre rings of different sizes. Class constants are used to specify parameters of each fibre ring created. Circuits are optionally created from customer wall-boxes back to OLTs in fibre exchange.
* convert_street_osm.py - Python code to convert OSM street data info routes and structures.