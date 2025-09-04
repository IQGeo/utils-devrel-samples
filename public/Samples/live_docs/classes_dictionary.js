import React from 'react';
import { useLocale } from 'myWorld-client/react';
import { param } from 'jquery';
import { MyWorldFeature } from 'myWorld-base';
import { useParams } from 'react-router-dom';
import structureDescriptions from './function_descriptions/structureDescriptions.json';
import equipmentDescriptions from './function_descriptions/equipmentDescriptions.json';
import conduitDescriptions from './function_descriptions/conduitDescriptions.json';
import cableDescriptions from './function_descriptions/cableDescriptions.json';
import connectionDescriptions from './function_descriptions/connectionDescriptions.json';
import circuitDescriptions from './function_descriptions/circuitDescriptions.json';

const { msg } = useLocale('LiveDocsPlugin');
const title = msg('classTitle');

export const Classes = [
    {
        label: 'Classes',
        title: 'API Functions',
        options: [
            {
                value: 'structureApi',
                label: 'Structure API'
            },
            {
                value: 'equipmentApi',
                label: 'Equipment API'
            },
            {
                value: 'conduitApi',
                label: 'Conduit API'
            },
            {
                value: 'cableApi',
                label: 'Cable API'
            },
            {
                value: 'connectionApi',
                label: 'Connection API'
            },
            {
                value: 'circuitApi',
                label: 'Circuit API'
            },
            {
                value: 'displayApi',
                label: 'Display API'
            },
            {
                value: 'specApi',
                label: 'Spec API'
            },
            {
                value: 'locApi',
                label: 'LoC API'
            }
        ]
    }
];

export const StructureMenu = [
    {
        label: <span>List Structures</span>,
        title: 'List Stuctures',
        options: [
            {
                value: 'listStructures',
                label: 'List Stuctures'
            }
        ]
    },
    {
        label: <span>Functions</span>,
        title: 'API Functions',
        options: [
            {
                value: 'structContent',
                label: 'structContent',
                params: 
                [
                    { name: 'structure' , type: 'MyWorldFeature'},
                    { name: 'includeProposed', type: 'Boolean' }
                ]
                
            },
            {
                value: 'getStructuresAtCoords',
                label: 'getStructuresAtCoords',
                params: [
                    { name: 'coords', type: 'Array<Array<Number>>' },
                    { name: 'featureTypes', type: 'Array<String>', optional: true  }
                ]
            },
            {
                value: 'getStructureAt',
                label: 'getStructureAt',
                params: [
                    { name: 'coord', type: 'Array<Number>' },
                    { name: 'featureTypes', type: 'Array<String>', optional: true  }
                ]
            },
            {
                value: 'getStructuresAt',
                label: 'getStructuresAt',
                params: [
                    { name: 'coord', type: 'Array<Number>' },
                    { name: 'featureTypes', type: 'Array<String>', optional: true  },
                    { name: 'tolerance', type: 'Number' }
                ]
            },
            {
                value: 'routeContent',
                label: 'routeContent',
                params: [
                    { name: 'route', type: 'MyWorldFeature' },
                    { name: 'includeProposed', type: 'Boolean' }
                ]
            },
            {
                value: 'validateRoutesForConduit',
                label: 'validateRoutesForConduit',
                params: [
                    { name: 'routes', type: 'Array<MyWorldFeature>' },
                    { name: 'conduit', type: 'MyWorldFeature' }
                ]
            },
            {
                value: 'isStructure',
                label: 'isStructure',
                params: [
                    { name: 'feature', type: 'MyWorldFeature' }
                ]
            },
            {
                value: 'isRoute',
                label: 'isRoute',
                params: [
                    { name: 'feature', type: 'MyWorldFeature' }
                ]
            },
            {
                value: 'isConduit',
                label: 'isConduit',
                params: [
                    { name: 'feature', type: 'MyWorldFeature' }
                ]
            },
            {
                value: 'fixRouteEnds',
                label: 'fixRouteEnds',
                params: [
                    { name: 'route', type: 'MyWorldFeature' },
                    { name: 'struct1', type: 'MyWorldFeature' },
                    { name: 'struct2', type: 'MyWorldFeature' }
                ]
            },
            {
                value: 'houseInStructure',
                label: 'houseInStructure',
                params: [
                    { name: 'toStructure', type: 'MyWorldFeature' }               
                ]
            },
            {
                value: 'transferToStructure',
                label: 'transferToStructure',
                params: [
                    { name: 'toStructure', type: 'MyWorldFeature'},
                    { name: 'fromStructure', type: 'MyWorldFeature'}
                ]
            }
        ]
    }
];

