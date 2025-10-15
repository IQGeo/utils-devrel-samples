import React, { useState } from 'react';
import { DraggableModal, Button } from 'myWorld-client/react';
import { useLocale } from 'myWorld-client/react';
import myw from 'myWorld-client';


/**
 * Makes an API request to the specified URL with the given method and body.
 * 
 * @param {string} url - The endpoint URL to fetch.
 * @param {string} [method='GET'] - The HTTP method to use (e.g., 'GET', 'POST').
 * @param {Object|null} [body=null] - The request body to send (for POST requests).
 * @returns {Promise<Response>} - A promise that resolves to the fetch response.
 */
async function apiFetch(url, method = 'GET', body = null) {
    const options = { method, redirect: 'follow' };
    if (method === 'POST' && body) {
        options.headers = { 'Content-Type': 'application/json' };
        options.body = JSON.stringify(body);
    }
    return fetch(`http://localhost${url}`, options);
}

/**
 * A modal component for visualizing conduit capacities on a map.
 * 
 * @param {Object} props - The component props.
 * @param {boolean} props.open - Determines if the modal is open.
 * @returns {JSX.Element} - The rendered modal component.
 */
export const ConduitCapacityModal = ({ open }) => {
    const { msg } = useLocale('ConduitCapacityPlugin');
    const [showIntro, setShowIntro] = useState(true);
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState('');
    const [isOpen, setIsOpen] = useState(open);
    const [overlay, setOverlay] = useState(null);
    

    const handleVisualize = async () => {
        setLoading(true);
        setStatus('Querying conduits in map window...');
        const appRef = myw.app;
        const map = appRef.map;

        // Get map bounds
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

        // console.log(geometry);
        // Search for conduits in the bounding box
        try {
            const geometryParam = encodeURIComponent(JSON.stringify(geometry));
            const resp = await apiFetch(`/feature/conduit/get?geometry=${geometryParam}`, 'POST');
            console.log(resp);
            const data = await resp.json();
            console.log(data);
            const conduits = data.features || [];

            setStatus(`Found ${conduits.length} conduits. Calculating capacities...`);

            if (overlay) {
                overlay.clear();
            }

            const zIndex = 200;
            const newOverlay = new myw.GeoJSONVectorLayer({map, zIndex});
            setOverlay(newOverlay);

            // console.log('Overlay layer created:', newOverlay);
            // console.log('Map reference:', map);


            // Define styles
            const lineStyles = {
                OK: new myw.LineStyle({ width: 4, color: '#2ecc71' }),
                EMPTY: new myw.LineStyle({ width: 4, color: '#a1b3b3ff' }),
                OVERFILL: new myw.LineStyle({ width: 4, color: '#e74c3c' }),
                'No diameter data': new myw.LineStyle({ width: 4, color: '#f1c40f' }),
                DEFAULT: new myw.LineStyle({ width: 4, color: '#3498db' })
            };

            const results = await Promise.all(
                conduits.map(async (conduit) => {
                    const { ratio, status } = await evaluateConduitCapacity(conduit);
                    // console.log('Adding geometry:', conduit.geometry);
                    return { conduit, ratio, status };
                })
            );

            results.forEach(({ conduit, ratio, status }) => {
                const style = lineStyles[status] || lineStyles['DEFAULT'];

                const feature = newOverlay.addGeom(conduit.geometry, style);
                feature.bindTooltip(`
                        <b>${conduit.properties.name || 'Conduit'}</b><br>
                        Status: ${status}<br>
                        Ratio: ${(ratio * 100).toFixed(1)}%
                    `);
            });
            setStatus('Visualization complete.');
        } catch (error) {
            console.error(error);
            setStatus(`Error: ${error.message}`);
        } finally {
            setLoading(false);
        }


    };
    const handleCancel = () => {
        setIsOpen(false);
    };
      const hideIntro = () => {
        setShowIntro(false);
    };

    return (
        <DraggableModal
            open={isOpen}
            title={msg('conduit_capacity_title')}
            onCancel={handleCancel}
            footer={
                showIntro ? 
                [
                    <Button key="ok" onClick={hideIntro} type="primary">
                        OK
                    </Button>
                ]
                :
                [
                    <Button key="cancel" onClick={handleCancel}>
                        Cancel
                    </Button>,
                    <Button key="visualize" onClick={handleVisualize} type="primary" disabled={loading}>
                        {loading ? 'Loading...' : 'Visualize'}
                    </Button>
                ]
            }
        >
            {showIntro ? (
                <div style={{ whiteSpace: 'pre-wrap' }}>{msg('description')}</div>
            ) : (
            <div className="p-4 space-y-3">
                <p>Click 'Visualize' to analyze conduits in the current map window.</p>
                <p>{status}</p>
            </div>
            )}
        </DraggableModal>
    );
};

// Helper Functions

async function evaluateConduitCapacity(conduit) {
    const cid = conduit.properties.id;
    const conduitDiameter = conduit.properties.diameter;

    const segResp = await apiFetch(`/feature/conduit/${cid}/relationship/cable_segments`);
    const segData = await segResp.json();
    const segments = segData.features || [];

    const cableRefs = [...new Set(segments.map(s => s.properties.cable).filter(Boolean))];
    const diameters = [];

    const cableResponses = await Promise.all(
        cableRefs.map(cref => apiFetch(`/feature/${cref}`))
    );

    const cablePropsArray = await Promise.all(
        cableResponses.map(async cableResp => (await cableResp.json()).properties)
    );

    for (const cableProps of cablePropsArray) {
        if (cableProps.diameter) diameters.push(cableProps.diameter);
    }

    const { ratio, limit } = calcFillRatio(conduitDiameter, diameters);
    let status;
    if (ratio == null) status = 'No diameter data';
    else if (ratio === 0) status = 'EMPTY';
    else if (ratio <= limit) status = 'OK';
    else status = 'OVERFILL';

    // console.log(`Conduit ${cid}: ratio=${(ratio * 100).toFixed(1)}%, limit=${(limit * 100).toFixed(1)}%, status=${status}`);
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
