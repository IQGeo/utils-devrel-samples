import React from 'react';

/**
 * It returns a div with a class of draggable-title, which contains a div with a class of
 * draggable-target
 * @param {string} title - The title of the modal.
 * @returns A div with a class of draggable-title and a child div with a class of draggable-target.
 */
const DraggableModalTitle = ({ title }) => {
    return (
        <div style={{ display: 'flex' }} className={'draggable-title'}>
            <div
                className={'draggable-target'}
                style={{
                    width: '100%',
                    cursor: 'move',
                    marginLeft: '.5em',
                    display: 'flex',
                    alignItems: 'center'
                }}
                onFocus={() => {}}
                onBlur={() => {}}
            >
                {title}
            </div>
        </div>
    );
};

export default DraggableModalTitle;
