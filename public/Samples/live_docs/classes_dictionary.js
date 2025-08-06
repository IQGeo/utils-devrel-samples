import React from 'react';
import { useLocale } from 'myWorld-client/react';

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
