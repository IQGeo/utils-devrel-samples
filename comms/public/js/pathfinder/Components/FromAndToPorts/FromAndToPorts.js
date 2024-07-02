import React from 'react';

const FromAndToPorts = ({ title, type, reference, buttonName, handleOnClick, msg }) => {
    return (
        <div className="grid-section-container">
            <label htmlFor={title} className="pathfinder-label">
                {title}
            </label>
            <div className="input-and-button">
                <input
                    placeholder={msg('select_a_structure')}
                    className="text ui-input from-and-to-input"
                    id={title}
                    type="text"
                    ref={reference}
                    readOnly
                />
                <button
                    className="primary-btn ui-button ui-corner-all ui-widget font-size-normal margin-0"
                    type="button"
                    onClick={() => handleOnClick(type)}
                >
                    {buttonName}
                </button>
            </div>
        </div>
    );
};

export default FromAndToPorts;
