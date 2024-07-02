import React from 'react';

const SimilarPathsCheckbox = ({ title, handleChecked, generating }) => {
    return (
        <div className="similar-paths__container">
            <label className="similar-paths__label" htmlFor="similarPathsCheckbox">
                {title}
            </label>
            <input
                className="similar-paths__checkbox"
                id="similarPathsCheckbox"
                type="checkbox"
                defaultChecked={true}
                onChange={handleChecked}
                disabled={generating}
            />
        </div>
    );
};

export default SimilarPathsCheckbox;
