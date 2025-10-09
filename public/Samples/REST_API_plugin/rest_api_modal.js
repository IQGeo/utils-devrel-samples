import React, { useState } from 'react';
import { DraggableModal, Button, Input } from 'myWorld-client/react';
import { Select } from 'antd';

export const restApiModal = ({ open }) => {
    const [url, setUrl] = useState('');
    const [method, setMethod] = useState('GET');
    const [payload, setPayload] = useState('');
    const [response, setResponse] = useState('');
    const [loading, setLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(open);

    const handleApiCall = async () => {
        setLoading(true);
        setResponse('');

        try {
            let fullUrl = url.trim();
            if (!fullUrl.startsWith('http')) {
                fullUrl = `http://localhost${fullUrl.startsWith('/') ? '' : '/'}${fullUrl}`;
            }
            const options = { method, redirect: 'follow' };

            if (['POST', 'PUT', 'PATCH'].includes(method) && payload) {
                options.body = payload;
                options.headers = { 'Content-Type': 'application/json' };
            }
            const res = await fetch(fullUrl, options);
            const text = await res.text();
            let formatted = text;
            try {
                const json = JSON.parse(text);
                formatted = JSON.stringify(json, null, 2);
            } catch (err) {
                // Leave as plain text if not JSON
            }
            setResponse(`${res.status} ${res.statusText}\n\n${formatted}`);
        } catch (err) {
            setResponse(`Error: ${err.message}`);
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
                title="REST API Caller"
                width={700}
                onCancel={handleCancel}
            >
        <div className="p-4 flex flex-col space-y-3">
            <label>API URL</label>
            <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://localhost/feature/pole"
            />

            <label>Method</label>
            <Select value={method} onChange={(value) => setMethod(value)}>
                <Select.Option value="GET">GET</Select.Option>
                <Select.Option value="POST">POST</Select.Option>
                <Select.Option value="PUT">PUT</Select.Option>
                <Select.Option value="PATCH">PATCH</Select.Option>
                <Select.Option value="DELETE">DELETE</Select.Option>
            </Select>

            {(method === 'POST' || method === 'PUT' || method === 'PATCH') && (
            <>
                <label>Payload (JSON)</label>
                <Input.TextArea
                value={payload}
                onChange={(e) => setPayload(e.target.value)}
                rows={6}
                placeholder='{"key": "value"}'
                />
            </>
            )}

            <Button onClick={handleApiCall} disabled={!url || loading}>
            {loading ? 'Calling...' : 'Send Request'}
            </Button>

            <div className="flex flex-col gap-1 mt-2">
                <label>Response</label>
                <pre
                    style={{
                        background: '#1e1e1e',
                        color: '#d4d4d4',
                        padding: '10px',
                        borderRadius: '6px',
                        height: '250px',
                        overflowY: 'auto',
                        fontSize: '12px',
                    }}
                >
                    {response || 'No response yet'}
                </pre>
            </div>
        </div>
        </DraggableModal>
    );
};