export const StructureDescriptions = {
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
                    {structureDescriptions.structContent}
                </p>
            </div>
        ),
        function: 'onStructContent'
    },

    getStructuresAtCoords: {
        body: (
            <div>
                <p>
                    {structureDescriptions.getStructuresAtCoords}
                </p>
            </div>
        ),
        function: 'onGetStructuresAtCoords'
    },

    getStructureAt: {
        body: (
            <div>
                <p>
                    {structureDescriptions.getStructureAt}
                </p>
            </div>
        ),
        function: 'onGetStructureAt'
    },

    getStructuresAt: {
        body: (
            <div>
                <p>{structureDescriptions.getStructuresAt}</p>
            </div>
        ),
        function: 'onGetStructuresAt'
    },

    routeContent: {
        body: (
            <div>
                <p>
                    {structureDescriptions.routeContent}
                </p>
            </div>
        ),

        function: 'onRouteContent'
    },

    validateRoutesForConduit: {
        body: (
            <div>
                <p>
                    {structureDescriptions.validateRoutesForConduit}
                </p>
            </div>
        ),
        function: 'onValidateRoutesForConduit'
    },

    isStructure: {
        body: (
            <div>
                <p>
                    {structureDescriptions.isStructure}
                </p>
            </div>
        ),
        function: 'onIsStructure'
    },

    isRoute: {
        body: (
            <div>
                <p>
                    {structureDescriptions.isRoute}
                </p>
            </div>
        ),
        function: 'onIsRoute'
    },
    isConduit: {
        body: (
            <div>
                <p>
                    {structureDescriptions.isConduit}
                </p>
            </div>
        ),
        function: 'onIsConduit'
    },
    fixRouteEnds: {
        body: (
            <div>
                <p>
                    {structureDescriptions.fixRouteEnds}
                </p>
            </div>
        ),
        function: 'onFixRouteEnds'
    },
    houseInStructure: {
        body: (
            <div>
                <p>
                    {structureDescriptions.houseInStructure}
                </p>
            </div>
        ),
        function: 'onHouseInStructure'
    },
    transferToStructure: {
        body: (
            <div>
                <p>
                    {structureDescriptions.transferToStructure}
                </p>
            </div>
        ),
        function: 'onTransferToStructure'
    }
};

export const EquipmentMenu = [
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
                value: 'isEquipment',
                label: 'isEquipment',
                params: [
                    { name: 'feature', type: 'MyWorldFeature' }
                ]
            },
            {
                value: 'moveAssembly',
                label: 'moveAssembly',
                params: [
                    { name: 'equipment', type: 'MyWorldFeature' },
                    { name: 'housing', type: 'MyWorldFeature' }
                ]
            },
            {
                value: 'copyAssembly',
                label: 'copyAssembly',
                params: [
                    { name: 'equipment', type: 'MyWorldFeature' },
                    { name: 'housing', type: 'MyWorldFeature' }
                ]
            },
            {
                value: 'connectionsIn',
                label: 'connectionsIn',
                params: [
                    { name: 'housing', type: 'MyWorldFeature' },
                ]
            },
            {
                value: 'connectionsOf',
                label: 'connectionsOf',
                params: [
                    { name: 'housing', type: 'MyWorldFeature' },
                ]
            },
            {
                value: 'equipmentWithPortInfo',
                label: 'equipmentWithPortInfo'
            },
            {
                value: 'ripplePortInfo',   
                label: 'ripplePortInfo',
                params: [
                    { name: 'feature', type: 'MyWorldFeature' },
                    { name: 'direction', type: 'String' },
                    { name: 'side', type: 'String' },
                    { name: 'sourceRanges', type: 'Array<Object>' },
                    { name: 'portInfoToRipple', type: 'Array<String>' }
                ]
            }
        ]
    }
];

export const EquipmentDescriptions = {
    listEquipment: {
        body: (
            <div>
                <p>
                    Pressing the button will list all features that are configured as equipment in
                    the myw.config['mywcom.equipment'] array.
                </p>
            </div>
        ),
        function: 'onListEquipment'
    },
    isEquipment: {
        body: (
            <div>
                <p>
                    {equipmentDescriptions.isEquipment}
                </p>
            </div>
        ),
        function: 'onIsEquipment'
    },
    moveAssembly: {
        body: (
            <div>
                <p>
                    {equipmentDescriptions.moveAssembly}
                </p>
            </div>
        ),
        function: 'onMoveAssembly'
    },
    copyAssembly: {
        body: (
            <div>
                <p>
                    {equipmentDescriptions.copyAssembly}
                </p>
            </div>
        ),
        function: 'onCopyAssembly'
    },
    connectionsIn: {
        body: (
            <div>
                <p>
                    {equipmentDescriptions.connectionsIn}
                </p>
            </div>
        ),
        function: 'onConnectionsIn'
    },
    connectionsOf: {
        body: (
            <div>
                <p>
                    {equipmentDescriptions.connectionsOf}
                </p>
            </div>
        ),
        function: 'onConnectionsOf'
    },
    equipmentWithPortInfo: {
        body: (
            <div>
                <p>
                    {equipmentDescriptions.equipmentWithPortInfo}
                </p>
            </div>
        ),
        function: 'onEquipmentWithPortInfo'
    },
    ripplePortInfo: {
        body: (
            <div>
                <p>
                    {equipmentDescriptions.ripplePortInfo}
                </p>
            </div>
        ),
        function: 'onRipplePortInfo'
    }
};  

