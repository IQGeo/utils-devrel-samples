import React, { useEffect, useRef } from 'react';
import myw from 'myWorld-client';

const IncludeAndAvoid = ({ list, handleOnClick, removeClick, title, error }) => {
    const { msg } = myw.react.useLocale('PathfinderModePlugin');

    const errorRef = useRef();
    const errorTimeout = useRef();

    useEffect(() => {
        if (!error.isError) return;
        errorRef.current?.classList.remove('hide-error');

        if (errorTimeout.current) clearTimeout(errorTimeout.current);
        errorTimeout.current = setTimeout(() => {
            errorRef.current?.classList.add('hide-error');
        }, 3000);
    }, [error]);

    const compiledList = list.map((item, index) => {
        return (
            <li className="include-and-avoid__list-item" key={`${item.name}-${index}`}>
                {item.name}
                <button
                    className="include-and-avoid__list-item-button hover-cursor"
                    type="button"
                    onClick={() => removeClick(item.identifier)}
                >
                    <img src={'modules/comms/images/editor/clear.svg'} className="svg-style" />
                </button>
            </li>
        );
    });

    return (
        <div className="include-and-avoid__container">
            <div className="include-and-avoid__label-and-button">
                <label className="pathfinder-label">{title}</label>
                <div
                    ref={errorRef}
                    className="include-and-avoid__error hide-error"
                    id={`include-and-avoid__error-${title.toLowerCase()}`}
                >
                    {error.isError ? msg(error.message) : null}
                </div>
                <button
                    className="include-and-avoid__button hover-cursor"
                    type="button"
                    onClick={handleOnClick}
                >
                    <img
                        src={'modules/comms/images/actions/add-layers.svg'}
                        className="svg-style"
                    />
                </button>
            </div>
            <ul className="include-and-avoid__list-container">{compiledList}</ul>
        </div>
    );
};

export default IncludeAndAvoid;
