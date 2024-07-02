import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import myw from 'myWorld-client';
import AppContext from '../appContext';
import reactViewsRegistry from '../../base/reactViewsRegistry';

export default function BulkMoveModeModalContainer() {
    const [appRef] = useState(myw.app);
    const appSettings = {
        appRef
    };
    const { BulkMoveModeModal } = reactViewsRegistry.reactViews;

    return (
        <AppContext.Provider value={appSettings}>
            <BulkMoveModeModal.component />
        </AppContext.Provider>
    );
}

(function check() {
    myw.appReady.then(() => {
        const BulkMoveModeModalContainer =
            reactViewsRegistry.reactViews['BulkMoveModeModalContainer'].component;

        if (!document.querySelector('#imageForNetworkDetector')) {
            window.requestAnimationFrame(check);
        } else {
            let div = document.createElement('div');
            div.setAttribute('id', 'bulk-move-modal-container');
            document.body.appendChild(div);

            const root = ReactDOM.createRoot(document.getElementById('bulk-move-modal-container'));
            root.render(<BulkMoveModeModalContainer />);
        }
    });
})();
