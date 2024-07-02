# Network Manager Telecom Changelog

## 7.1.3.2

### Front/back ports [NMC-2092]

Added ability to model front and back ports on equipment. This permits the modelling of patch panels where cables arrive at the back panel and at the front panel connectionss are made to other patch panels, or to the same patch panel. These ports are undirected / bidirectional.

Behaviour on a particular piece of equipment is controlled by setting the attribute 'Directed' on to False. The sides of the equipment are displayed as FRONT and BACK (rather than IN and OUT) and connections can be made in both directions on both sides.

The database upgrade step will add the field 'directed' to equipment features with port fields and the template models have been updated. The configuration validator includes a step to check directed field is present if ports are.

### Add graphic on startup [NMC-3234]

To add a graphic on application load, use the query param "addMarker='Enter desired text'". This will place a red pin marker at map center with the specified tooltip text. This will typically be used with the platform "ll" and "z" query paramaters to set the map location and zoom level.

http://localhost:82/mywcom.html?ll=52.22684236219919,0.14428244843973376&z=19&addMarker=Fault on cable WH-FCB-021 fiber 11

## 7.1.3.1

### Customisation

#### Manager Classes [NMC-2979, Mark]

Added ability to subclass manager classes and to specify in settings that these are to be instantiated. An example setting and subclasses is
provided in the comms_dev_db module both for Python and JS Native services. See `comms_dev_db/server/api/DevDbCircuitManager.js` and `comms_dev_db/native/services/DevDbCircuitManager.js`

Example setting is:

```
{
    "mywcom.customManagerClasses": {
        "circuit": "DevDbCircuitManager"
    }
}
```

### External API Specification [NMC-2951, Mark]

The external REST API developed for this release is formally specified using the OpenAPI format. The specification is located at `./comms/api/nmt_api.json` which
can also be accessed via the URL `<url base>/modules/comms/api/v1/metadata/nmt_api.json`.

This file can be imported in the Swagger API editor as follows:

-   Open this page https://editor.swagger.io
-   Select _File_ -> _Import file_
-   Navigate to this file in your installation or to where you have downloaded from the URL.

Note: Due to security restrictions the _Import URL_ option in Swagger can not be used. The file needs to be downloaded first.

In Swagger, the left hand panel shows the text of the specification and the right hand a rendered page.

