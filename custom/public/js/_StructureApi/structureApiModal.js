import React, { useState, useEffect } from 'react';
import { DraggableModal, Button } from 'myWorld-client/react';

export const StructureApiModal = ({ open, plugin, equipmentPlugin }) => {
    const [appRef] = useState(myw.app);
    const [db] = useState(appRef.database);
    const [structures, setStructures] = useState([]);
    const [fiberShelf, setFiberShelf] = useState();
    const [isOpen, setIsOpen] = useState(open);

    useEffect(() => {
        let promises = [];
        for (const structure in myw.config['mywcom.structures']) {
            let query = 'myworld/' + structure;
            promises.push(db.getFeatures(query));
        }
        Promise.all(promises).then(result => {
            setStructures(result.flat());
        });
        db.getFeatures('myworld/fiber_shelf').then(result => {
            setFiberShelf(result);
        });
    }, []);

    const closeWindow = () => {
        // setIsOpen(false);
    };

    const onStructContent = () => {
        const index = Math.floor(Math.random() * structures.length);
        plugin.structContent(structures[index]).then(result => {
            console.log('Content of structure: ', structures[index]._myw.title);
            console.log(result);
            appRef.setCurrentFeature(structures[index], { zoomTo: true });
            appRef.map.zoomTo(result);
        });
    };

    const onGetStructuresAt = () => {
        const coords = [];
        const index = Math.floor(Math.random() * structures.length);

        coords.push(
            structures[index].getGeometry().coordinates[0],
            structures[index].getGeometry().coordinates[1]
        );
        plugin.getStructuresAt(coords, null, 100).then(result => {
            console.log('Structures at coords: ' + coords[0] + ' - ' + coords[1]);
            console.log(result);
            appRef.setCurrentFeatureSet(result);
            appRef.map.zoomTo(result[0]);
        });
    };

    // const onConnectionsIn = () => {
    //     const promises = fiberShelf.map(shelf => equipmentPlugin.connectionsIn(shelf));
    //     Promise.all(promises)
    //         .then(result => {
    //             console.log('connectionsIn query successful!');
    //             console.log(result);
    //         })
    //         .catch(alert);
    // };

    return (
        <DraggableModal
            wrapClassName="structure-api-modal"
            open={isOpen}
            title={'Structure API Plugin'}
            width={500}
            onCancel={closeWindow}
            footer={[
                <Button key="close" onClick={closeWindow} type="primary">
                    Close Window
                </Button>
            ]}
        >
            <Button key="structContent" onClick={onStructContent} type="primary">
                structContent
            </Button>
            <br />
            <Button key="getStructuresAt" onClick={onGetStructuresAt} type="primary">
                getStructuresAt
            </Button>
            {/* <Button key="getStructuresAt" onClick={onConnectionsIn} type="primary">
                connectionsIn
            </Button> */}
        </DraggableModal>
    );
};
