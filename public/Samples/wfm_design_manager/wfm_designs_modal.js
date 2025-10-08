import myw from 'myWorld-client';
import React, { useState, useEffect } from 'react';
import { DraggableModal, Button, useLocale } from 'myWorld-client/react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export const WfmDesignsModal = ({ open }) => {
    const { msg } = useLocale('wfmDesignsPlugin');
    const appRef = myw.app;
    const db = appRef.database;

    const [isOpen, setIsOpen] = useState(open);
    const [designMap, setDesignMap] = useState({});

    useEffect(() => {
        fetchDesigns();
    }, []);

    const handleCancel = () => {
        setIsOpen(false);
    };

    async function fetchDesigns() {
        // Query tickets with design references
        const tickets = await db.queryFeatures('mywwfm_ticket', {
            outFields: ['name', 'mywwfm_design']
        });

        const map = {};
        tickets.forEach(ticket => {
            const designId = ticket.properties.myw_wfm_design;
            if (!designId) return;
            if (!map[designId]) map[designId] = [];
            map[designId].push(ticket);
        });

        setDesignMap(map);
    }

    return (
        <DraggableModal
            wrapClassName="customer-connection-modal"
            open={isOpen}
            title={msg('wfm_designs_title')}
            width={500}
            onCancel={handleCancel}
            footer={[
                <Button key="close" onClick={handleCancel}>
                    {msg('close')}
                </Button>
            ]}
        >
            {Object.keys(designMap).length === 0 ? (
                <div>{msg('loading')}</div>
            ) : (
                <div>
                    {Object.keys(designMap).map(designId => (
                        <Card key={designId} className="mb-2">
                            <CardHeader>{designId}</CardHeader>
                            <CardContent>
                                {designMap[designId].map(ticket => (
                                    <div key={ticket.id} className="p-1 border-b">
                                        {ticket.properties.name} ({ticket.id})
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </DraggableModal>
    );
};
