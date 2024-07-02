# NMC Scalability Test Framework

This framework makes use of the Locust test package (https://locust.io/). Follow the installation instructions here: https://docs.locust.io/en/stable/installation.html.

Custom event handlers have been developed to output request metrics tagged with user size, and in a form easier to process.

* start_locust_ui - Starts locust and a mini-webserver that you can point your browser to initiate a simple test run. Draws some useful charts but these don't drill down into requests types. Hence the custom event handler.
* start_locust_dev - Starts locust in headless mode with a simple run with fixed number of users. Useful for debugging locust user task code.
* start_locust - Use this to start full test runs. This cycles through a number of tests runs each with a fixed number of users and time period.
* process_results.py - Process results written by custom event handlers. Generates PNG images of graphs for request types and summary CSV file.

The directory locust contains the code that is run by locust to replicate users and user tasks.
There is a user class and task classes that mimic how anywhere users connect to the master server - download extracts, register replicas and sync data. This makes use of a Redis queue to synchronise activity between connected users and anywhere users.