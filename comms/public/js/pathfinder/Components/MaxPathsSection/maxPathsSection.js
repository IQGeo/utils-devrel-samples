import React, { useRef } from 'react';
import myw from 'myWorld-client';
import SimilarPathsCheckbox from '../SimilarPathsCheckbox/similarPathsCheckbox';

const MaxPathsSection = ({
    handler,
    listItemsArray,
    title,
    canGenerate,
    unit,
    handleChecked,
    generating
}) => {
    const { msg } = myw.react.useLocale('PathfinderModePlugin');
    const minPaths = 0;
    const maxPaths = 5;

    const sanitizeValue = (ref, name) => {
        let value = ref.current.value;
        if (name === msg('max_paths')) {
            value = Math.min(maxPaths, Math.max(minPaths, value));
            ref.current.value = value;
        }
        handler(ref.current.id, value);
    };

    const list = listItemsArray.map((item, index) => {
        const inputRef = useRef();
        return (
            <div className="max-paths__list-item" key={`${item}-${index}`}>
                <label htmlFor={item}>{item}</label>
                <input
                    className={`text ui-input max-paths__input${
                        item === msg('max_paths') ? '-paths' : '-distance'
                    }`}
                    id={item}
                    type="number"
                    ref={inputRef}
                    onChange={() => sanitizeValue(inputRef, item)}
                />
                {item !== msg('max_distance') ? null : (
                    <span className="max-paths__list-item-unit">{unit}</span>
                )}
            </div>
        );
    });

    return (
        <div className="max-paths__container">
            <div className="max-paths__list-container">{list}</div>
            <SimilarPathsCheckbox
                title={msg('exclude_similar_paths')}
                handleChecked={handleChecked}
                generating={generating}
            />
            <button
                className="primary-btn ui-button ui-corner-all ui-widget font-size-normal margin-0 max-paths-button"
                type="submit"
                disabled={!canGenerate || generating}
            >
                {title}
            </button>
        </div>
    );
};

export default MaxPathsSection;
