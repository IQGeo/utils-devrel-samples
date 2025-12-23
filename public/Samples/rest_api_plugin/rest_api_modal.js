import myw from 'myWorld-client';
import React, { useState, useEffect } from 'react';
import { DraggableModal, Button, Input } from 'myWorld-client/react';
import { Select } from 'antd';

export const restApiModal = ({ open, plugin }) => {
    const [url, setUrl] = useState('');
    const [method, setMethod] = useState('GET');
    const [payload, setPayload] = useState('');
    const [response, setResponse] = useState('');
    const [loading, setLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(open);
    const [selectedFeature, setSelectedFeature] = useState(null);
    const [isPickingFeature, setIsPickingFeature] = useState(false);
    const [appRef] = useState(myw.app);
    const [responseFeatures, setResponseFeatures] = useState([]);
    const [currentFeatureIndex, setCurrentFeatureIndex] = useState(0);

    // Listen for feature selection on the map
    useEffect(() => {
        function listener() {
            if (isPickingFeature) {
                const feature = appRef.currentFeature;
                if (feature) {
                    setSelectedFeature(feature);

                    setUrl(`/feature/${feature.type}/${feature.id}`);
                    setIsPickingFeature(false);
                }
            }
        }

        appRef.on('currentFeature-changed', listener);
        appRef.on('currentFeatureSet-changed', listener);

        return () => {
            appRef.off('currentFeature-changed', listener);
            appRef.off('currentFeatureSet-changed', listener);
        };
    }, [isPickingFeature, appRef]);

    const syntaxHighlight = (json) => {
        if (typeof json !== 'string') {
            json = JSON.stringify(json, null, 2);
        }
        json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, (match) => {
            let cls = 'number';
            if (/^"/.test(match)) {
                if (/:$/.test(match)) {
                    cls = 'key';
                } else {
                    cls = 'string';
                }
            } else if (/true|false/.test(match)) {
                cls = 'boolean';
            } else if (/null/.test(match)) {
                cls = 'null';
            }
            return `<span class="${cls}">${match}</span>`;
        });
    };

    const handleUseSelectedFeature = () => {
        const feature = appRef.currentFeature;
        if (feature) {
            setSelectedFeature(feature);
            setUrl(`/feature/${feature.type}/${feature.id}`);
        } else {
            setIsPickingFeature(true);
        }
    };

    const handleApiCall = async () => {
        setLoading(true);
        setResponse('');

        try {
            let fullUrl = url.trim();
            if (!fullUrl.startsWith('http')) {
                fullUrl = `http://localhost${fullUrl.startsWith('/') ? '' : '/'}${fullUrl}`;
            }
            const options = { method, redirect: 'follow', credentials: 'include' };

            if (['POST', 'PUT', 'PATCH'].includes(method) && payload) {
                options.body = payload;
                options.headers = { 'Content-Type': 'application/json', 'Accept': 'application/json'};

                const cookies = document.cookie.split(';');
                const csrfCookie = cookies.find(c => c.trim().startsWith('csrf_token='));
                const csrfToken = csrfCookie ? csrfCookie.split('=')[1] : null;

                if (csrfToken) {
                    options.headers['X-CSRF-Token'] = csrfToken;
                    console.log('Using CSRF token from cookie:', csrfToken);
                } else {
                    console.warn('No CSRF token found in cookies');
                }
            }
            
            const res = await fetch(fullUrl, options);
            const text = await res.text();
            let formatted = text;
            let json = null;
            
            try {
                json = JSON.parse(text);
                formatted = JSON.stringify(json, null, 2);
            } catch (err) {
                // Leave as plain text if not JSON
            }
            
            setResponse(`${res.status} ${res.statusText}\n\n${formatted}`);
            
            if (json && json.type === 'MywFeatureCollection' && Array.isArray(json.features) && json.features.length > 0) {
                setResponseFeatures(json.features);
                setCurrentFeatureIndex(0);

                await loadFeatureFromResponse(json.features[0]);
            }

            else if (json && Array.isArray(json) && json.length > 0) {

                const hasIds = json.every(item => item && (item.id || item.feature_id));
                if (hasIds) {
                    setResponseFeatures(json);
                    setCurrentFeatureIndex(0);

                    await loadFeatureFromResponse(json[0]);
                }
            }
            // If response contains a single feature
            else if (json && (json.id || json.feature_id)) {
                setResponseFeatures([json]);
                setCurrentFeatureIndex(0);
                await loadFeatureFromResponse(json);
            } else {

                setResponseFeatures([]);
                setCurrentFeatureIndex(0);
            }
        } catch (err) {
            setResponse(`Error: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleCancel = () => {
        setIsOpen(false);
    };

    const loadFeatureFromResponse = async (featureData) => {
        const featureId = featureData.id;
        const featureType = featureData.myw?.feature_type;


        // Try to show the feature on the map
        try {
            // This will select/highlight the feature if it exists
            const feature = await appRef.database.getFeature(featureType, featureId);
            if (feature) {
                appRef.setCurrentFeature(feature, { zoomTo: true });
            }
        } catch (err) {
            console.warn('Could not load feature from response:', err);
        }
    };

    const handlePreviousFeature = async () => {
        if (currentFeatureIndex > 0) {
            const newIndex = currentFeatureIndex - 1;
            setCurrentFeatureIndex(newIndex);
            await loadFeatureFromResponse(responseFeatures[newIndex]);
        }
    };

    const handleNextFeature = async () => {
        if (currentFeatureIndex < responseFeatures.length - 1) {
            const newIndex = currentFeatureIndex + 1;
            setCurrentFeatureIndex(newIndex);
            await loadFeatureFromResponse(responseFeatures[newIndex]);
        }
    };


    const getFeatureDisplayName = () => {
        if (!selectedFeature) return '';
        return selectedFeature.properties?.name || selectedFeature.id || '';
    };
    return (
        <DraggableModal
            open={isOpen}
            title="REST API Caller"
            width={700}
            onCancel={handleCancel}
        >
            <div className="p-4 flex flex-col space-y-3">
                <a href="https://docs.iqgeo.com" target="_blank" rel="noopener noreferrer">Link to API Documentation</a><br/>

                <label>API URL</label>
                <div className="flex gap-2">
                    <Input
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="http://localhost/feature/pole"
                        style={{ flex: 1 }}
                    />
                    <Button 
                        onClick={handleUseSelectedFeature}
                        type={isPickingFeature ? "primary" : "default"}
                    >
                        {isPickingFeature ? 'Click feature on map...' : 'Use Selected Feature'}
                    </Button>
                </div>
                
                {selectedFeature && !isPickingFeature && (
                    <div className="text-sm" style={{ color: '#666', marginTop: '4px' }}>
                        Selected Feature: <strong>{getFeatureDisplayName()}</strong> (ID: {selectedFeature.id})
                    </div>
                )}

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
                    {responseFeatures.length > 0 && (
                        <div className="flex items-center gap-2 mb-2" style={{
                            background: '#f0f0f0',
                            padding: '8px',
                            borderRadius: '4px',
                            justifyContent: 'space-between'
                        }}>
                            <span style={{ fontSize: '12px', color: '#666' }}>
                                Showing feature {currentFeatureIndex + 1} of {responseFeatures.length}
                            </span>
                            <div className="flex gap-2">
                                <Button 
                                    size="small"
                                    onClick={handlePreviousFeature}
                                    disabled={currentFeatureIndex === 0}
                                >
                                    ← Previous
                                </Button>
                                <Button 
                                    size="small"
                                    onClick={handleNextFeature}
                                    disabled={currentFeatureIndex === responseFeatures.length - 1}
                                >
                                    Next →
                                </Button>
                            </div>
                        </div>
                    )}
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
                        dangerouslySetInnerHTML={{
                            __html: response ? syntaxHighlight(response) : 'No response yet'
                        }}
                    />
                    <style>{`
                        .string { color: #ce9178; }
                        .number { color: #b5cea8; }
                        .boolean { color: #569cd6; }
                        .null { color: #569cd6; }
                        .key { color: #9cdcfe; }
                    `}</style>
                </div>
            </div>
        </DraggableModal>
    );
};