export const ConduitMenu = [
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
                label: 'disconnectConduit',
                params: [
                    { name: 'conduit', type: 'MyWorldFeature' },
                    { name: 'housing', type: 'MyWorldFeature' }
                ]
            },
            {
                value: 'connectConduits',
                label: 'connectConduits',
                params: [
                    { name: 'housing', type: 'MyWorldFeature' },
                    { name: 'first_conduit', type: 'MyWorldFeature' },
                    { name: 'second_conduit', type: 'MyWorldFeature' }
                ]
            },
            {
                value: 'routeNestedConduits',
                label: 'routeNestedConduits',
                params: [
                    { name: 'conduitJson', type: 'Object' },
                    { name: 'structures', type: 'Object' },
                    { name: 'parentConduits', type: 'Object' },
                    { name: 'transaction', type: 'Transaction' }
                ]
            },
            {
                value: 'moveInto',
                label: 'moveInto',
                params: [
                    { name: 'housing', type: 'MyWorldFeature' },
                    { name: 'feature', type: 'MyWorldFeature' }
                ]
            },
            {
                value: 'isContinuousConduitType',
                label: 'isContinuousConduitType',
                params: [
                    { name: 'feature', type: 'MyWorldFeature' }
                ]
            },
            {
                value: 'continuousPhysicalConduits',
                label: 'continuousPhysicalConduits',
                params: [
                    { name: 'feature', type: 'MyWorldFeature' }
                ]
            },
            {
                value: 'deleteContinuousPhysicalConduits',
                label: 'deleteContinuousPhysicalConduits',
                params: [
                    { name: 'conduit', type: 'MyWorldFeature' }
                ]
            }
        ]
    }
];

export const ConduitDescriptions = {
    listConduits: {
        body: (
            <div>
                <p>
                    Pressing the button will list all features that are configured as equipment in
                    the myw.config['mywcom.equipment'] array.
                </p>
            </div>
        ),
        function: 'onListConduits'
    },
    disconnectConduit: {
        body: (
            <div>
                <p>
                    {conduitDescriptions.disconnectConduit}
                </p>
            </div>
        ),
        function: 'onDisconnectConduit'
    },
    connectConduits: {
        body: (
            <div>
                <p>
                    {conduitDescriptions.connectConduits}
                </p>
            </div>
        ),
        function: 'onConnectConduits'
    },
    routeNestedConduits: {
        body: (
            <div>
                <p>
                    {conduitDescriptions.routeNestedConduits}
                </p>
            </div>
        ),
        function: 'onRouteNestedConduits'
    },
    moveInto: {
        body: (
            <div>
                <p>
                    {conduitDescriptions.moveInto}
                </p>
            </div>
        ),
        function: 'onMoveInto'
    },
    isContinuousConduitType: {
        body: (
            <div>
                <p>
                    {conduitDescriptions.isContinuousConduitType}
                </p>
            </div>
        ),
        function: 'onIsContinuousConduitType'
    },  
    continuousPhysicalConduits: {
        body: (
            <div>
                <p>
                    {conduitDescriptions.continuousPhysicalConduits}
                </p>
            </div>
        ),
        function: 'onContinuousPhysicalConduits'
    },
    deleteContinuousPhysicalConduits: {
        body: (
            <div>
                <p>
                    {conduitDescriptions.deleteContinuousPhysicalConduits}
                </p>
            </div>
        ),
        function: 'onDeleteContinuousPhysicalConduits'
    }
};

