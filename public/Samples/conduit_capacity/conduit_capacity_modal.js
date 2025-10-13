import React, { useState } from 'react';
import { DraggableModal, Button } from 'myWorld-client/react';
// import L from 'leaflet';
import myw from 'myWorld-client';


async function iqgeoFetch(url) {
    return fetch(`http://localhost${url}`, { method: 'POST', redirect: 'follow' });
}

export const ConduitCapacityModal = ({ open }) => {
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState('');

    const handleVisualize = async () => {
        setLoading(true);
        setStatus('Querying conduits in map window...');
        const appRef = myw.app;
        const map = appRef.map;

        // Get current map bounds
        const bounds = map.getBounds();
        const geometry = {
            type: 'Polygon',
            coordinates: [[
                [bounds.getWest(), bounds.getSouth()],
                [bounds.getEast(), bounds.getSouth()],
                [bounds.getEast(), bounds.getNorth()],
                [bounds.getWest(), bounds.getNorth()],
                [bounds.getWest(), bounds.getSouth()]
            ]]
        };

        console.log(geometry);
        // Search for conduits in the bounding box
        const resp = await iqgeoFetch(`/feature/conduit/get?geometry=${encodeURIComponent(JSON.stringify(geometry))}`);
        const data = await resp.json();
        const conduits = data.features || [];

        setStatus(`Found ${conduits.length} conduits. Calculating capacities...`);

        // const layer = L.layerGroup();

        // for (const conduit of conduits) {
        //     const result = await evaluateConduitCapacity(conduit);
        //     const color = getColorForStatus(result.status);

        //     const geom = L.geoJSON(conduit.geometry, { style: { color, weight: 4 } });
        //     geom.bindPopup(`
        //         <b>${conduit.properties.name || 'Conduit'}</b><br>
        //         ${result.status}<br>
        //         Ratio: ${(result.ratio * 100).toFixed(1)}%
        //     `);
        //     layer.addLayer(geom);
        // }

        // layer.addTo(map);
        // setLoading(false);
        // setStatus('Visualization complete ✅');
    };

    return (
        <DraggableModal
            open={open}
            title="Conduit Capacity Visualization"
            onClose={() => myw.app.ui.closeModal()}
        >
            <div className="p-4 space-y-3">
                <p>{status}</p>
                <Button onClick={handleVisualize} disabled={loading}>
                    {loading ? 'Loading...' : 'Visualize'}
                </Button>
            </div>
        </DraggableModal>
    );
};

// === Helper Functions ===

async function evaluateConduitCapacity(conduit) {
    const cid = conduit.properties.id;
    const conduitDiameter = conduit.properties.diameter;

    const segResp = await iqgeoFetch(`/feature/conduit/${cid}/relationship/cable_segments`);
    const segData = await segResp.json();
    const segments = segData.features || [];

    const cableRefs = [...new Set(segments.map(s => s.properties.cable).filter(Boolean))];
    const diameters = [];

    for (const cref of cableRefs) {
        const cableResp = await iqgeoFetch(`/feature/${cref}`);
        const cableProps = (await cableResp.json()).properties;
        if (cableProps.diameter) diameters.push(cableProps.diameter);
    }

    const { ratio, limit } = calcFillRatio(conduitDiameter, diameters);
    let status;
    if (ratio == null) status = 'No diameter data';
    else if (ratio === 0) status = 'EMPTY';
    else if (ratio <= limit) status = 'OK';
    else status = 'OVERFILL';

    return { ratio, limit, status };
}

function calcFillRatio(conduitDiameter, cableDiameters) {
    if (!conduitDiameter || conduitDiameter === 0) return { ratio: null, limit: null };
    const ratio = cableDiameters.reduce((a, d) => a + d ** 2, 0) / (conduitDiameter ** 2);

    let limit = 1.0;
    if (cableDiameters.length === 1) limit = 0.65;
    else if (cableDiameters.length === 2) limit = 0.31;
    else if (cableDiameters.length === 3) limit = 0.40;

    return { ratio, limit };
}

function getColorForStatus(status) {
    return {
        'OK': 'green',
        'EMPTY': 'gray',
        'OVERFILL': 'red',
        'No diameter data': 'yellow'
    }[status] || 'blue';
}
