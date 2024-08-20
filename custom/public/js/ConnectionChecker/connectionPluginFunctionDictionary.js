import React from 'react';

export const MenuItems = [
    {
        label: <span>Fuctions</span>,
        title: 'API Functions',
        options: [
            {
                value: 'freePinsOn',
                label: 'freePinsOn'
            },
            {
                value: 'usedPinsOn',
                label: 'usedPinsOn'
            },
            {
                value: 'highPinUsedOn',
                label: 'highPinUsedOn'
            },
            {
                value: 'pinStateFor',
                label: 'pinStateFor'
            },
            {
                value: 'pinCountFor',
                label: 'pinCountFor'
            },
            {
                value: 'traceOut',
                label: 'traceOut'
            },
            {
                value: 'connect',
                label: 'connect'
            },
            {
                value: 'disconnect',
                label: 'disconnect'
            },
            {
                value: 'moveConns',
                label: 'moveConns'
            },
            {
                value: 'techFor',
                label: 'techFor'
            }
        ]
    }
];
// * @param  {MywFeature} feature
// * @param  {string} Network type
// * @param  {string} 'in' or 'out'
// * @return {Array} list of used pins
// */
// async freePinsOn(feature, tech, side) {
export const ConnectionPluginFunctionDictionary = {
    freePinsOn: {
        body: (
            <div>
                <p>
                    freePinsOn returns list of pins on 'side' of 'feature' that are not connected.
                    It receives as parameters the feature to be checked, the network type, and a
                    string 'in' or 'out' indicating which side to check ("in" or "out", tick the
                    checkbox for "in", untick for "out") and it returns an array with the list of
                    free pins.
                </p>
                <p>
                    Pressing the button will call freePinsOn for a random fiber splitter, print on
                    the console the output array, focus the map on the Fiber Splitter and show its
                    details in the "Details" tab.
                </p>
            </div>
        ),
        checkbox: [{ label: 'Side' }],
        function: 'onFreePinsOn'
    },

    usedPinsOn: {
        body: (
            <div>
                <p>
                    usedPinsOn returns list of pins on 'side' of 'feature' that are connected. It
                    receives as parameters the feature to be checked, the network type, and a string
                    'in' or 'out' indicating which side to check ("in" or "out", tick the checkbox
                    for "in", untick for "out") and it returns an array with the list of used pins.
                </p>
                <p>
                    Pressing the button will call usedPinsOn for a random fiber splitter, print on
                    the console the output array, focus the map on the Fiber Splitter and show its
                    details in the "Details" tab.
                </p>
            </div>
        ),
        checkbox: [{ label: 'Side' }],
        function: 'onUsedPinsOn'
    },

    highPinUsedOn: {
        body: (
            <div>
                <p>
                    highPinOn returns the number of the higher pin used on a feature. It receives as
                    parameters the feature to be checked, the network type, and a string 'in' or
                    'out' indicating which side to check ("in" or "out", tick the checkbox for "in",
                    untick for "out") and it returns the number of the highest pin used.
                </p>
                <p>
                    Pressing the button will call highPinOn for a random fiber splitter, print on
                    the console the output, focus the map on the Fiber Splitter and show its details
                    in the "Details" tab.
                </p>
            </div>
        ),
        checkbox: [{ label: 'Side' }],
        function: 'onHighPinUsedOn'
    },

    pinStateFor: {
        body: (
            <div>
                <p>
                    pinStateFor returns the state of the pins on a feature. It receives as
                    parameters the feature to be checked, the network type, and a string 'in' or
                    'out' indicating which side to check ("in" or "out", tick the checkbox for "in",
                    untick for "out") and it returns an array indicating the state of each pin
                    ('true' for free, 'false' for used).
                </p>
                <p>
                    Pressing the button will call pinStateFor for a random fiber splitter, print on
                    the console the output, focus the map on the Fiber Splitter and show its details
                    in the "Details" tab.
                </p>
            </div>
        ),
        checkbox: [{ label: 'Side' }],
        function: 'onPinStateFor'
    },

    pinCountFor: {
        body: (
            <div>
                <p>
                    pinCountFor returns the number of pins on a feature. It receives as parameters
                    the feature to be checked, the network type, and a string 'in' or 'out'
                    indicating which side to check ("in" or "out", tick the checkbox for "in",
                    untick for "out") and it returns the number of pins on the feature.
                </p>
                <p>
                    Pressing the button will call pinCountFor for a random fiber splitter, print on
                    the console the output, focus the map on the Fiber Splitter and show its details
                    in the "Details" tab.
                </p>
            </div>
        ),
        checkbox: [{ label: 'Side' }],
        function: 'onPinCountFor'
    },

    traceOut: {
        body: (
            <div>
                <p>
                    traceOut does a trace starting from a pin, in a direction, and up to a
                    (optional) maximum distamce. It receives as parameters the network type, the
                    feature that houses the pin, an object containing the pins to be used, the
                    direction to trace ('upstream', 'downstream', or 'both'), and the maximum
                    distance and it returns an object with the trace tree.
                </p>
                <p>
                    Pressing the button will call traceOut for a random pin on a random fiber
                    splitter, using 'downstream' and unlimited distance, print on the console the
                    output, focus the map on the Fiber Splitter and show its details in the
                    "Details" tab.
                </p>
            </div>
        ),
        function: 'onTraceOut'
    },

    connect: {
        body: (
            <div>
                <p>
                    connect connects two sets of pins. It receives as parameters the network type,
                    the feature from where the connection will start, an array of pins where the
                    connections will start, the feature where the connection ends, the array of pins
                    where the connections will end, and the housing where the connections will be
                    stored. The function has no return.
                </p>
                <p>
                    Pressing the button will call connect connecting a pin in the JS_FiberSplitter_1
                    to a pin in JS_ONT_1, focus the map on the ONT and show its details in the
                    "Details" tab.
                </p>
            </div>
        ),
        function: 'onConnect'
    },

    disconnect: {
        body: (
            <div>
                <p>
                    disconnect disconnects pins of a feature. It receives as parameters the network
                    type, the feature that houses the pins, and the pins to be disconnected. The
                    function has no returns.
                </p>
                <p>
                    Pressing the button will call disconnect a pin from JS_ONT_1, focus the map on
                    the ONT and show its details in the "Details" tab.
                </p>
            </div>
        ),
        function: 'onDisconnect'
    },

    moveConns: {
        body: (
            <div>
                <p>
                    disconnect disconnects pins of a feature. It receives as parameters the network
                    type, the feature that houses the pins, and the pins to be disconnected. The
                    function has no returns.
                </p>
                <p>
                    Pressing the button will call disconnect a pin from JS_ONT_1, focus the map on
                    the ONT and show its details in the "Details" tab.
                </p>
            </div>
        ),
        function: 'onMoveConns'
    },

    techFor: {
        body: (
            <div>
                <p>
                    techFor shows the feature type for a given feature. It receives as parameters a
                    feature and the side of the feature to be checked (optional).
                </p>
                <p>
                    Pressing the button will call techFor for a random fiber splitter, print on the
                    console the output, focus the map on the Fiber Splitter and show its details in
                    the "Details" tab.
                </p>
            </div>
        ),
        function: 'onTechFor'
    }
};