export const CableMenu = [
    {
        label: <span>List Cables</span>,
        title: 'List Cables',
        options: [
            {
                value: 'listCables',
                label: 'List Cables'
            }
        ]
    },
    {
        label: <span>Fuctions</span>,
        title: 'API Functions',
        options: [
            {
                value: 'highestUsedPinOn',
                label: 'highestUsedPinOn',
                params: [
                    { name: 'cable', type: 'MyWorldFeature' }
                ]
            },
            {
                value: 'connectionsFor',
                label: 'connectionsFor',
                params: [
                    { name: 'cable', type: 'MyWorldFeature' },
                    {name: 'splice', type: 'Boolean' },
                    { name: 'sorted', type: 'Boolean' }
                ]
            },
            {
                value: 'internalSegments',
                label: 'internalSegments',
                params: [
                    { name: 'housingFeature', type: 'MyWorldFeature' },
                    { name: 'root', type: 'Boolean' }
                ]
            },
            {
                value: 'createDetachedInternalSeg',
                label: 'createDetachedInternalSeg',
                params: [
                    { name: 'struct', type: 'MyWorldFeature' },
                    { name: 'cable', type: 'MyWorldFeature' },
                    { name: 'housingUrn', type: 'String' },
                    { name: 'length', type: 'Number', optional: true }
                ]
            },
            {
                value: 'createDetachedSlack',
                label: 'createDetachedSlack',
                params: [
                    { name: 'cableFeature', type: 'MyWorldFeature' },
                    { name: 'housingUrn', type: 'MyWorldFeature' }
                ]
            },
            {
                value: 'splitSlack',
                label: 'splitSlack',
                params: [
                    { name: 'slack', type: 'MyWorldFeature' },
                    { name: 'length', type: 'Number' }
                ]
            },
            {
                value: 'createDetSlackAtSide',
                label: 'createDetSlackAtSide',
                params: [
                    { name: 'seg', type: 'MyWorldFeature' },
                    { name: 'struct', type: 'MyWorldFeature' },
                    { name: 'side', type: 'Boolean' }
                ]
            },
            {
                value: 'addSlack',
                label: 'addSlack',
                params: [
                    { name: 'featureType', type: 'String' },
                    { name: 'detSlack', type: 'MyWorldFeature' },
                    { name: 'segUrn', type: 'String' },
                    { name: 'side', type: 'Boolean' }
                ]
            },
            {
                value: 'transferConnections',
                label: 'transferConnections',
                params: [
                    { name: 'oldSeg', type: 'String' },
                    { name: 'newSeg', type: 'String' },
                    { name: 'side', type: 'String' }
                ]
            },
            {
                value: 'connectionsOf',
                label: 'connectionsOf',
                params: [
                    { name: 'featureUrn', type: 'MyWorldFeature' },
                    { name: 'housing_field', type: 'String' },
                    { name: 'splices', type: 'Boolean', optional: true}
                ]
            },
            {
                value: 'segmentContainment',
                label: 'segmentContainment',
                params: [
                    { name: 'seg', type: 'MyWorldFeature' },
                    { name: 'side', type: 'String' }
                ]
            },
            {
                value: 'setSegmentContainment',
                label: 'setSegmentContainment',
                params: [
                    { name: 'seg', type: 'MyWorldFeature' },
                    { name: 'side', type: 'String' },
                    { name: 'equip', type: 'MyWorldFeature' }
                ]
            },
            {
                value: 'setTickMark',
                label: 'setTickMark',
                params: [
                    { name: 'seg', type: 'MyWorldFeature' },
                    { name: 'tickMark', type: 'Number' },
                    { name: 'field', type: 'String' },
                    { name: 'spacing', type: 'Number' },
                    { name: 'unit', type: 'String' }

                ]
            },
            {
                value: 'setInTickMark',
                label: 'setInTickMark',
                params: [
                    { name: 'trans', type: 'Transaction' },
                    { name: 'seg', type: 'MyWorldFeature' },
                    { name: 'tickMark', type: 'Number' },
                    { name: 'spacing', type: 'Number' },
                    { name: 'unit', type: 'String' }
                ]
            },
            {
                value: 'findDownstreamSegsToTick',
                label: 'findDownstreamSegsToTick',
                params: [
                    { name: 'seg', type: 'MyWorldFeature' }
                ]
            },
            {
                value: 'setOutTickMark',
                label: 'setOutTickMark',
                params: [
                    { name: 'trans', type: 'Transaction' },
                    { name: 'seg', type: 'MyWorldFeature' },
                    { name: 'tickMark', type: 'Number' },
                    { name: 'spacing', type: 'Number' },
                    { name: 'unit', type: 'String' }
                ]
            },
            {
                value: 'findUpstreamSegsToTick',
                label: 'findUpstreamSegsToTick',
                params: [
                    { name: 'seg', type: 'MyWorldFeature' }
                ]
            },
            {
                value: 'computeTickDist',
                label: 'computeTickDist',
                params: [
                    { name: 'segTick', type: 'Number' },
                    { name: 'tick', type: 'Number' },
                    { name: 'spacing', type: 'Number' },
                    { name: 'unit', type: 'String' }
                ]
            },
            {
                value: 'adjustMeasuredLengths',
                label: 'adjustMeasuredLengths',
                params: [
                    { name: 'trans', type: 'Transaction' },
                    { name: 'segs', type: 'Array<MyWorldFeature>' },
                    { name: 'tickDist', type: 'Number' },
                ]   
            },
            {
                value: 'routeCable',
                label: 'routeCable',
                params: [
                    { name: 'cableJson', type: 'Array<GeoJSON' },
                    { name: 'structures', type: 'Array<MyWorldFeature>' },
                    { name: 'parentFeatures', type: 'Array<MyWorldFeature>' }
                ]
            },
            {
                value: 'cutCableAt',
                label: 'cutCableAt',
                params: [
                    { name: 'struct', type: 'MyWorldFeature' },
                    { name: 'segment', type: 'MyWorldFeature' },
                    { name: 'forward', type: 'Boolean' },
                    { name: 'spliceHousing', type: 'MyWorldFeature', optional: true}
                ]   
            },
            {
                value: 'isCable',
                label: 'isCable',
                params: [
                    { name: 'feature', type: 'MyWorldFeature' }
                ]
            },
            {
                value: 'isInternal',
                label: 'isInternal',
                params: [
                    { name: 'cable', type: 'MyWorldFeature' }
                ]
            },
            {
                value: 'rootHousingUrnOf',
                label: 'rootHousingUrnOf',
                params: [
                    { name: 'housing', type: 'MyWorldFeature'}
                ]
            },
            {
                value: 'getLength',
                label: 'getLength',
                params: [
                    { name: 'feature', type: 'GeoJSON'}
                ]
            },
            {
                value: 'segmentTypeForCable',
                label: 'segmentTypeForCable',
                params: [
                    { name: 'cable', type: 'MyWorldFeature' }
                ]  
            },
            {
                value: 'slackTypeForCable',
                label: 'slackTypeForCable',
                params: [
                    { name: 'cable', type: 'MyWorldFeature' }
                ]   
            },
            {
                value: 'slackTypeForSegment',
                label: 'slackTypeForSegment',
                params: [
                    { name: 'segment', type: 'MyWorldFeature' }
                ]
            },
            {
                value: 'isSegment',
                label: 'isSegment',
                params: [
                    { name: 'urn', type: 'String' }
                ]
            },
            {
                value: 'segmentTypes',
                label: 'segmentTypes'
            },
            {
                value: 'connectionTypes',
                label: 'connectionTypes'
            },
            {
                value: 'slackTypes',
                label: 'slackTypes'
            },
            {
                value: 'pinCountFor',
                label: 'pinCountFor',
                params: [
                    { name: 'feature', type: 'MyWorldFeature' },
                    { name: 'side', type: 'String' }
                ]
            },
            {
                value: 'moveCableOnConnect',
                label: 'moveCableOnConnect',
                params: [
                    { name: 'connRec', type: 'MyWorldFeature' }]
            },
            {
                value: 'truncateLine',
                label: 'truncateLine',
                params: [
                    { name: 'coords', type: 'Array<Array<number>>' },
                    { name: 'startTruncDist', type: 'Number' },
                    { name: 'endTruncDist', type: 'Number' }
                ]
            },
            {
                value: 'handleConnect',
                label: 'handleConnect',
                params: [
                    { name: 'event', type: 'Object' }
                ]
            },
            {
                value: 'fixCableSegmentChain',
                label: 'fixCableSegmentChain',
                params: [
                    { name: 'cable', type: 'MyWorldFeature' }
                ]
            },
            {
                value: 'fixCable',
                label: 'fixCable',
                params: [
                    { name: 'cable', type: 'MyWorldFeature' }
                ]
            },
            {
                value: 'rippleStrandInfo',
                label: 'rippleStrandInfo',
                params: [
                    { name: 'feature', type: 'MyWorldFeature' },
                    { name: 'direction', type: 'String' },
                    { name: 'sourceRanges', type: 'Array' },
                    { name: 'strandInfoToRipple', type: 'Object' }
                ]
            }
        ]
    }
];

