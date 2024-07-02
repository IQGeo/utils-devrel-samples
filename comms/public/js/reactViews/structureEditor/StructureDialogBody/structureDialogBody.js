import React from 'react';
import myw from 'myWorld-client';

const StructureDialogBody = ({ prevFeature, currFeature }) => {
    const { msg } = myw.react.useLocale('FeatureEditor');
    return (
        <div className="dialog-body">
            <p>{msg('replacing')}</p>
            <ul className="list">
                <li>
                    <b>{prevFeature}</b>
                </li>
            </ul>
            <p>{msg('with')}</p>
            <ul className="list">
                <li>
                    <b className="item">{currFeature}</b>
                </li>
            </ul>
            <p>{msg('continue')}</p>
        </div>
    );
};

export default StructureDialogBody;
