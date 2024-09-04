import React from 'react';

export const MenuItems = [
    {
        label: <span>Fuctions</span>,
        title: 'API Functions',
        options: [
            {
                value: 'getState',
                label: 'getState'
            },
            {
                value: 'specManager',
                label: 'specManager'
            },
            {
                value: 'pinLabel',
                label: 'pinLabel'
            },
            {
                value: 'connLabel',
                label: 'connLabel'
            },
            {
                value: 'circuitCount',
                label: 'circuitCount'
            },
            {
                value: 'featureLabel',
                label: 'featureLabel'
            },
            {
                value: 'cableLabel',
                label: 'cableLabel'
            }
        ]
    }
];

export const DisplayPluginFunctionDictionary = {
    getState: {
        body: (
            <div>
                <p>getState returns the state stored over application refreshes.</p>
                <p>Pressing the button will call getState and print the output on the console.</p>
            </div>
        ),
        function: 'onGetState'
    },

    specManager: {
        body: (
            <div>
                <p>specManager returns the content of this.app.plugins['specManager']</p>
                <p>
                    Pressing the button will call specManager and print the output on the console.
                </p>
            </div>
        ),
        function: 'onSpecManager'
    },

    pinLabel: {
        body: (
            <div>
                <p>
                    pinLabel generates the 'from' part of a pin tree node label. It receives as
                    parameters the cable to create the pin node label for, and an integer
                    representing the pin itself. It returns a string representing the pin color
                    parameters.
                </p>
                <p>
                    ATTENTION: The function does NOT save the label in the database, it only
                    generates the string.
                </p>
                <p>
                    Pressing the button will call pinLabel for a random fiber cable and pin 1, print
                    the output on the console, focus the map on the cable and show its details in
                    the "Details" tab.
                </p>
            </div>
        ),
        function: 'onPinLabel'
    },

    connLabel: {
        body: (
            <div>
                <p>
                    connLabel generates the 'connected to' part of a pin tree node label. It
                    receives as parameters the pin number and the connection itself. It returns a
                    string representing the label.
                </p>
                <p>
                    ATTENTION: The function does NOT save the label in the database, it only
                    generates the string.
                </p>
                <p>
                    Pressing the button will call connLabel for a random connection from a random
                    cable and pin 1, print the output on the console, focus the map on the cable and
                    show its details in the "Details" tab.
                </p>
            </div>
        ),
        function: 'onConnLabel'
    },

    circuitCount: {
        body: (
            <div>
                <p>
                    circuitCount returns a formatted string containing the number of connections. It
                    receives as parameters the number of connections and an optional boolean if be
                    formatted to include proposed connections (true) or not. It returns the
                    formatted string.
                </p>
                <p>
                    Pressing the button will call the function providing the number '1' as input.
                    Use the checkbox below to define if proposed connections should be included.
                </p>
            </div>
        ),
        checkbox: [{ label: 'Proposed' }],
        function: 'onCircuitCount'
    },

    featureLabel: {
        body: (
            <div>
                <p>
                    featureLabel string to display for a feature in an equipment or cable tree. It
                    receives as parameters the feature and an optional string representing the side
                    of the feature, It returns the formatted string.
                </p>
                <p>
                    Pressing the button will call the function for a random fiber cable and return
                    the formatted string, focus the map on the cable and show its details in the
                    "Details" tab.
                </p>
            </div>
        ),
        function: 'onFeatureLabel'
    },

    cableLabel: {
        body: (
            <div>
                <p>
                    featureLabel string to display for a feature in an equipment or cable tree. It
                    receives as parameters the feature and an optional string representing the side
                    of the feature, It returns the formatted string.
                </p>
                <p>
                    Pressing the button will call the function for a random fiber cable and return
                    the formatted string, focus the map on the cable and show its details in the
                    "Details" tab.
                </p>
            </div>
        ),
        function: 'onCableLabel'
    }
};