export const CableDescriptions = {
    listCables: {
        body: (
            <div>
                <p>
                    Pressing the button will list all features that are configured as equipment in
                    the myw.config['mywcom.equipment'] array.
                </p>
            </div>
        ),
        function: 'onListCables'
    },
    highestUsedPinOn: {
        body: (
            <div>
                <p>
                    {cableDescriptions.highestUsedPinOn}
                </p>
            </div>
        ),
        function: 'onHighestUsedPinOn'
    },
    connectionsFor: {
        body: (
            <div>
                <p>
                    {cableDescriptions.connectionsFor}
                </p>
            </div>
        ),
        function: 'onConnectionsFor'
    },
    internalSegments: {
        body: (
            <div>
                <p>
                    {cableDescriptions.internalSegments}
                </p>
            </div>
        ),
        function: 'onInternalSegments'
    },
    createDetachedInternalSeg: {
        body: (
            <div>
                <p>
                    {cableDescriptions.createDetachedInternalSeg}
                </p>
            </div>
        ),
        function: 'onCreateDetachedInternalSeg'
    },
    createDetachedSlack: {
        body: (
            <div>
                <p>
                    {cableDescriptions.createDetachedSlack}
                </p>
            </div>
        ),
        function: 'onCreateDetachedSlack'
    },
    splitSlack: {
        body: (
            <div>
                <p>
                    {cableDescriptions.splitSlack}
                </p>
            </div>
        ),
        function: 'onSplitSlack'
    },
    createDetSlackAtSide: {
        body: (
            <div>
                <p>
                    {cableDescriptions.createDetSlackAtSide}
                </p>
            </div>
        ),
        function: 'onCreateDetSlackAtSide'
    },
    addSlack: {
        body: (
            <div>
                <p>
                    {cableDescriptions.addSlack}
                </p>
            </div>
        ),
        function: 'onAddSlack'
    },
    transferConnections: {
        body: (
            <div>
                <p>
                    {cableDescriptions.transferConnections}
                </p>
            </div>
        ),
        function: 'onTransferConnections'
    },
    segmentContainment: {
        body: (
            <div>
                <p>
                    {cableDescriptions.segmentContainment}
                </p>
            </div>      
        ),
        function: 'onSegmentContainment'
    },
    setSegmentContainment: {
        body: (
            <div>
                <p>
                    {cableDescriptions.setSegmentContainment}
                </p>
            </div>
        ),
        function: 'onSetSegmentContainment'
    },
    setTickMark: {
        body: (
            <div>
                <p>
                    {cableDescriptions.setTickMark}
                </p>    
            </div>
        ),
        function: 'onSetTickMark'
    },
    setInTickMark: {
        body: (
            <div>
                <p>
                    {cableDescriptions.setInTickMark}   
                </p>
            </div>
        ),
        function: 'onSetInTickMark'
    },
    findDownstreamSegsToTick: {
        body: (
            <div>
                <p>
                    {cableDescriptions.findDownstreamSegsToTick}        
                </p>
            </div>
        ),
        function: 'onFindDownstreamSegsToTick'
    },
    setOutTickMark: {
        body: (
            <div>
                <p>
                    {cableDescriptions.setOutTickMark}
                </p>        
            </div>
        ),
        function: 'onSetOutTickMark'
    },
    findUpstreamSegsToTick: {
        body: (
            <div>
                <p>
                    {cableDescriptions.findUpstreamSegsToTick}  
                </p>      
            </div>
        ),
        function: 'onFindUpstreamSegsToTick'
    },
    computeTickDist: {
        body: (
            <div>
                <p>
                    {cableDescriptions.computeTickDist}
                </p>
            </div>
        ),
        function: 'onComputeTickDist'
    },
    adjustMeasuredLengths: {
        body: (
            <div>
                <p>
                    {cableDescriptions.adjustMeasuredLengths}
                </p>    
            </div>
        ),
        function: 'onAdjustMeasuredLengths'
    },
    routeCable: {
        body: (
            <div>
                <p>
                    {cableDescriptions.routeCable}
                </p>
            </div>
        ),
        function: 'onRouteCable'
    },
    cutCableAt: {
        body: (
            <div>
                <p>
                    {cableDescriptions.cutCableAt}  
                </p>  
            </div>      
        ),
        function: 'onCutCableAt'
    },
    isCable: {
        body: (
            <div>       
                <p>
                    {cableDescriptions.isCable}
                </p>
            </div>
        ),
        function: 'onIsCable'
    },
    isInternal: {
        body: (
            <div>
                <p>
                    {cableDescriptions.isInternal}
                </p>
            </div>
        ),
        function: 'onIsInternal'
    },
    rootHousingUrnOf: {
        body: (
            <div>
                <p>
                    {cableDescriptions.rootHousingUrnOf}
                </p>
            </div>
        ),
        function: 'onRootHousingUrnOf'
    },
    getLength: {
        body: (
            <div>   
                <p>
                    {cableDescriptions.getLength}
                </p>
            </div>
        ),
        function: 'onGetLength'
    },
    segmentTypeForCable: {
        body: (
            <div>
                <p>
                    {cableDescriptions.segmentTypeForCable}
                </p>
            </div>
        ),
        function: 'onSegmentTypeForCable'
    },  
    slackTypeForCable: {
        body: (
            <div>
                <p>
                    {cableDescriptions.slackTypeForCable}
                </p>
            </div>
        ),
        function: 'onSlackTypeForCable'
    },
    slackTypeForSegment: {
        body: (
            <div>
                <p>
                    {cableDescriptions.slackTypeForSegment}
                </p>
            </div>
        ),
        function: 'onSlackTypeForSegment'
    },
    isSegment: {
        body: (
            <div>
                <p>
                    {cableDescriptions.isSegment}
                </p>
            </div>
        ),
        function: 'onIsSegment'
    },
    segmentTypes: {
        body: (
            <div>
                <p>
                    {cableDescriptions.segmentTypes}
                </p>
            </div>
        ),
        function: 'onSegmentTypes'
    },
    connectionTypes: {
        body: (
            <div>
                <p>
                    {cableDescriptions.connectionTypes}
                </p>
            </div>
        ),
        function: 'onConnectionTypes'
    },
    slackTypes: {
        body: (
            <div>
                <p> 
                    {cableDescriptions.slackTypes}
                </p>
            </div>
        ),
        function: 'onSlackTypes'
    },
    pinCountFor: {
        body: (
            <div>
                <p>
                    {cableDescriptions.pinCountFor}
                </p>
            </div>
        ),
        function: 'onPinCountFor'
    },
    moveCableOnConnect: {
        body: (
            <div>
                <p>
                    {cableDescriptions.moveCableOnConnect}
                </p>
            </div>
        ),
        function: 'onMoveCableOnConnect'
    },
    truncateLine: {
        body: (
            <div>
                <p>
                    {cableDescriptions.truncateLine}
                </p>
            </div>
        ),
        function: 'onTruncateLine'
    },
    handleConnect: {
        body: (
            <div>
                <p>
                    {cableDescriptions.handleConnect}
                </p>
            </div>
        ),
        function: 'onHandleConnect'
    },
    fixCableSegmentChain: {
        body: (
            <div>
                <p>
                    {cableDescriptions.fixCableSegmentChain}
                </p>
            </div>
        ),
        function: 'onFixCableSegmentChain'
    },
    fixCable: {
        body: (
            <div>
                <p>
                    {cableDescriptions.fixCable}
                </p>
            </div>
        ),
        function: 'onFixCable'
    },
    rippleStrandInfo: {
        body: (
            <div>
                <p>
                    {cableDescriptions.rippleStrandInfo}
                </p>
            </div>
        ),
        function: 'onRippleStrandInfo'
    }
};