An alternative tool which provides better support for calling the API is Postman (https://www.postman.com/). The API JSON file can be dragged
and dropped into the postman desktop application.

In order to make use of Postman to invoke the API, you will need to authenticate against the IQGeo server. For this, as with the browser application,
a call to the auth REST API endpoint will need to be performed. As well as the myworldapp cookie this call returns an X-CSRF token. This token will need to
be set in postman globals using the following in the 'Tests' section of the auth call:

```
var globalSetter = pm.response.text();
pm.globals.set("X-CSRF-Token", globalSetter);

console.log(pm.globals.get("X-CSRF-Token"));
```

### Network Trace API [NMC-2884, Mark]

This trace API provides the same functionality as the internal trace API but is in the TMF style and includes a schema for the result payload. Here is an example call and result from the call. Full details can be found in the API specification and schemas provided with this document.
A trace from a patch panel is initiated with this URL:

```
<url base>/api/v1/networkTrace?from=fiber_patch_panel/1?pins=out:1&direction=&resultType=tree&maxDistance=100&maxNode=&delta=&application=&lang=&network=mywcom_fiber
```

And returns a payload with three components (ends, nodes and resources).

```
{
    "ends": [3],
    "nodes": [
        {
            "resource": "fiber_patch_panel/1", "distance": 0.0,"length": 0.0, "ports": "out:1"
        },
        {
            "resource": "fiber_cable/22", "distance": 15.38, "length": 15.38, "parent": 0,
            "startCoordinate": [0.1366049051285,52.2240164428564],
            "stopCoordinate": [0.1366840302944,52.2241248844409],
            "fibers": "1"
        },
:
:
    "resources": {
        "fiber_patch_panel/1": {
            "id": "fiber_patch_panel/1",
            "href": "http://localhost:82/modules/comms/api/v1/resourceInventoryManagement/resource/fiber_patch_panel/1",
            "name": "WH-ODF-01",
            "specification": null,
:
:
    "@type": "NetworkTrace", "@schemaLocation": "NetworkTrace.schema.json"
}
```

### Feature CRUD API [NMC-2995, Mike Conly]:

The TMF resource inventory API provides a mechanism to query and manipulate the resources (features) of the inventory. This API supports get as well as create, update and delete operations. These are accessed by the http verbs GET, POST, PATCH and DELETE respectively.

This API is similar to the internal feature API already provided in NMT with the main difference being that TMF uses camel case, "inPins" instead of "in_pins", and prohibits abbreviations, "undergroundRoute" instead of "ug_route". These conversions are configured in advanced settings in tmf_categories, tmf_fields and tmf_tables. The first setting, tmf_categories, maps the abbreviations in comms categories to full names, for example "Equip" to "Equipment". Tmf_fields handles field name conversions, eg "fiber_count" to "count" or "out_Conduit" to "outConduit". (Note that fields not specified will be automatically converted from snake case to camel case.) Finally, the tmf_tables settings handles table name conversions. As this varies by data model, populating tmf_tables happens when the table names are defined.

The TMF schema docs list the fields by category, e.g. Cable, Equipment or Structure. All features in the category have the same top-level fields. Data that are specific to the feature are returned in an array of name value pairs under 'Characteristic'. The top-level fields have a type, so values are validated by type - there are strings in string fields, bools in bool fields, etc.

You must provide an authentication token X-CSRF-Token in the request header for all actions except GET. The most likely cause of a "Error 403 (Not Found)" is failing to provide the proper auth token. Other error responses vary by request type.

All the feature API methods have server-side events or 'triggers' that fire when they are called. To use the trigger mechanism, create a trigger handler in Python and register on the NetworkView class. The events are only called on the feature category that was modified, so you can perform specific actions for cables, equipment, structures and so on. This mechanism is similar to and parallel to the existing server-side triggers. For example, creating a structure using the REST API the will fire the existing create trigger on the structure as well as a new one specific to the API. One difference with the API triggers is that there is also a GET event that fires when features are fetched either by id or by query. In the latter case, the get event is fired for each feature in the response collection.

There is a configurable whitelist that permits CRUD operations on specific categories. It is in advanced settings and is called 'tmf_edit_allowed'. It prevents API users from causing data issues by not conforming to specific expectations around validation. By default only circuits will be allowed to be modified. Other categories (cables, equipment, structures, etc.) may be added with the expectation that api calls will validate specific concerns for that category. An example of this is cables, which require start and endpoints to match a structure. Any attempt to edit a feature not allowed by the whitelist will generate a 403 Forbidden Error.

#### Fetching a record by its id

The url provides the feature type and the id to return. Note that the fields specified in the category schema are at the top level, while other values are put under ‘characteristic’. If you wish to retrieve the calculated reference sets, eg splices and connection arrays on a cable or in and out fiber segments on a manhole, add the parameter 'includeCalculatedReferenceSets=True'

URL:
http://localhost:82/modules/comms/api/v1/resourceInventoryManagement/resource/manhole/1

Method: GET
Response Body (Success)

```
{
    "id": "manhole/1",
    "href": "http://localhost:82/modules/comms/api/v1/resourceInventoryManagement/resource/manhole/1",
    "name": "WH-M-01",
    "specification": "FPM-CCANN-C2",
    "laborCosts": "survey",
    "location": {
        "type": "Point",
        "coordinates": [
            0.1353556662798,
            52.2235609031561
        ]
    },
    "characteristic": [
        {
            "name": "mywOrientationLocation",
            "value": 59.3813815475527
        },
        {
            "name": "sizeX",
            "value": 600.0
        },
        {
            "name": "sizeY",
            "value": 1200.0
        },
        {
            "name": "sizeZ",
            "value": 895.0
        },
        {
            "name": "lockable",
            "value": null
        },
        {
            "name": "powered",
            "value": null
        },
        {
            "name": "installationDate",
            "value": "2010-09-23"
        },
        {
            "name": "comsofAuto",
            "value": false
        }
    ],
    "@type": "Structure",
    "@baseType": "Feature"
}
```

Errors:

-   wrong feature type
    {"code": 404, "reason": "The resource could not be found.", "message": "No such feature type: 'abc'"}
-   bad ID  
    {"code": 404, "reason": "The resource could not be found.", "message": "No such feature: type='abc' and id='2000'"}

### Fetching one or more features using filter

The fields parameter in the URL specifies which fields will show in the result in addition to id and href. Here fields = none so only the required fields are visible. You construct filters by using name/value pairs. So name='WH-FTTH-051' is asking to return any records where the name equals that value. This response is wrapped in a collection with paging information since filters return one or many results. No id is passed in. As for getting a single record with id (above), add the includeCalculatedReferenceSets=True parameter to see calculated arrays.

URL:
http://localhost:82/modules/comms/api/v1/resourceInventoryManagement/resource/fiberToTheHomeCircuit?fields=none&name='WH-FTTH-051'

Method: GET
Response Body (Success)

```
{
	"type": "MywFeatureCollection",
	"features": [
		{
			"id": "ftth_circuit/51",
			"href": "http://localhost:82/modules/comms/api/v1/resourceInventoryManagement/resource/fiberToTheHomeCircuit/51"
		}
	],
	"limit": null,
	"unlimited_count": 1,
	"offset": 0,
	"count": 1,
	"next_offset": null,
	"previous_offset": null
}
```

Errors:

-   wrong feature type
    {"code": 404, "reason": "The resource could not be found.", "message": "No such feature type: 'abc'"}
-   filter value can't be parsed, e.g. using double-quotes in name = “WH-M-35“
    {"code": 400, "reason": "The server could not comply with the request since it is either malformed or otherwise
    incorrect.", "message": "Cannot parse '[name]=\"WH-ODF-02\"': Near char 7: Unexpected token: '\"WH-ODF-02\"'"}

#### Creating a feature

You have to provide a complete json in the request body with the values to populate the new feature. The response body has the new record, including the id. This should look the same as the request body when create succeeds.

URL:
http://localhost:82/modules/comms/api/v1/resourceInventoryManagement/resource/manhole

Method: POST
Request Body

```
{
    "name": "WH-M-01",
    "specification": "FPM-CCANN-C2",
    "laborCosts": "survey",
    "location": {
        "type": "Point",
        "coordinates": [
            0.1353556662798,
            52.2235609031561
        ]
    },
    "characteristic": [
        {
            "name": "mywOrientationLocation",
            "value": 59.3813815475527
        },
        {
            "name": "sizeX",
            "value": 600.0
        },
        {
            "name": "sizeY",
            "value": 1200.0
        },
        {
            "name": "sizeZ",
            "value": 895.0
        },
        {
            "name": "installationDate",
            "value": "2010-09-23"
        }
    ],
    "@type": "Structure",
    "@baseType": "Feature"
}
```

Response Body (Success)

```
{
    "id": "manhole/100000",
    "href": "http://localhost:82/modules/comms/api/v1/resourceInventoryManagement/resource/manhole/100000",
    ...
}
```

Errors:

-   wrong feature type
    {"code": 404, "reason": "The resource could not be found.", "message": "No such feature type: 'abc'"}
-   invalid json in request body
    {"code": 400, "reason": "The server could not comply with the request since it is either malformed or otherwise incorrect.", "message": "Invalid json: Expecting ',' delimiter"}
-   supplied attribute values do not match schema
    {"code": 400, "reason": "The server could not comply with the request since it is either malformed or otherwise incorrect.", "message": "Input request body does not match schema: 123 is not of type 'string'"}

#### Updating an existing feature

In update, you only provide the fields to update, not the whole record. This is a partial update, as opposed to a replace and uses the PATCH http verb. You supply the feature type and the id in the URL and the fields to update in the request body. The response body includes the entire updated record. To see the values available for that feature, you can issue a GET request with the same URL.

URL:
http://localhost:82/modules/comms/api/v1/resourceInventoryManagement/resource/fiber_cable/1

Method: PATCH
Request Body

```
{
    "name": "A New Name",
    "specification": "Spec-1234"
}
```

Response Body (Success)

```
{
    "id": "fiber_cable/1",
    "href": "http://localhost:82/modules/comms/api/v1/resourceInventoryManagement/resource/fiber_cable/1",
    "name": "A New Name",
    "specification": "Spec-1234",
    ...
}
```

Errors:

-   wrong feature type
    {"code": 404, "reason": "The resource could not be found.", "message": "No such feature type: 'abc'"}
-   bad ID  
    {"code": 404, "reason": "The resource could not be found.", "message": "No such feature: type='abc' and id='2000'"}
-   invalid json in request body
    {"code": 400, "reason": "The server could not comply with the request since it is either malformed or otherwise
    incorrect.", "message": "Invalid json: Expecting ',' delimiter"}
-   supplied attribute values do not match schema
    {"code": 400, "reason": "The server could not comply with the request since it is either malformed or otherwise
    incorrect.", "message": "Input request body does not match schema: 123 is not of type 'string'"}

#### An example of deleting a fiber cable

Delete takes the feature type and the ID. Nothing required in the request body and the response returns a code.

URL:
http://localhost:82/modules/comms/api/v1/resourceInventoryManagement/resource/cable/1

Method: DELETE
Request Body

Errors:

-   wrong feature type
    {"code": 404, "reason": "The resource could not be found.", "message": "No such feature type: 'abc'"}
-   bad ID  
    {"code": 404, "reason": "The resource could not be found.", "message": "No such feature: type='abc' and id='2000'"}

### Service Feasibility API [NMC-2883, Mark]

To provide service feasibility information, the TMF resource inventory API can be used to fetch a feature and the returned attribute information can used to determine service feasibility.

The example database includes a simple model for the customer end of a FTTH network.
The address feature includes Service Status and Serving Equipment fields.
The Service Status field can be queried using the resource inventory API to determine the service feasibility at the address.
As part of the workflow, the Serving Equipment reference field can be used to associate the address to the the fiber splitter that serves it.
And when the status of the splitter changes, for example to 'In Service', the user can make
use of this reference field and bulk edit function to update the status of the served addresses.

The following call will query for address by street number and name, and the returned data will include the service status of the address.

http://localhost:82/modules/comms/api/v1/resourceInventoryManagement/resource/address?streetName='Milton%20Road'&streetNr='294'&includeCalculatedReferenceSets=True

#### Export to CDIF from UI

At IQGeo Platform 7.1 a export UI was added to the design toolbar to allow for export of a design to Geopackage. Platform also provided a hook for applications to add additional formats for export. NMT has added CDIF as a choice for design export at 3.1
