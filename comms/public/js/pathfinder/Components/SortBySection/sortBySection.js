import React from 'react';
import myw from 'myWorld-client';

const SortBySection = ({ handler, sortByItemsArray, title }) => {
    const { msg } = myw.react.useLocale('PathfinderModePlugin');
    const list = sortByItemsArray.map((item, index) => {
        return (
            <li className="sort-by__list-item" key={`${msg(item)}-${index}`}>
                <input
                    id={item}
                    type="radio"
                    name="radio"
                    onChange={() => handler(event.target.id)}
                    defaultChecked={item === 'shortest' ? true : false}
                />
                <label htmlFor={item}>{msg(item)}</label>
            </li>
        );
    });

    return (
        <div className="sort-by__container">
            <label htmlFor="sort-by-list" className="pathfinder-label">
                {title}
            </label>
            <ul id="sort-by-list" className="sort-by__list-container">
                {list}
            </ul>
        </div>
    );
};

export default SortBySection;