export const ConnectionMenu = [
    {
        label: <span>List Connections</span>,
        title: 'List Connections',
        options: [
            {
                value: 'listConnections',
                label: 'List Connections'
            }
        ]
    },
    {
        label: <span>Functions</span>,
        title: 'API Functions',
        options: [
            {
                value: 'freePinsOn',
                label: 'freePinsOn',
                params: [
                    { name: 'feature', type: 'MyWorldFeature' },
                    { name: 'tech', type: 'String' },
                    { name: 'side', type: 'String' }
                ]
            },
            {
                value: 'usedPinsOn',
                label: 'usedPinsOn',
                params: [
                    { name: 'feature', type: 'MyWorldFeature' },
                    { name: 'tech', type: 'String' },
                    { name: 'side', type: 'String' }
                ]
            },
            {
                value: 'highPinUsedOn',
                label: 'highPinUsedOn',
                params: [
                    { name: 'feature', type: 'MyWorldFeature' },
                    { name: 'tech', type: 'String' },
                    { name: 'side', type: 'String' }
                ]
            },
            {
                value: 'pinStateFor',
                label: 'pinStateFor',
                params: [
                    { name: 'feature', type: 'MyWorldFeature' },
                    { name: 'tech', type: 'String' },
                    { name: 'side', type: 'String' }
                ]
            },
            {
                value: 'pinCountFor',
                label: 'pinCountFor',
                params: [
                    { name: 'feature', type: 'MyWorldFeature' },
                    { name: 'tech', type: 'String' },
                    { name: 'side', type: 'String' }
                ]
            },
            {
                value: 'traceOut',
                label: 'traceOut',
                params: [
                    { name: 'tech', type: 'String' },
                    { name: 'feature', type: 'MyWorldFeature' },
                    { name: 'pins', type: 'PinRange' },
                    { name: 'direction', type: 'String' },
                    { name: 'maxDist', type: 'Number' }
                ]
            },
            {
                value: 'connect',
                label: 'connect',
                params: [
                    { name: 'tech', type: 'String' },
                    { name: 'fromFeature', type: 'MyWorldFeature' },
                    { name: 'fromPins', type: 'PinRange' },
                    { name: 'toFeature', type: 'MyWorldFeature' },
                    { name: 'toPins', type: 'PinRange' },
                    { name: 'housing', type: 'MyWorldFeature' },
                    { name: 'ripple', type: 'Boolean', optional: true}
                ]
            },
            {
                value: 'disconnect',
                label: 'diconnect',
                params: [
                    { name: 'tech', type: 'String' },
                    { name: 'feature', type: 'MyWorldFeature' },
                    { name: 'pins', type: 'PinRange' },
                    { name: 'ripple', type: 'Boolean', optional: true }
                ]
            },
            {
                value: 'moveConns',
                label: 'moveConns',
                params: [
                    { name: 'conns', type: 'Array<String>' },
                    { name: 'housingUrn', type: 'String' },
                    { name: 'rootHousingUrn', type: 'String' }
                ]
            },
            {
                value: 'switchConnSides',
                label: 'switchConnSides',
                params: [
                    { name: 'feature', type: 'MyWorldFeature' }
                ]
            },
            {
                value: 'techFor',
                label: 'techFor',
                params: [
                    { name: 'feature', type: 'MyWorldFeature' },
                    { name: 'side', type: 'String' }
                ]
            },
            {
                value: 'fixConnectionSegments',
                label: 'fixConnectionSegments',
                params: [
                    { name: 'conn', type: 'MyWorldFeature' }
                ]
            },
            {
                value: 'isConnection',
                label: 'isConnection',
                params: [
                    { name: 'feature', type: 'MyWorldFeature' }
                ]
            }
        ]
    }
];

