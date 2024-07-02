import React, { useState } from 'react';
import reactViewsRegistry from '../../base/reactViewsRegistry';
import myw from 'myWorld-client';
import AppContext from '../appContext';
import ReactDOM from 'react-dom/client';

export default function LayoutStrandContainer() {
    const [appRef] = useState(myw.app);
    const [ds] = useState(appRef.getDatasource('myworld'));
    const [db] = useState(appRef.database);
    const { LayoutStrandModal } = reactViewsRegistry.reactViews;

    const appSettings = {
        appRef,
        ds,
        db
    };

    return (
        <AppContext.Provider value={appSettings}>
            <LayoutStrandModal.component />
        </AppContext.Provider>
    );
}

(function check() {
    myw.appReady.then(() => {
        const LayoutStrandContainer =
            reactViewsRegistry.reactViews['LayoutStrandContainer'].component;

        if (!document.querySelector('#imageForNetworkDetector')) {
            window.requestAnimationFrame(check);
        } else {
            let div = document.createElement('div');
            div.setAttribute('id', 'layout-strand-modal-container');
            document.body.appendChild(div);

            const root = ReactDOM.createRoot(
                document.getElementById('layout-strand-modal-container')
            );
            root.render(<LayoutStrandContainer />);
        }
    });
})();
