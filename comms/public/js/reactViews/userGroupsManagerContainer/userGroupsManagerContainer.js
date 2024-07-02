import myw from 'myWorld-client';
import React, { useState } from 'react';
import reactViewsRegistry from '../../base/reactViewsRegistry';
import ReactDOM from 'react-dom/client';
import AppContext from '../appContext';

export default function UserGroupsManagerContainer() {
    const [appRef] = useState(myw.app);
    const [ds] = useState(appRef.getDatasource('myworld'));
    const [db] = useState(appRef.database);

    const UserGroupsManagerModal =
        reactViewsRegistry.reactViews['UserGroupsManagerModal'].component;

    const appSettings = {
        appRef,
        ds,
        db
    };

    return (
        <AppContext.Provider value={appSettings}>
            <UserGroupsManagerModal />
        </AppContext.Provider>
    );
}

(function check() {
    myw.appReady.then(() => {
        const UserGroupsManagerContainer =
            reactViewsRegistry.reactViews['UserGroupsManagerContainer'].component;

        if (!document.querySelector('#imageForNetworkDetector')) {
            window.requestAnimationFrame(check);
        } else {
            let div = document.createElement('div');
            div.setAttribute('id', 'user-group-mgr-container');
            document.body.appendChild(div);

            const root = ReactDOM.createRoot(document.getElementById('user-group-mgr-container'));
            root.render(<UserGroupsManagerContainer />);
        }
    });
})();