export const ConnectionDescriptions = {
    listConnections: {
        body: (
            <div>
                <p>
                    Pressing the button will list all features that are configured as equipment in
                    the myw.config['mywcom.equipment'] array.
                </p>
            </div>
        ),
        function: 'onListConnections'
    },
    freePinsOn: {
        body: (
            <div>
                <p>
                    {connectionDescriptions.freePinsOn}
                </p>
            </div>
        ),
        function: 'onFreePinsOn'
    },
    usedPinsOn: {
        body: (
            <div>
                <p>
                    {connectionDescriptions.usedPinsOn}
                </p>
            </div>
        ),
        function: 'onUsedPinsOn'
    },
    highPinUsedOn: {
        body: (
            <div>
                <p>
                    {connectionDescriptions.highPinUsedOn}
                </p>
            </div>
        ),
        function: 'onHighPinUsedOn'
    },
    pinStateFor: {
        body: (
            <div>
                <p>
                    {connectionDescriptions.pinStateFor}
                </p>
            </div>
        ),
        function: 'onPinStateFor'
    },
    pinCountFor: {
        body: (
            <div>
                <p>
                    {connectionDescriptions.pinCountFor}
                </p>
            </div>
        ),
        function: 'onPinCountFor'
    },
    traceOut: {
        body: (
            <div>
                <p>
                    {connectionDescriptions.traceOut}
                </p>
            </div>
        ),
        function: 'onTraceOut'
    },
    connect: {
        body: (
            <div>
                <p>
                    {connectionDescriptions.connect}
                </p>
            </div>
        ),
        function: 'onConnect'
    },
    disconnect: {
        body: (
            <div>
                <p>
                    {connectionDescriptions.disconnect}
                </p>
            </div>
        ),
        function: 'onDisconnect'
    },
    moveConns: {
        body: (
            <div>
                <p>
                    {connectionDescriptions.moveConns}
                </p>    
            </div>    
        ),
        function: 'onMoveConns'
    },
    switchConnSides: {
        body: (
            <div>
                <p>
                    {connectionDescriptions.switchConnSides}
                </p>
            </div>
        ),
        function: 'onSwitchConnSides'
    },
    techFor: {
        body: (
            <div>
                <p> 
                    {connectionDescriptions.techFor}
                </p>
            </div>
        ),
        function: 'onTechFor'
    },
    fixConnectionSegments: {
        body: (
            <div>
                <p>
                    {connectionDescriptions.fixConnectionSegments}  
                </p>
            </div>
        ),
        function: 'onFixConnectionSegments'
    },
    isConnection: {
        body: (
            <div>
                <p>
                    {connectionDescriptions.isConnection}
                </p>
            </div>
        ),
        function: 'onIsConnection'
    }
};

