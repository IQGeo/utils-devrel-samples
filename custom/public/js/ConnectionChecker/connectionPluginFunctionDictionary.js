import React from 'react';

export const MenuItems = [
    {
        label: <span>Fuctions</span>,
        title: 'API Functions',
        options: [
            {
                value: 'freePinsOn',
                label: 'freePinsOn'
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
                    used pins.
                </p>
                <p>
                    Pressing the button will disconnect conduit JB_BFT_2 in the housing JS_CAB_2,
                    focus the map on the cabinet and show the cabinet status on the details.
                </p>
            </div>
        ),
        checkbox: [{ label: 'Side' }],
        function: 'onFreePinsOn'
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
