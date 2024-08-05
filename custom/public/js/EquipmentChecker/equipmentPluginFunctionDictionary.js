import React from 'react';

export const MenuItems = [
    {
        label: <span>List Equipment</span>,
        title: 'List Equipment',
        options: [
            {
                value: 'listEquipment',
                label: 'List Equipment'
            }
        ]
    },
    {
        label: <span>Fuctions</span>,
        title: 'API Functions',
        options: [
            {
                value: 'moveAssembly',
                label: 'moveAssembly'
            },
            {
                value: 'copyAssembly',
                label: 'copyAssembly'
            },
            {
                value: 'connectionsIn',
                label: 'connectionsIn'
            },
            {
                value: 'connectionsOf',
                label: 'connectionsOf'
            }
        ]
    }
];

export const EquipmentPluginFunctionDictionary = {
    listEquipment: {
        body: (
            <div>
                <p>
                    Pressing the button will list all features that are configured as a equipment in
                    the myw.config['mywcom.equipment'] array.
                </p>
            </div>
        ),
        function: 'onListEquipment'
    },

    moveAssembly: {
        body: (
            <div>
                <p>
                    moveAssembly receives two parameters, the first one is the equipment to be moved
                    and the second is the new housing. The equipment and all its children are moved.
                    The only return is the successful fulfillment of the Promise.
                </p>
                <p>
                    Pressing the button will take a fiber shelf and move it to a different rack.
                    Once the rack is moved a success message will appear in the console, after that
                    you can search for the fiber shelf on the map and the Housing will be updated.
                </p>
            </div>
        ),
        function: 'onMoveAssembly'
    },

    copyAssembly: {
        body: (
            <div>
                <p>
                    copyAssembly receives two parameters, the first one is the equipment to be
                    copied and the second is the housing that will receive the copy. The only return
                    is the successful fulfillment of the Promise.
                </p>
                <p>
                    Pressing the button will take a fiber shelf and copy it to a different rack. The
                    new equipment is created with a generic name finishing with a number starting at
                    10000. You can rename it by editing the feature.
                </p>
            </div>
        ),
        function: 'onCopyAssembly'
    },

    connectionsIn: {
        body: (
            <div>
                <p>
                    connectionsIn receives an equipment or housing and returns an array containing
                    all connections in the given input.
                </p>
                <p>
                    Pressing the button will print on the console the return array for connectionsIn
                    calls for all the fiber shelves. If a given equipment or housing has no
                    connections the return will be an empty array.
                </p>
            </div>
        ),
        function: 'onConnectionsIn'
    },

    connectionsOf: {
        body: (
            <div>
                <p>
                    connectionsOf receives an equipment or housing and returns an array containing
                    all connections for the given input.
                </p>
                <p>
                    Pressing the button will print on the console the return array for connectionsOf
                    calls for all the fiber shelves. If a given equipment or housing has no
                    connections the return will be an empty array.
                </p>
            </div>
        ),
        function: 'onConnectionsOf'
    }
};