export const CircuitMenu = [
    {
        label: <span>List Circuits</span>,
        title: 'List Circuits',
        options: [
            {
                value: 'listCircuits',
                label: 'List Circuits'
            }                       

        ]
    },
    {
        label: <span>Functions</span>,
        title: 'API Functions',
        options: [
            {
                value: 'traceLogicalCircuit',
                label: 'traceLogicalCircuit',
                params: [
                    { name: 'circuit', type: 'MyWorldFeature' }
                ]
            },
            {
                value: 'routeCircuit',  
                label: 'routeCircuit',  
                params: [
                    { name: 'circuit', type: 'MyWorldFeature' }
                ]
            },
            {
                value: 'unrouteCircuit',
                label: 'unrouteCircuit',
                params: [
                    { name: 'circuit', type: 'MyWorldFeature' }
                ]
            },
            {
                value: 'routeCircuits',
                label: 'routeCircuits',
                params: [
                    { name: 'circuits', type: 'Array<MyWorldFeature>' }
                ]
            },
            {
                value: 'isCircuitFeature',
                lable: 'isCircuitFeature',
                params:[
                    { name: 'feature', type: 'MyWorldFeature' }
                ]

            },
            {
                value: 'getDetachedCircuitPath',
                lable: 'getDetachedCircuitPath',
                params: [
                    { name: 'featureType', type: 'String' },
                    { name: 'logicalCircuits', type: 'MyWorldFeature' }
                ]
            },
            {
                value: 'updateCircuitStatus',
                label: 'updateCircuitStatus',
                params: [
                    { name: 'circuit', type: 'MyWorldFeature' },
                    { name: 'status', type: 'String' }
                ]
            }
        ]
    }
];

export const CircuitDescriptions = {
    listCircuits: {
        body: (
            <div>
                <p>
                    Pressing the button will list all features that are configured as equipment in
                    the myw.config['mywcom.equipment'] array.
                </p>
            </div>
        ),
        function: 'onListCircuits'
    },
    traceLogicalCircuit: {
        body: (
            <div>
                <p>
                    {circuitDescriptions.traceLogicalCircuit}
                </p>
            </div>
        ),
        function: 'onTraceLogicalCircuit'
    },
    routeCircuit: {
        body: (
            <div>
                <p>
                    {circuitDescriptions.routeCircuit}
                </p>
            </div>
        ),
        function: 'onRouteCircuit'
    },
    unrouteCircuit: {
        body: (
            <div>
                <p>
                    {circuitDescriptions.unrouteCircuit}
                </p>
            </div>
        ),
        function: 'onUnrouteCircuit'
    },
    routeCircuits: {
        body: (
            <div>
                <p>
                    {circuitDescriptions.routeCircuits}
                </p>
            </div>
        ),
        function: 'onRouteCircuits'
    },
    isCircuitFeature: {
        body: (
            <div>
                <p>
                    {circuitDescriptions.isCircuitFeature}
                </p>
            </div>
        ),
        function: 'onIsCircuitFeature'
    },
    getDetachedCircuitPath: {
        body: (
            <div>
                <p>
                    {circuitDescriptions.getDetachedCircuitPath}
                </p>
            </div>
        ),
        function: 'onGetDetachedCircuitPath'
    },
    updateCircuitStatus: {
        body: (
            <div>
                <p>
                    {circuitDescriptions.updateCircuitStatus}
                </p>    
            </div>    
        ),
        function: 'onUpdateCircuitStatus'
    }
};