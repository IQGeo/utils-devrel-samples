import React from 'react';

export const MenuItems = [
    {
        label: <span>List Stuctures</span>,
        title: 'List Stuctures',
        options: [
            {
                value: 'listStructures',
                label: 'List Stuctures'
            }
        ]
    },
    {
        label: <span>Fuctions</span>,
        title: 'API Functions',
        options: [
            {
                value: 'structContent',
                label: 'structContent'
            },
            {
                value: 'getStructuresAtCoords',
                label: 'getStructuresAtCoords'
            },
            {
                value: 'getStructureAt',
                label: 'getStructureAt'
            },
            {
                value: 'getStructuresAt',
                label: 'getStructuresAt'
            },
            {
                value: 'routeContent',
                label: 'routeContent'
            },
            {
                value: 'validateRoutesForConduit',
                label: 'validateRoutesForConduit'
            },
            {
                value: 'isStructure',
                label: 'isStructure'
            },
            {
                value: 'isRoute',
                label: 'isRoute'
            }
        ]
    }
];

export const StructurePluginFunctionDictionary = {
    listStructures: {
        body: (
            <div>
                <p>
                    Pressing the button will list all features that are configured as a building in
                    the myw.config['mywcom.structures'] array.
                </p>
            </div>
        ),
        function: 'onListStructures'
    },

    structContent: {
        body: (
            <div>
                <p>
                    structContent receives a Structure and returns the equipment, cables, etc housed
                    within (or connected to) it. Returns a StructContent.
                </p>
                <p>
                    Pressing the button will pick a random structure and print on the console the
                    contents of the StructContent. Also the map will focus on the structure and show
                    its details in the "Details" tab.
                </p>
            </div>
        ),
        function: 'onStructContent'
    },

    getStructuresAtCoords: {
        body: (
            <div>
                <p>
                    getStructuresAtCoords receives an array of coordinates and returns an array
                    containing the structure (if any) at each given coordinate.
                </p>
                <p>
                    Pressing the button will pick three random structures and use their coordinates
                    as input, then print on the console the returning array, as well as populate the
                    "Details" tab with the structures informations.
                </p>
            </div>
        ),
        function: 'onGetStructuresAtCoords'
    },

    getStructureAt: {
        body: (
            <div>
                <p>
                    getStructureAt receives a coordinate and returns the structure found. If no
                    structures are found it returns null. If multiple structures are found it
                    returns a random structure
                </p>
                <p>
                    Pressing the button will pick a random structures and use its coordinates as
                    input, then print on the console the returning array. As well as populate the
                    "Details" tab with the structures informations.
                </p>
            </div>
        ),
        function: 'onGetStructureAt'
    },

    getStructuresAt: {
        body: (
            <div>
                <p>getStructuresAt receives:</p>
                <p>- A coordinate</p>
                <p>- A list of feature types</p>
                <p>- A tolerance value (in meters)</p>
                And returns an array of structures.
                <p>
                    Pressing the button will pick a random structure and use its coordinates as
                    input, it will search for any type of feature in a 10m radius, then print on the
                    console the returning structure. Also the map will focus on the first structure
                    in the return array and show a list of all structures returned in the "Details"
                    tab.
                </p>
            </div>
        ),
        function: 'onGetStructuresAt'
    },

    routeContent: {
        body: (
            <div>
                <p>
                    routeContent receives a route and an option boolean flagging if proposed cables
                    and conduits should be included. It returns a RouteContent structure containing
                    the cables and conduits housed in the route.
                </p>
                <p>
                    Pressing the button will pick a random route and then print on the console the
                    returning RouteContent structure. Also the map will focus on the route, as well
                    as populate the "Details" tab with the route informations.
                </p>
            </div>
        ),
        function: 'onRouteContent'
    },

    validateRoutesForConduit: {
        body: (
            <div>
                <p>
                    validateRoutesForConduit receives an array of routes and conduit feature and
                    check if the routes within the array can receive the conduit. Returns false if
                    all routes can receive the conduit and true otherwise.
                </p>
                <p>
                    Pressing the button will pick a random conduit and print on the console the
                    result of the function, either "true" or "false".
                </p>
            </div>
        ),
        function: 'onValidateRoutesForConduit'
    },

    isStructure: {
        body: (
            <div>
                <p>
                    isStructure receives a feature and checks if it is a structure based on the
                    myw.config['mywcom.structures'] array. Returns false if all routes can receive
                    the conduit and true otherwise.
                </p>
                <p>
                    Pressing the button will call the function three times passing a building,
                    route, and conduit respectively and print on the console the return for each of
                    the calls (true, false, false).
                </p>
            </div>
        ),
        function: 'onIsStructure'
    },

    isRoute: {
        body: (
            <div>
                <p>
                    isRoute receives a feature and checks if it is a route based on the
                    myw.config['mywcom.routes'] array. Returns false if all routes can receive the
                    conduit and true otherwise.
                </p>
                <p>
                    Pressing the button will call the function three times passing a build, route,
                    and conduit respectively and print on the console the return for each of the
                    calls (false, true, false).
                </p>
            </div>
        ),
        function: 'onIsRoute'
    }
};
