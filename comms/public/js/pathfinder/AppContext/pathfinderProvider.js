import React, { useState } from 'react';
import myw from 'myWorld-client';
import AppContext from './appContext';

const PathfinderProvider = ({ children }) => {
    const [appRef] = useState(myw.app);
    const [ds] = useState(appRef.getDatasource('myworld'));
    const [db] = useState(appRef.database);
    const appSettings = {
        appRef,
        ds,
        db
    };
    return <AppContext.Provider value={appSettings}>{children}</AppContext.Provider>;
};

export default PathfinderProvider;
