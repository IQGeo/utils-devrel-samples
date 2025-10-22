import React, { useState } from 'react';
import { DraggableModal, Button } from 'myWorld-client/react';
import { useLocale } from 'myWorld-client/react';
import myw from 'myWorld-client';


/**
 * A modal component for visualizing conduit capacities on a map.
 * 
 * @param {Object} props - The component props.
 * @param {boolean} props.open - Determines if the modal is open.
 * @returns {JSX.Element} - The rendered modal component.
 */
export const ConduitCapacityModal = ({ open, builder }) => {
    const { msg } = useLocale('ConduitCapacityPlugin');
    const [showIntro, setShowIntro] = useState(true);
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState('');
    const [isOpen, setIsOpen] = useState(open);
    const [overlay, setOverlay] = useState(null);
    const [appRef] = useState(myw.app);
    const [db] = useState(appRef.database);
    
    const handleVisualize = async () => {
        setLoading(true);
        setStatus('Querying conduits in map window...');
        const map = appRef.map;

        // Get map bounds
        const bounds = map.getBounds();

        // Search for conduits in the bounding box
        try {
            const conduits = await db.getFeatures('conduit', { bounds });
            setStatus(`Found ${conduits.length} conduits. Calculating capacities...`);

            if (overlay) {
                overlay.clear();
            }

            const zIndex = 200;
            const newOverlay = new myw.GeoJSONVectorLayer({map, zIndex});
            setOverlay(newOverlay);

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
                    const { ratio, status } = await builder.calculateCapacity(conduit);
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
            setStatus(`Visualization complete for ${conduits.length} conduits.`);
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
    
    return (
        <DraggableModal
            open={isOpen}
            title={msg('conduit_capacity_title')}
            onCancel={handleCancel}
            footer={
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
            <div className="p-4 space-y-3">
                <p>Click 'Visualize' to analyze conduits in the current map window.</p>
                <p>{status}</p>
                <p>This tool checks the capacity of conduits in the window bounding box.</p>
                <p>To use the tool zoom to your desired window size then click the 'Visualize' button and the tool will automatically check all conduits within the geometry and add a map layer to visualize the capacity.</p>
                <p>You can find the source code in the folder modules/utils-devrel-samples/public/js/Samples/conduit_capacity.</p>
            </div>
        </DraggableModal>
    );
};