import React from 'react';

export const MenuItems = [
    {
        label: <span>List Conduits</span>,
        title: 'List Conduits',
        options: [
            {
                value: 'listConduits',
                label: 'listConduits'
            }
        ]
    },
    {
        label: <span>Fuctions</span>,
        title: 'API Functions',
        options: [
            {
                value: 'disconnectConduit',
                label: 'disconnectConduit'
            },
            {
                value: 'connectConduits',
                label: 'connectConduits'
            },
            {
                value: 'moveInto',
                label: 'moveInto'
            },
            {
                value: 'isContinuousConduitType',
                label: 'isContinuousConduitType'
            }
        ]
    }
];

export const ConduitPluginFunctionDictionary = {
    listConduits: {
        body: (
            <div>
                <p>
                    Pressing the button will list all features that are configured as a conduit in
                    the myw.config['mywcom.conduits'] array.
                </p>
            </div>
        ),
        function: 'onListConduits'
    },

    disconnectConduit: {
        body: (
            <div>
                <p>
                    IMPORTANT: disconnectConduit only works on Continuous conduits (e.g.: Blown
                    Fiber Tubes)
                </p>
                <p>
                    disconnectConduit disconnects the conduit from its housing. The conduit's
                    housing is stored in the root_housing property of the conduit.
                </p>
                <p>
                    Pressing the button will disconnect conduit JB_BFT_2 in the housing JS_CAB_2,
                    focus the map on the cabinet and show the cabinet status on the details.
                </p>
            </div>
        ),
        function: 'onDisconnectConduit'
    },

    connectConduits: {
        body: (
            <div>
                <p>
                    IMPORTANT: connectConduits only works on Continuous conduits (e.g.: Blown Fiber
                    Tubes)
                </p>
                <p>
                    connectConduit connects two conduits arriving in a housing. The conduit's
                    housing is stored in the root_housing property of the conduit.
                </p>
                <p>
                    Pressing the button will connect the two sections of conduit JB_BFT_2 in the
                    housing JS_CAB_2, focus the map on the cabinet and show the cabinet status on
                    the details. Trying to connect the conduits when they are already connected will
                    make the promise throw an error that will be printed in the console.
                </p>
            </div>
        ),
        function: 'onConnectConduits'
    },

    moveInto: {
        body: (
            <div>
                <p>moveInto moves a cable segment or conduit to a new housing in same route</p>
                <p>
                    Pressing the button will move JS_SUBCND_1 between JS_CND_1 to the conduit
                    JS_CND_5 (i.e.: If it is currently housed into JS_CND_1 it will move it to
                    JS_CND_5 and vice-versa), focus the map on the cabinet and show the route the
                    conduit information in the details tab.
                </p>
            </div>
        ),
        function: 'onMoveInto'
    },

    isContinuousConduitType: {
        body: (
            <div>
                <p>
                    isContinuousConduitType will return true if the feature is a continuous conduit
                    (e.g.: Blown Fiber Tubes).
                </p>
                <p>
                    Pressing the button will randomly pick a conduit and check if it is continuous
                    or not.
                </p>
            </div>
        ),
        function: 'onIsContinuousConduitType'
    }
};
