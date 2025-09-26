# Reporting Samples - Code Deep Dive

## Table of Contents

## Table of Contents

- [Reporting Samples - Code Deep Dive](#rest-apis---code-deep-dive)
  - [Table of Contents](#table-of-contents)
  - [Tool Description](#tool-description)
  - [Tool files](#tool-files)
  - [How the tool works](#how-the-tool-works)
    - [utils\.py](#utilspy)
    - [conduit\_capacity\.py](#conduit_capacitypy)
    - [pole\_attachment\.py](#pole_attachmentpy)
    - [spatial\_query\.py](#spatial_querypy)
---


## Tool Description

This sample provides examples for how to query the database and create reports similar to the Enterprise "Data Warehouse" reports using the available Platform REST APIs. These examples are designed for Professional customers to: 

- Authenticate via **RPOC auth** or **JWT auth** to get started
- Query feature data in various ways to mimic "Data Warehouse" reporting


The goal is to make REST API–based reporting as straightforward as possible, even without a replica database. All examples are written in **Python** with examples for conduit capacity, pole attachment, and spatial querying reports. 

As a stretch goal, we may also provide **code-free options** using tools like **FME** or **Postman**, to give Professional Edition customers an experience closer to Enterprise’s no-code “Data Warehouse” reporting workflows.

Use this sample as a reference if you want to:

- Understand spatial query workflows.
- Extend results handling into custom reporting or UI logic.
- Experiment quickly with geometry-based searches before building larger tools.

## Tool Files

- `utils.py` - Python lib helper file
- `conduit_capacity.py` - Reporting example for conduit capacity
- `pole_attachment.py` - Reporting example for pole attachment  
- `spatial_query.py` - Reporting example for querying geometry with tolerance

All files are located in the `modules/custom/public/js/Samples/reporting_samples` folder

## How the tool works

In this section we will go over the tool source code describing how it works.

### utils.py

The code starts with the relevant `import` statements. Make sure your Python environment has the libraries installed.

```
import requests
from pathlib import Path
```

- The `requests` library is used to send the HTTP requests to the server
- the `Path` liobrary is used to input the `token.txt` file for JWT authentication

Next, some global variables are created

```BASE_URL = "http://host.docker.internal"
# BASE_URL = "http://localhost"
LOGIN_URL = f"{BASE_URL}/auth"
SESSION = requests.Session()
HEADERS = {}
```

- `BASE_URL` is the URL for the requests. If you are running inside a docker container, the base URL will be `http://host.docker.internal`. Otherwise, the base URl is `localhost`
- `LOGIN_URL` is the URL for authentication
- `SESSION` is called to ensure cookie persistence. The authentication request will return a cookie that needs to be used in the following requests
- `HEADERS` will be passed through to the reporting samples as after a cookie is recieved, it must be added to all subsequent requests


First, we have the two authentication helper functions. Below is the JWT authentication helper function.

```
def iqgeo_jwt_auth(token_file: Path):
    """
    Prompt user for JWT token and then set the auth header.
    """
    if not token_file.exists():
        raise FileNotFoundError(f"Token file not found: {token_file}")

    token = token_file.read_text().strip()
    response = SESSION.post(LOGIN_URL, data={"id_token": token})
    response.raise_for_status()
    cookies = response.cookies.get_dict()
    HEADERS[
        "cookie"
    ] = f"myworldapp={cookies['myworldapp']}; csrf_token={cookies['csrf_token']}"
```
- This function takes in the `token.txt` as a parameter to authenticate using the unique token. 
- It then send a POST request using the data inside the token file and the `LOGIN_URL`, takes the response cookie, and sets the cookie in the `HEADER`


Next authentication helper function is the ROPC authentication function.

```
def iqgeo_interactive_ropc_auth():
    """
    Prompt user for credentials and then send AUTH request.
    Raises exception if not authorized, returns the auth cookie on success.
    """
    user = input("Enter username: ")
    password = input("Enter password: ")

    uauth = {"user": user, "pass": password}

    response = SESSION.post(LOGIN_URL, data=uauth)
    response.raise_for_status()
    cookies = response.cookies.get_dict()
    HEADERS[
        "cookie"
    ] = f"myworldapp={cookies['myworldapp']}; csrf_token={cookies['csrf_token']}"
```
- This function is similar to the JWT, however this time, we prompt the user for a username and password to authenticate.
- The inputted data, `LOGIN_URL` is sent with a POST request to recieve the cookie in response, which is then set in the `HEADER`


The next few functions are used by the individual examples to build off of.

```
def get_all_features(feature_type, design=None):
    """Get all features of a specific type in the design"""
    return iqgeo_get_request(f"{BASE_URL}/feature/{feature_type}", design).get(
        "features", []
    )
```
- This function will take in `feature_type` and `design`, set to `None`, parameters
- It will return all the features using a get request given the `BASE_URL`, `feature_type`, and `design` specification


```def iqgeo_get_request(endpoint, params=None, design=None):
    """
    Hit a GET endpoint using the auth cookie for this session.

    Raises HTTP errors, and returns the request body JSON.
    """
    if design is not None:
        params = params or {}
        params["design"] = design
    r = SESSION.get(endpoint, headers=HEADERS, params=params)
    r.raise_for_status()
    return r.json()
```
- This function handles the GET requests made in the sample report files
- It takes in the `endpoint` URL to send request to, and the optional `params` and `design` to filter the query
- The return is the raw json data response from the GET request

```
def iqgeo_post_request(endpoint, params=None, design=None, data=None):
    """
    Hit a POST endpoint using the auth cookie for this session.

    Raises HTTP errors, and returns the request body JSON.
    """
    if design is not None:
        params = params or {}
        params["design"] = design
    r = SESSION.post(endpoint, headers=HEADERS, params=params, json=data)
    r.raise_for_status()
    return r.json()
```
- This function handles the POST request made in the sample report files
- It takes in the `endpoint` URL, and the optional `params`, `design`, and `data` to filter the query
- The return is the raw json data response from the 


```
def query_spatial(feature_type, geometry, tolerance=0):
    """
    General spatial query for any feature type.
    Supports Point, LineString, and Polygon geometries.
    """
    geom_type = geometry.get("type")

    if geom_type == "Point":
        lon, lat = geometry["coordinates"]
        url = f"{BASE_URL}/feature/{feature_type}"
        params = {"lat": lat, "lon": lon, "tolerance": tolerance}
        return iqgeo_get_request(url, params=params)

    elif geom_type in ["LineString", "Polygon"]:
        url = f"{BASE_URL}/feature/{feature_type}/get"
        data = {"geometry": geometry, "tolerance": tolerance}
        return iqgeo_post_request(url, data=data)
    else:
        raise ValueError(f"Unsupported geometry type: {geom_type}")
```
- This function calls the spatial query requests using both the GET and POST helper functions
- It takes in the `feature_type` that the user wants to query, the `geometry` with its coordinates, and the `tolerance` to add to the coordinates
- First, it checks the geometry type from the `geometry` parameter to determine which type of geometry, `Point`, `LineString`, or `Polygon`
- If point, the `lat` and `lon` are used to pass into the parameters using a GET request
- If `LineString` or `Polygon`, the request is sent as a POST request to keep the endpoint URL clean
    - The `data` is sent with the `geometry` and `tolerance` 



### conduit_capacity.py

The code starts with the relevant `import` statements. 

```
import argparse
import json
from pathlib import Path
from utils import (
    iqgeo_jwt_auth,
    iqgeo_get_request,
    get_all_features,
    BASE_URL,
)
```
- The `argparse` library is used to parse the arugments passed in to run the python file
- The `json` library is used to read the cookies dictionary and REST request response
- the `Path` liobrary is used to input the `token.txt` file for JWT authentication
- The imports from `utils` are the helper functions explained above to be used in the `conduit_capacity.py`

The first function is the `get_cable_segments` which is used to get all the feature data of the fiber cable segments that are in relationship with a conduit given its ID.

```
def get_cable_segments(conduit_id, design):
    """Get cable segments related to a specific conduit"""
    return iqgeo_get_request(
        f"{BASE_URL}/feature/conduit/{conduit_id}/relationship/cable_segments", design
    ).get("features", [])
```
- This function takes in the `conduit_id` and `design` as a parameter
- It will return the raw cable segment data using the `iqgeo_get_request` helper function


```
def get_cable_diameter(cable_ref, design):
    """Get cable diameter from cable properties
    ref = e.g. fiber_cable/4
    """
    return (
        iqgeo_get_request(f"{BASE_URL}/feature/{cable_ref}", design)
        .get("properties", {})
        .get("diameter")
    )
```
- This function takes in the cable reference and design as parameters
- It returns the diameter data of the cable passed into the function
    - This will be used to calculate the cable capacity percentage


```
def calc_fill_ratio(conduit_diameter, cable_diameters):
    """
    Calculate fill ratio and determine if within limits.

    Implementation of:
    https://www.corning.com/optical-communications/worldwide/en/home/Resources/system-design-calculators/fill-ratio-calculator.html
    """
    if not conduit_diameter or conduit_diameter == 0:
        return None, None
    ratio = sum(d**2 for d in cable_diameters) / (conduit_diameter**2)

    if len(cable_diameters) == 1:
        limit = 0.65
    elif len(cable_diameters) == 2:
        limit = 0.31
    elif len(cable_diameters) == 3:
        limit = 0.40
    else:
        limit = 1.0

    return ratio, limit
```
- This function uses the `conduit_diameter` and `cable_diameter` to calculate the fill ratio of a conduit
- First, it calculates the `ratio` using the sum of the `cable_diameter` squared over the `conduit_diameter` squared
- Then, using the amount of cables per conduit, calculates a `limit` 
- The function then returns the `ratio` and `limit`


```
def main(token_file, design):
    """script entrypoint."""

    iqgeo_jwt_auth(token_file)

    capacity_report = {}
    conduits = get_all_features(feature_type="conduit", design=design)

    for conduit in conduits:
        cid = conduit["properties"].get("id")
        conduit_d = conduit["properties"].get("diameter")

        segments = get_cable_segments(cid, design)
        cable_refs = {
            seg["properties"].get("cable")
            for seg in segments
            if seg["properties"].get("cable")
        }

        cable_diameters = []
        for cref in cable_refs:
            d = get_cable_diameter(cref, design)
            if d:
                cable_diameters.append(d)

        # use the printed values to test
        ratio, limit = calc_fill_ratio(conduit_d, cable_diameters)
        if ratio is None:
            status = "No diameter data"
        else:
            percent = f"{ratio*100:.1f}%"
            if ratio <= limit and ratio > 0:
                status = f"{percent} (OK), cable count: {len(cable_refs)}"
            elif ratio == 0:
                status = f"{percent} (EMPTY), cable count: {len(cable_refs)}"
            else:
                status = f"{percent} (OVERFILL), cable count: {len(cable_refs)}"

        capacity_report[f"conduit/{cid}"] = status

    print(json.dumps(capacity_report, indent=2))
```
- This is the main python funtion which takes in the `token_file` and `design` as parameters from the arguments
- First, it will call the `iqgeo_jwt_auth` function to authenticate the user
- Then, create some variables that will be used in the later helper function calls
    - `capacity_report` will be returned at the end with all the conduit capacity information
    - `conduits` is the list of conduits using the request in the `utils.py` file
- The function will then loop through each conduit in `conduits`
    - Each conduit's ID is set to the `cid` variable
    - Each conduit's diameter is set to the `conduit_d` variable
    - Using the `cid` and `design`, the function then calls the `get_cable_segments` function to get a list of all the segments associated with the particular conduit
    - Using the list of segments, it creates a list of `cable_refs`, this each reference to a fiber cable inside the properties of the cable segment
    - Then, creating a list of `cable_diameters`, the function loops through all the cables in `cable_refs` to get the diameter of each cable and append to the list of `cable_diameters`
    - Passing the `conduit_d` and `cable_diameters` into the `calc_fill_ratio` function, the `ratio` and `limit` is then received
    - The is the `ratio` is used to calculate a `percent`, set a status for how full each conduit is, and add the information to the `capacity_report` to print out

```
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Conduit capacity report")
    parser.add_argument(
        "--token_file",
        type=Path,
        default="token.txt",
        help="Path to the pre-generated JWT token",
    )
    parser.add_argument(
        "--design",
        type=str,
        default=None,
        help="Design ID to use, e.g. design/2FMyDesign",
    )
    args = parser.parse_args()

    main(token_file=args.token_file, design=args.design)
```
This block makes the script runnable from the command line. It sets up two arguments:
- `--token_file` is the path to the JWT token file (default: `token.txt`)
- `--design` is the ID of the design to use (optional)


### pole_attachment.py

The code starts with the relevent `impot` statements.

```
import argparse
import json
from pathlib import Path
from utils import (
    iqgeo_jwt_auth,
    iqgeo_get_request,
    get_all_features,
    BASE_URL,
)
```
- The `argparse` library is used to parse the arguments passed when running the Python file
- The `json` library is used to pretty-print the attachment report results
- The `Path` library is used to input the `token.txt` file for JWT authentication
- The imports from `utils` are the helper functions explained above, which handle authentication and REST API requests

The first helper function gets equipment related to a specific pole.

```
def get_pole_equipment(pole_id, design):
    """Get equipment attached to a specific pole"""
    return iqgeo_get_request(
        f"{BASE_URL}/feature/pole/{pole_id}/relationship/equipment", design
    ).get("features", [])
```
- This functions takes in the `pole_id` and `design` as parameters
- It uses the `iqgeo_get_request` helper to query all equipment features attached to that pole
- The return is a list of equipment in JSON format

The next helper functions gets the routes associated with a pole.

```
def get_pole_routes(pole_id, design):
    """Get routes associated with a specific pole"""
    return iqgeo_get_request(
        f"{BASE_URL}/feature/pole/{pole_id}/relationship/routes", design
    ).get("features", [])
```
- This function takes in the `pole_id` and `design` as parameters
- It uses the `iqgeo_get_request` helper to query all routes connected to that pole
- The return is a list of route features in JSON format

```def main(token_file, design):
    """script entrypoint."""

    iqgeo_jwt_auth(token_file)

    # custom report section
    attachment_report = {}
    poles = get_all_features(feature_type="pole", design=design)

    for pole in poles:
        pid = pole["properties"].get("id")

        equipment = get_pole_equipment(pid, design)
        routes = get_pole_routes(pid, design)

        equip_list = [
            {
                "id": e["properties"].get("name"),
                "root_housing": e["properties"].get("root_housing"),
            }
            for e in equipment
            if e.get("properties")
        ]

        route_list = [
            {
                "id": r["properties"].get("id"),
                "in_structure": r["properties"].get("in_structure"),
                "out_structure": r["properties"].get("out_structure"),
            }
            for r in routes
            if r.get("properties")
        ]

        attachment_report[f"pole/{pid}"] = {
            "equipment_count": len(equip_list),
            "equipment": equip_list,
            "route_count": len(route_list),
            "routes": route_list,
        }

    print(json.dumps(attachment_report, indent=2))
```
- The function starts by authenticating with the `iqgeo_jwt_auth` helper using the provided token file
- It then retrieves all poles in the given design using the `get_all_features` function
- For each pole:
    - It retrieves attached equipment (`get_pole_equipment`) and connected routes (`get_pole_routes`)
    - It builds a list of equipment details (`equip_list`) including the equipment name and root housing
    - It builds a list of route details (`route_list`) including route ID, in_structure, and out_structure
    - It adds these results into the attachment_report dictionary under the pole's ID
- Finally, the report is printed in a JSON format output

The script ends with a runnable block to parse arguments from the command line.

```
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Conduit capacity report")
    parser.add_argument(
        "--token_file",
        type=Path,
        default="token.txt",
        help="Path to the pre-generated JWT token",
    )
    parser.add_argument(
        "--design",
        type=str,
        default=None,
        help="Design ID to use, e.g. design/2FMyDesign",
    )
    args = parser.parse_args()

    main(token_file=args.token_file, design=args.design)
```
This block makes the script runnable from the command line. It sets up two arguments:
- `--token_file` is the path to the JWT token file (default: `token.txt`)
- `--design` is the ID of the design to use (optional)

### spatial_query.py

This example shows how to perform spatial queries against the Platform REST API using different geometry types: Point, LineString, and Polygon. It demonstrates how to use the `query_spatial` helper function (from `utils.py`) to search for features within a specified tolerance.

The code starts with the relevant imports:

```
import argparse
from pathlib import Path
from utils import query_spatial, iqgeo_jwt_auth
```
- `json` is used to format and print results
- `argparse` handles command line arguments
- `Path` manages the token.txt file for JWT authentication
- The imports from `utils` (`query_spatial`, `iqgeo_jwt_auth`) provide authentication and query helpers

```
def report_features(feature_type, geometry, tolerance=0):
    """
    Generic report function: prints properties of features returned by query_spatial.
    """
    results = query_spatial(feature_type, geometry, tolerance)
    print(f"--- {feature_type.upper()} spatial query ---")
    for f in results.get("features", []):
        props = f.get("properties", {})
        print(props)
```
- Calls the `query_spatial` helper to run a query with the given feature type, geometry, and tolerance
- Iterates through the returned `features` list and prints out the `properties` of each result
- This function is generic and can be reused for any feature type and geometry combination


```
def main(token_file):

    iqgeo_jwt_auth(token_file)

    # Point
    point = {"type": "Point", "coordinates": [0.14208, 52.23095]}
    report_features("manhole", point, tolerance=60)

    # LineString
    line = {
        "type": "LineString",
        "coordinates": [
            [0.13422048802249265, 52.220846611354546],
            [0.135095125230265, 52.22157378945272],
            [0.14540334946042321, 52.22735251836545],
        ],
    }
    report_features("pole", line, tolerance=25)

    # Polygon
    polygon = {
        "type": "Polygon",
        "coordinates": [
            [
                [0.1400, 52.2300],
                [0.1450, 52.2300],
                [0.1450, 52.2350],
                [0.1400, 52.2350],
                [0.1400, 52.2300],
            ]
        ],
    }
    report_features("pole", polygon, tolerance=10)
```
- First authenticates using the provided token file
- Runs three example spatial queries:
    - Point query: finds manholes near a given coordinate within 60m
    - LineString query: finds poles intersecting a drawn line within 25m tolerance
    - Polygon query: finds poles inside a bounding box polygon with 10m tolerance

This shows how different geometries can be used to target specific areas or assets in the network.


Lastly, the command-line execution
```
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Conduit capacity report")
    parser.add_argument(
        "--token_file",
        type=Path,
        default="token.txt",
        help="Path to the pre-generated JWT token",
    )
    args = parser.parse_args()

    main(token_file=args.token_file)
```
- Accepts one argument:
    - `--token_file`: path to the JWT token file (defasult: `token.txt`)

